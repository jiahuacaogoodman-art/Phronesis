import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

test("v0.8 environment examples and ignore rules exist", () => {
  assert.ok(existsSync(path.join(process.cwd(), ".env.example")), ".env.example should exist");
  assert.ok(existsSync(path.join(process.cwd(), ".env.local.example")), ".env.local.example should exist");

  const gitignore = readFileSync(path.join(process.cwd(), ".gitignore"), "utf8");
  assert.ok(gitignore.includes(".env"), ".gitignore should ignore .env");
  assert.ok(gitignore.includes(".env.*"), ".gitignore should ignore .env.*");
  assert.ok(gitignore.includes("!.env.example"), ".gitignore should keep .env.example");
});

test("v0.8 real llm scripts exist and do not contain real API keys", () => {
  for (const scriptName of [
    "scripts/real-llm-smoke.sh",
    "scripts/real-llm-run.sh",
    "scripts/real-llm-compare.sh",
  ]) {
    const fullPath = path.join(process.cwd(), scriptName);
    assert.ok(existsSync(fullPath), `${scriptName} should exist`);
    const content = readFileSync(fullPath, "utf8");
    assert.ok(!content.includes("sk-"), `${scriptName} should not contain a real API key`);
  }
});

test("v0.8 README does not contain a real API key and documents local env usage", () => {
  const readme = readFileSync(path.join(process.cwd(), "README.md"), "utf8");
  assert.ok(!readme.includes("sk-"), "README should not contain a real API key");
  assert.ok(readme.includes(".env.local"), "README should mention .env.local");
});

test("v0.8 provider source does not leak authorization header in error text", () => {
  const providerSource = readFileSync(path.join(process.cwd(), "src/llm/openai-compatible-provider.ts"), "utf8");
  assert.ok(!providerSource.includes("Authorization"), "provider source should not print Authorization header");
  assert.ok(!providerSource.includes("failed with status ${response.status}: ${String(text).slice(0, 500)} ${this.apiKey}"), "provider source should not append API key to error strings");
  assert.ok(!providerSource.includes("request error: ${error instanceof Error ? error.message : String(error)} ${this.apiKey}"), "provider source should not append API key to request error strings");
  assert.ok(!providerSource.includes("request headers"), "provider source should not mention request headers in error strings");
  assert.ok(!providerSource.includes("authorization header"), "provider source should not mention authorization header in error strings");
});

test("v0.8 still does not add UI surfaces", () => {
  const forbiddenPaths = ["web", "app", "pages", "components", "src/App.tsx", "vite.config.ts"];
  for (const forbiddenPath of forbiddenPaths) {
    assert.equal(existsSync(path.join(process.cwd(), forbiddenPath)), false, `Forbidden UI path exists: ${forbiddenPath}`);
  }
});