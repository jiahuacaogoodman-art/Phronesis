export type ConversationIntent =
  | "create_planning_run"
  | "inspect_latest_run"
  | "explain_blockers"
  | "continue_research"
  | "generate_handoff"
  | "run_autocode_dry_run"
  | "run_autocode_execute"
  | "run_autocode_eval"
  | "ingest_coding_result"
  | "summarize_artifacts"
  | "repair_from_failure"
  | "ask_clarifying_question"
  | "unknown";

export type RuntimeActionType =
  | "run_planning"
  | "inspect_latest_run"
  | "inspect_blockers"
  | "continue_research"
  | "generate_handoff"
  | "run_autocode_dry_run"
  | "run_autocode_execute"
  | "run_autocode_eval"
  | "ingest_coding_result"
  | "summarize_artifacts"
  | "repair_from_failure"
  | "ask_clarifying_question"
  | "unknown";

export interface ClassifiedConversationIntent {
  intent: ConversationIntent;
  confidence: number;
  extractedGoal?: string;
  targetRepo?: string;
  requestedMode?: string;
  runRef?: string;
  riskLevel: "low" | "medium" | "high";
  requiresConfirmation: boolean;
  reason: string;
}

interface RuntimeActionBase {
  commandEquivalent: string;
  targetRepo?: string;
  runDir?: string;
  handoffPath?: string;
  resultPath?: string;
  readArtifacts: string[];
  expectedArtifacts: string[];
  requiresConfirmation: boolean;
  riskLevel: "low" | "medium" | "high";
  reason: string;
}

export type RuntimeActionPlan =
  | (RuntimeActionBase & { actionType: "run_planning"; mode?: ThinkingMode; online?: boolean })
  | (RuntimeActionBase & { actionType: "run_autocode_eval"; mode?: "execute" | "dry-run"; fixture?: AutocodeEvalFixture })
  | (RuntimeActionBase & { actionType: "run_autocode_dry_run"; mode: "dry-run" })
  | (RuntimeActionBase & { actionType: "run_autocode_execute"; mode: "execute" })
  | (RuntimeActionBase & {
      actionType:
        | "inspect_latest_run"
        | "inspect_blockers"
        | "continue_research"
        | "generate_handoff"
        | "ingest_coding_result"
        | "summarize_artifacts"
        | "repair_from_failure"
        | "ask_clarifying_question"
        | "unknown";
    });

export interface ArtifactConversationSummary {
  whatHappened: string;
  currentStatus: string;
  importantFindings: string[];
  blockers: string[];
  recommendedNextActions: string[];
  artifactPaths: string[];
}

export type ConversationExecutionStatus =
  | "completed"
  | "failed"
  | "blocked"
  | "pending-confirmation"
  | "confirmation-not-found"
  | "needs-clarification";

export interface PendingConfirmation {
  confirmationId: string;
  action: RuntimeActionPlan;
  createdAt: string;
  reason: string;
}

export interface ConversationState {
  sessionId: string;
  latestRunDir?: string;
  latestHandoffDir?: string;
  latestEvalDir?: string;
  latestTargetRepo?: string;
  lastIntent?: ClassifiedConversationIntent;
  lastAction?: RuntimeActionPlan;
  pendingConfirmation?: PendingConfirmation;
  unresolvedQuestions: string[];
  userDecisions: string[];
  updatedAt: string;
}

export interface RuntimeActionExecutorInput {
  action: RuntimeActionPlan;
  intent: ClassifiedConversationIntent;
  state: ConversationState;
  confirmationId?: string;
}

export interface RuntimeActionExecutionResult {
  status: ConversationExecutionStatus;
  state: ConversationState;
  summary: ArtifactConversationSummary;
  pendingConfirmation?: PendingConfirmation;
  result?: unknown;
}

export interface ConversationTurnInput {
  message?: string;
  confirmationId?: string;
  store?: {
    rootDir: string;
    loadState(): ConversationState;
    saveState(state: ConversationState): ConversationState;
    appendActionLog(entry: Record<string, unknown>): void;
    writeSummaryCache(summary: ArtifactConversationSummary): void;
    writeResponse(markdown: string): void;
    responsePath(): string;
  };
  rootDir?: string;
  sessionName?: string;
}
import type { AutocodeEvalFixture } from "./autocode-eval.js";
import type { ThinkingMode } from "../llm/types.js";