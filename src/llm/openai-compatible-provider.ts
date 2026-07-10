import { redactSecretText } from "../security/secret-redactor.js";
import { guardJsonOutput } from "./schema-guard.js";
import { saveLLMRawOutput } from "./llm-run-recorder.js";
import type { LLMJsonRequest, LLMJsonResult, LLMProvider, SchemaGuardResult, SchemaRepairRecord } from "./types.js";

export interface OpenAICompatibleProviderOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  chatCompletionsPath?: string;
  timeoutMs?: number | string;
}

interface ModelCallBase {
  rawText: string;
  usage: Record<string, number>;
  httpStatus: number;
  responseBodyPreview: string;
}

type ModelCallResult =
  | (ModelCallBase & { ok: true })
  | (ModelCallBase & { ok: false; errorCode: string });

interface RepairContext<T> {
  rawText: string;
  guard: SchemaGuardResult<T>;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function normalizeUsage(value: unknown): Record<string, number> {
  const record = asRecord(value);
  if (!record) return {};
  return Object.fromEntries(
    Object.entries(record)
      .map(([key, item]) => [key, Number(item)] as const)
      .filter((entry) => Number.isFinite(entry[1])),
  );
}

function buildRepairPrompt<T>(request: LLMJsonRequest<T>, rawText: string, guard: SchemaGuardResult<T>): string {
  const productExpansionInstruction = request.agentName === "ProductGradeExpander"
    ? [
        "",
        "ProductGradeExpander repair requirement:",
        "Every coreCapabilities item must include id, name, priority, description, whyItMatters, acceptanceSignal, triggeredBy, and riskIfMissing.",
        "Do not omit whyItMatters or acceptanceSignal. Fill them for every item.",
      ].join("\n")
    : "";
  return [
    "Repair the previous JSON output so it matches the requested schema exactly.",
    "Return only one root JSON object. Do not use markdown. Do not explain.",
    "Do not wrap the object inside productIntent, intent, data, result, or output.",
    "The root object must directly contain every required schema field.",
    "All arrays must be arrays. Missing arrays must be present as [].",
    "",
    "Schema name:",
    request.schemaName,
    "",
    "Schema description:",
    request.schemaDescription,
    "",
    "Schema guard errors:",
    JSON.stringify({
      validationErrors: guard.validationErrors,
      qualityChecklistFailures: guard.qualityChecklistFailures,
    }, null, 2),
    productExpansionInstruction,
    "",
    "Previous raw output:",
    rawText.slice(0, 12_000),
  ].join("\n");
}

export class OpenAICompatibleProvider implements LLMProvider {
  readonly providerId = "openai-compatible-provider";
  readonly providerType = "openai-compatible" as const;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  readonly chatCompletionsPath: string;
  readonly timeoutMs: number;

  constructor(options: OpenAICompatibleProviderOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.chatCompletionsPath = options.chatCompletionsPath || "/v1/chat/completions";
    const configuredTimeout = Number(options.timeoutMs ?? 180_000);
    this.timeoutMs = configuredTimeout > 0 ? configuredTimeout : 180_000;
  }

  extractContent(payload: unknown): string {
    const root = asRecord(payload);
    const choices = root?.choices;
    const firstChoice = Array.isArray(choices) ? asRecord(choices[0]) : undefined;
    const message = asRecord(firstChoice?.message);
    const content = message?.content;
    if (Array.isArray(content)) {
      return content
        .map((item) => {
          const record = asRecord(item);
          return typeof record?.text === "string"
            ? record.text
            : typeof record?.content === "string" ? record.content : "";
        })
        .join("")
        .trim();
    }
    return typeof content === "string" ? content.trim() : "";
  }

  async callModel<T>(request: LLMJsonRequest<T>): Promise<ModelCallResult> {
    const chatPath = `/${this.chatCompletionsPath.replace(/^\/+/, "")}`;
    const endpoint = `${this.baseUrl}${chatPath}`;
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;

    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          temperature: request.temperature,
          max_tokens: request.maxTokens ?? 1800,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: request.systemPrompt },
            { role: "user", content: request.userPrompt },
          ],
        }),
        signal: controller.signal,
      });
    } catch (error: unknown) {
      clearTimeout(timeoutHandle);
      if (error instanceof Error && error.name === "AbortError") {
        return {
          ok: false,
          errorCode: "LLM_REQUEST_TIMEOUT",
          rawText: `LLM request timed out after ${this.timeoutMs}ms.`,
          usage: {},
          httpStatus: 0,
          responseBodyPreview: "",
        };
      }
      const message = redactSecretText(error instanceof Error ? error.message : String(error));
      return {
        ok: false,
        errorCode: "LLM_REQUEST_FAILED",
        rawText: `OpenAI-compatible request error: ${message}`,
        usage: {},
        httpStatus: 0,
        responseBodyPreview: "",
      };
    }

    const text = await response.text();
    clearTimeout(timeoutHandle);
    const responseBodyPreview = redactSecretText(text.slice(0, 1000));
    if (!response.ok) {
      return {
        ok: false,
        errorCode: "LLM_HTTP_ERROR",
        rawText: `OpenAI-compatible request failed with status ${response.status}. Response preview: ${responseBodyPreview}`,
        usage: {},
        httpStatus: response.status,
        responseBodyPreview,
      };
    }

    let payload: unknown;
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      return {
        ok: false,
        errorCode: "LLM_RESPONSE_PARSE_FAILED",
        rawText: `OpenAI-compatible response was not valid JSON. Response preview: ${responseBodyPreview}`,
        usage: {},
        httpStatus: response.status,
        responseBodyPreview,
      };
    }

    const payloadRecord = asRecord(payload);
    const content = this.extractContent(payload);
    const usage = normalizeUsage(payloadRecord?.usage);
    if (!content) {
      return {
        ok: false,
        errorCode: "LLM_EMPTY_RESPONSE",
        rawText: `OpenAI-compatible response content was empty. Response preview: ${responseBodyPreview}`,
        usage,
        httpStatus: response.status,
        responseBodyPreview,
      };
    }
    return { ok: true, rawText: content, usage, httpStatus: response.status, responseBodyPreview };
  }

  async completeJson<T>(request: LLMJsonRequest<T>): Promise<LLMJsonResult<T>> {
    const started = Date.now();
    const maxAttempts = Math.max(1, request.maxRetries);
    const rawOutputSavedPaths: string[] = [];
    let lastRawText = "";
    let usage: Record<string, number> = {};
    let lastModelResult: ModelCallResult = {
      ok: false,
      errorCode: "LLM_REQUEST_FAILED",
      rawText: "No attempt was made.",
      usage: {},
      httpStatus: 0,
      responseBodyPreview: "",
    };
    let lastGuard: SchemaGuardResult<T> = {
      ok: false,
      data: undefined,
      repaired: false,
      validationErrors: ["No attempt was made."],
      qualityChecklistFailures: [],
      canonicalizationApplied: [],
      missingFieldRepairs: [],
    };
    let repairContext: RepairContext<T> | undefined;
    const schemaRepairAttempts: unknown[] = [];
    const canonicalizationApplied: SchemaRepairRecord[] = [];
    const missingFieldRepairs: SchemaRepairRecord[] = [];

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const currentRepair = repairContext;
      const isRepairAttempt = currentRepair !== undefined;
      const attemptRequest: LLMJsonRequest<T> = currentRepair
        ? { ...request, userPrompt: buildRepairPrompt(request, currentRepair.rawText, currentRepair.guard) }
        : request;
      lastModelResult = await this.callModel(attemptRequest);
      lastRawText = lastModelResult.rawText;
      usage = lastModelResult.usage;
      rawOutputSavedPaths.push(await saveLLMRawOutput(request.runDir, request.agentName, attempt, lastRawText, isRepairAttempt ? "repair" : ""));

      if (!lastModelResult.ok) {
        lastGuard = {
          ok: false,
          data: undefined,
          repaired: false,
          validationErrors: [lastRawText],
          qualityChecklistFailures: [],
          canonicalizationApplied: [],
          missingFieldRepairs: [],
        };
        repairContext = undefined;
        continue;
      }

      lastGuard = guardJsonOutput(lastRawText, request);
      canonicalizationApplied.push(...lastGuard.canonicalizationApplied);
      missingFieldRepairs.push(...lastGuard.missingFieldRepairs);
      if (lastGuard.ok) break;

      if (attempt < maxAttempts) {
        schemaRepairAttempts.push({
          fromAttempt: attempt,
          repairAttempt: attempt + 1,
          errors: [...lastGuard.validationErrors, ...lastGuard.qualityChecklistFailures],
        });
        repairContext = { rawText: lastRawText, guard: lastGuard };
      }
    }

    return {
      ok: lastGuard.ok,
      data: lastGuard.data,
      rawText: lastRawText,
      repaired: lastGuard.repaired,
      errorCode: lastGuard.ok ? undefined : (!lastModelResult.ok ? lastModelResult.errorCode : "SCHEMA_GUARD_FAILED"),
      validationErrors: lastGuard.validationErrors,
      qualityChecklistFailures: lastGuard.qualityChecklistFailures,
      attempts: rawOutputSavedPaths.length,
      providerId: this.providerId,
      model: this.model,
      usage,
      latencyMs: Date.now() - started,
      httpStatus: lastModelResult.httpStatus,
      responseBodyPreview: lastModelResult.responseBodyPreview,
      fallbackUsed: false,
      fallbackReason: undefined,
      rawOutputSavedPaths,
      schemaRepairAttempts,
      canonicalizationApplied,
      missingFieldRepairs,
    };
  }
}