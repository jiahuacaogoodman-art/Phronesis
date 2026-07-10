import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const goal = "做一个医院实习轮转管理系统";

function runThinking(env = {}, extraArgs = []) {
  const result = spawnSync("pnpm", ["think:run", "--goal", goal, "--mode", "hybrid", ...extraArgs], {
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

test("v1.7 blocked route triggers StrategyRevisionAgent and writes revision artifacts", () => {
  const runDir = runThinking({
    THINK_LLM_PROVIDER: "mock",
    THINK_MOCK_LLM_BEHAVIOR: "low-critic-score",
    THINK_LLM_MODEL: "mock-json-model",
    THINK_ROUTE_REVISION_MAX_ROUNDS: "1",
  });
  const metadata = readJson(runDir, "llm-run-metadata.json");
  const revision = readJson(runDir, "strategy-revision-report.json");

  assert.ok(existsSync(path.join(runDir, "strategy-revision-report.json")));
  assert.ok(existsSync(path.join(runDir, "strategy-candidates-revised-r1.json")));
  assert.ok(existsSync(path.join(runDir, "route-deep-dive-revised-r1.json")));
  assert.ok(existsSync(path.join(runDir, "critic-council-report-revised-r1.json")));
  assert.ok(existsSync(path.join(runDir, "selected-route-revised-r1.json")));
  assert.equal(metadata.revisionRoundsExecuted, 1);
  assert.ok(metadata.agentsUsingLLM.includes("StrategyRevisionAgent"));
  assert.equal(revision.revisionRound, 1);
});

test("v1.7 revised strategies must contain substantive changedFields", () => {
  const runDir = runThinking({
    THINK_LLM_PROVIDER: "mock",
    THINK_MOCK_LLM_BEHAVIOR: "low-critic-score",
    THINK_LLM_MODEL: "mock-json-model",
    THINK_ROUTE_REVISION_MAX_ROUNDS: "1",
  });
  const revision = readJson(runDir, "strategy-revision-report.json");
  for (const item of revision.strategyChangeLog) {
    assert.ok(item.changedFields.length > 0, "changedFields must not be empty");
    assert.ok(item.changedFields.some((field) => field !== "title"), "revision cannot only change title");
  }
});

test("v1.7 final report shows revision loop result and remains blocked when blockers remain", () => {
  const runDir = runThinking({
    THINK_LLM_PROVIDER: "mock",
    THINK_MOCK_LLM_BEHAVIOR: "low-critic-score",
    THINK_LLM_MODEL: "mock-json-model",
    THINK_ROUTE_REVISION_MAX_ROUNDS: "1",
  });
  const selected = readJson(runDir, "selected-route.json");
  const finalReport = readFileSync(path.join(runDir, "final-thinking-report.md"), "utf8");

  assert.equal(selected.canProceedToCoding, false);
  assert.ok(finalReport.includes("## Revision Loop"));
  assert.ok(finalReport.includes("Triggered: yes"));
  assert.ok(finalReport.includes("Do not hand off to Coding Agent yet."));
});

test("v1.7 max rounds prevents infinite revision loop", () => {
  const runDir = runThinking({
    THINK_LLM_PROVIDER: "mock",
    THINK_MOCK_LLM_BEHAVIOR: "low-critic-score",
    THINK_LLM_MODEL: "mock-json-model",
    THINK_ROUTE_REVISION_MAX_ROUNDS: "1",
  });
  const metadata = readJson(runDir, "llm-run-metadata.json");
  const revision = readJson(runDir, "strategy-revision-report.json");
  assert.equal(metadata.revisionRoundsExecuted, 1);
  assert.equal(existsSync(path.join(runDir, "strategy-revision-report-r2.json")), false);
  assert.ok(revision.stopReason.includes("THINK_ROUTE_REVISION_MAX_ROUNDS"));
});

test("v1.7 invalid title-only revision is rejected and recorded", () => {
  const runDir = runThinking({
    THINK_LLM_PROVIDER: "mock",
    THINK_MOCK_LLM_BEHAVIOR: "invalid-revision-title-only",
    THINK_LLM_MODEL: "mock-json-model",
    THINK_ROUTE_REVISION_MAX_ROUNDS: "1",
  });
  const metadata = readJson(runDir, "llm-run-metadata.json");
  const revision = readJson(runDir, "strategy-revision-report.json");
  assert.ok(metadata.revisionValidationFailures.length > 0);
  assert.ok(metadata.revisionFallbacks.length > 0);
  assert.ok(revision.unresolvedBlockingIssues.some((issue) => String(issue).includes("only changed title") || String(issue).includes("not substantive")));
});

test("v1.7 revision can leave route coding-approved only if selection thresholds pass", () => {
  const runDir = runThinking({
    THINK_LLM_PROVIDER: "mock",
    THINK_MOCK_LLM_BEHAVIOR: "valid-revision",
    THINK_LLM_MODEL: "mock-json-model",
    THINK_ROUTE_REVISION_MAX_ROUNDS: "1",
  });
  const selected = readJson(runDir, "selected-route.json");
  if (selected.canProceedToCoding) {
    assert.ok(selected.selectionScoreBreakdown.criticAverage >= 6);
    assert.ok(selected.selectionScoreBreakdown.finalScore >= 0);
  } else {
    assert.ok(["blocked", "conditional"].includes(selected.selectionStatus));
  }
});