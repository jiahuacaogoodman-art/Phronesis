import type { ExecutionTask, TechnicalSolutionIntegrationPlan } from "./artifacts.js";

export type CodingHandoffStatus = "blocked" | "conditional" | "approved";

export interface CodingTaskPackage {
  taskId: string;
  title: string;
  planningSource: string[];
  goal: string;
  implementationIntent: string;
  inputArtifacts: string[];
  expectedOutputs: string[];
  allowedChangeAreas: string[];
  forbiddenChangeAreas: string[];
  dependencies: string[];
  dataModelRequirements: string[];
  workflowRequirements: string[];
  permissionRequirements: string[];
  auditRequirements: string[];
  validationRules: string[];
  testRequirements: string[];
  acceptanceCriteria: string[];
  riskNotes: string[];
  stopConditions: string[];
}

export interface PreCodingResolutionPack {
  blockingReasons: string[];
  requiredClarifications: string[];
  unresolvedEvidenceGaps: string[];
  unresolvedTechnicalQuestions: string[];
  criticBlockingIssues: string[];
  recommendedResearchTasks: string[];
  recommendedHumanDecisions: string[];
  artifactsToRegenerateAfterResolution: string[];
}

export interface CodingHandoff {
  runId: string;
  goal: string;
  handoffStatus: CodingHandoffStatus;
  canProceedToCoding: boolean;
  selectedRouteId: string;
  selectedRouteTitle: string;
  routeStatus: string;
  sourceArtifacts: string[];
  approvedCodingTasks: string[];
  conditionalCodingTasks: string[];
  blockedCodingTasks: string[];
  globalConstraints: string[];
  forbiddenActions: string[];
  requiredBeforeCoding: string[];
  implementationOrder: string[];
  acceptanceTestStrategy: string[];
  rollbackStrategy: string[];
  codingAgentInstructions: string[];
}

export interface CodingAgentPreparedRun {
  adapterName: string;
  handoffStatus: CodingHandoffStatus;
  canProceedToCoding: boolean;
  taskPackageCount: number;
  promptPath?: string;
}

export interface CodingAgentAdapter {
  name: string;
  prepare(handoff: CodingHandoff): Promise<CodingAgentPreparedRun>;
}

export interface CodingHandoffSourceArtifacts {
  goal: { runId: string; rawGoal: string };
  reconstructedIntent: unknown;
  productIntent: unknown;
  selectedRoute: {
    selectedStrategyId: string;
    selectedTitle: string;
    selectionStatus?: "selected" | "conditional" | "blocked";
    canProceedToCoding?: boolean;
    blockingReasons?: string[];
    requiredClarificationsBeforeCoding?: string[];
    evidenceGapsAccepted?: string[];
    missingEvidenceThatCouldChangeDecision?: string[];
  };
  executionTaskGraph: {
    canProceedToCoding?: boolean;
    globalBlockingReasons?: string[];
    requiredClarificationsBeforeCoding?: string[];
    tasks: ExecutionTask[];
    suggestedExecutionOrder: string[];
  };
  technicalRoutePlan: {
    routes: Array<{
      strategyId: string;
      databaseModel?: { entities?: Array<{ name: string; fields?: string[] }>; constraints?: string[] };
      stateMachines?: Array<{ name: string; states?: string[] }>;
      approvalWorkflowModel?: { workflows?: string[] };
      conflictDetectionModel?: { rules?: string[] };
      permissionModel?: { resourceActions?: string[]; boundaries?: string[] };
      auditLogModel?: { events?: string[]; actorContext?: string[]; retention?: string[] };
      testingPlan?: string[];
      backupAndRecoveryPlan?: string[];
      unresolvedTechnicalQuestions?: string[];
    }>;
  };
  productizationForecast: unknown;
  problemResolutionPlan: unknown;
  technicalRouteScorecard: {
    canProceedToCoding: boolean;
    inheritedBlockingReasons?: string[];
    routeScores: Array<{ codingReadiness: "approved" | "conditional" | "blocked" }>;
  };
  technicalSolutionCandidates: { problems: Array<{ remainingUnknowns?: string[] }> };
  technicalSolutionDecisionMatrix: unknown;
  technicalSolutionIntegrationPlan: Pick<TechnicalSolutionIntegrationPlan, "items">;
  finalThinkingReport: { markdown: string };
}

export interface CodingHandoffBuildResult {
  handoff: CodingHandoff;
  taskPackages: CodingTaskPackage[];
  preCodingPack: PreCodingResolutionPack;
}

export class MockCodingAgentAdapter implements CodingAgentAdapter {
  name = "mock-coding-agent-adapter";

  async prepare(handoff: CodingHandoff): Promise<CodingAgentPreparedRun> {
    return {
      adapterName: this.name,
      handoffStatus: handoff.handoffStatus,
      canProceedToCoding: handoff.canProceedToCoding,
      taskPackageCount: handoff.approvedCodingTasks.length + handoff.conditionalCodingTasks.length,
    };
  }
}