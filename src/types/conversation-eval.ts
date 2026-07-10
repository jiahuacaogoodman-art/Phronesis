export type ConversationEvalScenarioId =
  | "summarize-latest-run"
  | "explain-blocked-run"
  | "toy-eval-confirmation"
  | "blocked-autocode-execute"
  | "stale-confirmation"
  | "continue-context";

export interface ConversationEvalTurn {
  userMessage?: string;
  confirmationId?: string;
  intent?: ClassifiedConversationIntent;
  action?: RuntimeActionPlan;
  requiresConfirmation?: boolean;
  executed: boolean;
  status: ConversationExecutionStatus;
  pendingConfirmationId?: string;
  responsePath?: string;
  responsePreview?: string;
  stateBefore?: ConversationState;
  stateAfter?: ConversationState;
}

export interface ConversationEvalReport {
  scenarioId: string;
  passed: boolean;
  checks: Record<string, boolean>;
  failedChecks: string[];
  intentAccuracy: boolean;
  gateCompliance: boolean;
  confirmationCompliance: boolean;
  stateConsistency: boolean;
  responseQuality: boolean;
  artifactSafety: boolean;
  actionLogCompleteness: boolean;
}

export interface ConversationEvalFixtures {
  fixturesDir: string;
  blockedRunDir: string;
  targetRepo: string;
}

export type ConversationScenarioMessage =
  | { userMessage: string }
  | { confirmPending: true }
  | { confirmationId: string };

export interface ConversationTranscript {
  scenarioId: ConversationEvalScenarioId;
  turns: ConversationEvalTurn[];
  artifactsTouched: string[];
  commandsEquivalent: string[];
  warnings: string[];
  actionLogPath?: string;
  statePath?: string;
  responsePath?: string;
  summaryCachePath?: string;
  latestRunPointerPath?: string;
  finalState?: ConversationState;
}

export interface ConversationScenarioRun {
  scenarioId: ConversationEvalScenarioId;
  outputDir: string;
  fixtures: ConversationEvalFixtures;
  transcript: ConversationTranscript;
  actionLog: Array<Record<string, unknown>>;
}

export interface ConversationScenarioRunnerInput {
  scenarioId: ConversationEvalScenarioId;
  outputDir: string;
  sessionName?: string;
}

export interface ConversationE2EOptions {
  evalId?: string;
  scenario?: ConversationEvalScenarioId | "all";
  outputDir?: string;
  sessionName?: string;
  keepTemp?: boolean;
}

export interface ConversationE2EAggregateReport {
  evalId: string;
  scenario: ConversationEvalScenarioId | "all";
  passed: boolean;
  results: Array<{
    scenarioId: ConversationEvalScenarioId;
    outputDir: string;
    passed: boolean;
    failedChecks: string[];
  }>;
  failedScenarios: ConversationEvalScenarioId[];
}
import type { ClassifiedConversationIntent, ConversationExecutionStatus, ConversationState, RuntimeActionPlan } from "./conversation-runtime.js";