import path from "node:path";
import { RunManager } from "../run-manager.js";
import { writeCodingHandoffForRun } from "../agents/coding-handoff-builder.js";
import { runAutocodeEvalHarness } from "../eval/autocode-eval-harness.js";
import { ingestCodingResult } from "../agents/coding-result-ingestor.js";
import { loadNativeRunArtifacts } from "../coding/runtime-artifact-loader.js";
import type { AutocodeEvalFixture } from "../types/autocode-eval.js";
import type { AutocodeMode } from "../types/native-coding.js";
import type { ArtifactConversationSummary, RuntimeActionExecutionResult, RuntimeActionExecutorInput } from "../types/conversation-runtime.js";
import { summarizeArtifacts } from "./artifact-summarizer.js";

function runIsBlocked(runDir: string): boolean {
  const artifacts = loadNativeRunArtifacts(runDir);
  return artifacts.selectedRoute.canProceedToCoding === false ||
    artifacts.executionTaskGraph.canProceedToCoding === false ||
    artifacts.handoff.canProceedToCoding === false ||
    artifacts.handoff.handoffStatus === "blocked";
}

function confirmationId(): string {
  return `confirm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function blockedSummary(runDir: string | undefined, evalDir: string | undefined, reason: string): ArtifactConversationSummary {
  const summary = summarizeArtifacts({ runDir, evalDir });
  return {
    ...summary,
    currentStatus: "Coding execute is blocked by planning gates.",
    blockers: [...(summary.blockers ?? []), reason].filter(Boolean),
    recommendedNextActions: ["Resolve blockers before coding.", "Regenerate handoff after clarification.", ...(summary.recommendedNextActions ?? [])],
  };
}

function autocodeMode(value: string | undefined, fallback: AutocodeMode): AutocodeMode {
  return value === "execute" || value === "dry-run" || value === "plan-only" ? value : fallback;
}

function evalFixture(value: string | undefined): AutocodeEvalFixture {
  return value === "blocked" || value === "forbidden-file" || value === "repair-loop" ? value : "typescript-basic";
}

function evalRepoPath(result: unknown): string | undefined {
  if (result === null || typeof result !== "object" || Array.isArray(result)) return undefined;
  const toyRepo = Reflect.get(result, "toyRepo");
  if (toyRepo === null || typeof toyRepo !== "object" || Array.isArray(toyRepo)) return undefined;
  const repoPath = Reflect.get(toyRepo, "repoPath");
  return typeof repoPath === "string" ? repoPath : undefined;
}

export async function executeRuntimeAction(input: RuntimeActionExecutorInput): Promise<RuntimeActionExecutionResult> {
  const action = input.action;
  const state = input.state;

  if (input.confirmationId) {
    const pending = state.pendingConfirmation;
    if (!pending || pending.confirmationId !== input.confirmationId) {
      return {
        status: "confirmation-not-found",
        state,
        summary: {
          whatHappened: "No matching pending confirmation was found.",
          currentStatus: "Nothing was executed.",
          importantFindings: [],
          blockers: ["Confirmation id does not match the pending action."],
          recommendedNextActions: ["Create the action again, then confirm the new confirmation id."],
          artifactPaths: [],
        },
      };
    }
    const confirmedAction = pending.action;
    const nextState = { ...state, pendingConfirmation: undefined, lastAction: confirmedAction };
    const confirmedExecutionAction = { ...confirmedAction, requiresConfirmation: false };
    return executeRuntimeAction({ action: confirmedExecutionAction, intent: input.intent, state: nextState });
  }

  if (action.actionType === "run_autocode_execute") {
    const runDir = action.runDir ?? state.latestRunDir;
    const targetRepo = action.targetRepo ?? state.latestTargetRepo;
    if (!runDir) {
      return { status: "blocked", state, summary: blockedSummary(undefined, state.latestEvalDir, "No planning run is available.") };
    }
    if (runIsBlocked(runDir)) {
      return { status: "blocked", state: { ...state, lastAction: action }, summary: blockedSummary(runDir, state.latestEvalDir, "canProceedToCoding=false, so native coding execute is not allowed.") };
    }
    if (!targetRepo) {
      return { status: "blocked", state, summary: blockedSummary(runDir, state.latestEvalDir, "No target repo was provided.") };
    }
  }

  if (action.requiresConfirmation) {
    const nextState = { ...state };
    nextState.pendingConfirmation = {
      confirmationId: confirmationId(),
      action,
      createdAt: new Date().toISOString(),
      reason: `This action may execute commands or modify a target repo: ${action.commandEquivalent}.`,
    };
    nextState.lastAction = action;
    const summary = summarizeArtifacts({ runDir: action.runDir ?? state.latestRunDir, evalDir: state.latestEvalDir });
    summary.currentStatus = "Waiting for confirmation before running a side-effecting action.";
    summary.recommendedNextActions = ["Review the pending action.", `Confirm with pnpm think:chat --confirm ${nextState.pendingConfirmation.confirmationId} if you want to proceed.`];
    return { status: "pending-confirmation", state: nextState, summary, pendingConfirmation: nextState.pendingConfirmation };
  }

  if (action.actionType === "run_planning") {
    const manager = new RunManager();
    const planningMode = action.mode === "rule" || action.mode === "llm" || action.mode === "hybrid"
      ? action.mode
      : "hybrid";
    const result = await manager.run(input.intent.extractedGoal ?? "", { mode: planningMode, online: action.online });
    const nextState = { ...state, latestRunDir: result.runDir, latestHandoffDir: result.runDir, lastAction: action };
    return { status: "completed", state: nextState, summary: summarizeArtifacts({ runDir: result.runDir, evalDir: state.latestEvalDir }), result };
  }

  if (action.actionType === "generate_handoff") {
    if (!action.runDir) {
      return { status: "blocked", state, summary: blockedSummary(state.latestRunDir, state.latestEvalDir, "No latest run is available for handoff generation.") };
    }
    const result = await writeCodingHandoffForRun(action.runDir, { target: "codex" });
    const nextState = { ...state, latestRunDir: action.runDir, latestHandoffDir: action.runDir, lastAction: action };
    return { status: "completed", state: nextState, summary: summarizeArtifacts({ runDir: action.runDir, evalDir: state.latestEvalDir }), result };
  }

  if (action.actionType === "run_autocode_eval") {
    const result = await runAutocodeEvalHarness({
      fixture: evalFixture(action.fixture),
      mode: autocodeMode(action.mode, "execute") === "dry-run" ? "dry-run" : "execute",
      keepTemp: true,
    });
    const nextState = { ...state, latestEvalDir: result.outputDir, latestTargetRepo: evalRepoPath(result), lastAction: action };
    return { status: result.report.checksPassed ? "completed" : "failed", state: nextState, summary: summarizeArtifacts({ runDir: state.latestRunDir, evalDir: result.outputDir }), result };
  }

  if (action.actionType === "run_autocode_dry_run" || action.actionType === "run_autocode_execute") {
    const runDir = action.runDir ?? state.latestRunDir;
    const targetRepo = action.targetRepo ?? state.latestTargetRepo;
    if (!runDir) {
      return { status: "blocked", state, summary: blockedSummary(undefined, state.latestEvalDir, "No planning run is available.") };
    }
    if (runIsBlocked(runDir)) {
      return { status: "blocked", state: { ...state, lastAction: action }, summary: blockedSummary(runDir, state.latestEvalDir, "canProceedToCoding=false, so native coding execute is not allowed.") };
    }
    if (!targetRepo) {
      return { status: "blocked", state, summary: blockedSummary(runDir, state.latestEvalDir, "No target repo was provided.") };
    }
    const { runNativeAutocode } = await import("../coding/native-coding-runtime.js");
    const result = await runNativeAutocode({
      runDir,
      targetRepo,
      mode: autocodeMode(action.mode, action.actionType === "run_autocode_execute" ? "execute" : "dry-run"),
      batch: "first",
      allowDirty: false,
    });
    const nextState = { ...state, latestRunDir: runDir, latestTargetRepo: targetRepo, lastAction: action };
    const conversationStatus = result.status === "partial" ? "completed" : result.status === "rejected" ? "failed" : result.status;
    return { status: conversationStatus, state: nextState, summary: summarizeArtifacts({ runDir, evalDir: state.latestEvalDir }), result };
  }

  if (action.actionType === "ingest_coding_result") {
    const runDir = action.runDir ?? state.latestRunDir;
    if (!runDir) {
      return { status: "blocked", state, summary: blockedSummary(undefined, state.latestEvalDir, "No latest run is available for coding result ingestion.") };
    }
    const result = await ingestCodingResult({
      handoffPath: path.join(runDir, "coding-handoff.json"),
      resultPath: path.join(runDir, "autonomous-coding-result.json"),
    });
    const nextState = { ...state, latestRunDir: runDir, lastAction: action };
    return { status: "completed", state: nextState, summary: summarizeArtifacts({ runDir, evalDir: state.latestEvalDir }), result };
  }

  if (action.actionType === "inspect_blockers" || action.actionType === "inspect_latest_run" || action.actionType === "summarize_artifacts") {
    return { status: "completed", state: { ...state, lastAction: action }, summary: summarizeArtifacts({ runDir: action.runDir ?? state.latestRunDir, evalDir: state.latestEvalDir }) };
  }

  return {
    status: "needs-clarification",
    state: { ...state, lastAction: action },
    summary: {
      whatHappened: "The message was understood as a conversation request, but no runtime action was safe to execute.",
      currentStatus: "I need a clearer instruction.",
      importantFindings: [],
      blockers: [action.reason],
      recommendedNextActions: ["Ask to create a planning run, inspect blockers, summarize latest run, or run toy eval."],
      artifactPaths: [],
    },
  };
}