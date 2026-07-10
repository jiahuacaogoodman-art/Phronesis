import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const goal = "做一个医院实习轮转管理系统";
const placeholderPattern = /\{[a-zA-Z0-9_.() ,]+"?\}/;

function runCommand(args, env = {}) {
  const result = spawnSync("pnpm", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  assert.equal(result.status, 0, `command failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  const match = result.stdout.match(/Run directory:\s*(.+)/);
  assert.ok(match, `Run directory was not printed.\nstdout:\n${result.stdout}`);
  return match[1].trim();
}

function readJson(runDir, fileName) {
  return JSON.parse(readFileSync(path.join(runDir, fileName), "utf8"));
}

function readText(runDir, fileName) {
  return readFileSync(path.join(runDir, fileName), "utf8");
}

function mockMedicalEnv() {
  return {
    THINK_LLM_PROVIDER: "mock",
    THINK_MOCK_LLM_BEHAVIOR: "medical-product-intent",
    THINK_LLM_MODEL: "mock-json-model",
  };
}

test("v1.4 final report renders template values and reflects LLM ProductIntent", () => {
  const runDir = runCommand(["think:run", "--goal", goal, "--mode", "hybrid"], mockMedicalEnv());
  const finalReport = readText(runDir, "final-thinking-report.md");
  const productIntent = readJson(runDir, "product-intent.json");

  assert.equal(productIntent.domainId, "medical-intern-rotation-management");
  assert.equal(placeholderPattern.test(finalReport), false, "final report contains an unrendered template placeholder");
  for (const term of ["医院实习", "轮转", "科室", "带教"]) {
    assert.ok(finalReport.includes(term), `final report missing ProductIntent term: ${term}`);
  }
});

test("v1.4 full hybrid run passes LLM ProductIntent into downstream artifacts", () => {
  const runDir = runCommand(["think:run", "--goal", goal, "--mode", "hybrid"], mockMedicalEnv());
  const strategyText = JSON.stringify(readJson(runDir, "strategy-candidates.json"));
  const evidenceText = JSON.stringify(readJson(runDir, "evidence-ledger.json"));
  const antiSimplificationText = JSON.stringify(readJson(runDir, "anti-simplification-report.json"));
  const taskGraphText = JSON.stringify(readJson(runDir, "execution-task-graph.json"));

  assert.ok(strategyText.includes("轮转") && strategyText.includes("科室"), "strategy candidates did not consume LLM ProductIntent resources/workflows");
  assert.ok(evidenceText.includes("轮转") && evidenceText.includes("带教"), "evidence ledger did not consume LLM ProductIntent");
  assert.ok(antiSimplificationText.includes("轮转") || antiSimplificationText.includes("科室"), "anti-simplification report did not consume LLM ProductIntent");
  assert.ok(taskGraphText.includes("轮转") || taskGraphText.includes("科室"), "task graph did not consume LLM ProductIntent");
});

test("v1.4 single-agent llm smoke marks final report as partial", () => {
  const runDir = runCommand(
    ["think:llm-smoke", "--goal", goal, "--agent", "ProductIntentBuilder"],
    mockMedicalEnv(),
  );
  assert.ok(existsSync(path.join(runDir, "final-thinking-report.md")), "smoke run should still write a marked final report");
  const finalReport = readText(runDir, "final-thinking-report.md");
  assert.ok(finalReport.includes("Partial Smoke Notice"), "smoke final report must be marked partial");
  assert.ok(finalReport.includes("partial LLM smoke run"), "smoke final report must warn that downstream artifacts are not full LLM outputs");
  assert.equal(placeholderPattern.test(finalReport), false, "smoke final report contains an unrendered template placeholder");
});