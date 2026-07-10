import type { CommandPolicyDecision, CommandPolicyViolation, CommandSpec, SafeCommandResult } from "./command-execution.js";

export type CodingResultStatus = "completed" | "partial" | "failed" | "blocked" | "rejected";

export interface CodingCommandRun {
  command: string;
  commandSpec?: CommandSpec;
  policyDecision?: CommandPolicyDecision;
  policyViolations?: CommandPolicyViolation[];
  exitCode?: number;
  durationMs?: number;
  stdoutPreview?: string;
  stderrPreview?: string;
}

export interface CodingTestResult {
  name: string;
  command?: string;
  status?: "passed" | "failed" | "skipped";
  passed?: boolean;
  exitCode?: number;
  details?: string;
}

export interface AcceptanceCriterionResult {
  criterion: string;
  status?: "passed" | "failed" | "missing" | "not-run";
  passed?: boolean;
  evidence?: string;
  notes?: string;
}

interface CodingResultBase {
  handoffRunId: string;
  codingAgentName: string;
  codingTaskId: string;
  filesChanged: string[];
  filesCreated: string[];
  filesDeleted: string[];
  commandsRun: CodingCommandRun[];
  testsRun: string[];
  testResults: CodingTestResult[];
  acceptanceCriteriaResults: AcceptanceCriterionResult[];
  commandExecutions?: SafeCommandResult[];
  policyViolations?: CommandPolicyViolation[];
  forbiddenActionViolations: string[];
  allowedChangeAreaViolations: string[];
  unresolvedQuestions: string[];
  implementationSummary: string;
  failureSummary: string;
  needsPlannerRevision: boolean;
}

export type CodingResult =
  | (CodingResultBase & { status: "completed" })
  | (CodingResultBase & { status: "partial" })
  | (CodingResultBase & { status: "failed" })
  | (CodingResultBase & { status: "blocked" })
  | (CodingResultBase & { status: "rejected" });

export interface CodingFailureAnalysis {
  failureType: string;
  failedAcceptanceCriteria: string[];
  failedTests: string[];
  likelyPlanningCause: string[];
  likelyCodingCause: string[];
  missingSpecification: string[];
  violatedConstraints: string[];
  recommendedNextPlannerAction: string;
  shouldRegenerateHandoff: boolean;
  shouldReopenRouteSelection: boolean;
  shouldUpdateProblemResolutionPlan: boolean;
  shouldStopCoding: boolean;
}

export interface CodingFeedbackReport {
  handoffRunId: string;
  codingTaskId: string;
  codingAgentName: string;
  resultStatus: CodingResultStatus;
  handoffStatus: string;
  canProceedToCoding: boolean;
  valid: boolean;
  matchedHandoffRunId: boolean;
  validTask: boolean;
  forbiddenExecutionDetected: boolean;
  allowedChangeAreaViolations: string[];
  forbiddenActionViolations: string[];
  missingRequiredTests: string[];
  incompleteAcceptanceCheck: string[];
  failedTests: string[];
  failedAcceptanceCriteria: string[];
  unresolvedQuestions: string[];
  needsPlannerRevision: boolean;
  recommendedNextPlannerAction: string;
  shouldStopCoding: boolean;
  generatedArtifacts: string[];
}

export interface CodingResultValidation {
  matchedHandoffRunId: boolean;
  validTask: boolean;
  forbiddenExecutionDetected: boolean;
  allowedChangeAreaViolations: string[];
  forbiddenActionViolations: string[];
  missingRequiredTests: string[];
  incompleteAcceptanceCheck: string[];
  failedTests: string[];
  failedAcceptanceCriteria: string[];
}

export interface CodingFeedbackAnalysisInput {
  handoff: import("./coding-handoff.js").CodingHandoff;
  codingResult: CodingResult;
  taskPackage?: import("./coding-handoff.js").CodingTaskPackage;
  validation: CodingResultValidation;
}