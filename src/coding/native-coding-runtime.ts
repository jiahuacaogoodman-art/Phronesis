import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AcceptanceCriterionResult, CodingCommandRun, CodingTestResult } from "../types/coding-result.js";
import type { CodingHandoff, CodingTaskPackage } from "../types/coding-handoff.js";
import type {
  AppliedPatches,
  AutocodeMode,
  CodeReviewReport,
  CodebaseIndex,
  ImplementationBatch,
  ImplementationBatchPlan,
  NativeAutocodeOptions,
  NativeAutocodeRunResult,
  NativeAutonomousCodingResult,
  NativePatchPlan,
  RepairLoopReport,
  RepoAnalysis,
  RepoContextPack,
  TestRunReport,
} from "../types/native-coding.js";
import type { CommandPolicyViolation } from "../types/command-execution.js";
import { analyzeRepo } from "./repo-analyzer.js";
import { indexCodebase } from "./codebase-indexer.js";
import { buildImplementationBatchPlan } from "./implementation-batch-planner.js";
import { planNativePatch } from "./native-patch-planner.js";
import { applyNativePatchPlan } from "./patch-applier.js";
import { runTestCommands } from "./test-command-runner.js";
import { analyzeBuildFailure } from "./build-failure-analyzer.js";
import { runRepairLoop } from "./repair-loop-controller.js";
import { reviewNativeCodingResult } from "./code-review-critic.js";
import { loadNativeRunArtifacts, type NativeRunArtifacts } from "./runtime-artifact-loader.js";
import { redactSecrets } from "../security/secret-redactor.js";

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(redactSecrets(value), null, 2)}\n`, "utf8");
}

function isBlocked(artifacts: NativeRunArtifacts): boolean {
  return artifacts.handoff.canProceedToCoding === false ||
    artifacts.handoff.handoffStatus === "blocked" ||
    artifacts.selectedRoute.canProceedToCoding === false ||
    artifacts.executionTaskGraph.canProceedToCoding === false;
}

function blockingReasons(artifacts: NativeRunArtifacts): string[] {
  return [
    "Do not hand off to Coding Agent yet.",
    ...artifacts.handoff.requiredBeforeCoding,
    ...artifacts.selectedRoute.blockingReasons,
    ...artifacts.executionTaskGraph.globalBlockingReasons,
  ].filter(Boolean);
}

function selectBatches(batchPlan: ImplementationBatchPlan, selection: string | undefined): ImplementationBatch[] {
  const batches = batchPlan.batches;
  if (selection === "all") return batches;
  if (!selection || selection === "first") return batches.length > 0 ? [batches[0]] : [];
  return batches.filter((batch) => batch.batchId === selection);
}

function taskPackagesForBatch(taskPackages: CodingTaskPackage[], batch: ImplementationBatch): CodingTaskPackage[] {
  return batch.tasks
    .map((taskId) => taskPackages.find((task) => task.taskId === taskId))
    .filter((task): task is CodingTaskPackage => task !== undefined);
}

function allowedAreasForBatch(taskPackages: CodingTaskPackage[], batch: ImplementationBatch): string[] {
  return Array.from(new Set(taskPackagesForBatch(taskPackages, batch).flatMap((task) => task.allowedChangeAreas)));
}

function forbiddenAreasForBatch(taskPackages: CodingTaskPackage[], batch: ImplementationBatch, handoff: CodingHandoff): string[] {
  return Array.from(new Set([
    ...handoff.forbiddenActions,
    ...taskPackagesForBatch(taskPackages, batch).flatMap((task) => task.forbiddenChangeAreas),
  ]));
}

function resultForBlocked({ artifacts, targetRepo, reasons }: { artifacts: NativeRunArtifacts; targetRepo: string; reasons: string[] }): NativeAutonomousCodingResult {
  return {
    status: "blocked",
    runId: artifacts.handoff.runId || artifacts.goal.runId,
    handoffRunId: artifacts.handoff.runId || artifacts.goal.runId,
    codingAgentName: "NativeAutonomousCodingRuntime",
    codingTaskId: "blocked-before-implementation",
    targetRepo,
    batchesAttempted: [],
    filesChanged: [],
    filesCreated: [],
    filesDeleted: [],
    commandsRun: [],
    commandExecutions: [],
    policyViolations: [],
    testsRun: [],
    testResults: [],
    acceptanceCriteriaResults: [],
    forbiddenActionViolations: [],
    allowedChangeAreaViolations: [],
    unresolvedQuestions: reasons,
    implementationSummary: "Native autonomous coding was not started because planning gates are blocked.",
    failureSummary: reasons.join(" | "),
    reason: reasons.join(" | "),
    needsPlannerRevision: true,
  };
}

function resultForPartial({ artifacts, targetRepo, mode, batchPlan, patchPlan }: {
  artifacts: NativeRunArtifacts;
  targetRepo: string;
  mode: AutocodeMode;
  batchPlan: ImplementationBatchPlan;
  patchPlan?: NativePatchPlan;
}): NativeAutonomousCodingResult {
  return {
    status: "partial",
    runId: artifacts.handoff.runId || artifacts.goal.runId,
    handoffRunId: artifacts.handoff.runId || artifacts.goal.runId,
    codingAgentName: "NativeAutonomousCodingRuntime",
    codingTaskId: patchPlan?.batchId ?? batchPlan?.selectedByDefault ?? "planning-only",
    targetRepo,
    batchesAttempted: patchPlan ? [patchPlan.batchId] : [],
    filesChanged: [],
    filesCreated: [],
    filesDeleted: [],
    commandsRun: [],
    commandExecutions: [],
    policyViolations: [],
    testsRun: [],
    testResults: [],
    acceptanceCriteriaResults: [],
    forbiddenActionViolations: [],
    allowedChangeAreaViolations: [],
    unresolvedQuestions: [],
    implementationSummary: mode === "plan-only" ? "Generated implementation batch plan only." : "Generated native patch plan without applying it.",
    failureSummary: "",
    needsPlannerRevision: false,
  };
}

function commandResultsFromReport(report: TestRunReport): CodingCommandRun[] {
  return report.commands.map((command, index) => ({
    command,
    commandSpec: report.commandExecutions[index]?.commandSpec,
    policyDecision: report.commandExecutions[index]?.policyDecision,
    policyViolations: report.commandExecutions[index]?.policyViolations,
    exitCode: report.exitCodes[index] ?? 0,
    durationMs: report.commandExecutions[index]?.durationMs,
  }));
}

function testResultsFromReport(report: TestRunReport): CodingTestResult[] {
  return report.commands.map((command, index): CodingTestResult => ({
    name: command,
    command,
    status: ((report.exitCodes ?? [])[index] ?? 0) === 0 ? "passed" : "failed",
    passed: ((report.exitCodes ?? [])[index] ?? 0) === 0,
    exitCode: (report.exitCodes ?? [])[index] ?? 0,
  }));
}

function acceptanceResults(batch: Pick<ImplementationBatch, "acceptanceCriteria">, review: CodeReviewReport, testReport: TestRunReport): AcceptanceCriterionResult[] {
  return batch.acceptanceCriteria.map((criterion): AcceptanceCriterionResult => ({
    criterion,
    status: testReport.success && !review.needsPlannerRevision ? "passed" : "not-run",
    passed: testReport.success && !review.needsPlannerRevision,
    evidence: testReport.success ? "Required test command completed successfully." : "Tests failed or were not run.",
  }));
}

function latestSuccessfulRepairApplied(repairLoopReport: RepairLoopReport): AppliedPatches | undefined {
  const iterations = repairLoopReport.iterations;
  for (let index = iterations.length - 1; index >= 0; index -= 1) {
    const iteration = iterations[index];
    if (iteration?.success) return iteration.applied;
  }
  return undefined;
}

function latestSuccessfulRepairTestReport(repairLoopReport: RepairLoopReport): TestRunReport | undefined {
  const iterations = repairLoopReport.iterations;
  for (let index = iterations.length - 1; index >= 0; index -= 1) {
    const iteration = iterations[index];
    if (iteration?.success) return iteration.testReport;
  }
  return undefined;
}

function resultForExecute({ artifacts, targetRepo, selectedBatch, batchesAttempted, applied, testReport, review, repairLoopReport }: {
  artifacts: NativeRunArtifacts;
  targetRepo: string;
  selectedBatch: ImplementationBatch;
  batchesAttempted: string[];
  applied: AppliedPatches;
  testReport: TestRunReport;
  review: CodeReviewReport;
  repairLoopReport: RepairLoopReport;
}): NativeAutonomousCodingResult {
  const repairedApplied = latestSuccessfulRepairApplied(repairLoopReport);
  const effectiveApplied = repairedApplied ?? applied;
  const repairedTestReport = latestSuccessfulRepairTestReport(repairLoopReport);
  const effectiveTestReport = repairedTestReport ?? testReport;
  const repairSucceeded = repairLoopReport.finalStatus === "completed";
  const policyViolations: CommandPolicyViolation[] = effectiveTestReport.policyViolations;
  const success = (effectiveTestReport.success || repairSucceeded) && (effectiveApplied.errors ?? []).length === 0 && policyViolations.length === 0 && !review.needsPlannerRevision;
  const codingTaskId = (selectedBatch.tasks ?? [])[0] ?? batchesAttempted[0] ?? "unknown-task";
  return {
    status: success ? "completed" : policyViolations.length > 0 ? "rejected" : "failed",
    runId: artifacts.handoff.runId || artifacts.goal.runId,
    handoffRunId: artifacts.handoff.runId || artifacts.goal.runId,
    codingAgentName: "NativeAutonomousCodingRuntime",
    codingTaskId,
    targetRepo,
    batchesAttempted,
    filesChanged: Array.from(new Set([...(applied.filesChanged ?? []), ...(effectiveApplied.filesChanged ?? [])])),
    filesCreated: [],
    filesDeleted: [],
    commandsRun: commandResultsFromReport(effectiveTestReport),
    commandExecutions: effectiveTestReport.commandExecutions ?? [],
    policyViolations,
    testsRun: effectiveTestReport.commands ?? [],
    testResults: testResultsFromReport(effectiveTestReport),
    acceptanceCriteriaResults: acceptanceResults({ acceptanceCriteria: [] }, review, testReport),
    forbiddenActionViolations: review.forbiddenActionViolations ?? [],
    allowedChangeAreaViolations: review.allowedChangeAreaViolations ?? [],
    unresolvedQuestions: [],
    implementationSummary: success ? "Native autonomous coding completed selected batch and tests passed." : "Native autonomous coding attempted selected batch but did not reach completion.",
    failureSummary: success ? "" : [
      ...(applied.errors ?? []),
      ...(effectiveTestReport.failedTests ?? []),
      ...(review.testCoverageWarnings ?? []),
      ...(review.forbiddenActionViolations ?? []),
      ...(review.allowedChangeAreaViolations ?? []),
      ...policyViolations.map((violation) => `Command policy violation: ${violation.code} - ${violation.message}`),
    ].join(" | "),
    needsPlannerRevision: review.needsPlannerRevision || !success,
  };
}

async function writeBaseArtifacts(runDir: string, repoAnalysis: RepoAnalysis, indexResult: { codebaseIndex: CodebaseIndex; repoContextPack: RepoContextPack }): Promise<void> {
  await writeJson(path.join(runDir, "repo-analysis.json"), repoAnalysis);
  await writeJson(path.join(runDir, "codebase-index.json"), indexResult.codebaseIndex);
  await writeJson(path.join(runDir, "repo-context-pack.json"), indexResult.repoContextPack);
}

export async function runNativeAutocode(options: NativeAutocodeOptions): Promise<NativeAutocodeRunResult> {
  const runDir = path.resolve(process.cwd(), options.runDir);
  const targetRepo = path.resolve(process.cwd(), options.targetRepo);
  const mode = options.mode ?? "dry-run";
  await mkdir(runDir, { recursive: true });
  const artifacts = loadNativeRunArtifacts(runDir);
  const blockedByPlanningGate = isBlocked(artifacts);
  const repoAnalysis = await analyzeRepo(targetRepo, {
    runGitStatus: mode === "execute" && !blockedByPlanningGate,
  });
  const indexResult = indexCodebase(targetRepo, {
    maxFiles: options.maxFiles ?? 120,
    maxChars: options.maxChars ?? 40_000,
  });
  await writeBaseArtifacts(runDir, repoAnalysis, indexResult);

  if (blockedByPlanningGate) {
    const result = resultForBlocked({ artifacts, targetRepo, reasons: blockingReasons(artifacts) });
    await writeJson(path.join(runDir, "autonomous-coding-result.json"), result);
    return { status: "blocked", runDir, repoAnalysis, codebaseIndex: indexResult.codebaseIndex, repoContextPack: indexResult.repoContextPack, autonomousCodingResult: result };
  }

  if (mode === "execute" && !options.allowDirty && repoAnalysis.isClean === false) {
    const result: NativeAutonomousCodingResult = {
      ...resultForBlocked({ artifacts, targetRepo, reasons: ["Target repo has uncommitted changes and --allow-dirty was not set."] }),
      status: "rejected",
      codingTaskId: "dirty-repo-gate",
    };
    await writeJson(path.join(runDir, "autonomous-coding-result.json"), result);
    return { status: "rejected", runDir, repoAnalysis, autonomousCodingResult: result };
  }

  const batchPlan = buildImplementationBatchPlan({
    handoff: artifacts.handoff,
    taskPackages: artifacts.taskPackages,
    technicalRoutePlan: artifacts.technicalRoutePlan,
    technicalSolutionIntegrationPlan: artifacts.technicalSolutionIntegrationPlan,
    executionTaskGraph: artifacts.executionTaskGraph,
    repoAnalysis,
    codebaseIndex: indexResult.codebaseIndex,
  });
  await writeJson(path.join(runDir, "implementation-batch-plan.json"), batchPlan);

  if (mode === "plan-only") {
    const result = resultForPartial({ artifacts, targetRepo, mode, batchPlan });
    await writeJson(path.join(runDir, "autonomous-coding-result.json"), result);
    return { status: "partial", runDir, repoAnalysis, batchPlan, autonomousCodingResult: result };
  }

  const selectedBatches = selectBatches(batchPlan, options.batch ?? "first");
  const selectedBatch = selectedBatches[0];
  if (!selectedBatch) {
    const result: NativeAutonomousCodingResult = {
      ...resultForBlocked({ artifacts, targetRepo, reasons: ["No implementation batch was available."] }),
      status: "failed",
      codingTaskId: "no-batch",
    };
    await writeJson(path.join(runDir, "autonomous-coding-result.json"), result);
    return { status: "failed", runDir, repoAnalysis, batchPlan, autonomousCodingResult: result };
  }

  const patchPlanResult = await planNativePatch({
    runDir,
    goal: artifacts.handoff.goal,
    handoff: artifacts.handoff,
    batch: selectedBatch,
    repoAnalysis,
    repoContextPack: indexResult.repoContextPack,
    sourceArtifacts: {
      technicalRoutePlan: artifacts.technicalRoutePlan,
      technicalSolutionIntegrationPlan: artifacts.technicalSolutionIntegrationPlan,
      executionTaskGraph: artifacts.executionTaskGraph,
    },
  });
  const patchPlan = patchPlanResult.patchPlan;
  await writeJson(path.join(runDir, "native-patch-plan.json"), patchPlan);

  if (mode === "dry-run") {
    const result = resultForPartial({ artifacts, targetRepo, mode, batchPlan, patchPlan });
    await writeJson(path.join(runDir, "autonomous-coding-result.json"), result);
    return { status: "partial", runDir, repoAnalysis, batchPlan, patchPlan, autonomousCodingResult: result };
  }

  const allowedChangeAreas = allowedAreasForBatch(artifacts.taskPackages, selectedBatch);
  const forbiddenChangeAreas = forbiddenAreasForBatch(artifacts.taskPackages, selectedBatch, artifacts.handoff);
  const applied = applyNativePatchPlan({
    targetRepo,
    patchPlan,
    allowedChangeAreas,
    forbiddenChangeAreas,
    dryRun: false,
  });
  await writeJson(path.join(runDir, "applied-patches.json"), applied);

  const testReport = options.skipTests
    ? { commands: [], exitCodes: [], stdoutSummary: [], stderrSummary: [], failedTests: [], durationMs: 0, success: true, commandExecutions: [], policyViolations: [], outputTruncated: false }
    : await runTestCommands({
      targetRepo,
      batch: selectedBatch,
      repoAnalysis,
      testCommand: options.testCommand,
      skipTests: false,
    });
  await writeJson(path.join(runDir, "test-run-report.json"), testReport);

  const failureContext = testReport.success && applied.errors.length === 0
    ? { failureType: "none", failedCommand: "", relevantErrorLines: [], likelyCauses: [], filesLikelyInvolved: [], repairHints: [], shouldAttemptRepair: false }
    : analyzeBuildFailure({ testRunReport: testReport, appliedPatches: applied });
  await writeJson(path.join(runDir, "failure-context.json"), failureContext);

  const repairLoopReport = testReport.success && applied.errors.length === 0
    ? { iterations: [], patchesApplied: 0, testsRun: testReport.commands.length, failures: [], repairsAttempted: 0, finalStatus: "completed", stoppedReason: "initial tests passed" }
    : await runRepairLoop({
      maxIterations: options.maxIterations ?? 5,
      initialTestReport: testReport,
      initialFailureContext: failureContext,
      planRepair: async ({ iteration, failureContext }) => {
        const repairPlanResult = await planNativePatch({
          runDir,
          goal: artifacts.handoff.goal,
          handoff: artifacts.handoff,
          batch: { ...selectedBatch, batchId: `${selectedBatch.batchId}-repair-${iteration}` },
          repoAnalysis,
          repoContextPack: indexResult.repoContextPack,
          sourceArtifacts: { failureContext },
        });
        return repairPlanResult.patchPlan;
      },
      applyRepair: async ({ repairPlan }) => applyNativePatchPlan({
        targetRepo,
        patchPlan: repairPlan,
        allowedChangeAreas,
        forbiddenChangeAreas,
        dryRun: false,
      }),
      runTests: async () => runTestCommands({
        targetRepo,
        batch: selectedBatch,
        repoAnalysis,
        testCommand: options.testCommand,
        skipTests: false,
      }),
      analyzeFailure: async ({ testReport }) => analyzeBuildFailure({ testRunReport: testReport }),
    });
  await writeJson(path.join(runDir, "repair-loop-report.json"), repairLoopReport);

  const repairedApplied = latestSuccessfulRepairApplied(repairLoopReport);
  const repairedTestReport = latestSuccessfulRepairTestReport(repairLoopReport);
  const effectiveFilesChanged = Array.from(new Set([...(applied.filesChanged ?? []), ...(repairedApplied?.filesChanged ?? [])]));
  const effectiveTestReport = repairedTestReport ?? testReport;
  const review = reviewNativeCodingResult({
    targetRepo,
    filesChanged: effectiveFilesChanged,
    allowedChangeAreas,
    forbiddenChangeAreas,
    batch: selectedBatch,
    testRunReport: effectiveTestReport,
  });
  await writeJson(path.join(runDir, "code-review-report.json"), review);

  const result = resultForExecute({
    artifacts,
    targetRepo,
    selectedBatch,
    batchesAttempted: [selectedBatch.batchId],
    applied,
    testReport,
    review,
    repairLoopReport,
  });
  result.acceptanceCriteriaResults = acceptanceResults(selectedBatch, review, testReport);
  await writeJson(path.join(runDir, "autonomous-coding-result.json"), result);
  return {
    status: result.status,
    runDir,
    repoAnalysis,
    codebaseIndex: indexResult.codebaseIndex,
    repoContextPack: indexResult.repoContextPack,
    batchPlan,
    patchPlan,
    applied,
    testReport,
    failureContext,
    repairLoopReport,
    codeReviewReport: review,
    autonomousCodingResult: result,
  };
}