import { RunManager } from "./run-manager.js";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { evaluateThinkingQuality, loadArtifactsForEvaluation } from "./evaluation/thinking-quality-evaluator.js";
import { writeCodingHandoffForRun } from "./agents/coding-handoff-builder.js";
import { ingestCodingResult } from "./agents/coding-result-ingestor.js";
import type { ThinkingMode } from "./llm/types.js";
import type { AutocodeEvalFixture } from "./types/autocode-eval.js";
import type { AutocodeMode } from "./types/native-coding.js";
import type { ConversationEvalScenarioId } from "./types/conversation-eval.js";
import { PROJECT_BANNER } from "./project-metadata.js";
import { redactSecrets } from "./security/secret-redactor.js";

function readGoal(argv: string[]): string | undefined {
  const goalFlagIndex = argv.findIndex((arg) => arg === "--goal" || arg === "-g");
  if (goalFlagIndex >= 0) {
    return argv[goalFlagIndex + 1];
  }

  const inlineGoal = argv.find((arg) => arg.startsWith("--goal="));
  if (inlineGoal) {
    return inlineGoal.slice("--goal=".length);
  }

  return undefined;
}

function normalizeThinkingMode(value: string): ThinkingMode {
  return value === "rule" || value === "llm" || value === "hybrid" ? value : "hybrid";
}

function readMode(argv: string[]): ThinkingMode {
  const modeFlagIndex = argv.findIndex((arg) => arg === "--mode" || arg === "-m");
  if (modeFlagIndex >= 0) {
    return normalizeThinkingMode(argv[modeFlagIndex + 1] ?? "hybrid");
  }

  const inlineMode = argv.find((arg) => arg.startsWith("--mode="));
  if (inlineMode) {
    return normalizeThinkingMode(inlineMode.slice("--mode=".length));
  }

  return "hybrid";
}

function autocodeMode(value: string): AutocodeMode {
  return value === "execute" || value === "plan-only" || value === "dry-run" ? value : "dry-run";
}

function autocodeEvalFixture(value: string): AutocodeEvalFixture {
  switch (value) {
    case "blocked":
    case "forbidden-file":
    case "repair-loop":
    case "typescript-basic":
      return value;
    default:
      return "typescript-basic";
  }
}

function executeMode(value: string): "execute" | "dry-run" {
  return value === "dry-run" ? "dry-run" : "execute";
}

function conversationScenario(value: string): ConversationEvalScenarioId | "all" {
  switch (value) {
    case "summarize-latest-run":
    case "explain-blocked-run":
    case "toy-eval-confirmation":
    case "blocked-autocode-execute":
    case "stale-confirmation":
    case "continue-context":
    case "all":
      return value;
    default:
      return "all";
  }
}

const scoreDimensionKeys = [
  "goalSpecificity",
  "productIntentDepth",
  "capabilityRelevance",
  "routeDiversity",
  "antiSimplificationStrength",
  "criticDisagreementQuality",
  "evidenceGapAwareness",
  "taskGraphExecutability",
  "avoidsGenericSaaSTalk",
  "finalReportUsefulness",
] as const;

function readRunDir(argv: string[]): string | undefined {
  const runFlagIndex = argv.findIndex((arg) => arg === "--run" || arg === "-r");
  if (runFlagIndex >= 0) {
    return argv[runFlagIndex + 1];
  }

  const inlineRun = argv.find((arg) => arg.startsWith("--run="));
  if (inlineRun) {
    return inlineRun.slice("--run=".length);
  }

  return undefined;
}

function readAgent(argv: string[]): string | undefined {
  const agentFlagIndex = argv.findIndex((arg) => arg === "--agent");
  if (agentFlagIndex >= 0) {
    return argv[agentFlagIndex + 1];
  }

  const inlineAgent = argv.find((arg) => arg.startsWith("--agent="));
  if (inlineAgent) {
    return inlineAgent.slice("--agent=".length);
  }

  return undefined;
}

function readTarget(argv: string[]): string {
  const targetFlagIndex = argv.findIndex((arg) => arg === "--target");
  if (targetFlagIndex >= 0) {
    return argv[targetFlagIndex + 1] ?? "codex";
  }

  const inlineTarget = argv.find((arg) => arg.startsWith("--target="));
  if (inlineTarget) {
    return inlineTarget.slice("--target=".length);
  }

  return "codex";
}

function readHandoffPath(argv: string[]): string | undefined {
  const handoffFlagIndex = argv.findIndex((arg) => arg === "--handoff");
  if (handoffFlagIndex >= 0) {
    return argv[handoffFlagIndex + 1];
  }

  const inlineHandoff = argv.find((arg) => arg.startsWith("--handoff="));
  if (inlineHandoff) {
    return inlineHandoff.slice("--handoff=".length);
  }

  return undefined;
}

function readResultPath(argv: string[]): string | undefined {
  const resultFlagIndex = argv.findIndex((arg) => arg === "--result");
  if (resultFlagIndex >= 0) {
    return argv[resultFlagIndex + 1];
  }

  const inlineResult = argv.find((arg) => arg.startsWith("--result="));
  if (inlineResult) {
    return inlineResult.slice("--result=".length);
  }

  return undefined;
}

function readTargetRepo(argv: string[]): string | undefined {
  const flagIndex = argv.findIndex((arg) => arg === "--target-repo");
  if (flagIndex >= 0) {
    return argv[flagIndex + 1];
  }

  const inline = argv.find((arg) => arg.startsWith("--target-repo="));
  if (inline) {
    return inline.slice("--target-repo=".length);
  }

  return undefined;
}

function readMessage(argv: string[]): string | undefined {
  const flagIndex = argv.findIndex((arg) => arg === "--message");
  if (flagIndex >= 0) {
    return argv[flagIndex + 1];
  }

  const inline = argv.find((arg) => arg.startsWith("--message="));
  if (inline) {
    return inline.slice("--message=".length);
  }

  return undefined;
}

function readConfirm(argv: string[]): string | undefined {
  const flagIndex = argv.findIndex((arg) => arg === "--confirm");
  if (flagIndex >= 0) {
    return argv[flagIndex + 1];
  }

  const inline = argv.find((arg) => arg.startsWith("--confirm="));
  if (inline) {
    return inline.slice("--confirm=".length);
  }

  return undefined;
}

function readOption(argv: string[], flag: string, fallback: string): string {
  const flagIndex = argv.findIndex((arg) => arg === flag);
  if (flagIndex >= 0) {
    return argv[flagIndex + 1] ?? fallback;
  }

  const inline = argv.find((arg) => arg.startsWith(`${flag}=`));
  if (inline) {
    return inline.slice(flag.length + 1);
  }

  return fallback;
}

function hasFlag(argv: string[], flag: string) {
  return argv.includes(flag);
}

const defaultSmokeAgents = ["GoalReconstructor", "ProductIntentBuilder"];
const allAISmokeAgents = [
  "GoalReconstructor",
  "ProductIntentBuilder",
  "ProductGradeExpander",
  "StrategyGenerator",
  "CriticCouncil",
  "TechnicalProductizationPlanner",
  "ProblemSolutionResearchAgent",
];

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(redactSecrets(value), null, 2)}\n`, "utf8");
}

async function runCommand(argv: string[]) {
  const goal = readGoal(argv);
  const mode = readMode(argv);
  const online = hasFlag(argv, "--online");
  if (!goal) {
    console.error('Usage: pnpm think:run --goal "做一个签到系统" --mode hybrid [--online]');
    process.exitCode = 1;
    return;
  }

  const manager = new RunManager();
  const result = await manager.run(goal, { mode, online });

  console.log(PROJECT_BANNER);
  console.log(`Run ID: ${result.runId}`);
  console.log(`Run directory: ${result.runDir}`);
  console.log(`Mode: ${result.artifacts.llmRunMetadata?.mode ?? mode}`);
  console.log(`Detected domain: ${result.artifacts.domainAnalysis.domainId} (${result.artifacts.domainAnalysis.confidence})`);
  console.log(`Selected route: ${result.artifacts.selectedRoute.selectedStrategyId} - ${result.artifacts.selectedRoute.selectedTitle}`);
  console.log("Artifacts written:");
  console.log("  goal.json");
  console.log("  domain-analysis.json");
  console.log("  product-intent.json");
  console.log("  evidence-ledger.json");
  console.log("  reconstructed-intent.json");
  console.log("  product-expansion.json");
  console.log("  research-plan.json");
  console.log("  evidence-map.json");
  console.log("  strategy-candidates.json");
  console.log("  route-deep-dive.json");
  console.log("  anti-simplification-report.json");
  console.log("  critic-council-report.json");
  console.log("  selected-route.json");
  console.log("  decision-ledger.json");
  console.log("  claim-graph.json");
  console.log("  llm-run-metadata.json");
  console.log("  architecture-plan.md");
  console.log("  execution-task-graph.json");
  console.log("  technical-route-plan.json");
  console.log("  productization-forecast.json");
  console.log("  problem-resolution-plan.json");
  console.log("  technical-route-scorecard.json");
  console.log("  technical-solution-research-plan.json");
  console.log("  technical-solution-search-results.json");
  console.log("  technical-solution-candidates.json");
  console.log("  technical-solution-decision-matrix.json");
  console.log("  technical-solution-integration-plan.json");
  console.log("  coding-handoff.json");
  console.log("  pre-coding-resolution-pack.json");
  console.log("  coding-task-packages/");
  console.log("  coding-agent-prompt.md");
  console.log("  final-thinking-report.md");
}

async function evaluateCommand(argv: string[]) {
  const runDirInput = readRunDir(argv);
  if (!runDirInput) {
    console.error("Usage: pnpm think:evaluate --run .runs/<run-id>");
    process.exitCode = 1;
    return;
  }

  const runDir = path.resolve(process.cwd(), runDirInput);
  const artifacts = loadArtifactsForEvaluation(runDir);
  const report = evaluateThinkingQuality({
    goal: artifacts.goal.rawGoal ?? "",
    runDir,
    artifacts,
  });
  const reportPath = path.join(runDir, "thinking-quality-report.json");
  await writeJson(reportPath, report);

  console.log(PROJECT_BANNER);
  console.log(`Evaluated run: ${runDir}`);
  console.log(`Quality report: ${reportPath}`);
  console.log(`Overall score: ${report.overallScore}`);
}

async function compareCommand(argv: string[]) {
  const goal = readGoal(argv);
  if (!goal) {
    console.error('Usage: pnpm think:compare --goal "做一个医院实习轮转管理系统"');
    process.exitCode = 1;
    return;
  }

  const manager = new RunManager();
  const ruleResult = await manager.run(goal, { mode: "rule" });
  const hybridResult = await manager.run(goal, { mode: "hybrid" });

  const ruleArtifacts = loadArtifactsForEvaluation(ruleResult.runDir);
  const hybridArtifacts = loadArtifactsForEvaluation(hybridResult.runDir);
  const ruleReport = evaluateThinkingQuality({ goal, runDir: ruleResult.runDir, artifacts: ruleArtifacts });
  const hybridReport = evaluateThinkingQuality({ goal, runDir: hybridResult.runDir, artifacts: hybridArtifacts });

  await writeJson(path.join(ruleResult.runDir, "thinking-quality-report.json"), ruleReport);
  await writeJson(path.join(hybridResult.runDir, "thinking-quality-report.json"), hybridReport);

  const hybridUsedLLM = (hybridArtifacts.llmRunMetadata?.agentsUsingLLM?.length ?? 0) > 0;
  const whetherHybridIsActuallyBetter = hybridUsedLLM && hybridReport.overallScore > ruleReport.overallScore;
  const improvements = [];
  const regressions = [];
  for (const key of scoreDimensionKeys) {
    const ruleDimension = ruleReport.scores[key];
    const hybridDimension = hybridReport.scores[key];
    if (hybridDimension.score > ruleDimension.score) {
      improvements.push(`${key}: ${ruleDimension.score} -> ${hybridDimension.score}`);
    } else if (hybridDimension.score < ruleDimension.score) {
      regressions.push(`${key}: ${ruleDimension.score} -> ${hybridDimension.score}`);
    }
  }

  const comparisonReport = {
    goal,
    ruleRunId: ruleReport.runId,
    hybridRunId: hybridReport.runId,
    ruleScore: ruleReport.overallScore,
    hybridScore: hybridReport.overallScore,
    improvements,
    regressions,
    recommendation: hybridUsedLLM
      ? whetherHybridIsActuallyBetter
        ? "Hybrid used LLM and scored higher on the evaluator, so it is a plausible quality improvement candidate."
        : "Hybrid used LLM but did not clearly beat rule on the evaluator, so do not claim AI uplift yet."
      : "Hybrid fell back to rule, so this comparison cannot prove AI quality improvement.",
    whetherHybridIsActuallyBetter,
  };

  const comparisonPath = path.join(hybridResult.runDir, "comparison-report.json");
  await writeJson(comparisonPath, comparisonReport);

  console.log(PROJECT_BANNER);
  console.log(`Rule run: ${ruleResult.runDir}`);
  console.log(`Hybrid run: ${hybridResult.runDir}`);
  console.log(`Comparison report: ${comparisonPath}`);
  console.log(`Rule score: ${ruleReport.overallScore}`);
  console.log(`Hybrid score: ${hybridReport.overallScore}`);
}

async function llmSmokeCommand(argv: string[]) {
  const goal = readGoal(argv) ?? "做一个医院实习轮转管理系统";
  const requestedAgent = readAgent(argv);
  const runAll = hasFlag(argv, "--all");
  const online = hasFlag(argv, "--online");
  const enabledAgents = requestedAgent
    ? new Set([requestedAgent])
    : runAll
      ? new Set(allAISmokeAgents)
      : new Set(defaultSmokeAgents);
  const manager = new RunManager();
  const result = await manager.run(goal, { mode: "llm", enabledAgents, online });
  const agentsUsingLLM = result.artifacts.llmRunMetadata?.agentsUsingLLM ?? [];
  const warnings = result.artifacts.llmRunMetadata?.warnings ?? [];

  console.log(PROJECT_BANNER);
  console.log(`Run ID: ${result.runId}`);
  console.log(`Run directory: ${result.runDir}`);
  console.log(`Mode: ${result.artifacts.llmRunMetadata?.mode ?? "llm"}`);
  console.log(`Smoke agents: ${Array.from(enabledAgents).join(", ")}`);
  console.log(`Online route deep dive: ${online ? "enabled" : "disabled"}`);
  console.log(`Agents using LLM: ${agentsUsingLLM.join(", ") || "none"}`);
  if (warnings.length > 0) {
    console.log(`Warnings: ${warnings.map((warning) => `${warning.agentName}:${warning.code}`).join(", ")}`);
  }
  if (agentsUsingLLM.length === 0) {
    throw new Error("LLM smoke failed: llm-run-metadata.json recorded no agentsUsingLLM.");
  }
}

async function handoffCommand(argv: string[]) {
  const runDirInput = readRunDir(argv);
  if (!runDirInput) {
    console.error("Usage: pnpm think:handoff --run .runs/<run-id> --target codex");
    process.exitCode = 1;
    return;
  }
  const target = readTarget(argv);
  const runDir = path.resolve(process.cwd(), runDirInput);
  const result = await writeCodingHandoffForRun(runDir, { target });
  console.log(PROJECT_BANNER);
  console.log(`Run directory: ${runDir}`);
  console.log(`Target: ${target}`);
  console.log(`Handoff status: ${result.handoff.handoffStatus}`);
  console.log(`Can proceed to coding: ${result.handoff.canProceedToCoding}`);
  console.log("Artifacts written:");
  console.log("  coding-handoff.json");
  console.log("  pre-coding-resolution-pack.json");
  console.log("  coding-task-packages/");
  console.log("  coding-agent-prompt.md");
  if (result.handoff.handoffStatus === "blocked") {
    console.log("Coding execution is not allowed for this run.");
  }
}

async function ingestCodingResultCommand(argv: string[]) {
  const handoffPath = readHandoffPath(argv);
  const resultPath = readResultPath(argv);
  if (!handoffPath || !resultPath) {
    console.error("Usage: pnpm think:ingest-coding-result --handoff .handoff/<id>/coding-handoff.json --result coding-result.json");
    process.exitCode = 1;
    return;
  }
  const result = await ingestCodingResult({ handoffPath, resultPath });
  console.log(PROJECT_BANNER);
  console.log(`Run directory: ${result.runDir}`);
  console.log(`Coding task: ${result.codingResult.codingTaskId}`);
  console.log(`Feedback valid: ${result.feedbackReport.valid}`);
  console.log(`Forbidden execution detected: ${result.feedbackReport.forbiddenExecutionDetected}`);
  console.log(`Recommended planner action: ${result.feedbackReport.recommendedNextPlannerAction}`);
  console.log("Artifacts written:");
  console.log("  coding-result.json");
  console.log("  coding-diff-summary.md");
  console.log("  coding-test-report.json");
  console.log("  coding-failure-analysis.json");
  console.log("  coding-feedback-report.json");
}

async function autocodeCommand(argv: string[]) {
  const runDirInput = readRunDir(argv);
  const targetRepo = readTargetRepo(argv);
  if (!runDirInput || !targetRepo) {
    console.error("Usage: pnpm think:autocode --run .runs/<run-id> --target-repo <path> --mode dry-run");
    process.exitCode = 1;
    return;
  }
  const mode = autocodeMode(readOption(argv, "--mode", "dry-run"));
  const maxIterations = Number(readOption(argv, "--max-iterations", "5"));
  const batch = readOption(argv, "--batch", "first");
  const testCommand = readOption(argv, "--test-command", "");
  const allowDirty = hasFlag(argv, "--allow-dirty");
  const skipTests = hasFlag(argv, "--skip-tests");
  const runDir = path.resolve(process.cwd(), runDirInput);
  const { runNativeAutocode } = await import("./coding/native-coding-runtime.js");
  const result = await runNativeAutocode({
    runDir,
    targetRepo,
    mode,
    maxIterations,
    allowDirty,
    skipTests,
    batch,
    testCommand: testCommand || undefined,
  });
  console.log(PROJECT_BANNER);
  console.log(`Run directory: ${result.runDir}`);
  console.log(`Target repo: ${path.resolve(process.cwd(), targetRepo)}`);
  console.log(`Mode: ${mode}`);
  console.log(`Status: ${result.autonomousCodingResult?.status ?? result.status}`);
  console.log("Artifacts written:");
  console.log("  repo-analysis.json");
  console.log("  codebase-index.json");
  console.log("  repo-context-pack.json");
  if (result.batchPlan) console.log("  implementation-batch-plan.json");
  if (result.patchPlan) console.log("  native-patch-plan.json");
  if (result.applied) console.log("  applied-patches.json");
  if (result.testReport) console.log("  test-run-report.json");
  if (result.failureContext) console.log("  failure-context.json");
  if (result.repairLoopReport) console.log("  repair-loop-report.json");
  if (result.codeReviewReport) console.log("  code-review-report.json");
  console.log("  autonomous-coding-result.json");
}

async function autocodeEvalCommand(argv: string[]) {
  const fixture = autocodeEvalFixture(readOption(argv, "--fixture", "typescript-basic"));
  const mode = executeMode(readOption(argv, "--mode", "execute"));
  const output = readOption(argv, "--output", "");
  const keepTemp = hasFlag(argv, "--keep-temp");
  const { runAutocodeEvalHarness } = await import("./eval/autocode-eval-harness.js");
  const result = await runAutocodeEvalHarness({
    fixture,
    mode,
    keepTemp,
    outputDir: output || undefined,
  });
  console.log(PROJECT_BANNER);
  console.log(`Eval ID: ${result.evalId}`);
  console.log(`Fixture: ${fixture}`);
  console.log(`Mode: ${mode}`);
  console.log(`Output directory: ${result.outputDir}`);
  console.log(`Toy repo: ${result.toyRepo.repoPath}`);
  console.log(`Fixture run: ${result.handoffFixture.runDir}`);
  console.log(`Checks passed: ${result.report.checksPassed}`);
  console.log(`Autocode status: ${result.report.autocodeStatus}`);
  console.log("Artifacts written:");
  console.log("  autocode-eval-plan.json");
  console.log("  autocode-eval-run-report.json");
  console.log("  autocode-eval-summary.md");
  console.log("  autocode-eval-fixtures/");
  if (!result.report.checksPassed) {
    console.log(`Failures: ${result.report.checkerFailures.join(" | ")}`);
    process.exitCode = 1;
  }
}

async function chatCommand(argv: string[]) {
  const message = readMessage(argv);
  const confirmationId = readConfirm(argv);
  if (!message && !confirmationId) {
    console.error('Usage: pnpm think:chat --message "总结最新 run"');
    console.error("       pnpm think:chat --confirm <confirmationId>");
    process.exitCode = 1;
    return;
  }
  const { runConversationTurn } = await import("./conversation/conversation-orchestrator.js");
  const result = await runConversationTurn({ message, confirmationId });
  console.log(PROJECT_BANNER);
  console.log(result.response);
  console.log("");
  console.log(`Conversation state: ${result.storeRoot}`);
}

async function conversationEvalCommand(argv: string[]) {
  const scenario = conversationScenario(readOption(argv, "--scenario", "all"));
  const sessionName = readOption(argv, "--session", "default");
  const output = readOption(argv, "--output", "");
  const keepTemp = hasFlag(argv, "--keep-temp");
  const { runConversationE2EHarness } = await import("./eval/conversation-e2e-harness.js");
  const result = await runConversationE2EHarness({
    scenario,
    sessionName,
    keepTemp,
    outputDir: output || undefined,
  });
  console.log(PROJECT_BANNER);
  console.log(`Eval ID: ${result.evalId}`);
  console.log(`Scenario: ${scenario}`);
  console.log(`Output directory: ${result.outputDir}`);
  console.log(`Passed: ${result.report.passed}`);
  console.log("Scenarios:");
  for (const item of result.report.results) {
    console.log(`  ${item.scenarioId}: ${item.passed ? "passed" : `failed (${item.failedChecks.join(", ")})`}`);
  }
  console.log("Artifacts written:");
  console.log("  conversation-eval-plan.json");
  console.log("  conversation-transcript.json");
  console.log("  conversation-eval-report.json");
  console.log("  conversation-eval-summary.md");
  if (!result.report.passed) {
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const command = argv[0]?.startsWith("--") || !argv[0] ? "run" : argv[0];
  const commandArgs = command === "run" ? argv : argv.slice(1);

  if (command === "run") return runCommand(commandArgs);
  if (command === "evaluate") return evaluateCommand(commandArgs);
  if (command === "compare") return compareCommand(commandArgs);
  if (command === "llm-smoke") return llmSmokeCommand(commandArgs);
  if (command === "handoff") return handoffCommand(commandArgs);
  if (command === "ingest-coding-result") return ingestCodingResultCommand(commandArgs);
  if (command === "autocode") return autocodeCommand(commandArgs);
  if (command === "autocode-eval") return autocodeEvalCommand(commandArgs);
  if (command === "chat") return chatCommand(commandArgs);
  if (command === "conversation-eval") return conversationEvalCommand(commandArgs);

  console.error(`Unknown command: ${command}`);
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Thinking run failed: ${message}`);
  process.exitCode = 1;
});