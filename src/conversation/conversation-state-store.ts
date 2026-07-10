import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { redactSecretText, redactSecrets } from "../security/secret-redactor.js";
import type {
  ArtifactConversationSummary,
  ClassifiedConversationIntent,
  ConversationIntent,
  ConversationState,
  RuntimeActionPlan,
  RuntimeActionType,
} from "../types/conversation-runtime.js";

interface StateStoreOptions {
  rootDir?: string;
  sessionName?: string;
}

const intents = new Set<ConversationIntent>([
  "create_planning_run", "inspect_latest_run", "explain_blockers", "continue_research", "generate_handoff",
  "run_autocode_dry_run", "run_autocode_execute", "run_autocode_eval", "ingest_coding_result",
  "summarize_artifacts", "repair_from_failure", "ask_clarifying_question", "unknown",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function runtimeActionType(value: unknown): RuntimeActionType | undefined {
  switch (value) {
    case "run_planning":
    case "inspect_latest_run":
    case "inspect_blockers":
    case "continue_research":
    case "generate_handoff":
    case "run_autocode_dry_run":
    case "run_autocode_execute":
    case "run_autocode_eval":
    case "ingest_coding_result":
    case "summarize_artifacts":
    case "repair_from_failure":
    case "ask_clarifying_question":
    case "unknown":
      return value;
    default:
      return undefined;
  }
}

function planningMode(value: unknown): "rule" | "hybrid" | "llm" {
  return value === "rule" || value === "llm" || value === "hybrid" ? value : "hybrid";
}

function evaluationMode(value: unknown): "execute" | "dry-run" {
  return value === "dry-run" ? "dry-run" : "execute";
}

function evaluationFixture(value: unknown): "typescript-basic" | "blocked" | "forbidden-file" | "repair-loop" {
  return value === "blocked" || value === "forbidden-file" || value === "repair-loop" ? value : "typescript-basic";
}

function readJsonUnknown(filePath: string): unknown {
  if (!existsSync(filePath)) return undefined;
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  } catch {
    return undefined;
  }
}

function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(redactSecrets(value), null, 2)}\n`, "utf8");
}

function newestDirectory(parentDir: string): string | undefined {
  if (!existsSync(parentDir)) return undefined;
  return readdirSync(parentDir)
    .map((name) => path.join(parentDir, name))
    .filter((item) => {
      try {
        return statSync(item).isDirectory();
      } catch {
        return false;
      }
    })
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
}

function newSessionId(): string {
  return `conversation-${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}-${Math.random().toString(36).slice(2, 8)}`;
}

function canonicalizeIntent(value: unknown): ClassifiedConversationIntent | undefined {
  if (!isRecord(value) || typeof value.intent !== "string" || !intents.has(value.intent as ConversationIntent)) return undefined;
  const riskLevel: "low" | "medium" | "high" = value.riskLevel === "medium" || value.riskLevel === "high" ? value.riskLevel : "low";
  return {
    intent: value.intent as ConversationIntent,
    confidence: Number.isFinite(Number(value.confidence)) ? Number(value.confidence) : 0,
    extractedGoal: optionalString(value.extractedGoal),
    targetRepo: optionalString(value.targetRepo),
    requestedMode: optionalString(value.requestedMode),
    runRef: optionalString(value.runRef),
    riskLevel,
    requiresConfirmation: value.requiresConfirmation === true,
    reason: optionalString(value.reason) ?? "Restored conversation intent.",
  };
}

function canonicalizeAction(value: unknown): RuntimeActionPlan | undefined {
  if (!isRecord(value)) return undefined;
  const actionType = runtimeActionType(value.actionType);
  if (!actionType) return undefined;
  const riskLevel: "low" | "medium" | "high" = value.riskLevel === "medium" || value.riskLevel === "high" ? value.riskLevel : "low";
  const base = {
    commandEquivalent: optionalString(value.commandEquivalent) ?? "none",
    targetRepo: optionalString(value.targetRepo),
    runDir: optionalString(value.runDir),
    handoffPath: optionalString(value.handoffPath),
    resultPath: optionalString(value.resultPath),
    readArtifacts: stringArray(value.readArtifacts),
    expectedArtifacts: stringArray(value.expectedArtifacts),
    requiresConfirmation: value.requiresConfirmation === true,
    riskLevel,
    reason: optionalString(value.reason) ?? "Restored runtime action.",
  };
  if (actionType === "run_planning") {
    return { ...base, actionType, mode: planningMode(value.mode), online: value.online === true };
  }
  if (actionType === "run_autocode_eval") {
    return { ...base, actionType, mode: evaluationMode(value.mode), fixture: evaluationFixture(value.fixture) };
  }
  if (actionType === "run_autocode_dry_run") return { ...base, actionType, mode: "dry-run" };
  if (actionType === "run_autocode_execute") return { ...base, actionType, mode: "execute" };
  return { ...base, actionType };
}

function canonicalizeState(value: unknown): ConversationState {
  const record = isRecord(value) ? value : {};
  const pendingRecord = isRecord(record.pendingConfirmation) ? record.pendingConfirmation : undefined;
  const pendingAction = canonicalizeAction(pendingRecord?.action);
  const pendingConfirmation = pendingRecord && pendingAction && typeof pendingRecord.confirmationId === "string"
    ? {
        confirmationId: pendingRecord.confirmationId,
        action: pendingAction,
        createdAt: optionalString(pendingRecord.createdAt) ?? new Date().toISOString(),
        reason: optionalString(pendingRecord.reason) ?? "Restored pending action.",
      }
    : undefined;
  return {
    sessionId: optionalString(record.sessionId) ?? newSessionId(),
    latestRunDir: optionalString(record.latestRunDir),
    latestHandoffDir: optionalString(record.latestHandoffDir),
    latestEvalDir: optionalString(record.latestEvalDir),
    latestTargetRepo: optionalString(record.latestTargetRepo),
    lastIntent: canonicalizeIntent(record.lastIntent),
    lastAction: canonicalizeAction(record.lastAction),
    pendingConfirmation,
    unresolvedQuestions: stringArray(record.unresolvedQuestions),
    userDecisions: stringArray(record.userDecisions),
    updatedAt: optionalString(record.updatedAt) ?? new Date().toISOString(),
  };
}

export class ConversationStateStore {
  readonly rootDir: string;

  constructor(options: StateStoreOptions = {}) {
    this.rootDir = path.resolve(process.cwd(), options.rootDir ?? ".conversation", options.sessionName ?? "default");
    mkdirSync(this.rootDir, { recursive: true });
  }

  statePath(): string { return path.join(this.rootDir, "conversation-session.json"); }
  latestRunPointerPath(): string { return path.join(this.rootDir, "latest-run-pointer.json"); }
  actionLogPath(): string { return path.join(this.rootDir, "runtime-action-log.json"); }
  summaryCachePath(): string { return path.join(this.rootDir, "artifact-summary-cache.json"); }
  responsePath(): string { return path.join(this.rootDir, "conversation-response.md"); }

  loadState(): ConversationState {
    const state = canonicalizeState(readJsonUnknown(this.statePath()));
    const pointer = isRecord(readJsonUnknown(this.latestRunPointerPath())) ? readJsonUnknown(this.latestRunPointerPath()) : undefined;
    const pointerRecord = isRecord(pointer) ? pointer : undefined;
    if (!state.latestRunDir) state.latestRunDir = optionalString(pointerRecord?.latestRunDir) ?? newestDirectory(path.resolve(process.cwd(), ".runs"));
    if (!state.latestEvalDir) state.latestEvalDir = optionalString(pointerRecord?.latestEvalDir) ?? newestDirectory(path.resolve(process.cwd(), ".eval-runs"));
    return state;
  }

  saveState(state: ConversationState): ConversationState {
    const nextState: ConversationState = { ...state, updatedAt: new Date().toISOString() };
    writeJson(this.statePath(), nextState);
    writeJson(this.latestRunPointerPath(), {
      latestRunDir: nextState.latestRunDir,
      latestHandoffDir: nextState.latestHandoffDir,
      latestEvalDir: nextState.latestEvalDir,
      latestTargetRepo: nextState.latestTargetRepo,
      updatedAt: nextState.updatedAt,
    });
    return nextState;
  }

  appendActionLog(entry: Record<string, unknown>): void {
    const loaded = readJsonUnknown(this.actionLogPath());
    const existing: unknown[] = Array.isArray(loaded) ? loaded : [];
    existing.push({ ...entry, createdAt: new Date().toISOString() });
    writeJson(this.actionLogPath(), existing);
  }

  writeSummaryCache(summary: ArtifactConversationSummary): void { writeJson(this.summaryCachePath(), summary); }
  writeResponse(markdown: string): void { writeFileSync(this.responsePath(), `${redactSecretText(markdown).trim()}\n`, "utf8"); }
}