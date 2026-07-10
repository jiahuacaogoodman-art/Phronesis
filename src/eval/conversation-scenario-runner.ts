import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ConversationStateStore } from "../conversation/conversation-state-store.js";
import { runConversationTurn } from "../conversation/conversation-orchestrator.js";
import type { ConversationState } from "../types/conversation-runtime.js";
import type {
  ConversationEvalTurn,
  ConversationScenarioRun,
  ConversationScenarioRunnerInput,
  ConversationTranscript,
} from "../types/conversation-eval.js";
import { createConversationEvalFixtures, scenarioMessages } from "./conversation-scenario-fixtures.js";

function readActionLog(filePath: string): Array<Record<string, unknown>> {
  if (!existsSync(filePath)) return [];
  try {
    const value: unknown = JSON.parse(readFileSync(filePath, "utf8"));
    return Array.isArray(value)
      ? value.filter((item): item is Record<string, unknown> => item !== null && typeof item === "object" && !Array.isArray(item))
      : [];
  } catch {
    return [];
  }
}

function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function actionExecuted(status: string): boolean {
  return status === "completed" || status === "failed" || status === "blocked" || status === "confirmation-not-found";
}

export async function runConversationScenario(input: ConversationScenarioRunnerInput): Promise<ConversationScenarioRun> {
  const { scenarioId } = input;
  mkdirSync(input.outputDir, { recursive: true });
  const fixtures = createConversationEvalFixtures(input.outputDir);
  const store = new ConversationStateStore({
    rootDir: path.join(input.outputDir, "conversation-session"),
    sessionName: input.sessionName ?? "default",
  });
  const initialState: ConversationState = {
    sessionId: `conversation-eval-${scenarioId}`,
    latestRunDir: fixtures.blockedRunDir,
    latestTargetRepo: fixtures.targetRepo,
    unresolvedQuestions: [],
    userDecisions: [],
    updatedAt: new Date().toISOString(),
  };
  store.saveState(initialState);

  const plan = { scenarioId, turns: scenarioMessages(scenarioId), fixtures };
  writeJson(path.join(input.outputDir, "conversation-eval-plan.json"), plan);

  const transcript: ConversationTranscript = {
    scenarioId,
    turns: [],
    artifactsTouched: [],
    commandsEquivalent: [],
    warnings: [],
  };

  for (const turn of plan.turns) {
    const stateBefore = structuredClone(store.loadState());
    let message: string | undefined;
    let turnConfirmationId: string | undefined;
    if ("confirmPending" in turn) {
      const pending = stateBefore.pendingConfirmation;
      if (!pending?.confirmationId) transcript.warnings.push("Expected pending confirmation but none existed.");
      turnConfirmationId = pending?.confirmationId ?? "missing-pending-confirmation";
    } else if ("confirmationId" in turn) {
      turnConfirmationId = turn.confirmationId;
    } else {
      message = turn.userMessage;
    }
    const result = await runConversationTurn({ store, message, confirmationId: turnConfirmationId });
    const stateAfter = structuredClone(store.loadState());
    const transcriptTurn: ConversationEvalTurn = {
      userMessage: message,
      confirmationId: turnConfirmationId,
      intent: result.intent,
      action: result.action,
      requiresConfirmation: result.action.requiresConfirmation === true,
      pendingConfirmationId: result.state.pendingConfirmation?.confirmationId,
      executed: actionExecuted(result.status) && result.status !== "pending-confirmation",
      status: result.status,
      responsePath: store.responsePath(),
      responsePreview: result.response.slice(0, 1000),
      stateBefore,
      stateAfter,
    };
    transcript.turns.push(transcriptTurn);
    if (result.action.commandEquivalent) transcript.commandsEquivalent.push(result.action.commandEquivalent);
    transcript.artifactsTouched.push(...result.summary.artifactPaths);
  }

  transcript.actionLogPath = store.actionLogPath();
  transcript.statePath = store.statePath();
  transcript.responsePath = store.responsePath();
  transcript.summaryCachePath = store.summaryCachePath();
  transcript.latestRunPointerPath = store.latestRunPointerPath();
  transcript.finalState = structuredClone(store.loadState());
  writeJson(path.join(input.outputDir, "conversation-transcript.json"), transcript);
  return {
    scenarioId,
    outputDir: input.outputDir,
    fixtures,
    transcript,
    actionLog: readActionLog(store.actionLogPath()),
  };
}