import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { writeCodingHandoffArtifacts } from "../src/agents/coding-handoff-builder.js";

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

function blockedRunDir() {
  return runThinking({
    THINK_LLM_PROVIDER: "mock",
    THINK_MOCK_LLM_BEHAVIOR: "low-critic-score",
    THINK_LLM_MODEL: "mock-json-model",
    THINK_ROUTE_REVISION_MAX_ROUNDS: "1",
  });
}

function approvedArtifacts(status = "approved") {
  return {
    goal: { runId: "test-run", rawGoal: goal },
    reconstructedIntent: { normalizedGoal: goal },
    productIntent: {
      primaryActors: ["科教管理员"],
      coreResources: ["轮转计划", "科室容量"],
      coreWorkflows: ["轮转排班", "审批"],
      riskSurfaces: ["容量冲突"],
    },
    selectedRoute: {
      selectedStrategyId: "S1",
      selectedTitle: "单体成品路线",
      selectionStatus: status,
      canProceedToCoding: true,
      requiredClarificationsBeforeCoding: [],
      blockingReasons: [],
    },
    executionTaskGraph: {
      canProceedToCoding: true,
      globalBlockingReasons: [],
      requiredClarificationsBeforeCoding: [],
      suggestedExecutionOrder: ["task-domain-model"],
      tasks: [{
        id: "task-domain-model",
        title: "实现轮转领域模型",
        dependsOn: [],
        ownerAgent: "CodingAgent",
        purpose: "Create domain model and validation skeleton for rotation planning.",
        deliverables: ["domain model", "validation tests"],
        acceptanceCriteria: ["Rotation plan has capacity version reference", "Conflict validation is testable"],
        riskLevel: "medium",
        verificationHint: "Run model and validation tests.",
        derivedFromCapabilities: ["轮转计划"],
        derivedFromRisks: ["容量冲突"],
        requiredEvidenceBeforeExecution: status === "conditional" ? ["Confirm capacity version policy"] : [],
        shouldBlockCodingUntilResolved: false,
      }],
    },
    technicalRoutePlan: {
      routes: [{
        strategyId: "S1",
        routeTitle: "单体成品路线",
        databaseModel: {
          entities: [{ name: "轮转计划", fields: ["id", "capacityVersionId"], relationships: ["科室容量"] }],
          constraints: ["容量冲突检测"],
        },
        stateMachines: [{ name: "轮转生命周期", states: ["草稿", "已发布"], transitions: [], guards: [] }],
        approvalWorkflowModel: { workflows: ["审批"], states: [], escalationRules: [] },
        conflictDetectionModel: { rules: ["dry-run conflict check"] },
        permissionModel: { resourceActions: ["轮转计划:update"], boundaries: ["科教管理员"] },
        auditLogModel: { events: ["审计日志"], actorContext: ["operator"], retention: ["archive"] },
        testingPlan: ["容量冲突测试"],
        backupAndRecoveryPlan: ["rollback batch"],
        codingReadiness: status === "conditional" ? "conditional" : "approved",
        unresolvedTechnicalQuestions: [],
      }],
    },
    productizationForecast: { items: [] },
    problemResolutionPlan: { problems: [] },
    technicalRouteScorecard: {
      canProceedToCoding: true,
      inheritedBlockingReasons: [],
      routeScores: [{ strategyId: "S1", codingReadiness: status === "conditional" ? "conditional" : "approved" }],
    },
    technicalSolutionCandidates: { problems: [] },
    technicalSolutionDecisionMatrix: { decisions: [] },
    technicalSolutionIntegrationPlan: {
      items: [{
        problemId: "P1",
        problemStatement: "科室容量变更导致既有轮转计划冲突",
        selectedSolution: "PostgreSQL exclusion + dry-run",
        dataModelChanges: ["capacity version table"],
        serviceLayerChanges: ["dry-run checker"],
        apiContractChanges: ["POST /dry-run"],
        workflowChanges: ["admin confirmation"],
        permissionChanges: ["admin only"],
        auditChanges: ["audit capacity change"],
        testingChanges: ["capacity conflict test"],
        migrationChanges: ["backfill capacity version"],
        operationRunbookChanges: ["capacity change runbook"],
        impactsCodingReadiness: "ready",
        stillBlocksCoding: false,
      }],
    },
    finalThinkingReport: { markdown: "# Final Thinking Report" },
  };
}

test("v2.0 blocked run writes blocked handoff and no approved tasks", () => {
  const runDir = blockedRunDir();
  const handoff = readJson(runDir, "coding-handoff.json");
  assert.equal(handoff.handoffStatus, "blocked");
  assert.equal(handoff.canProceedToCoding, false);
  assert.deepEqual(handoff.approvedCodingTasks, []);
});

test("v2.0 blocked run writes prompt and pre-coding resolution pack", () => {
  const runDir = blockedRunDir();
  const prompt = readFileSync(path.join(runDir, "coding-agent-prompt.md"), "utf8");
  assert.ok(prompt.includes("Do not implement code yet."));
  assert.ok(prompt.includes("Do not create files."));
  assert.ok(prompt.includes("Do not modify repository."));
  assert.ok(existsSync(path.join(runDir, "pre-coding-resolution-pack.json")));
  const pack = readJson(runDir, "pre-coding-resolution-pack.json");
  assert.ok(pack.blockingReasons.length > 0);
  assert.ok(pack.artifactsToRegenerateAfterResolution.includes("coding-handoff.json"));
});

test("v2.0 blocked coding-task-packages contain only pre-coding markdown tasks", () => {
  const runDir = blockedRunDir();
  const packageDir = path.join(runDir, "coding-task-packages");
  const files = readdirSync(packageDir);
  assert.ok(files.length > 0);
  assert.ok(files.every((file) => file.endsWith(".md")));
  const content = files.map((file) => readFileSync(path.join(packageDir, file), "utf8")).join("\n");
  assert.ok(content.includes("This is a pre-coding clarification task."));
  assert.ok(!content.includes("implementation task"));
});

test("v2.0 approved handoff can generate approved coding task packages", async () => {
  const runDir = mkdtempSync(path.join(os.tmpdir(), "coding-handoff-approved-"));
  const result = await writeCodingHandoffArtifacts(runDir, approvedArtifacts("approved"), { target: "codex" });
  assert.equal(result.handoff.handoffStatus, "approved");
  assert.ok(result.handoff.approvedCodingTasks.includes("task-domain-model"));
  const files = readdirSync(path.join(runDir, "coding-task-packages"));
  assert.ok(files.some((file) => file.endsWith(".json")));
  const task = JSON.parse(readFileSync(path.join(runDir, "coding-task-packages", files.find((file) => file.endsWith(".json"))), "utf8"));
  for (const field of ["expectedOutputs", "allowedChangeAreas", "forbiddenChangeAreas", "testRequirements", "acceptanceCriteria"]) {
    assert.ok(Array.isArray(task[field]));
    assert.ok(task[field].length > 0, `${field} should not be empty`);
  }
});

test("v2.0 conditional task package inherits stopConditions", async () => {
  const runDir = mkdtempSync(path.join(os.tmpdir(), "coding-handoff-conditional-"));
  const result = await writeCodingHandoffArtifacts(runDir, approvedArtifacts("conditional"), { target: "codex" });
  assert.equal(result.handoff.handoffStatus, "conditional");
  assert.ok(result.handoff.conditionalCodingTasks.includes("task-domain-model"));
  const files = readdirSync(path.join(runDir, "coding-task-packages"));
  const task = JSON.parse(readFileSync(path.join(runDir, "coding-task-packages", files.find((file) => file.endsWith(".json"))), "utf8"));
  assert.ok(task.stopConditions.includes("Confirm capacity version policy"));
  assert.ok(task.stopConditions.some((item) => item.includes("out of scope") || item.includes("scope")));
});

test("v2.0 sourceArtifacts include planning and technical solution artifacts", () => {
  const runDir = blockedRunDir();
  const handoff = readJson(runDir, "coding-handoff.json");
  for (const artifact of ["technical-route-plan.json", "problem-resolution-plan.json", "technical-solution-integration-plan.json", "execution-task-graph.json"]) {
    assert.ok(handoff.sourceArtifacts.includes(artifact), `missing ${artifact}`);
  }
});

test("v2.0 think:handoff CLI regenerates handoff without executing coding", () => {
  const runDir = blockedRunDir();
  const spawnOptions = {};
  spawnOptions.cwd = process.cwd();
  spawnOptions.encoding = "utf8";
  const result = spawnSync("pnpm", ["think:handoff", "--run", runDir, "--target", "codex"], spawnOptions);
  assert.equal(result.status, 0, `think:handoff failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  assert.ok(result.stdout.includes("Handoff status: blocked"));
  assert.ok(result.stdout.includes("Coding execution is not allowed"));
  assert.ok(existsSync(path.join(runDir, "coding-handoff.json")));
});

test("v2.0 still does not add UI surfaces", () => {
  for (const forbiddenPath of ["web", "app", "pages", "components", "src/App.tsx", "vite.config.ts"]) {
    assert.equal(existsSync(path.resolve(process.cwd(), forbiddenPath)), false, `${forbiddenPath} should not exist`);
  }
});