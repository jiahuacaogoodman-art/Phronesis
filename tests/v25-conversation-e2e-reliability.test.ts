import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runConversationE2EHarness } from "../src/eval/conversation-e2e-harness.js";

async function runScenario(scenario) {
  const outputDir = mkdtempSync(path.join(os.tmpdir(), `conversation-eval-${scenario}-`));
  const options = {};
  options.scenario = scenario;
  options.outputDir = outputDir;
  options.keepTemp = true;
  return runConversationE2EHarness(options);
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function scenarioDir(result, scenario) {
  return result.scenario === "all" ? path.join(result.outputDir, scenario) : result.outputDir;
}

test("v2.5 summarize-latest-run scenario passes", async () => {
  const result = await runScenario("summarize-latest-run");
  assert.equal(result.report.passed, true, JSON.stringify(result.report.results));
  const transcript = readJson(path.join(result.outputDir, "conversation-transcript.json"));
  assert.ok(["inspect_latest_run", "summarize_artifacts"].includes(transcript.turns[0].intent.intent));
  assert.equal(transcript.turns[0].status, "completed");
});

test("v2.5 explain-blocked-run explains blockers in natural language", async () => {
  const result = await runScenario("explain-blocked-run");
  assert.equal(result.report.passed, true, JSON.stringify(result.report.results));
  const response = readFileSync(path.join(result.outputDir, "conversation-session", "default", "conversation-response.md"), "utf8");
  assert.ok(response.includes("审批") || response.includes("科室"));
  assert.ok(!response.trim().startsWith("{"));
});

test("v2.5 toy-eval-confirmation waits first then executes on confirm", async () => {
  const result = await runScenario("toy-eval-confirmation");
  assert.equal(result.report.passed, true, JSON.stringify(result.report.results));
  const transcript = readJson(path.join(result.outputDir, "conversation-transcript.json"));
  assert.equal(transcript.turns[0].status, "pending-confirmation");
  assert.equal(transcript.turns[0].executed, false);
  assert.equal(transcript.turns[1].status, "completed");
  assert.ok(transcript.turns[1].stateAfter.latestEvalDir);
  assert.ok(existsSync(transcript.turns[1].stateAfter.latestEvalDir));
  assert.equal(Boolean(transcript.turns[1].stateAfter.pendingConfirmation), false);
});

test("v2.5 blocked-autocode-execute does not execute autocode or generate patches", async () => {
  const result = await runScenario("blocked-autocode-execute");
  assert.equal(result.report.passed, true, JSON.stringify(result.report.results));
  const transcript = readJson(path.join(result.outputDir, "conversation-transcript.json"));
  assert.equal(transcript.turns[0].status, "blocked");
  const runDir = transcript.finalState.latestRunDir;
  assert.equal(existsSync(path.join(runDir, "applied-patches.json")), false);
  assert.equal(existsSync(path.join(runDir, "native-patch-plan.json")), false);
});

test("v2.5 stale confirmation does not execute any action", async () => {
  const result = await runScenario("stale-confirmation");
  assert.equal(result.report.passed, true, JSON.stringify(result.report.results));
  const transcript = readJson(path.join(result.outputDir, "conversation-transcript.json"));
  assert.equal(transcript.turns[0].status, "confirmation-not-found");
});

test("v2.5 continue-context does not execute side-effecting action", async () => {
  const result = await runScenario("continue-context");
  assert.equal(result.report.passed, true, JSON.stringify(result.report.results));
  const transcript = readJson(path.join(result.outputDir, "conversation-transcript.json"));
  assert.notEqual(transcript.turns[0].status, "pending-confirmation");
  const runDir = transcript.finalState.latestRunDir;
  assert.equal(existsSync(path.join(runDir, "applied-patches.json")), false);
});

test("v2.5 conversation response is not a JSON dump and action log is complete", async () => {
  const result = await runScenario("toy-eval-confirmation");
  const response = readFileSync(path.join(result.outputDir, "conversation-session", "default", "conversation-response.md"), "utf8");
  assert.ok(response.includes("当前状态"));
  assert.equal(response.trim().startsWith("{"), false);
  const actionLog = readJson(path.join(result.outputDir, "conversation-session", "default", "runtime-action-log.json"));
  assert.ok(actionLog.length >= 2);
});

test("v2.5 scenario all produces aggregate report", async () => {
  const outputDir = mkdtempSync(path.join(os.tmpdir(), "conversation-eval-all-"));
  const options = {};
  options.scenario = "all";
  options.outputDir = outputDir;
  options.keepTemp = true;
  const result = await runConversationE2EHarness(options);
  assert.equal(result.report.passed, true, JSON.stringify(result.report.results));
  for (const scenario of ["summarize-latest-run", "explain-blocked-run", "toy-eval-confirmation", "blocked-autocode-execute", "stale-confirmation", "continue-context"]) {
    assert.ok(existsSync(path.join(scenarioDir(result, scenario), "conversation-transcript.json")));
    assert.ok(existsSync(path.join(scenarioDir(result, scenario), "conversation-eval-report.json")));
  }
});