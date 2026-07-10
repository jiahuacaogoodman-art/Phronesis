import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { planTechnicalSolutionResearch } from "../src/lib/technical-search-query-planner.js";
import { searchTechnicalSolutions } from "../src/agents/problem-solution-research-agent.js";

const goal = "做一个医院实习轮转管理系统";

function runThinking(env = {}, args = []) {
  const result = spawnSync("pnpm", ["think:run", "--goal", goal, "--mode", "hybrid", ...args], {
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

function mockEnv() {
  return {
    THINK_LLM_PROVIDER: "mock",
    THINK_MOCK_LLM_BEHAVIOR: "low-critic-score",
    THINK_LLM_MODEL: "mock-json-model",
    THINK_ROUTE_REVISION_MAX_ROUNDS: "1",
    THINK_TECHNICAL_SEARCH_PROVIDER: "mock",
  };
}

test("v1.9 research plan is generated with problem-specific technical queries", () => {
  const runDir = runThinking(mockEnv());
  const plan = readJson(runDir, "technical-solution-research-plan.json");
  assert.ok(plan.problems.length >= 8);
  const allQueries = plan.problems.flatMap((problem) => problem.searchQueries).join(" | ");
  assert.ok(allQueries.includes("PostgreSQL exclusion constraint"));
  assert.ok(allQueries.includes("OR-Tools CP-SAT"));
  assert.ok(allQueries.includes("scheduling conflict detection"));
  assert.ok(allQueries.includes("RBAC ABAC"));
  assert.ok(allQueries.includes("PostgreSQL Row Level Security"));
  assert.ok(allQueries.includes("transactional outbox"));
  assert.ok(allQueries.includes("dead letter queue"));
});

test("v1.9 mock search provider accepts official technical sources at quality B or better", async () => {
  const researchPlan = planTechnicalSolutionResearch({
    goal,
    problemResolutionPlan: {
      problems: [
        { problem: "科室容量变更导致既有轮转计划冲突" },
        { problem: "多院区/多科室权限边界错误导致越权查看" },
      ],
    },
  });
  const results = await searchTechnicalSolutions(researchPlan, { online: true, provider: "mock" });
  assert.equal(results.status, "completed");
  const accepted = results.resultsByProblem.flatMap((problem) => problem.queryResults).flatMap((query) => query.results).filter((result) => result.accepted);
  assert.ok(accepted.length > 0);
  assert.ok(accepted.some((source) => source.url.includes("postgresql.org") && ["A", "B"].includes(source.sourceQuality)));
  assert.ok(accepted.every((source) => source.sourceQuality !== "Reject"));
});

test("v1.9 solution candidates include recommended and rejected technical options", () => {
  const runDir = runThinking(mockEnv());
  const candidates = readJson(runDir, "technical-solution-candidates.json");
  assert.ok(candidates.problems.length >= 8);
  for (const problem of candidates.problems) {
    assert.ok(problem.candidateSolutions.length > 0, "candidateSolutions required");
    assert.ok(problem.recommendedSolution.name, "recommendedSolution required");
    assert.ok(problem.implementationImpact.length > 0, "implementationImpact required");
    assert.ok(problem.candidateSolutions.length >= 2 || problem.rejectedSolutions.length > 0, "need multiple options or rejected reason");
  }
});

test("v1.9 capacity conflict recommends PostgreSQL exclusion plus dry-run and keeps OR-Tools as later option", () => {
  const runDir = runThinking(mockEnv());
  const candidates = readJson(runDir, "technical-solution-candidates.json");
  const capacity = candidates.problems.find((problem) => problem.problemStatement.includes("科室容量"));
  assert.ok(capacity, "capacity problem missing");
  const text = JSON.stringify(capacity);
  assert.ok(text.includes("PostgreSQL"));
  assert.ok(text.includes("exclusion"));
  assert.ok(text.includes("dry-run"));
  assert.ok(text.includes("OR-Tools"));
  assert.ok(text.includes("later") || text.includes("后期"));
});

test("v1.9 permission boundary recommends RBAC plus ABAC data scope and optional PostgreSQL RLS", () => {
  const runDir = runThinking(mockEnv());
  const candidates = readJson(runDir, "technical-solution-candidates.json");
  const permission = candidates.problems.find((problem) => problem.problemStatement.includes("权限") || problem.problemStatement.includes("越权"));
  assert.ok(permission, "permission problem missing");
  const text = JSON.stringify(permission);
  assert.ok(text.includes("RBAC"));
  assert.ok(text.includes("ABAC"));
  assert.ok(text.includes("Row Level Security"));
});

test("v1.9 bulk import recommends staging table dry-run validation and row-level error report", () => {
  const runDir = runThinking(mockEnv());
  const candidates = readJson(runDir, "technical-solution-candidates.json");
  const bulkImport = candidates.problems.find((problem) => problem.problemStatement.includes("批量导入") || problem.problemStatement.includes("脏数据"));
  assert.ok(bulkImport, "bulk import problem missing");
  const text = JSON.stringify(bulkImport);
  assert.ok(text.includes("Staging") || text.includes("staging"));
  assert.ok(text.includes("dry-run"));
  assert.ok(text.includes("row-level error report"));
});

test("v1.9 decision matrix and integration plan map solutions to route implementation", () => {
  const runDir = runThinking(mockEnv());
  const matrix = readJson(runDir, "technical-solution-decision-matrix.json");
  const integration = readJson(runDir, "technical-solution-integration-plan.json");
  assert.ok(matrix.decisions.length >= 8);
  assert.ok(integration.items.length >= 8);
  const text = JSON.stringify(integration);
  for (const signal of ["dataModelChanges", "serviceLayerChanges", "permissionChanges", "auditChanges", "testingChanges"]) {
    assert.ok(text.includes(signal), `integration plan missing ${signal}`);
  }
});

test("v1.9 final report displays problem-solution technical research", () => {
  const runDir = runThinking(mockEnv());
  const report = readFileSync(path.join(runDir, "final-thinking-report.md"), "utf8");
  assert.ok(report.includes("## Problem-Solution Technical Research"));
  assert.ok(report.includes("Recommended solution candidates"));
  assert.ok(report.includes("Integration impacts"));
});

test("v1.9 live provider not configured does not fabricate sourceRefs", () => {
  const runDir = runThinking({
    THINK_LLM_PROVIDER: "mock",
    THINK_MOCK_LLM_BEHAVIOR: "low-critic-score",
    THINK_LLM_MODEL: "mock-json-model",
    THINK_ROUTE_REVISION_MAX_ROUNDS: "1",
    THINK_TECHNICAL_SEARCH_PROVIDER: "",
    THINK_TECHNICAL_SEARCH_REQUESTED: "1",
  });
  const searchResults = readJson(runDir, "technical-solution-search-results.json");
  const candidates = readJson(runDir, "technical-solution-candidates.json");
  const report = readFileSync(path.join(runDir, "final-thinking-report.md"), "utf8");
  assert.equal(searchResults.status, "not_configured");
  for (const problem of candidates.problems) {
    assert.equal(problem.sourceRefs.length, 0);
    assert.equal(problem.recommendedSolution.sourceRefs.length, 0);
    assert.equal(problem.recommendedSolution.sourceEvidenceStatus, "ruleFallback");
  }
  assert.ok(report.includes("Technical solution search was requested but no live search provider was configured."));
});

test("v1.9 all technical solution research artifacts are generated", () => {
  const runDir = runThinking(mockEnv());
  for (const fileName of [
    "technical-solution-research-plan.json",
    "technical-solution-search-results.json",
    "technical-solution-candidates.json",
    "technical-solution-decision-matrix.json",
    "technical-solution-integration-plan.json",
  ]) {
    assert.ok(existsSync(path.join(runDir, fileName)), `${fileName} should exist`);
  }
});

test("v1.9 still does not add UI surfaces", () => {
  for (const forbiddenPath of ["web", "app", "pages", "components", "src/App.tsx", "vite.config.ts"]) {
    assert.equal(existsSync(path.resolve(process.cwd(), forbiddenPath)), false, `${forbiddenPath} should not exist`);
  }
});