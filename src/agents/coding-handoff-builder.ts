import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ExecutionTask, RiskLevel } from "../types/artifacts.js";
import type {
  CodingHandoff,
  CodingHandoffBuildResult,
  CodingHandoffSourceArtifacts,
  CodingHandoffStatus,
  CodingTaskPackage,
  PreCodingResolutionPack,
} from "../types/coding-handoff.js";
import { buildCodingTaskPackages, buildPreCodingTaskMarkdownTasks, taskPackageFileName } from "./coding-task-packager.js";
import { redactSecretText, redactSecrets } from "../security/secret-redactor.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readJson(runDir: string, fileName: string): unknown {
  const filePath = path.join(runDir, fileName);
  if (!existsSync(filePath)) return undefined;
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  } catch {
    return undefined;
  }
}

function readText(runDir: string, fileName: string, fallback = ""): string {
  const filePath = path.join(runDir, fileName);
  if (!existsSync(filePath)) return fallback;
  return readFileSync(filePath, "utf8");
}

function uniq(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)));
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function recordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => isRecord(item)) : [];
}

function parseExecutionTask(value: unknown): ExecutionTask | undefined {
  if (!isRecord(value) || typeof value.id !== "string") return undefined;
  const riskLevel: RiskLevel = value.riskLevel === "high" || value.riskLevel === "medium" ? value.riskLevel : "low";
  return {
    id: value.id,
    title: stringValue(value.title, value.id),
    dependsOn: stringArray(value.dependsOn),
    ownerAgent: stringValue(value.ownerAgent, "CodingAgent"),
    purpose: stringValue(value.purpose),
    deliverables: stringArray(value.deliverables),
    acceptanceCriteria: stringArray(value.acceptanceCriteria),
    riskLevel,
    evidenceRefs: stringArray(value.evidenceRefs),
    decisionRefs: stringArray(value.decisionRefs),
    derivedFromCapabilities: stringArray(value.derivedFromCapabilities),
    derivedFromRisks: stringArray(value.derivedFromRisks),
    verificationHint: typeof value.verificationHint === "string" ? value.verificationHint : undefined,
    claimRefs: stringArray(value.claimRefs),
    requiredEvidenceBeforeExecution: stringArray(value.requiredEvidenceBeforeExecution),
    evidenceGapRisk: value.evidenceGapRisk === "high" || value.evidenceGapRisk === "medium" || value.evidenceGapRisk === "low" ? value.evidenceGapRisk : undefined,
    shouldBlockCodingUntilResolved: value.shouldBlockCodingUntilResolved === true,
  };
}

function optionalListRecord(value: unknown, fields: string[]): Record<string, string[]> | undefined {
  if (!isRecord(value)) return undefined;
  return Object.fromEntries(fields.map((field) => [field, stringArray(value[field])]));
}

function sourceArtifacts(): string[] {
  return [
    "goal.json",
    "reconstructed-intent.json",
    "product-intent.json",
    "selected-route.json",
    "execution-task-graph.json",
    "technical-route-plan.json",
    "productization-forecast.json",
    "problem-resolution-plan.json",
    "technical-route-scorecard.json",
    "technical-solution-candidates.json",
    "technical-solution-decision-matrix.json",
    "technical-solution-integration-plan.json",
    "final-thinking-report.md",
  ];
}

export function loadCodingHandoffArtifacts(runDir: string): CodingHandoffSourceArtifacts {
  const goal = isRecord(readJson(runDir, "goal.json")) ? readJson(runDir, "goal.json") : undefined;
  const goalRecord = isRecord(goal) ? goal : {};
  const selectedValue = readJson(runDir, "selected-route.json");
  const selected = isRecord(selectedValue) ? selectedValue : {};
  const graphValue = readJson(runDir, "execution-task-graph.json");
  const graph = isRecord(graphValue) ? graphValue : {};
  const routeValue = readJson(runDir, "technical-route-plan.json");
  const routePlan = isRecord(routeValue) ? routeValue : {};
  const scoreValue = readJson(runDir, "technical-route-scorecard.json");
  const scorecard = isRecord(scoreValue) ? scoreValue : {};
  const candidatesValue = readJson(runDir, "technical-solution-candidates.json");
  const candidates = isRecord(candidatesValue) ? candidatesValue : {};
  const integrationValue = readJson(runDir, "technical-solution-integration-plan.json");
  const integration = isRecord(integrationValue) ? integrationValue : {};
  const technicalRoutes = recordArray(routePlan.routes).map((route) => ({
    strategyId: stringValue(route.strategyId),
    databaseModel: isRecord(route.databaseModel) ? {
      entities: recordArray(route.databaseModel.entities).map((entity) => ({ name: stringValue(entity.name), fields: stringArray(entity.fields) })),
      constraints: stringArray(route.databaseModel.constraints),
    } : undefined,
    stateMachines: recordArray(route.stateMachines).map((machine) => ({ name: stringValue(machine.name), states: stringArray(machine.states) })),
    approvalWorkflowModel: optionalListRecord(route.approvalWorkflowModel, ["workflows"]),
    conflictDetectionModel: optionalListRecord(route.conflictDetectionModel, ["rules"]),
    permissionModel: optionalListRecord(route.permissionModel, ["resourceActions", "boundaries"]),
    auditLogModel: optionalListRecord(route.auditLogModel, ["events", "actorContext", "retention"]),
    testingPlan: stringArray(route.testingPlan),
    backupAndRecoveryPlan: stringArray(route.backupAndRecoveryPlan),
    unresolvedTechnicalQuestions: stringArray(route.unresolvedTechnicalQuestions),
  }));
  const integrationItems = recordArray(integration.items).map((item) => ({
    problemId: stringValue(item.problemId),
    problemStatement: stringValue(item.problemStatement),
    selectedSolution: stringValue(item.selectedSolution),
    dataModelChanges: stringArray(item.dataModelChanges),
    serviceLayerChanges: stringArray(item.serviceLayerChanges),
    apiContractChanges: stringArray(item.apiContractChanges),
    workflowChanges: stringArray(item.workflowChanges),
    permissionChanges: stringArray(item.permissionChanges),
    auditChanges: stringArray(item.auditChanges),
    testingChanges: stringArray(item.testingChanges),
    migrationChanges: stringArray(item.migrationChanges),
    operationRunbookChanges: stringArray(item.operationRunbookChanges),
    impactsCodingReadiness: stringValue(item.impactsCodingReadiness),
    stillBlocksCoding: item.stillBlocksCoding === true,
  }));
  return {
    goal: { runId: stringValue(goalRecord.runId, "unknown"), rawGoal: stringValue(goalRecord.rawGoal) },
    reconstructedIntent: readJson(runDir, "reconstructed-intent.json"),
    productIntent: readJson(runDir, "product-intent.json"),
    selectedRoute: {
      selectedStrategyId: stringValue(selected.selectedStrategyId, "unknown"),
      selectedTitle: stringValue(selected.selectedTitle, "unknown"),
      selectionStatus: selected.selectionStatus === "selected" || selected.selectionStatus === "conditional" || selected.selectionStatus === "blocked" ? selected.selectionStatus : "blocked",
      canProceedToCoding: selected.canProceedToCoding === true,
      blockingReasons: stringArray(selected.blockingReasons),
      requiredClarificationsBeforeCoding: stringArray(selected.requiredClarificationsBeforeCoding),
      evidenceGapsAccepted: stringArray(selected.evidenceGapsAccepted),
      missingEvidenceThatCouldChangeDecision: stringArray(selected.missingEvidenceThatCouldChangeDecision),
    },
    executionTaskGraph: {
      canProceedToCoding: graph.canProceedToCoding === true,
      globalBlockingReasons: stringArray(graph.globalBlockingReasons),
      requiredClarificationsBeforeCoding: stringArray(graph.requiredClarificationsBeforeCoding),
      tasks: (Array.isArray(graph.tasks) ? graph.tasks : []).map(parseExecutionTask).filter((task): task is ExecutionTask => task !== undefined),
      suggestedExecutionOrder: stringArray(graph.suggestedExecutionOrder),
    },
    technicalRoutePlan: { routes: technicalRoutes },
    productizationForecast: readJson(runDir, "productization-forecast.json"),
    problemResolutionPlan: readJson(runDir, "problem-resolution-plan.json"),
    technicalRouteScorecard: {
      canProceedToCoding: scorecard.canProceedToCoding === true,
      inheritedBlockingReasons: stringArray(scorecard.inheritedBlockingReasons),
      routeScores: recordArray(scorecard.routeScores).map((score) => ({
        codingReadiness: score.codingReadiness === "approved" || score.codingReadiness === "conditional" ? score.codingReadiness : "blocked",
      })),
    },
    technicalSolutionCandidates: {
      problems: recordArray(candidates.problems).map((problem) => ({ remainingUnknowns: stringArray(problem.remainingUnknowns) })),
    },
    technicalSolutionDecisionMatrix: readJson(runDir, "technical-solution-decision-matrix.json"),
    technicalSolutionIntegrationPlan: { items: integrationItems },
    finalThinkingReport: { markdown: readText(runDir, "final-thinking-report.md") },
  };
}

function handoffStatusFor(artifacts: CodingHandoffSourceArtifacts): CodingHandoffStatus {
  if (artifacts.selectedRoute?.canProceedToCoding === false || artifacts.executionTaskGraph?.canProceedToCoding === false || artifacts.technicalRouteScorecard?.canProceedToCoding === false) {
    return "blocked";
  }
  const routeStatus = artifacts.selectedRoute?.selectionStatus;
  const scorecardReadiness = (artifacts.technicalRouteScorecard?.routeScores ?? []).map((score) => score.codingReadiness);
  if (routeStatus === "conditional" || scorecardReadiness.includes("conditional")) return "conditional";
  return "approved";
}

function preCodingPackFor(artifacts: CodingHandoffSourceArtifacts): PreCodingResolutionPack {
  const blockingReasons = uniq([
    ...(artifacts.selectedRoute?.blockingReasons ?? []),
    ...(artifacts.executionTaskGraph?.globalBlockingReasons ?? []),
    ...(artifacts.technicalRouteScorecard?.inheritedBlockingReasons ?? []),
  ]);
  const requiredClarifications = uniq([
    ...(artifacts.selectedRoute?.requiredClarificationsBeforeCoding ?? []),
    ...(artifacts.executionTaskGraph?.requiredClarificationsBeforeCoding ?? []),
  ]);
  const unresolvedTechnicalQuestions = uniq([
    ...(artifacts.technicalRoutePlan?.routes ?? []).flatMap((route) => route.unresolvedTechnicalQuestions ?? []),
    ...(artifacts.technicalSolutionCandidates?.problems ?? []).flatMap((problem) => problem.remainingUnknowns ?? []),
  ]);
  const unresolvedEvidenceGaps = uniq([
    ...(artifacts.selectedRoute?.evidenceGapsAccepted ?? []),
    ...(artifacts.selectedRoute?.missingEvidenceThatCouldChangeDecision ?? []),
    ...(artifacts.executionTaskGraph?.tasks ?? []).flatMap((task) => task.requiredEvidenceBeforeExecution ?? []),
  ]);
  const criticBlockingIssues = blockingReasons.filter((reason) => String(reason).toLowerCase().includes("critic"));
  return {
    blockingReasons,
    requiredClarifications,
    unresolvedEvidenceGaps,
    unresolvedTechnicalQuestions,
    criticBlockingIssues: criticBlockingIssues.length > 0 ? criticBlockingIssues : blockingReasons.slice(0, 6),
    recommendedResearchTasks: [
      "Resolve unanswered integration contracts before implementation.",
      "Confirm workflow policy and data-retention decisions with domain owner.",
      "Regenerate route selection after blockers are resolved.",
    ],
    recommendedHumanDecisions: [
      "Decide whether current selected route can become coding-approved.",
      "Approve user scale, integration systems, workflow policy, and retention boundaries.",
      "Confirm which technical solution candidates are accepted for phase one.",
    ],
    artifactsToRegenerateAfterResolution: [
      "selected-route.json",
      "execution-task-graph.json",
      "technical-route-scorecard.json",
      "technical-solution-integration-plan.json",
      "coding-handoff.json",
    ],
  };
}

function acceptanceTestStrategy(artifacts: CodingHandoffSourceArtifacts): string[] {
  return uniq([
    ...(artifacts.executionTaskGraph?.tasks ?? []).flatMap((task) => task.verificationHint ? [task.verificationHint] : []),
    ...(artifacts.technicalRoutePlan?.routes ?? []).flatMap((route) => route.testingPlan ?? []),
    ...(artifacts.technicalSolutionIntegrationPlan?.items ?? []).flatMap((item) => item.testingChanges ?? []),
  ]).slice(0, 20);
}

function rollbackStrategy(artifacts: CodingHandoffSourceArtifacts): string[] {
  return uniq([
    ...(artifacts.technicalRoutePlan?.routes ?? []).flatMap((route) => route.backupAndRecoveryPlan ?? []),
    ...(artifacts.technicalSolutionIntegrationPlan?.items ?? []).flatMap((item) => item.migrationChanges ?? []),
    "Keep implementation changes small enough for task-level revert.",
    "Stop and report if repository reality contradicts handoff constraints.",
  ]).slice(0, 16);
}

function codingAgentInstructionsFor(status: CodingHandoffStatus): string[] {
  if (status === "blocked") {
    return [
      "Do not implement code yet.",
      "Summarize blockers.",
      "Ask for missing information.",
      "Do not create files.",
      "Do not modify repository.",
      "Return clarification questions and required decisions only.",
    ];
  }
  return [
    "You are a coding agent receiving a controlled handoff.",
    "Use only approvedCodingTasks.",
    "Do not reinterpret product scope.",
    "Do not implement tasks outside allowedChangeAreas.",
    "Run required tests.",
    "Return coding-result.json.",
  ];
}

export function buildCodingHandoff(artifacts: CodingHandoffSourceArtifacts): CodingHandoffBuildResult {
  const status = handoffStatusFor(artifacts);
  const taskPackages = buildCodingTaskPackages(artifacts, status);
  const approvedCodingTasks = status === "approved" ? taskPackages.map((task) => task.taskId) : [];
  const conditionalCodingTasks = status === "conditional" ? taskPackages.map((task) => task.taskId) : [];
  const preCodingPack = preCodingPackFor(artifacts);
  const blockedCodingTasks = status === "blocked"
    ? ["clarify-user-scale", "clarify-integration-systems", "clarify-workflow-policy", "clarify-data-retention"]
    : [];
  const handoff: CodingHandoff = {
    runId: artifacts.goal.runId,
    goal: artifacts.goal.rawGoal,
    handoffStatus: status,
    canProceedToCoding: status !== "blocked",
    selectedRouteId: artifacts.selectedRoute?.selectedStrategyId ?? "unknown",
    selectedRouteTitle: artifacts.selectedRoute?.selectedTitle ?? "unknown",
    routeStatus: artifacts.selectedRoute?.selectionStatus ?? "selected",
    sourceArtifacts: sourceArtifacts(),
    approvedCodingTasks,
    conditionalCodingTasks,
    blockedCodingTasks,
    globalConstraints: [
      "Coding Agent must use this handoff as the source of truth.",
      "Coding Agent must not reinterpret product scope.",
      "Coding Agent must stop on missing repository context, conflicting requirements, or out-of-scope changes.",
    ],
    forbiddenActions: [
      "Do not implement business code when handoffStatus is blocked.",
      "Do not modify target repository from the thinking run.",
      "Do not scan unrelated repositories.",
      "Do not create UI, dashboard, terminal panel, diff viewer, or landing page unless an approved task explicitly asks for it.",
      "Do not bypass canProceedToCoding=false.",
    ],
    requiredBeforeCoding: status === "blocked" ? preCodingPack.requiredClarifications : [],
    implementationOrder: artifacts.executionTaskGraph?.suggestedExecutionOrder ?? taskPackages.map((task) => task.taskId),
    acceptanceTestStrategy: acceptanceTestStrategy(artifacts),
    rollbackStrategy: rollbackStrategy(artifacts),
    codingAgentInstructions: codingAgentInstructionsFor(status),
  };
  return { handoff, taskPackages, preCodingPack };
}

export function buildCodingAgentPrompt(handoff: CodingHandoff, preCodingPack: PreCodingResolutionPack): string {
  if (handoff.handoffStatus === "blocked") {
    return [
      "# Coding Agent Prompt",
      "",
      "Do not implement code yet.",
      "",
      "This run is blocked and cannot be handed to implementation.",
      "",
      "## Blockers",
      ...(preCodingPack.blockingReasons ?? []).map((item) => `- ${item}`),
      "",
      "## Missing Information To Ask For",
      ...(preCodingPack.requiredClarifications ?? []).map((item) => `- ${item}`),
      "",
      "## Required Behavior",
      "- Summarize blockers.",
      "- Ask for missing information.",
      "- Do not create files.",
      "- Do not modify repository.",
      "- Do not run implementation steps.",
    ].join("\n");
  }
  return [
    "# Coding Agent Prompt",
    "",
    "You are a coding agent receiving a controlled handoff.",
    "",
    "Use only approvedCodingTasks.",
    "Do not reinterpret product scope.",
    "Do not implement tasks outside allowedChangeAreas.",
    "Run required tests.",
    "Return coding-result.json.",
    "",
    `Handoff status: ${handoff.handoffStatus}`,
    `Selected route: ${handoff.selectedRouteId} - ${handoff.selectedRouteTitle}`,
    "",
    "## Task IDs",
    ...[...handoff.approvedCodingTasks, ...handoff.conditionalCodingTasks].map((taskId) => `- ${taskId}`),
    "",
    "## Forbidden Actions",
    ...handoff.forbiddenActions.map((item) => `- ${item}`),
  ].join("\n");
}

async function writePackageFiles(runDir: string, status: CodingHandoffStatus, taskPackages: CodingTaskPackage[], preCodingPack: PreCodingResolutionPack): Promise<void> {
  const packageDir = path.join(runDir, "coding-task-packages");
  await mkdir(packageDir, { recursive: true });
  if (status === "blocked") {
    for (const task of buildPreCodingTaskMarkdownTasks(preCodingPack)) {
      await writeFile(path.join(packageDir, task.fileName), `${redactSecretText(task.markdown).trim()}\n`, "utf8");
    }
    return;
  }
  for (const taskPackage of taskPackages) {
    await writeFile(
      path.join(packageDir, taskPackageFileName(taskPackage)),
      `${JSON.stringify(redactSecrets(taskPackage), null, 2)}\n`,
      "utf8",
    );
  }
}

export async function writeCodingHandoffArtifacts(runDir: string, artifacts: CodingHandoffSourceArtifacts, options: { target?: string } = {}) {
  const target = options.target ?? "codex";
  const { handoff, taskPackages, preCodingPack } = buildCodingHandoff(artifacts);
  const prompt = buildCodingAgentPrompt(handoff, preCodingPack);
  await writeFile(path.join(runDir, "coding-handoff.json"), `${JSON.stringify(redactSecrets({ ...handoff, target }), null, 2)}\n`, "utf8");
  await writeFile(path.join(runDir, "pre-coding-resolution-pack.json"), `${JSON.stringify(redactSecrets(preCodingPack), null, 2)}\n`, "utf8");
  await writePackageFiles(runDir, handoff.handoffStatus, taskPackages, preCodingPack);
  await writeFile(path.join(runDir, "coding-agent-prompt.md"), `${redactSecretText(prompt).trim()}\n`, "utf8");
  return { handoff: { ...handoff, target }, taskPackages, preCodingPack, codingAgentPrompt: prompt };
}

export async function writeCodingHandoffForRun(runDir: string, options: { target?: string } = {}) {
  const artifacts = loadCodingHandoffArtifacts(runDir);
  return writeCodingHandoffArtifacts(runDir, artifacts, options);
}