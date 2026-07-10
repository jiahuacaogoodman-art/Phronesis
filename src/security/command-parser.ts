import type { CommandParseResult, CommandPolicyViolation } from "../types/command-execution.js";

function violation(message: string): CommandPolicyViolation {
  return { code: "COMMAND_PARSE_FAILED", message };
}

function shellSyntaxOutsideQuotes(command: string): string[] {
  const labels: string[] = [];
  let quote: "'" | '"' | undefined;
  let escaping = false;

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];
    const next = command[index + 1] ?? "";
    if (escaping) {
      escaping = false;
      continue;
    }
    if (character === "\\" && quote !== "'") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === "&" && next === "&") labels.push("&&");
    else if (character === "|" && next === "|") labels.push("||");
    else if (character === "|") labels.push("pipe");
    else if (character === ";") labels.push(";");
    else if (character === ">" || character === "<") labels.push("redirection");
    else if (character === "$" && next === "(") labels.push("command substitution");
    else if (character === "`") labels.push("backtick command substitution");
    else if (character === "\r" || character === "\n") labels.push("newline");
  }
  return Array.from(new Set(labels));
}

function tokenize(command: string): string[] | undefined {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | undefined;
  let escaping = false;

  for (const character of command.trim()) {
    if (escaping) {
      current += character;
      escaping = false;
      continue;
    }
    if (character === "\\" && quote !== "'") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = undefined;
      else current += character;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (/\s/.test(character)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += character;
  }

  if (quote || escaping) return undefined;
  if (current) tokens.push(current);
  return tokens;
}

export function parseCommand(command: string): CommandParseResult {
  const violations = shellSyntaxOutsideQuotes(command)
    .map((label) => violation(`Shell syntax is not allowed: ${label}.`));
  if (violations.length > 0) return { ok: false, violations };

  const tokens = tokenize(command);
  if (!tokens || tokens.length === 0) {
    return { ok: false, violations: [violation("Command is empty or has unclosed quoting.")] };
  }
  if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0])) {
    return {
      ok: false,
      violations: [{ code: "ENV_PREFIX_DENIED", message: "Environment variable prefixes are not allowed in command strings." }],
    };
  }
  return { ok: true, command: { executable: tokens[0], args: tokens.slice(1) } };
}