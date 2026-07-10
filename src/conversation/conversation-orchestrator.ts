import { classifyConversationIntent } from "./intent-classifier.js";
import { planRuntimeAction } from "./runtime-action-planner.js";
import { executeRuntimeAction } from "./runtime-action-executor.js";
import { ConversationStateStore } from "./conversation-state-store.js";
import { buildConversationalResponse } from "./conversational-response-builder.js";
import type {
  ClassifiedConversationIntent,
  ConversationTurnInput,
  RuntimeActionPlan,
} from "../types/conversation-runtime.js";

export async function runConversationTurn(input: ConversationTurnInput = {}) {
  const store = input.store ?? new ConversationStateStore(input);
  const state = store.loadState();
  let intent: ClassifiedConversationIntent;
  let action: RuntimeActionPlan;

  if (input.confirmationId) {
    intent = state.lastIntent ?? {
      intent: "unknown",
      confidence: 1,
      riskLevel: "high",
      requiresConfirmation: false,
      reason: "Confirmation requested for pending action.",
    };
    action = state.pendingConfirmation?.action ?? {
      actionType: "unknown",
      commandEquivalent: "none",
      readArtifacts: [],
      expectedArtifacts: [],
      requiresConfirmation: false,
      riskLevel: "low",
      reason: "No pending confirmation exists.",
    };
  } else {
    intent = classifyConversationIntent(input.message ?? "");
    action = planRuntimeAction(intent, state);
  }

  const executed = await executeRuntimeAction({
    action,
    intent,
    state: { ...state, lastIntent: intent },
    confirmationId: input.confirmationId,
  });

  const nextState = store.saveState({ ...executed.state, lastIntent: intent, lastAction: executed.state.lastAction ?? action });
  const response = buildConversationalResponse({
    summary: executed.summary,
    pendingConfirmation: executed.pendingConfirmation,
    reason: action.reason,
  });
  store.writeSummaryCache(executed.summary);
  store.writeResponse(response);
  const logEntry: Record<string, unknown> = {
    message: input.message,
    confirmationId: input.confirmationId,
    intent,
    action,
    status: executed.status,
    latestRunDir: nextState.latestRunDir,
    latestEvalDir: nextState.latestEvalDir,
    pendingConfirmationId: nextState.pendingConfirmation?.confirmationId,
  };
  store.appendActionLog(logEntry);

  return {
    intent,
    action,
    status: executed.status,
    state: nextState,
    summary: executed.summary,
    response,
    storeRoot: store.rootDir,
    result: executed.result,
  };
}