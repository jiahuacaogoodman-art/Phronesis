import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ConversationEvalReport, ConversationScenarioRun } from "../types/conversation-eval.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readJsonRecord(filePath: string | undefined): Record<string, unknown> {
  if (!filePath || !existsSync(filePath)) return {};
  try {
    const value: unknown = JSON.parse(readFileSync(filePath, "utf8"));
    return isRecord(value) ? value : {};
  } catch {
    return {};
  }
}

function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function responseText(run: ConversationScenarioRun): string {
  const responsePath = run.transcript.responsePath;
  return responsePath && existsSync(responsePath) ? readFileSync(responsePath, "utf8") : "";
}

function looksLikeJsonDump(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return true;
  const jsonish = (text.match(/[{}\"]/g) ?? []).length;
  return jsonish > Math.max(30, text.length / 8);
}

function latestPointerValid(run: ConversationScenarioRun): boolean {
  const pointer = readJsonRecord(run.transcript.latestRunPointerPath);
  if (typeof pointer.latestRunDir === "string" && !existsSync(pointer.latestRunDir)) return false;
  if (typeof pointer.latestEvalDir === "string" && !existsSync(pointer.latestEvalDir)) return false;
  return true;
}

function summaryCacheValid(run: ConversationScenarioRun): boolean {
  const cache = readJsonRecord(run.transcript.summaryCachePath);
  const artifactPaths = Array.isArray(cache.artifactPaths) ? cache.artifactPaths : [];
  return artifactPaths.every((artifactPath) => typeof artifactPath === "string" && existsSync(artifactPath));
}

function actionLogComplete(run: ConversationScenarioRun): boolean {
  return run.actionLog.length >= run.transcript.turns.length;
}

function noAutocodeArtifacts(run: ConversationScenarioRun): boolean {
  const runDir = run.fixtures.blockedRunDir;
  return !existsSync(path.join(runDir, "applied-patches.json")) && !existsSync(path.join(runDir, "native-patch-plan.json"));
}

function checkResponseQuality(run: ConversationScenarioRun, checks: Record<string, boolean>): void {
  const text = responseText(run);
  checks.responseNotEmpty = text.trim().length > 0;
  checks.responseNotJsonDump = !looksLikeJsonDump(text);
  checks.responseHasNaturalStatus = text.includes("当前状态") || /status|blocked|Planning|确认|执行/.test(text);
  if (run.scenarioId.includes("blocked") || run.scenarioId === "explain-blocked-run") {
    checks.responseContainsBlocker = /blocked|阻塞|Do not hand off|审批|科室|canProceedToCoding=false/.test(text);
  }
  if (run.scenarioId === "toy-eval-confirmation") {
    checks.responseMentionsEvalAfterConfirm = /eval|checks passed|completed|Autocode|fixture/i.test(text);
  }
  const pendingTurn = run.transcript.turns.find((turn) => turn.status === "pending-confirmation");
  if (pendingTurn) checks.responseContainsConfirmation = /confirm-|Confirmation ID|需要确认/.test(pendingTurn.responsePreview ?? text);
}

export function checkConversationScenario(run: ConversationScenarioRun): ConversationEvalReport {
  const checks: Record<string, boolean> = {};
  const turns = run.transcript.turns;
  const first = turns[0];
  const finalState = run.transcript.finalState;

  checks.intentPresent = Boolean(first?.intent?.intent);
  checks.actionPresent = Boolean(first?.action?.actionType);
  checks.latestPointerValid = latestPointerValid(run);
  checks.summaryCacheValid = summaryCacheValid(run);
  checks.actionLogComplete = actionLogComplete(run);
  checkResponseQuality(run, checks);

  if (run.scenarioId === "summarize-latest-run") {
    checks.intentAccuracy = first?.intent?.intent === "inspect_latest_run" || first?.intent?.intent === "summarize_artifacts";
    checks.actionReadOnly = first?.action?.actionType === "inspect_latest_run";
    checks.noPendingConfirmation = !finalState?.pendingConfirmation;
    checks.noSideEffectArtifacts = noAutocodeArtifacts(run);
  }
  if (run.scenarioId === "explain-blocked-run") {
    checks.intentAccuracy = first?.intent?.intent === "explain_blockers";
    const reads = first?.action?.readArtifacts ?? [];
    checks.readsBlockingArtifacts = reads.includes("execution-task-graph.json") && reads.includes("selected-route.json");
    checks.noAutocodeExecute = noAutocodeArtifacts(run);
    checks.blockersExplained = checks.responseContainsBlocker === true;
  }
  if (run.scenarioId === "toy-eval-confirmation") {
    const second = turns[1];
    checks.intentAccuracy = first?.intent?.intent === "run_autocode_eval";
    checks.firstRequiresConfirmation = first?.action?.requiresConfirmation === true;
    checks.pendingGenerated = Boolean(first?.stateAfter?.pendingConfirmation?.confirmationId);
    checks.firstDidNotExecute = first?.status === "pending-confirmation" && !first.executed;
    checks.confirmExecuted = second?.executed === true && second.status === "completed";
    checks.latestEvalDirUpdated = Boolean(second?.stateAfter?.latestEvalDir) && existsSync(second?.stateAfter?.latestEvalDir ?? "");
    checks.pendingCleared = !second?.stateAfter?.pendingConfirmation;
    checks.actionLogRecordedBothTurns = run.actionLog.length >= 2;
  }
  if (run.scenarioId === "blocked-autocode-execute") {
    checks.intentAccuracy = first?.intent?.intent === "run_autocode_execute";
    checks.gateBlockedExecute = first?.status === "blocked";
    checks.noPatchGenerated = noAutocodeArtifacts(run);
    checks.targetRepoUnchanged = readFileSync(path.join(run.fixtures.targetRepo, "src", "index.ts"), "utf8").includes("untouched");
  }
  if (run.scenarioId === "stale-confirmation") {
    checks.confirmationRejected = first?.status === "confirmation-not-found";
    checks.noSideEffects = noAutocodeArtifacts(run);
    checks.actionLogRejectedConfirmation = run.actionLog.some((entry) => entry.status === "confirmation-not-found");
  }
  if (run.scenarioId === "continue-context") {
    checks.intentAccuracy = first?.intent?.intent === "continue_research";
    checks.noSideEffects = noAutocodeArtifacts(run);
    checks.suggestsNextAction = /Resolve|解决|block|研究|总结|handoff/i.test(responseText(run));
  }

  const failedChecks = Object.entries(checks).filter(([, value]) => value !== true).map(([key]) => key);
  const report: ConversationEvalReport = {
    scenarioId: run.scenarioId,
    passed: failedChecks.length === 0,
    checks,
    failedChecks,
    intentAccuracy: checks.intentAccuracy !== false && checks.intentPresent === true,
    gateCompliance: checks.noAutocodeExecute !== false && checks.gateBlockedExecute !== false && checks.noPatchGenerated !== false && checks.noSideEffectArtifacts !== false,
    confirmationCompliance: checks.firstRequiresConfirmation !== false && checks.pendingGenerated !== false && checks.confirmExecuted !== false && checks.confirmationRejected !== false,
    stateConsistency: checks.latestPointerValid === true && checks.summaryCacheValid === true && checks.pendingCleared !== false,
    responseQuality: checks.responseNotEmpty === true && checks.responseNotJsonDump === true && checks.responseHasNaturalStatus === true && checks.responseContainsBlocker !== false,
    artifactSafety: checks.noSideEffects !== false && checks.noPatchGenerated !== false && checks.noSideEffectArtifacts !== false,
    actionLogCompleteness: checks.actionLogComplete === true && checks.actionLogRecordedBothTurns !== false,
  };
  writeJson(path.join(run.outputDir, "conversation-eval-report.json"), report);
  writeFileSync(path.join(run.outputDir, "conversation-eval-summary.md"), [
    "# Conversation Eval Summary", "", `Scenario: ${run.scenarioId}`, `Passed: ${report.passed}`, "", "## Failed Checks",
    ...(failedChecks.length ? failedChecks.map((item) => `- ${item}`) : ["- none"]), "",
  ].join("\n"), "utf8");
  return report;
}