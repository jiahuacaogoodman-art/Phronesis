export type ThinkingMode = "rule" | "hybrid" | "llm";
export type LLMProviderType = "mock" | "openai-compatible";

export interface ExpectedArrayRule {
  path: string;
  minItems?: number;
  itemRequired?: string[];
}

export type ExpectedShape =
  | {
      type: "array";
      minItems?: number;
      itemRequired?: string[];
      itemArrays?: ExpectedArrayRule[];
    }
  | {
      type: "object";
      required?: string[];
      arrays?: ExpectedArrayRule[];
    };

export type SchemaRepairRecord = string | { field: string; repair: string };

export interface SchemaGuardResult<T> {
  ok: boolean;
  data?: T;
  repaired: boolean;
  validationErrors: string[];
  qualityChecklistFailures: string[];
  canonicalizationApplied: SchemaRepairRecord[];
  missingFieldRepairs: SchemaRepairRecord[];
}

export interface LLMJsonRequest<T> {
  agentName: string;
  goal: string;
  systemPrompt: string;
  userPrompt: string;
  schemaName: string;
  schemaDescription: string;
  examples: unknown[];
  qualityChecklist: string[];
  temperature: number;
  maxTokens?: number;
  maxRetries: number;
  runDir: string;
  expectedShape?: ExpectedShape;
  input?: unknown;
  mockData?: T;
}

export interface LLMJsonResult<T> {
  ok: boolean;
  data?: T;
  rawText: string;
  repaired: boolean;
  errorCode?: string;
  validationErrors: string[];
  qualityChecklistFailures: string[];
  attempts: number;
  providerId: string;
  model: string;
  usage: Record<string, number>;
  latencyMs: number;
  httpStatus?: number;
  responseBodyPreview?: string;
  fallbackUsed: boolean;
  fallbackReason?: string;
  rawOutputSavedPaths?: string[];
  schemaRepairAttempts?: unknown[];
  canonicalizationApplied?: SchemaRepairRecord[];
  missingFieldRepairs?: SchemaRepairRecord[];
}

export interface LLMProvider {
  providerId: string;
  providerType: LLMProviderType;
  model: string;
  completeJson<T>(request: LLMJsonRequest<T>): Promise<LLMJsonResult<T>>;
}