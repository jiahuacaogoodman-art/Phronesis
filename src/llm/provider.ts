import { LLMRunRecorder } from "./llm-run-recorder.js";
import { MockLLMProvider } from "./mock-provider.js";
import { OpenAICompatibleProvider } from "./openai-compatible-provider.js";
import type { ExpectedShape, LLMProvider, ThinkingMode } from "./types.js";

interface PromptContract<TInput> {
  agentName?: string;
  outputSchemaName: string;
  systemPrompt: string;
  outputSchemaDescription: string;
  examples?: unknown[];
  qualityChecklist?: string[];
  temperature?: number;
  maxRetries?: number;
  expectedShape?: ExpectedShape;
  buildUserPrompt(input: TInput): string;
}

interface ThinkingRuntimeOptions {
  mode?: string;
  runDir: string;
  goal: string;
  enabledAgents?: Set<string>;
}

type ProviderFactoryResult =
  | { provider: LLMProvider; unavailableReason: undefined }
  | { provider: undefined; unavailableReason: string };

function summarizeReason(reason: unknown): string {
  return String(reason ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function totalTokensFromUsage(usage: Record<string, number>): number {
  return Number(
    usage?.totalTokens ??
    usage?.total_tokens ??
    ((usage?.promptTokens ?? usage?.prompt_tokens ?? 0) + (usage?.completionTokens ?? usage?.completion_tokens ?? 0)),
  );
}

const agentMaxTokenDefaults: Record<string, number> = {
  GoalReconstructor: 800,
  ProductIntentBuilder: 1200,
  ProductGradeExpander: 1600,
  StrategyGenerator: 1600,
  CriticCouncil: 2200,
  TechnicalProductizationPlanner: 2400,
  ProblemSolutionResearchAgent: 2400,
};

const agentMaxTokenEnvKeys: Record<string, string> = {
  GoalReconstructor: "THINK_LLM_MAX_TOKENS_GOAL_RECONSTRUCTOR",
  ProductIntentBuilder: "THINK_LLM_MAX_TOKENS_PRODUCT_INTENT",
  ProductGradeExpander: "THINK_LLM_MAX_TOKENS_PRODUCT_EXPANDER",
  StrategyGenerator: "THINK_LLM_MAX_TOKENS_STRATEGY_GENERATOR",
  CriticCouncil: "THINK_LLM_MAX_TOKENS_CRITIC_COUNCIL",
  TechnicalProductizationPlanner: "THINK_LLM_MAX_TOKENS_TECHNICAL_PRODUCTIZATION",
  ProblemSolutionResearchAgent: "THINK_LLM_MAX_TOKENS_PROBLEM_SOLUTION_RESEARCH",
};

function maxTokensForAgent(agentName: string): number {
  const normalizedAgentName = String(agentName).startsWith("CriticCouncil.") ? "CriticCouncil" : agentName;
  const agentEnvKey = agentMaxTokenEnvKeys[normalizedAgentName];
  const agentValue = agentEnvKey ? Number(process.env[agentEnvKey] ?? 0) : 0;
  if (agentValue > 0) return agentValue;
  const defaultForAgent = agentMaxTokenDefaults[normalizedAgentName];
  if (defaultForAgent) return defaultForAgent;
  const globalValue = Number(process.env.THINK_LLM_MAX_TOKENS ?? 1800);
  return globalValue > 0 ? globalValue : 1800;
}

export function normalizeThinkingMode(mode: unknown): ThinkingMode {
  if (mode === "rule" || mode === "hybrid" || mode === "llm") return mode;
  return "hybrid";
}

export function createLLMProviderFromEnv(): ProviderFactoryResult {
  const providerName = process.env.THINK_LLM_PROVIDER;
  if (!providerName) {
    return { provider: undefined, unavailableReason: "THINK_LLM_PROVIDER is not configured." };
  }

  if (providerName === "mock") {
    return {
      provider: new MockLLMProvider({
        model: process.env.THINK_LLM_MODEL ?? "mock-json-model",
        behavior: process.env.THINK_MOCK_LLM_BEHAVIOR ?? "valid",
      }),
      unavailableReason: undefined,
    };
  }

  if (providerName === "openai-compatible") {
    const baseUrl = process.env.THINK_LLM_BASE_URL;
    const apiKey = process.env.THINK_LLM_API_KEY;
    const model = process.env.THINK_LLM_MODEL;
    const chatCompletionsPath = process.env.THINK_LLM_CHAT_COMPLETIONS_PATH || "/v1/chat/completions";
    const timeoutMs = process.env.THINK_LLM_TIMEOUT_MS || "180000";
    const missing: string[] = [];
    if (!baseUrl) missing.push("THINK_LLM_BASE_URL");
    if (!apiKey) missing.push("THINK_LLM_API_KEY");
    if (!model) missing.push("THINK_LLM_MODEL");
    if (missing.length > 0) {
      return {
        provider: undefined,
        unavailableReason: `OpenAI-compatible provider missing env vars: ${missing.join(", ")}.`,
      };
    }
    if (!baseUrl || !apiKey || !model) {
      return { provider: undefined, unavailableReason: "OpenAI-compatible provider configuration is incomplete." };
    }
    return {
      provider: new OpenAICompatibleProvider({ baseUrl, apiKey, model, chatCompletionsPath, timeoutMs }),
      unavailableReason: undefined,
    };
  }

  return {
    provider: undefined,
    unavailableReason: `Unsupported THINK_LLM_PROVIDER: ${providerName}.`,
  };
}

export function createThinkingRuntime({ mode, runDir, goal, enabledAgents }: ThinkingRuntimeOptions) {
  const normalizedMode = normalizeThinkingMode(mode);
  const providerResult = createLLMProviderFromEnv();
  const provider = providerResult.provider;
  const recorder = new LLMRunRecorder({
    mode: normalizedMode,
    provider: provider?.providerId ?? "none",
    model: provider?.model ?? "none",
    runDir,
  });

  async function runJsonAgent<TInput, TOutput>(contract: PromptContract<TInput>, input: TInput, ruleData: TOutput): Promise<TOutput> {
    const agentName = contract.agentName ?? contract.outputSchemaName;
    const parentAgentName = String(agentName).split(".")[0];
    if (enabledAgents && !enabledAgents.has(agentName) && !enabledAgents.has(parentAgentName)) {
      return ruleData;
    }
    if (normalizedMode === "rule") {
      recorder.recordRuleFallback(agentName, "rule mode selected");
      return ruleData;
    }

    if (!provider) {
      const reason = providerResult.unavailableReason ?? "No LLM provider available.";
      if (normalizedMode === "llm") {
        throw new Error(`LLM mode requires a configured provider. ${reason}`);
      }
      recorder.recordRuleFallback(agentName, reason);
      console.log(`[llm] fallback ${agentName} reason=${summarizeReason(reason)}`);
      return ruleData;
    }

    const request = {
      agentName,
      goal,
      systemPrompt: contract.systemPrompt,
      userPrompt: contract.buildUserPrompt(input),
      schemaName: contract.outputSchemaName,
      schemaDescription: contract.outputSchemaDescription,
      examples: contract.examples ?? [],
      qualityChecklist: contract.qualityChecklist ?? [],
      temperature: contract.temperature ?? 0.2,
      maxTokens: maxTokensForAgent(agentName),
      maxRetries: contract.maxRetries ?? 2,
      runDir,
      expectedShape: contract.expectedShape,
      input,
      mockData: ruleData,
    };

    console.log(`[llm] start ${agentName} model=${provider.model}`);
    const result = await provider.completeJson(request);
    if (agentName === "ProductIntentBuilder" && String(result.rawText ?? "").length > 4000) {
      recorder.recordWarning(agentName, "LLM_OUTPUT_TOO_LONG", `Raw output length ${String(result.rawText ?? "").length} exceeds 4000 characters.`);
    }
    recorder.recordLLMResult(agentName, result);
    if (result.ok && result.data !== undefined) {
      console.log(`[llm] done ${agentName} latencyMs=${result.latencyMs} tokens=${totalTokensFromUsage(result.usage)}`);
      return result.data;
    }

    const errorCode = result.errorCode ?? (result.validationErrors.length > 0 || result.qualityChecklistFailures.length > 0 ? "SCHEMA_GUARD_FAILED" : "LLM_REQUEST_FAILED");
    console.log(`[llm] failed ${agentName} error=${errorCode}`);
    const reason = [
      ...result.validationErrors,
      ...result.qualityChecklistFailures,
    ].join(" | ") || "LLM output failed schema guard.";

    if (normalizedMode === "llm") {
      throw new Error(`${agentName} failed in llm mode: ${reason}`);
    }

    recorder.recordRuleFallback(agentName, reason);
    console.log(`[llm] fallback ${agentName} reason=${summarizeReason(reason)}`);
    return ruleData;
  }

  return {
    mode: normalizedMode,
    provider,
    recorder,
    runJsonAgent,
    async writeMetadata() {
      await recorder.write();
    },
  };
}