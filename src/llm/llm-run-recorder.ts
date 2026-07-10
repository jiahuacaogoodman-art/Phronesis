import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { redactSecretText, redactSecrets } from "../security/secret-redactor.js";
import type { LLMRunMetadata } from "../types/artifacts.js";
import type { LLMJsonResult, SchemaRepairRecord, ThinkingMode } from "./types.js";

interface RecorderOptions {
  mode: ThinkingMode;
  provider: string;
  model: string;
  runDir: string;
}

interface WarningRecord {
  agentName: string;
  code: string;
  message: string;
}

interface MessageRecord {
  agentName: string;
  message: string;
}

interface FallbackRecord {
  agentName: string;
  reason: string;
}

interface AgentMetric {
  agentName: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  rawTextLength: number;
  estimatedCost?: number;
  warnings: WarningRecord[];
}

interface FailedLLMCall {
  agentName: string;
  providerId: string;
  errorCode?: string;
  httpStatus?: number;
  responseBodyPreview?: string;
  attempts: number;
  validationErrors: string[];
  qualityChecklistFailures: string[];
}

function slug(value: unknown): string {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "llm-agent";
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function withAgentName(agentName: string, value: unknown): Record<string, unknown> {
  return { agentName, ...(asRecord(value) ?? { value: String(value) }) };
}

export async function saveLLMRawOutput(runDir: string, agentName: string, attempt: number, rawText: unknown, label = ""): Promise<string> {
  const rawDir = path.join(runDir, "llm-raw");
  await mkdir(rawDir, { recursive: true });
  const suffix = label ? `-${slug(label)}` : "";
  const filePath = path.join(rawDir, `${slug(agentName)}-attempt-${attempt}${suffix}.txt`);
  await writeFile(filePath, redactSecretText(String(rawText ?? "")), "utf8");
  return filePath;
}

export class LLMRunRecorder {
  readonly mode: ThinkingMode;
  readonly provider: string;
  readonly model: string;
  readonly runDir: string;
  readonly agentsUsingLLM: string[] = [];
  readonly agentsUsingRuleFallback: string[] = [];
  readonly failedLLMCalls: FailedLLMCall[] = [];
  readonly validationFailures: MessageRecord[] = [];
  readonly qualityChecklistFailures: MessageRecord[] = [];
  totalLatencyMs = 0;
  readonly totalUsage: Record<string, number> = {};
  readonly fallbackReasons: FallbackRecord[] = [];
  readonly rawOutputSavedPaths: string[] = [];
  readonly agentMetrics: AgentMetric[] = [];
  readonly warnings: WarningRecord[] = [];
  readonly schemaRepairAttempts: Array<Record<string, unknown>> = [];
  readonly canonicalizationApplied: Array<{ agentName: string; action: SchemaRepairRecord }> = [];
  readonly missingFieldRepairs: Array<Record<string, unknown>> = [];
  revisionRoundsExecuted = 0;
  readonly revisionFallbacks: Array<{ round: number; reason: string }> = [];
  readonly revisionValidationFailures: Array<{ round: number; message: string }> = [];

  constructor({ mode, provider, model, runDir }: RecorderOptions) {
    this.mode = mode;
    this.provider = provider;
    this.model = model;
    this.runDir = runDir;
  }

  addUsage(usage: Record<string, number>): void {
    for (const [key, value] of Object.entries(usage)) {
      this.totalUsage[key] = (this.totalUsage[key] ?? 0) + Number(value ?? 0);
    }
  }

  normalizeUsage(usage: Record<string, number>): { promptTokens: number; completionTokens: number; totalTokens: number } {
    return {
      promptTokens: Number(usage.promptTokens ?? usage.prompt_tokens ?? 0),
      completionTokens: Number(usage.completionTokens ?? usage.completion_tokens ?? 0),
      totalTokens: Number(usage.totalTokens ?? usage.total_tokens ?? 0),
    };
  }

  recordWarning(agentName: string, code: string, message: string): void {
    this.warnings.push({ agentName, code, message });
  }

  setAgentMetric<T>(agentName: string, result: LLMJsonResult<T>): void {
    const usage = this.normalizeUsage(result.usage);
    const metric: AgentMetric = {
      agentName,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens || usage.promptTokens + usage.completionTokens,
      latencyMs: result.latencyMs,
      rawTextLength: result.rawText.length,
      estimatedCost: undefined,
      warnings: this.warnings.filter((warning) => warning.agentName === agentName),
    };
    const existingIndex = this.agentMetrics.findIndex((item) => item.agentName === agentName);
    if (existingIndex >= 0) this.agentMetrics.splice(existingIndex, 1, metric);
    else this.agentMetrics.push(metric);
  }

  recordLLMResult<T>(agentName: string, result: LLMJsonResult<T>): void {
    if (result.ok) {
      if (!this.agentsUsingLLM.includes(agentName)) this.agentsUsingLLM.push(agentName);
    } else {
      this.failedLLMCalls.push({
        agentName,
        providerId: result.providerId,
        errorCode: result.errorCode,
        httpStatus: result.httpStatus,
        responseBodyPreview: result.responseBodyPreview,
        attempts: result.attempts,
        validationErrors: result.validationErrors,
        qualityChecklistFailures: result.qualityChecklistFailures,
      });
    }
    this.validationFailures.push(...result.validationErrors.map((message) => ({ agentName, message })));
    this.qualityChecklistFailures.push(...result.qualityChecklistFailures.map((message) => ({ agentName, message })));
    this.schemaRepairAttempts.push(...(result.schemaRepairAttempts ?? []).map((attempt) => withAgentName(agentName, attempt)));
    this.canonicalizationApplied.push(...(result.canonicalizationApplied ?? []).map((action) => ({ agentName, action })));
    this.missingFieldRepairs.push(...(result.missingFieldRepairs ?? []).map((repair) => withAgentName(agentName, repair)));
    for (const repair of result.missingFieldRepairs ?? []) {
      const record = asRecord(repair);
      const detail = record ? `${String(record.field ?? "unknown")}: ${String(record.repair ?? "repaired")}` : String(repair);
      this.recordWarning(agentName, "LLM_MISSING_FIELD_REPAIRED", detail);
    }
    this.totalLatencyMs += result.latencyMs;
    this.addUsage(result.usage);
    this.rawOutputSavedPaths.push(...(result.rawOutputSavedPaths ?? []));
    this.setAgentMetric(agentName, result);
  }

  recordRuleFallback(agentName: string, reason: string): void {
    if (!this.agentsUsingRuleFallback.includes(agentName)) this.agentsUsingRuleFallback.push(agentName);
    this.fallbackReasons.push({ agentName, reason });
  }

  recordRevisionRound(round: number): void {
    this.revisionRoundsExecuted = Math.max(this.revisionRoundsExecuted, Number(round ?? 0));
  }

  recordRevisionFallback(round: number, reason: string): void {
    this.revisionFallbacks.push({ round, reason });
  }

  recordRevisionValidationFailure(round: number, message: string): void {
    this.revisionValidationFailures.push({ round, message });
  }

  metadata(): LLMRunMetadata {
    return {
      mode: this.mode,
      provider: this.provider,
      model: this.model,
      agentsUsingLLM: this.agentsUsingLLM,
      agentsUsingRuleFallback: this.agentsUsingRuleFallback,
      failedLLMCalls: this.failedLLMCalls,
      validationFailures: this.validationFailures,
      qualityChecklistFailures: this.qualityChecklistFailures,
      totalLatencyMs: this.totalLatencyMs,
      totalUsage: this.totalUsage,
      agentMetrics: this.agentMetrics,
      fallbackReasons: this.fallbackReasons,
      rawOutputSavedPaths: this.rawOutputSavedPaths,
      warnings: this.warnings,
      schemaRepairAttempts: this.schemaRepairAttempts,
      canonicalizationApplied: this.canonicalizationApplied,
      missingFieldRepairs: this.missingFieldRepairs,
      revisionRoundsExecuted: this.revisionRoundsExecuted,
      revisionFallbacks: this.revisionFallbacks,
      revisionValidationFailures: this.revisionValidationFailures,
    };
  }

  async write(): Promise<void> {
    await writeFile(
      path.join(this.runDir, "llm-run-metadata.json"),
      `${JSON.stringify(redactSecrets(this.metadata()), null, 2)}\n`,
      "utf8",
    );
  }
}