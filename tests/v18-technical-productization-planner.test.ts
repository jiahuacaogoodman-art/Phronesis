import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { guardJsonOutput } from "../src/llm/schema-guard.js";
import { technicalProductizationPlannerPrompt } from "../src/prompts/technical-productization-planner.prompt.js";

const goal = "做一个医院实习轮转管理系统";

function runThinking(env = {}) {
  const result = spawnSync("pnpm", ["think:run", "--goal", goal, "--mode", "hybrid"], {
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

test("v1.8 TechnicalProductizationPlanner writes all four artifacts", () => {
  const runDir = runThinking({
    THINK_LLM_PROVIDER: "mock",
    THINK_MOCK_LLM_BEHAVIOR: "low-critic-score",
    THINK_LLM_MODEL: "mock-json-model",
    THINK_ROUTE_REVISION_MAX_ROUNDS: "1",
  });
  for (const fileName of [
    "technical-route-plan.json",
    "productization-forecast.json",
    "problem-resolution-plan.json",
    "technical-route-scorecard.json",
  ]) {
    assert.ok(existsSync(path.join(runDir, fileName)), `${fileName} was not generated`);
  }
});

test("v1.8 technical route plan expands hospital rotation implementation details", () => {
  const runDir = runThinking({
    THINK_LLM_PROVIDER: "mock",
    THINK_MOCK_LLM_BEHAVIOR: "low-critic-score",
    THINK_LLM_MODEL: "mock-json-model",
    THINK_ROUTE_REVISION_MAX_ROUNDS: "1",
  });
  const planText = JSON.stringify(readJson(runDir, "technical-route-plan.json"));
  for (const signal of ["轮转计划", "科室容量", "带教分配", "请假调岗", "出科考核", "考勤记录", "审批流", "审计日志"]) {
    assert.ok(planText.includes(signal), `technical-route-plan missing ${signal}`);
  }
});

test("v1.8 productization forecast contains concrete future risks", () => {
  const runDir = runThinking({
    THINK_LLM_PROVIDER: "mock",
    THINK_MOCK_LLM_BEHAVIOR: "low-critic-score",
    THINK_LLM_MODEL: "mock-json-model",
    THINK_ROUTE_REVISION_MAX_ROUNDS: "1",
  });
  const forecast = readJson(runDir, "productization-forecast.json");
  assert.ok(forecast.items.length >= 8);
  const scenarios = forecast.items.map((item) => item.scenario).join(" ");
  for (const signal of ["科室容量变更", "补轮转", "带教老师临时调整", "手工补录考勤", "主数据不同步", "考核模板版本", "通知失败", "批量导入"]) {
    assert.ok(scenarios.includes(signal), `forecast missing ${signal}`);
  }
  const genericOnly = forecast.items.filter((item) => ["权限", "数据", "安全"].includes(item.scenario));
  assert.equal(genericOnly.length, 0);
});

test("v1.8 problem resolution plan converts risks into engineering solutions", () => {
  const runDir = runThinking({
    THINK_LLM_PROVIDER: "mock",
    THINK_MOCK_LLM_BEHAVIOR: "low-critic-score",
    THINK_LLM_MODEL: "mock-json-model",
    THINK_ROUTE_REVISION_MAX_ROUNDS: "1",
  });
  const plan = readJson(runDir, "problem-resolution-plan.json");
  assert.ok(plan.problems.length >= 8);
  for (const problem of plan.problems) {
    assert.ok(problem.recommendedSolution, "recommendedSolution is required");
    assert.ok(problem.dataModelChange.length > 0, "dataModelChange is required");
    assert.ok(problem.workflowChange.length > 0, "workflowChange is required");
    assert.ok(problem.validationRule.length > 0, "validationRule is required");
    assert.ok(problem.testCases.length > 0, "testCases is required");
  }
  const text = JSON.stringify(plan);
  for (const required of ["capacity versioning", "impact analysis", "dry-run conflict check", "affected students list", "rollback plan", "leave type", "qualification impact", "mentor assignment history", "manual override flag", "evidence attachment placeholder"]) {
    assert.ok(text.includes(required), `problem resolution missing ${required}`);
  }
});

test("v1.8 scorecard inherits blocked coding state", () => {
  const runDir = runThinking({
    THINK_LLM_PROVIDER: "mock",
    THINK_MOCK_LLM_BEHAVIOR: "low-critic-score",
    THINK_LLM_MODEL: "mock-json-model",
    THINK_ROUTE_REVISION_MAX_ROUNDS: "1",
  });
  const selected = readJson(runDir, "selected-route.json");
  const scorecard = readJson(runDir, "technical-route-scorecard.json");
  assert.equal(selected.canProceedToCoding, false);
  assert.equal(scorecard.canProceedToCoding, false);
  assert.ok(scorecard.routeScores.every((score) => score.codingReadiness !== "approved"));
});

test("v1.8 final report contains technical productization sections", () => {
  const runDir = runThinking({
    THINK_LLM_PROVIDER: "mock",
    THINK_MOCK_LLM_BEHAVIOR: "low-critic-score",
    THINK_LLM_MODEL: "mock-json-model",
    THINK_ROUTE_REVISION_MAX_ROUNDS: "1",
  });
  const report = readFileSync(path.join(runDir, "final-thinking-report.md"), "utf8");
  assert.ok(report.includes("## Technical Productization Plan"));
  assert.ok(report.includes("## Productization Forecast"));
  assert.ok(report.includes("## Problem Resolution Plan"));
  assert.ok(report.includes("Do not hand off to Coding Agent yet."));
});

test("v1.8 schema guard rejects approved scorecard when selected route is blocked", () => {
  const raw = JSON.stringify({
    technicalRoutePlan: {
      generatedAt: "x",
      planningStatus: "planning-only",
      routes: [{
        strategyId: "S1",
        routeTitle: "轮转路线",
        recommendedArchitecture: ["轮转计划"],
        backendModules: [],
        frontendBoundaries: [],
        databaseModel: {},
        stateMachines: [],
        permissionModel: {},
        conflictDetectionModel: {},
        approvalWorkflowModel: {},
        auditLogModel: {},
        importExportModel: {},
        integrationAdapters: [],
        deploymentTopology: [],
        observabilityPlan: [],
        backupAndRecoveryPlan: [],
        testingPlan: [],
        migrationPlan: [],
        codingReadiness: "approved",
        unresolvedTechnicalQuestions: [],
      }],
    },
    productizationForecast: {
      generatedAt: "x",
      items: [{ id: "PF-01", scenario: "科室容量变更导致轮转冲突", whyLikely: "x", affectedModules: ["轮转"], severity: "high", earlyWarningSignal: "x", designCountermeasure: "x", testCaseNeeded: "x", operationalPlaybookNeeded: "x" }],
    },
    problemResolutionPlan: {
      generatedAt: "x",
      problems: [{ problem: "科室容量变更", rootCause: "x", recommendedSolution: "x", dataModelChange: [], workflowChange: [], permissionChange: [], auditRequirement: [], validationRule: [], testCases: [], operationalFallback: "x", residualRisk: "x", blocksCodingUntilResolved: true }],
    },
    technicalRouteScorecard: {
      generatedAt: "x",
      canProceedToCoding: false,
      inheritedBlockingReasons: ["blocked"],
      routeScores: [{ strategyId: "S1", routeTitle: "轮转路线", architectureMaturity: 7, domainModelCompleteness: 7, workflowRobustness: 7, permissionSafety: 7, auditability: 7, integrationReadiness: 5, productizationRisk: 8, testingFeasibility: 7, operationalMaintainability: 7, codingReadiness: "approved", finalRecommendation: "x" }],
    },
  });
  const guarded = guardJsonOutput(raw, {
    agentName: "TechnicalProductizationPlanner",
    schemaName: technicalProductizationPlannerPrompt.outputSchemaName,
    expectedShape: technicalProductizationPlannerPrompt.expectedShape,
    qualityChecklist: technicalProductizationPlannerPrompt.qualityChecklist,
    input: {
      selectedRouteSummary: { canProceedToCoding: false },
      productIntentEssential: { domainId: "medical-intern-rotation-management", coreResources: ["轮转计划"], coreWorkflows: ["审批"] },
    },
  });
  assert.equal(guarded.ok, false);
  assert.ok(guarded.qualityChecklistFailures.some((failure) => failure.includes("cannot be codingReadiness approved")));
});

test("v1.8 still does not add UI surfaces", () => {
  for (const forbiddenPath of ["web", "app", "pages", "components", "src/App.tsx", "vite.config.ts"]) {
    assert.equal(existsSync(path.resolve(process.cwd(), forbiddenPath)), false, `${forbiddenPath} should not exist`);
  }
});