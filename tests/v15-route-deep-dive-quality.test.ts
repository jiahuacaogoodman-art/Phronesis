import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

function mockMedicalEnv() {
  return {
    THINK_LLM_PROVIDER: "mock",
    THINK_MOCK_LLM_BEHAVIOR: "medical-product-intent",
    THINK_LLM_MODEL: "mock-json-model",
  };
}

test("v1.5 RouteDeepDive expands medical intern rotation specifics from ProductIntent", () => {
  const runDir = runThinking(["--goal", goal, "--mode", "hybrid"], mockMedicalEnv());
  const deepDive = readJson(runDir, "route-deep-dive.json");
  const deepDiveText = JSON.stringify(deepDive);

  for (const term of ["轮转", "科室", "带教", "考勤", "出科", "请假"]) {
    assert.ok(deepDiveText.includes(term), `route-deep-dive missing term: ${term}`);
  }
  assert.ok(deepDiveText.includes("审批") || deepDiveText.includes("调换"), "route-deep-dive missing approval or swap flow");

  for (const analysis of deepDive.routeAnalyses) {
    assert.ok(Array.isArray(analysis.domainModelImplications), "missing domainModelImplications");
    assert.ok(Array.isArray(analysis.technicalImplementationAxes), "missing technicalImplementationAxes");
    assert.ok(Array.isArray(analysis.riskRegister), "missing riskRegister");
    assert.ok(Array.isArray(analysis.hiddenComplexities), "missing hiddenComplexities");
    assert.ok(Array.isArray(analysis.productizationBar), "missing productizationBar");
    assert.ok(Array.isArray(analysis.validationBeforeCoding), "missing validationBeforeCoding");
    assert.ok(Array.isArray(analysis.integrationQuestions), "missing integrationQuestions");
    assert.ok(Array.isArray(analysis.operationalFailureModes), "missing operationalFailureModes");
    assert.ok(Array.isArray(analysis.testStrategyImplications), "missing testStrategyImplications");
  }
});

test("v1.5 RouteDeepDive risk register uses concrete business risks", () => {
  const runDir = runThinking(["--goal", goal, "--mode", "hybrid"], mockMedicalEnv());
  const deepDive = readJson(runDir, "route-deep-dive.json");
  const genericLabels = new Set(["权限滥用", "数据错误", "操作不可追溯"]);
  const allRisks = deepDive.routeAnalyses.flatMap((analysis) => analysis.riskRegister.map((risk) => risk.risk));
  const concreteMedicalRisks = allRisks.filter((risk) =>
    ["科室容量", "补轮转", "带教老师", "手工补录考勤", "主数据", "跨科室"].some((signal) => risk.includes(signal)),
  );

  assert.ok(concreteMedicalRisks.length >= 3, "expected at least three concrete medical rotation risks");
  assert.equal(allRisks.some((risk) => genericLabels.has(risk)), false, "risk register should not preserve generic risk labels as final risks");
});

test("v1.5 RouteDeepDive records ProductIntent consumption and external evidence insufficiency", () => {
  const runDir = runThinking(["--goal", goal, "--mode", "hybrid"], mockMedicalEnv());
  const deepDive = readJson(runDir, "route-deep-dive.json");
  const finalReport = readFileSync(path.join(runDir, "final-thinking-report.md"), "utf8");

  for (const analysis of deepDive.routeAnalyses) {
    assert.ok(analysis.productIntentSignalsConsumed.coreResources.includes("轮转计划"), "coreResources were not recorded as consumed");
    assert.ok(analysis.productIntentSignalsConsumed.coreWorkflows.includes("请假审批"), "coreWorkflows were not recorded as consumed");
    assert.ok(analysis.productIntentSignalsConsumed.riskSurfaces.includes("科室超额"), "riskSurfaces were not recorded as consumed");
    assert.equal(analysis.onlineResearch.sourceCount, 0);
    assert.equal(analysis.onlineResearch.relevance, "none");
    assert.equal(analysis.onlineResearch.shouldNotUseAsEvidence, true);
  }

  assert.ok(finalReport.includes("外部证据不足"), "final report must explicitly state external evidence is insufficient when sources are 0");
});