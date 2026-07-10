import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { CodingHandoff, CodingHandoffStatus, CodingTaskPackage } from "../types/coding-handoff.js";

interface GateArtifact {
  canProceedToCoding: boolean;
  blockingReasons: string[];
  globalBlockingReasons: string[];
}

export interface NativeRunArtifacts {
  goal: { runId: string; rawGoal: string };
  handoff: CodingHandoff;
  selectedRoute: GateArtifact;
  executionTaskGraph: GateArtifact;
  technicalRoutePlan: unknown;
  technicalSolutionIntegrationPlan: unknown;
  taskPackages: CodingTaskPackage[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readJsonUnknown(filePath: string): unknown {
  if (!existsSync(filePath)) return undefined;
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  } catch {
    return undefined;
  }
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function handoffStatus(value: unknown): CodingHandoffStatus {
  return value === "approved" || value === "conditional" || value === "blocked" ? value : "blocked";
}

export function parseCodingHandoffArtifact(value: unknown, fallbackRunId = "unknown", fallbackGoal = ""): CodingHandoff {
  const record = isRecord(value) ? value : {};
  const status = handoffStatus(record.handoffStatus);
  const explicitlyApproved = record.canProceedToCoding === true && status !== "blocked";
  return {
    runId: stringValue(record.runId, fallbackRunId),
    goal: stringValue(record.goal, fallbackGoal),
    handoffStatus: explicitlyApproved ? status : "blocked",
    canProceedToCoding: explicitlyApproved,
    selectedRouteId: stringValue(record.selectedRouteId),
    selectedRouteTitle: stringValue(record.selectedRouteTitle),
    routeStatus: stringValue(record.routeStatus, explicitlyApproved ? status : "blocked"),
    sourceArtifacts: stringArray(record.sourceArtifacts),
    approvedCodingTasks: explicitlyApproved ? stringArray(record.approvedCodingTasks) : [],
    conditionalCodingTasks: explicitlyApproved ? stringArray(record.conditionalCodingTasks) : [],
    blockedCodingTasks: stringArray(record.blockedCodingTasks),
    globalConstraints: stringArray(record.globalConstraints),
    forbiddenActions: stringArray(record.forbiddenActions),
    requiredBeforeCoding: stringArray(record.requiredBeforeCoding),
    implementationOrder: explicitlyApproved ? stringArray(record.implementationOrder) : [],
    acceptanceTestStrategy: stringArray(record.acceptanceTestStrategy),
    rollbackStrategy: stringArray(record.rollbackStrategy),
    codingAgentInstructions: stringArray(record.codingAgentInstructions),
  };
}

export function parseCodingTaskPackageArtifact(value: unknown): CodingTaskPackage | undefined {
  if (!isRecord(value) || typeof value.taskId !== "string" || !value.taskId) return undefined;
  return {
    taskId: value.taskId,
    title: stringValue(value.title, value.taskId),
    planningSource: stringArray(value.planningSource),
    goal: stringValue(value.goal),
    implementationIntent: stringValue(value.implementationIntent),
    inputArtifacts: stringArray(value.inputArtifacts),
    expectedOutputs: stringArray(value.expectedOutputs),
    allowedChangeAreas: stringArray(value.allowedChangeAreas),
    forbiddenChangeAreas: stringArray(value.forbiddenChangeAreas),
    dependencies: stringArray(value.dependencies),
    dataModelRequirements: stringArray(value.dataModelRequirements),
    workflowRequirements: stringArray(value.workflowRequirements),
    permissionRequirements: stringArray(value.permissionRequirements),
    auditRequirements: stringArray(value.auditRequirements),
    validationRules: stringArray(value.validationRules),
    testRequirements: stringArray(value.testRequirements),
    acceptanceCriteria: stringArray(value.acceptanceCriteria),
    riskNotes: stringArray(value.riskNotes),
    stopConditions: stringArray(value.stopConditions),
  };
}

function canonicalizeGate(value: unknown): GateArtifact {
  const record = isRecord(value) ? value : {};
  return {
    canProceedToCoding: record.canProceedToCoding === true,
    blockingReasons: stringArray(record.blockingReasons),
    globalBlockingReasons: stringArray(record.globalBlockingReasons),
  };
}

export function loadNativeRunArtifacts(runDir: string): NativeRunArtifacts {
  const goalValue = readJsonUnknown(path.join(runDir, "goal.json"));
  const goalRecord = isRecord(goalValue) ? goalValue : {};
  const goal = {
    runId: stringValue(goalRecord.runId, "unknown"),
    rawGoal: stringValue(goalRecord.rawGoal),
  };
  const packageDir = path.join(runDir, "coding-task-packages");
  const taskPackages = existsSync(packageDir)
    ? readdirSync(packageDir)
        .filter((file) => file.endsWith(".json"))
        .map((file) => parseCodingTaskPackageArtifact(readJsonUnknown(path.join(packageDir, file))))
        .filter((item): item is CodingTaskPackage => item !== undefined)
    : [];
  return {
    goal,
    handoff: parseCodingHandoffArtifact(readJsonUnknown(path.join(runDir, "coding-handoff.json")), goal.runId, goal.rawGoal),
    selectedRoute: canonicalizeGate(readJsonUnknown(path.join(runDir, "selected-route.json"))),
    executionTaskGraph: canonicalizeGate(readJsonUnknown(path.join(runDir, "execution-task-graph.json"))),
    technicalRoutePlan: readJsonUnknown(path.join(runDir, "technical-route-plan.json")) ?? {},
    technicalSolutionIntegrationPlan: readJsonUnknown(path.join(runDir, "technical-solution-integration-plan.json")) ?? {},
    taskPackages,
  };
}