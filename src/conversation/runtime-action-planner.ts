import type { ClassifiedConversationIntent, ConversationState, RuntimeActionPlan } from "../types/conversation-runtime.js";
import type { ThinkingMode } from "../llm/types.js";

function planningMode(value: string | undefined): ThinkingMode {
  return value === "rule" || value === "llm" || value === "hybrid" ? value : "hybrid";
}

function evaluationMode(value: string | undefined): "execute" | "dry-run" {
  return value === "dry-run" ? "dry-run" : "execute";
}

export function planRuntimeAction(intent: ClassifiedConversationIntent, state: Partial<ConversationState> = {}): RuntimeActionPlan {
  const runDir = intent.runRef ?? state.latestRunDir;
  if (intent.intent === "create_planning_run") {
    return {
      actionType: "run_planning",
      commandEquivalent: "think:run",
      mode: planningMode(intent.requestedMode),
      online: process.env.THINK_CHAT_ONLINE === "1",
      readArtifacts: [],
      expectedArtifacts: ["final-thinking-report.md", "selected-route.json", "execution-task-graph.json", "coding-handoff.json"],
      requiresConfirmation: false,
      riskLevel: intent.riskLevel,
      reason: intent.reason,
    };
  }

  if (intent.intent === "explain_blockers") {
    return {
      actionType: "inspect_blockers",
      commandEquivalent: "inspect artifacts",
      runDir,
      readArtifacts: ["execution-task-graph.json", "selected-route.json", "critic-council-report.json", "technical-route-scorecard.json"],
      expectedArtifacts: ["conversation-response.md"],
      requiresConfirmation: false,
      riskLevel: "low",
      reason: intent.reason,
    };
  }

  if (intent.intent === "run_autocode_eval") {
    return {
      actionType: "run_autocode_eval",
      commandEquivalent: "think:autocode-eval",
      fixture: "typescript-basic",
      mode: evaluationMode(intent.requestedMode),
      readArtifacts: [],
      expectedArtifacts: ["autocode-eval-run-report.json", "autocode-eval-summary.md"],
      requiresConfirmation: intent.requestedMode === "execute" || intent.requiresConfirmation,
      riskLevel: intent.riskLevel,
      reason: intent.reason,
    };
  }

  if (intent.intent === "run_autocode_execute") {
    return {
      actionType: "run_autocode_execute",
      commandEquivalent: "think:autocode",
      runDir,
      targetRepo: intent.targetRepo ?? state.latestTargetRepo,
      mode: "execute",
      readArtifacts: ["coding-handoff.json", "selected-route.json", "execution-task-graph.json"],
      expectedArtifacts: ["autonomous-coding-result.json", "test-run-report.json", "applied-patches.json"],
      requiresConfirmation: true,
      riskLevel: "high",
      reason: intent.reason,
    };
  }

  if (intent.intent === "run_autocode_dry_run") {
    return {
      actionType: "run_autocode_dry_run",
      commandEquivalent: "think:autocode",
      runDir,
      targetRepo: intent.targetRepo ?? state.latestTargetRepo,
      mode: "dry-run",
      readArtifacts: ["coding-handoff.json", "selected-route.json", "execution-task-graph.json"],
      expectedArtifacts: ["native-patch-plan.json", "autonomous-coding-result.json"],
      requiresConfirmation: false,
      riskLevel: "medium",
      reason: intent.reason,
    };
  }

  if (intent.intent === "generate_handoff") {
    return {
      actionType: "generate_handoff",
      commandEquivalent: "think:handoff",
      runDir,
      readArtifacts: ["selected-route.json", "execution-task-graph.json"],
      expectedArtifacts: ["coding-handoff.json", "pre-coding-resolution-pack.json", "coding-agent-prompt.md"],
      requiresConfirmation: false,
      riskLevel: "low",
      reason: intent.reason,
    };
  }

  if (intent.intent === "ingest_coding_result") {
    return {
      actionType: "ingest_coding_result",
      commandEquivalent: "think:ingest-coding-result",
      runDir,
      readArtifacts: ["coding-handoff.json", "autonomous-coding-result.json"],
      expectedArtifacts: ["coding-feedback-report.json", "coding-failure-analysis.json"],
      requiresConfirmation: false,
      riskLevel: "low",
      reason: intent.reason,
    };
  }

  if (intent.intent === "repair_from_failure") {
    return {
      actionType: "repair_from_failure",
      commandEquivalent: "think:autocode execute after failure",
      runDir,
      targetRepo: intent.targetRepo ?? state.latestTargetRepo,
      readArtifacts: ["autonomous-coding-result.json", "coding-feedback-report.json", "failure-context.json"],
      expectedArtifacts: ["repair-loop-report.json", "autonomous-coding-result.json"],
      requiresConfirmation: true,
      riskLevel: "high",
      reason: intent.reason,
    };
  }

  if (intent.intent === "continue_research") {
    return {
      actionType: "continue_research",
      commandEquivalent: "think:run --online",
      runDir,
      readArtifacts: ["technical-solution-research-plan.json", "technical-solution-candidates.json"],
      expectedArtifacts: ["conversation-response.md"],
      requiresConfirmation: false,
      riskLevel: "medium",
      reason: intent.reason,
    };
  }

  if (intent.intent === "inspect_latest_run" || intent.intent === "summarize_artifacts") {
    return {
      actionType: "inspect_latest_run",
      commandEquivalent: "inspect latest artifacts",
      runDir,
      readArtifacts: [
        "final-thinking-report.md",
        "product-intent.json",
        "selected-route.json",
        "execution-task-graph.json",
        "technical-route-plan.json",
        "technical-solution-candidates.json",
        "coding-handoff.json",
        "autonomous-coding-result.json",
        "autocode-eval-run-report.json",
        "coding-feedback-report.json",
      ],
      expectedArtifacts: ["conversation-response.md"],
      requiresConfirmation: false,
      riskLevel: "low",
      reason: intent.reason,
    };
  }

  return {
    actionType: intent.intent === "ask_clarifying_question" ? "ask_clarifying_question" : "unknown",
    commandEquivalent: "none",
    readArtifacts: [],
    expectedArtifacts: ["conversation-response.md"],
    requiresConfirmation: false,
    riskLevel: "low",
    reason: intent.reason,
  };
}