import type { NativePatchOperation, NativePatchPlan, NativePatchOperationType } from "../types/native-coding.js";

export type NativePatchPlanParseResult =
  | { ok: true; data: NativePatchPlan; errors: [] }
  | { ok: false; errors: string[] };

const operationTypes = new Set<NativePatchOperationType>([
  "createFile",
  "replaceFile",
  "patchFile",
  "deleteFile",
  "appendFile",
  "mkdir",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredString(record: Record<string, unknown>, key: string, context: string, errors: string[]): string {
  const value = record[key];
  if (typeof value === "string" && value.trim()) return value;
  errors.push(`${context}.${key} must be a non-empty string.`);
  return "";
}

function stringArray(value: unknown, field: string, errors: string[]): string[] {
  if (!Array.isArray(value)) {
    errors.push(`${field} must be an array.`);
    return [];
  }
  const invalid = value.find((item) => typeof item !== "string");
  if (invalid !== undefined) errors.push(`${field} must contain only strings.`);
  return value.filter((item): item is string => typeof item === "string");
}

function parseOperation(value: unknown, index: number, errors: string[]): NativePatchOperation | undefined {
  const context = `operations[${index}]`;
  if (!isRecord(value)) {
    errors.push(`${context} must be an object.`);
    return undefined;
  }
  const typeValue = value.type;
  if (typeof typeValue !== "string" || !operationTypes.has(typeValue as NativePatchOperationType)) {
    errors.push(`${context}.type is unsupported.`);
    return undefined;
  }
  const type = typeValue as NativePatchOperationType;
  const path = requiredString(value, "path", context, errors);
  const rationale = requiredString(value, "rationale", context, errors);
  const safetyCheck = requiredString(value, "safetyCheck", context, errors);
  if (type === "createFile" || type === "replaceFile" || type === "appendFile") {
    const content = value.content;
    if (typeof content !== "string") {
      errors.push(`${context}.content must be a string for ${type}.`);
      return undefined;
    }
    return { type, path, rationale, safetyCheck, content };
  }
  if (type === "patchFile") {
    const find = value.find;
    const replace = value.replace;
    if (typeof find !== "string" || !find) errors.push(`${context}.find must be a non-empty string for patchFile.`);
    if (typeof replace !== "string") errors.push(`${context}.replace must be a string for patchFile.`);
    if (typeof find !== "string" || !find || typeof replace !== "string") return undefined;
    return { type, path, rationale, safetyCheck, find, replace };
  }
  if (type === "deleteFile") return { type, path, rationale, safetyCheck };
  return { type: "mkdir", path, rationale, safetyCheck };
}

export function parseNativePatchPlan(value: unknown): NativePatchPlanParseResult {
  const errors: string[] = [];
  if (!isRecord(value)) return { ok: false, errors: ["Native patch plan must be an object."] };
  const rawOperations = value.operations;
  if (!Array.isArray(rawOperations)) errors.push("operations must be an array.");
  const operations = Array.isArray(rawOperations)
    ? rawOperations.map((operation, index) => parseOperation(operation, index, errors)).filter((operation): operation is NativePatchOperation => operation !== undefined)
    : [];
  const confidence = Number(value.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    errors.push("confidence must be a number between 0 and 1.");
  }
  const data: NativePatchPlan = {
    batchId: requiredString(value, "batchId", "patchPlan", errors),
    summary: requiredString(value, "summary", "patchPlan", errors),
    operations,
    expectedFilesChanged: stringArray(value.expectedFilesChanged, "expectedFilesChanged", errors),
    expectedTests: stringArray(value.expectedTests, "expectedTests", errors),
    riskNotes: stringArray(value.riskNotes, "riskNotes", errors),
    rollbackPlan: stringArray(value.rollbackPlan, "rollbackPlan", errors),
    confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0,
  };
  return errors.length > 0 ? { ok: false, errors } : { ok: true, data, errors: [] };
}