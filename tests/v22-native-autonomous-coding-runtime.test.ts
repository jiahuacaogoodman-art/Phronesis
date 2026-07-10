import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { analyzeRepo } from "../src/coding/repo-analyzer.js";
import { indexCodebase } from "../src/coding/codebase-indexer.js";
import { buildImplementationBatchPlan } from "../src/coding/implementation-batch-planner.js";
import { planNativePatch } from "../src/coding/native-patch-planner.js";
import { applyNativePatchPlan } from "../src/coding/patch-applier.js";
import { runTestCommands } from "../src/coding/test-command-runner.js";
import { analyzeBuildFailure } from "../src/coding/build-failure-analyzer.js";
import { runRepairLoop } from "../src/coding/repair-loop-controller.js";
import { runNativeAutocode } from "../src/coding/native-coding-runtime.js";
import { ingestCodingResult } from "../src/agents/coding-result-ingestor.js";

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function nodeCommand(source) {
  return `node -e ${JSON.stringify(source)}`;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function makeRepo() {
  const repo = mkdtempSync(path.join(os.tmpdir(), "native-target-"));
  const mkdirOptions = {};
  mkdirOptions.recursive = true;
  mkdirSync(path.join(repo, "src/domain"), mkdirOptions);
  mkdirSync(path.join(repo, "tests"), mkdirOptions);
  mkdirSync(path.join(repo, "node_modules/pkg"), mkdirOptions);
  mkdirSync(path.join(repo, "dist"), mkdirOptions);
  mkdirSync(path.join(repo, ".git"), mkdirOptions);
  const packageJson = {};
  packageJson.scripts = {};
  packageJson.scripts.test = nodeCommand("process.exit(0)");
  packageJson.scripts.build = "tsc -p tsconfig.json";
  packageJson.scripts.lint = "eslint src";
  packageJson.scripts.typecheck = "tsc --noEmit";
  packageJson.dependencies = {};
  packageJson.dependencies.react = "latest";
  packageJson.dependencies.vite = "latest";
  packageJson.devDependencies = {};
  packageJson.devDependencies.typescript = "latest";
  writeJson(path.join(repo, "package.json"), packageJson);
  const lockText = "lockfileVersion" + ": '9.0'\n";
  writeFileSync(path.join(repo, "pnpm-lock.yaml"), lockText, "utf8");
  const tsconfig = {};
  tsconfig.compilerOptions = {};
  tsconfig.compilerOptions.strict = true;
  writeJson(path.join(repo, "tsconfig.json"), tsconfig);
  writeFileSync(path.join(repo, "src/domain/rotation.ts"), "export const existing = true;\n", "utf8");
  writeFileSync(path.join(repo, "tests/rotation.test.ts"), "import '../src/domain/rotation';\n", "utf8");
  writeFileSync(path.join(repo, "node_modules/pkg/ignored.ts"), "ignored\n", "utf8");
  writeFileSync(path.join(repo, "dist/ignored.js"), "ignored\n", "utf8");
  return repo;
}

function handoff(status = "approved") {
  const blocked = status === "blocked";
  return {
    runId: "native-run-1",
    goal: "做一个医院实习轮转管理系统",
    handoffStatus: blocked ? "blocked" : status,
    canProceedToCoding: !blocked,
    selectedRouteId: "S1",
    selectedRouteTitle: "院内运营优先路线",
    routeStatus: blocked ? "blocked" : "approved",
    sourceArtifacts: ["technical-route-plan.json", "problem-resolution-plan.json", "technical-solution-integration-plan.json", "execution-task-graph.json"],
    approvedCodingTasks: blocked ? [] : ["task-domain-model", "task-service"],
    conditionalCodingTasks: [],
    blockedCodingTasks: blocked ? ["clarify-workflow-policy"] : [],
    globalConstraints: [],
    forbiddenActions: ["Do not modify src/ui/", "Do not modify package.json"],
    requiredBeforeCoding: blocked ? ["Clarify workflow policy"] : [],
    implementationOrder: blocked ? [] : ["task-domain-model", "task-service"],
    acceptanceTestStrategy: [nodeCommand("process.exit(0)")],
    rollbackStrategy: ["task-level revert"],
    codingAgentInstructions: blocked ? ["Do not implement code yet."] : ["Return coding-result.json."],
  };
}

function taskPackage(taskId, title) {
  return {
    taskId,
    title,
    planningSource: ["execution-task-graph.json"],
    goal: "做一个医院实习轮转管理系统",
    implementationIntent: title,
    inputArtifacts: ["coding-handoff.json"],
    expectedOutputs: [`${title} output`],
    allowedChangeAreas: ["src/domain/"],
    forbiddenChangeAreas: ["src/ui/", "package.json"],
    dependencies: taskId === "task-service" ? ["task-domain-model"] : [],
    dataModelRequirements: ["轮转计划"],
    workflowRequirements: ["轮转排班"],
    permissionRequirements: ["科教管理员"],
    auditRequirements: ["审计日志"],
    validationRules: ["capacity validation"],
    testRequirements: [nodeCommand("process.exit(0)")],
    acceptanceCriteria: [`${title} acceptance`],
    riskNotes: ["科室容量变更导致既有轮转计划冲突"],
    stopConditions: [],
  };
}

function makeRun(status = "approved") {
  const runDir = mkdtempSync(path.join(os.tmpdir(), "native-run-"));
  const packageDir = path.join(runDir, "coding-task-packages");
  const mkdirOptions = {};
  mkdirOptions.recursive = true;
  mkdirSync(packageDir, mkdirOptions);
  const goal = {};
  goal.runId = "native-run-1";
  goal.rawGoal = "做一个医院实习轮转管理系统";
  writeJson(path.join(runDir, "goal.json"), goal);
  writeJson(path.join(runDir, "coding-handoff.json"), handoff(status));
  const selectedRoute = {};
  selectedRoute.selectedStrategyId = "S1";
  selectedRoute.canProceedToCoding = status !== "blocked";
  selectedRoute.blockingReasons = status === "blocked" ? ["critic blocking issue"] : [];
  writeJson(path.join(runDir, "selected-route.json"), selectedRoute);
  const executionTaskGraph = {};
  executionTaskGraph.canProceedToCoding = status !== "blocked";
  executionTaskGraph.globalBlockingReasons = status === "blocked" ? ["Do not hand off to Coding Agent yet."] : [];
  executionTaskGraph.tasks = [];
  writeJson(path.join(runDir, "execution-task-graph.json"), executionTaskGraph);
  const technicalRoutePlan = {};
  technicalRoutePlan.routes = [];
  writeJson(path.join(runDir, "technical-route-plan.json"), technicalRoutePlan);
  const integrationPlan = {};
  integrationPlan.items = [];
  writeJson(path.join(runDir, "technical-solution-integration-plan.json"), integrationPlan);
  if (status !== "blocked") {
    for (const pkg of [taskPackage("task-domain-model", "domain model"), taskPackage("task-service", "service layer")]) {
      writeJson(path.join(packageDir, `${pkg.taskId}.json`), pkg);
    }
  }
  return runDir;
}

function withMockProvider(fn) {
  const oldProvider = process.env.THINK_LLM_PROVIDER;
  const oldModel = process.env.THINK_LLM_MODEL;
  process.env.THINK_LLM_PROVIDER = "mock";
  process.env.THINK_LLM_MODEL = "mock-json-model";
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (oldProvider == null) delete process.env.THINK_LLM_PROVIDER;
      else process.env.THINK_LLM_PROVIDER = oldProvider;
      if (oldModel == null) delete process.env.THINK_LLM_MODEL;
      else process.env.THINK_LLM_MODEL = oldModel;
    });
}

test("v2.2 blocked run rejects execute but still writes repo analysis and index", async () => {
  const repo = makeRepo();
  const runDir = makeRun("blocked");
  const result = await runNativeAutocode({ runDir, targetRepo: repo, mode: "execute" });
  assert.equal(result.autonomousCodingResult.status, "blocked");
  assert.ok(existsSync(path.join(runDir, "repo-analysis.json")));
  assert.ok(existsSync(path.join(runDir, "codebase-index.json")));
  assert.equal(existsSync(path.join(runDir, "native-patch-plan.json")), false);
  assert.equal(existsSync(path.join(runDir, "applied-patches.json")), false);
});

test("v2.2 RepoAnalyzer detects TypeScript package manager test command and source root", async () => {
  const repo = makeRepo();
  const analysis = await analyzeRepo(repo);
  assert.ok(analysis.detectedLanguages.includes("TypeScript"));
  assert.ok(analysis.packageManagers.includes("pnpm"));
  assert.ok(analysis.testCommands.includes("pnpm test"));
  assert.ok(analysis.sourceRoots.includes("src"));
});

test("v2.2 CodebaseIndexer excludes node_modules dist and git", () => {
  const repo = makeRepo();
  const indexed = indexCodebase(repo, { maxFiles: 50, maxChars: 20_000 }).codebaseIndex;
  const text = indexed.fileTree.join("\n");
  assert.ok(!text.includes("node_modules"));
  assert.ok(!text.includes("dist/ignored"));
  assert.ok(!text.includes(".git"));
  assert.ok(indexed.indexedFiles.some((file) => file.path === "src/domain/rotation.ts"));
});

test("v2.2 ImplementationBatchPlanner builds batches for approved task graph", () => {
  const repo = makeRepo();
  const analysis = analyzeRepo(repo);
  const codebaseIndex = indexCodebase(repo).codebaseIndex;
  const packages = [taskPackage("task-domain-model", "domain model"), taskPackage("task-service", "service layer")];
  const plan = buildImplementationBatchPlan({ handoff: handoff("approved"), taskPackages: packages, repoAnalysis: analysis, codebaseIndex });
  assert.ok(plan.batches.length >= 2);
  assert.ok(plan.batches.some((batch) => batch.tasks.includes("task-domain-model")));
  assert.ok(plan.batches.some((batch) => batch.tasks.includes("task-service")));
});

test("v2.2 NativePatchPlanner uses mock LLM provider for structured operations", async () => {
  await withMockProvider(async () => {
    const repo = makeRepo();
    const runDir = makeRun("approved");
    const analysis = analyzeRepo(repo);
    const context = indexCodebase(repo).repoContextPack;
    const batch = buildImplementationBatchPlan({ handoff: handoff("approved"), taskPackages: [taskPackage("task-domain-model", "domain model")], repoAnalysis: analysis, codebaseIndex: { indexedFiles: [] } }).batches[0];
    const result = await planNativePatch({ runDir, goal: "goal", handoff: handoff("approved"), batch, repoAnalysis: analysis, repoContextPack: context });
    assert.equal(result.providerUsed, "mock-provider");
    assert.ok(Array.isArray(result.patchPlan.operations));
    assert.notEqual(result.patchPlan.operations[0]?.type, undefined);
  });
});

test("v2.2 PatchApplier rejects paths outside target repo and forbidden areas", () => {
  const repo = makeRepo();
  const outside = applyNativePatchPlan({
    targetRepo: repo,
    patchPlan: { batchId: "b1", operations: [{ type: "createFile", path: "../escape.txt", content: "x", rationale: "x", safetyCheck: "x" }] },
    allowedChangeAreas: ["src/domain/"],
    forbiddenChangeAreas: [],
  });
  assert.ok(outside.errors.some((error) => error.includes("escapes") || error.includes("Absolute")));
  const forbidden = applyNativePatchPlan({
    targetRepo: repo,
    patchPlan: { batchId: "b1", operations: [{ type: "createFile", path: "src/ui/bad.ts", content: "x", rationale: "x", safetyCheck: "x" }] },
    allowedChangeAreas: ["src/"],
    forbiddenChangeAreas: ["src/ui/"],
  });
  assert.ok(forbidden.errors.some((error) => error.includes("forbiddenChangeAreas")));
});

test("v2.2 PatchApplier rolls back earlier operations when batch fails", () => {
  const repo = makeRepo();
  const marker = path.join(repo, "src/domain/created.ts");
  const result = applyNativePatchPlan({
    targetRepo: repo,
    patchPlan: {
      batchId: "b1",
      operations: [
        { type: "createFile", path: "src/domain/created.ts", content: "created", rationale: "x", safetyCheck: "x" },
        { type: "patchFile", path: "src/domain/rotation.ts", find: "missing-text", replace: "new", rationale: "x", safetyCheck: "x" },
      ],
    },
    allowedChangeAreas: ["src/domain/"],
    forbiddenChangeAreas: [],
  });
  assert.equal(result.rolledBack, true);
  assert.equal(existsSync(marker), false);
});

test("v2.2 TestCommandRunner and BuildFailureAnalyzer capture failing TypeScript and pytest context", async () => {
  const repo = makeRepo();
  const report = await runTestCommands({ targetRepo: repo, testCommand: nodeCommand("console.error('src/domain/rotation.ts(1,1): error TS2322: bad'); process.exit(1)") });
  assert.equal(report.success, false);
  const failure = analyzeBuildFailure({ testRunReport: report });
  assert.equal(failure.failureType, "typescript");
  assert.ok(failure.filesLikelyInvolved.includes("src/domain/rotation.ts"));
  const pytest = analyzeBuildFailure({ testRunReport: { commands: ["pytest"], exitCodes: [1], stdoutSummary: ["FAILED tests/test_app.py::test_x"], stderrSummary: ["AssertionError"], failedTests: [] } });
  assert.equal(pytest.failureType, "pytest");
});

test("v2.2 RepairLoopController respects maxIterations", async () => {
  const report = await runRepairLoop({
    maxIterations: 2,
    initialTestReport: { success: false, commands: ["test"], exitCodes: [1] },
    initialFailureContext: { shouldAttemptRepair: true },
    planRepair: async ({ iteration }) => ({ batchId: `repair-${iteration}`, operations: [] }),
    applyRepair: async () => ({ filesChanged: [], errors: [] }),
    runTests: async () => ({ success: false, commands: ["test"], exitCodes: [1] }),
    analyzeFailure: async () => ({ shouldAttemptRepair: true }),
  });
  assert.equal(report.repairsAttempted, 2);
  assert.equal(report.stoppedReason, "max iterations reached");
});

test("v2.2 execute success writes autonomous result that v2.1 ingestor can accept", async () => {
  await withMockProvider(async () => {
    const repo = makeRepo();
    const runDir = makeRun("approved");
    const result = await runNativeAutocode({
      runDir,
      targetRepo: repo,
      mode: "execute",
      testCommand: nodeCommand("process.exit(0)"),
      maxIterations: 1,
    });
    assert.equal(result.autonomousCodingResult.status, "completed");
    assert.ok(existsSync(path.join(runDir, "autonomous-coding-result.json")));
    const ingested = await ingestCodingResult({
      handoffPath: path.join(runDir, "coding-handoff.json"),
      resultPath: path.join(runDir, "autonomous-coding-result.json"),
    });
    assert.equal(ingested.feedbackReport.validTask, true);
    assert.equal(ingested.feedbackReport.forbiddenExecutionDetected, false);
  });
});