const sensitiveKeyPattern = /(?:api[-_]?key|authorization|cookie|credential|password|secret|session[-_]?token|access[-_]?token|refresh[-_]?token|provider[-_]?key)/i;

export function redactSecretText(value: string): string {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{8,}\b/g, "[REDACTED]")
    .replace(/\bgh[pousr]_[A-Za-z0-9_]{12,}\b/gi, "[REDACTED]")
    .replace(/\b(Cookie|Authorization)\s*:\s*[^\r\n]+/gi, (_match, key: string) => `${key}: [REDACTED]`)
    .replace(
      /\b(THINK_LLM_API_KEY|OPENAI_API_KEY|API[-_]?KEY|ACCESS[-_]?TOKEN|REFRESH[-_]?TOKEN|SESSION[-_]?TOKEN|PROVIDER[-_]?CREDENTIAL|PASSWORD|COOKIE|AUTHORIZATION)\b["']?\s*[=:]\s*["']?([^\s,"';}]+)/gi,
      (_match, key: string) => `${key}=[REDACTED]`,
    );
}

export function redactSecrets(value: unknown): unknown {
  if (typeof value === "string") return redactSecretText(value);
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item));
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      result[key] = sensitiveKeyPattern.test(key) ? "[REDACTED]" : redactSecrets(item);
    }
    return result;
  }
  return value;
}