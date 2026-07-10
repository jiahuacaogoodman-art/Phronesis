import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ingestCodingResult } from "../src/agents/coding-result-ingestor.js";

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function baseHandoff(overrides = {}) {
  return {
    runId: "handoff-run-1",
    goal: "做一个医院实习轮转管理系统",
    handoffStatus: "approved",
    canProceedToCoding: true,
    selectedRouteId: "S1",
    selectedRouteTitle: "院内运营优先路线",
    routeStatus: "approved",
    sourceArtifacts: [
      "technical-route-plan.json",
      "problem-resolution-plan.json",
      "technical-solution-integration-plan.json",
      "execution-task-graph.json",
    ],
    approvedCodingTasks: ["task-domain-model"],
    conditionalCodingTasks: [],
    blockedCodingTasks: [],
    globalConstraints: ["Use the handoff as source of truth."],
    forbiddenActions: ["Do not modify src/ui/", "Do not modify package.json"],
    requiredBeforeCoding: [],
    implementationOrder: ["task-domain-model"],
    acceptanceTestStrategy: ["pnpm test -- domain"],
    rollbackStrategy: ["task-level revert"],
    codingAgentInstructions: ["Return coding-result.json."],
    ...overrides,
  };
}

function baseTaskPackage(overrides = {}) {
  return {
    taskId: "task-domain-model",
    title: "实现轮转领域模型",
    planningSource: ["execution-task-graph.json"],
    goal: "做一个医院实习轮转管理系统",
    implementationIntent: "Implement rotation domain model only.",
    inputArtifacts: ["coding-handoff.json"],
    expectedOutputs: ["domain model", "validation tests"],
    allowedChangeAreas: ["src/domain/"],
    forbiddenChangeAreas: ["src/ui/", "package.json"],
    dependencies: [],
    dataModelRequirements: ["轮转计划", "科室容量"],
    workflowRequirements: ["轮转排班"],
    permissionRequirements: ["科教管理员"],
    auditRequirements: ["审计事件"],
    validationRules: ["capacity cannot be exceeded"],
    testRequirements: ["pnpm test -- domain"],
    acceptanceCriteria: ["Rotation plan has capacity version reference", "Conflict validation is testable"],
    riskNotes: ["科室容量变更导致既有轮转计划冲突"],
    stopConditions: [],
    ...overrides,
  };
}

function baseCodingResult(overrides = {}) {
  return {
    handoffRunId: "handoff-run-1",
    codingAgentName: "mock-coding-agent",
    codingTaskId: "task-domain-model",
    status: "completed",
    filesChanged: ["src/domain/rotation.ts"],
    filesCreated: [],
    filesDeleted: [],
    commandsRun: [{ command: "pnpm test -- domain", exitCode: 0 }],
    testsRun: ["pnpm test -- domain"],
    testResults: [{ name: "domain", command: "pnpm test -- domain", status: "passed", passed: true, exitCode: 0 }],
    acceptanceCriteriaResults: [
      { criterion: "Rotation plan has capacity version reference", status: "passed", passed: true },
      { criterion: "Conflict validation is testable", status: "passed", passed: true },
    ],
    forbiddenActionViolations: [],
    allowedChangeAreaViolations: [],
    unresolvedQuestions: [],
    implementationSummary: "Implemented rotation domain model.",
    failureSummary: "",
    needsPlannerRevision: false,
    ...overrides,
  };
}

function setupRun({ handoff = baseHandoff(), taskPackage = baseTaskPackage(), codingResult = baseCodingResult() } = {}) {
  const runDir = mkdtempSync(path.join(os.tmpdir(), "coding-feedback-"));
  const packageDir = path.join(runDir, "coding-task-packages");
  mkdirSync(packageDir, { recursive: true });
  const handoffPath = path.join(runDir, "coding-handoff.json");
  const resultPath = path.join(runDir, "input-coding-result.json");
  writeJson(handoffPath, handoff);
  if (taskPackage) {
    writeJson(path.join(packageDir, `${taskPackage.taskId}.json`), taskPackage);
  }
  writeJson(resultPath, codingResult);
  return { runDir, handoffPath, resultPath };
}

test("v2.1 blocked handoff receiving implementation result marks forbidden execution", async () => {
  const handoff = baseHandoff({
    handoffStatus: "blocked",
    canProceedToCoding: false,
    approvedCodingTasks: [],
    conditionalCodingTasks: [],
    blockedCodingTasks: ["clarify-user-scale"],
  });
  const { runDir, handoffPath, resultPath } = setupRun({ handoff, taskPackage: undefined });
  await ingestCodingResult({ handoffPath, resultPath });
  const feedback = readJson(path.join(runDir, "coding-feedback-report.json"));
  const failure = readJson(path.join(runDir, "coding-failure-analysis.json"));
  assert.equal(feedback.forbiddenExecutionDetected, true);
  assert.equal(feedback.valid, false);
  assert.equal(failure.recommendedNextPlannerAction, "resolve blockers before coding");
});

test("v2.1 task id outside approved or conditional tasks is invalid", async () => {
  const codingResult = baseCodingResult({ codingTaskId: "unknown-task" });
  const { runDir, handoffPath, resultPath } = setupRun({ codingResult });
  await ingestCodingResult({ handoffPath, resultPath });
  const feedback = readJson(path.join(runDir, "coding-feedback-report.json"));
  assert.equal(feedback.validTask, false);
  assert.equal(feedback.valid, false);
});

test("v2.1 changed files outside allowedChangeAreas are reported", async () => {
  const codingResult = baseCodingResult({ filesChanged: ["src/api/rotation-controller.ts"] });
  const { runDir, handoffPath, resultPath } = setupRun({ codingResult });
  await ingestCodingResult({ handoffPath, resultPath });
  const feedback = readJson(path.join(runDir, "coding-feedback-report.json"));
  assert.ok(feedback.allowedChangeAreaViolations.some((item) => item.includes("src/api/rotation-controller.ts")));
});

test("v2.1 changed files hitting forbiddenChangeAreas are reported", async () => {
  const codingResult = baseCodingResult({ filesChanged: ["src/ui/rotation-page.tsx"] });
  const { runDir, handoffPath, resultPath } = setupRun({ codingResult });
  await ingestCodingResult({ handoffPath, resultPath });
  const feedback = readJson(path.join(runDir, "coding-feedback-report.json"));
  assert.ok(feedback.forbiddenActionViolations.some((item) => item.includes("src/ui/rotation-page.tsx")));
});

test("v2.1 missing required tests are reported", async () => {
  const codingResult = baseCodingResult({ testsRun: [], testResults: [], commandsRun: [] });
  const { runDir, handoffPath, resultPath } = setupRun({ codingResult });
  await ingestCodingResult({ handoffPath, resultPath });
  const feedback = readJson(path.join(runDir, "coding-feedback-report.json"));
  assert.ok(feedback.missingRequiredTests.includes("pnpm test -- domain"));
});

test("v2.1 incomplete acceptance criteria are reported", async () => {
  const codingResult = baseCodingResult({
    acceptanceCriteriaResults: [{ criterion: "Rotation plan has capacity version reference", status: "passed", passed: true }],
  });
  const { runDir, handoffPath, resultPath } = setupRun({ codingResult });
  await ingestCodingResult({ handoffPath, resultPath });
  const feedback = readJson(path.join(runDir, "coding-feedback-report.json"));
  assert.ok(feedback.incompleteAcceptanceCheck.includes("Conflict validation is testable"));
});

test("v2.1 failed tests generate coding-failure-analysis.json", async () => {
  const codingResult = baseCodingResult({
    status: "failed",
    testResults: [{ name: "domain", command: "pnpm test -- domain", status: "failed", passed: false, exitCode: 1 }],
    failureSummary: "Domain validation test failed.",
  });
  const { runDir, handoffPath, resultPath } = setupRun({ codingResult });
  await ingestCodingResult({ handoffPath, resultPath });
  const failure = readJson(path.join(runDir, "coding-failure-analysis.json"));
  assert.equal(failure.failureType, "test-failure");
  assert.ok(failure.failedTests.includes("domain"));
});

test("v2.1 planner revision request recommends StrategyRevision or TechnicalProductizationPlanner", async () => {
  const codingResult = baseCodingResult({
    needsPlannerRevision: true,
    unresolvedQuestions: ["科室容量版本策略与现有计划冲突，需要 planner 决策。"],
  });
  const { runDir, handoffPath, resultPath } = setupRun({ codingResult });
  await ingestCodingResult({ handoffPath, resultPath });
  const feedback = readJson(path.join(runDir, "coding-feedback-report.json"));
  assert.equal(feedback.needsPlannerRevision, true);
  assert.ok(feedback.recommendedNextPlannerAction.includes("StrategyRevisionAgent") || feedback.recommendedNextPlannerAction.includes("TechnicalProductizationPlanner"));
});

test("v2.1 think:ingest-coding-result CLI analyzes result without executing coding", () => {
  const setup = setupRun();
  const spawnOptions = {};
  spawnOptions.cwd = process.cwd();
  spawnOptions.encoding = "utf8";
  const result = spawnSync("pnpm", ["think:ingest-coding-result", "--handoff", setup.handoffPath, "--result", setup.resultPath], spawnOptions);
  assert.equal(result.status, 0, `think:ingest-coding-result failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  assert.ok(result.stdout.includes("Feedback valid: true"));
  assert.ok(existsSync(path.join(setup.runDir, "coding-feedback-report.json")));
  assert.ok(existsSync(path.join(setup.runDir, "coding-result.json")));
  assert.ok(existsSync(path.join(setup.runDir, "coding-diff-summary.md")));
  assert.ok(existsSync(path.join(setup.runDir, "coding-test-report.json")));
  assert.ok(existsSync(path.join(setup.runDir, "coding-failure-analysis.json")));
});