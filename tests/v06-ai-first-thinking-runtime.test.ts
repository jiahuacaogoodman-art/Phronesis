import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const goal = "做一个医院实习轮转管理系统";

function runThinking(args, env = {}) {
  const result = spawnSync("pnpm", ["think:run", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  assert.equal(result.status, 0, `think:run failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  const match = result.stdout.match(/Run directory:\s*(.+)/);
  assert.ok(match, "Run directory was not printed.");
  return match[1].trim();
}

function readJson(runDir, fileName) {
  return JSON.parse(readFileSync(path.join(runDir, fileName), "utf8"));
}

function assertCoreArtifacts(runDir) {
  for (const artifact of [
    "goal.json",
    "domain-analysis.json",
    "product-intent.json",
    "reconstructed-intent.json",
    "product-expansion.json",
    "strategy-candidates.json",
    "anti-simplification-report.json",
    "critic-council-report.json",
    "selected-route.json",
    "decision-ledger.json",
    "evidence-ledger.json",
    "claim-graph.json",
    "execution-task-graph.json",
    "final-thinking-report.md",
    "llm-run-metadata.json",
  ]) {
    assert.ok(existsSync(path.join(runDir, artifact)), `Missing artifact: ${artifact}`);
  }
}

test("v0.6 rule mode preserves the rule baseline and writes metadata", () => {
  const runDir = runThinking(["--goal", goal, "--mode", "rule"]);
  assertCoreArtifacts(runDir);
  const metadata = readJson(runDir, "llm-run-metadata.json");
  assert.equal(metadata.mode, "rule");
  assert.equal(metadata.agentsUsingLLM.length, 0);
  assert.ok(metadata.agentsUsingRuleFallback.length >= 5, "rule mode should record rule fallback agents");
});

test("v0.6 hybrid mode uses mock LLM when it returns valid JSON", () => {
  const runDir = runThinking(["--goal", goal, "--mode", "hybrid"], {
    THINK_LLM_PROVIDER: "mock",
    THINK_MOCK_LLM_BEHAVIOR: "valid",
  });
  assertCoreArtifacts(runDir);
  const metadata = readJson(runDir, "llm-run-metadata.json");
  assert.equal(metadata.mode, "hybrid");
  assert.ok(metadata.agentsUsingLLM.length >= 5, "expected at least five LLM-backed agents");
  assert.equal(metadata.agentsUsingRuleFallback.length, 0);
  assert.ok(metadata.rawOutputSavedPaths.length >= 5, "expected raw LLM outputs to be saved");
  for (const savedPath of metadata.rawOutputSavedPaths) {
    assert.ok(existsSync(savedPath), `raw output path missing: ${savedPath}`);
  }
});

test("v0.6 hybrid mode schema guard catches invalid mock JSON and falls back", () => {
  const runDir = runThinking(["--goal", goal, "--mode", "hybrid"], {
    THINK_LLM_PROVIDER: "mock",
    THINK_MOCK_LLM_BEHAVIOR: "invalid",
  });
  assertCoreArtifacts(runDir);
  const metadata = readJson(runDir, "llm-run-metadata.json");
  assert.equal(metadata.mode, "hybrid");
  assert.equal(metadata.agentsUsingLLM.length, 0);
  assert.ok(metadata.agentsUsingRuleFallback.length >= 5, "invalid LLM output should fall back to rule agents");
  assert.ok(metadata.validationFailures.length >= 5, "schema guard should record validation failures");
  assert.ok(metadata.fallbackReasons.length >= 5, "fallback reasons should be recorded");
  assert.ok(metadata.rawOutputSavedPaths.length >= 5, "invalid raw outputs should still be saved");
});

test("v0.6 still does not add UI surfaces", () => {
  const forbiddenPaths = ["web", "app", "pages", "components", "src/App.tsx", "vite.config.ts"];
  for (const forbiddenPath of forbiddenPaths) {
    assert.equal(existsSync(path.join(process.cwd(), forbiddenPath)), false, `Forbidden UI path exists: ${forbiddenPath}`);
  }
});