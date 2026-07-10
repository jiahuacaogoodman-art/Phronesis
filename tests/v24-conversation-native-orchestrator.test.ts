import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { classifyConversationIntent } from "../src/conversation/intent-classifier.js";
import { ConversationStateStore } from "../src/conversation/conversation-state-store.js";
import { planRuntimeAction } from "../src/conversation/runtime-action-planner.js";
import { executeRuntimeAction } from "../src/conversation/runtime-action-executor.js";
import { summarizeArtifacts } from "../src/conversation/artifact-summarizer.js";
import { runConversationTurn } from "../src/conversation/conversation-orchestrator.js";

function mkdirp(dir) {
  const options = {};
  options.recursive = true;
  mkdirSync(dir, options);
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function makeBlockedRun(parentDir) {
  const runDir = path.join(parentDir, "blocked-run");
  mkdirp(runDir);
  const goal = {};
  goal.runId = "blocked-run";
  goal.rawGoal = "做一个医院实习轮转管理系统";
  writeJson(path.join(runDir, "goal.json"), goal);

  const selectedRoute = {};
  selectedRoute.selectedStrategyId = "S1";
  selectedRoute.selectedTitle = "医院实习轮转路线";
  selectedRoute.selectionStatus = "blocked";
  selectedRoute.canProceedToCoding = false;
  selectedRoute.blockingReasons = ["critic average below 6", "科室容量规则未确认"];
  writeJson(path.join(runDir, "selected-route.json"), selectedRoute);

  const taskGraph = {};
  taskGraph.canProceedToCoding = false;
  taskGraph.globalBlockingReasons = ["Do not hand off to Coding Agent yet.", "审批规则缺失"];
  writeJson(path.join(runDir, "execution-task-graph.json"), taskGraph);

  const criticReport = {};
  criticReport.summary = {};
  criticReport.summary.blockingIssues = 7;
  writeJson(path.join(runDir, "critic-council-report.json"), criticReport);

  const scorecard = {};
  scorecard.canProceedToCoding = false;
  writeJson(path.join(runDir, "technical-route-scorecard.json"), scorecard);

  const handoff = {};
  handoff.handoffStatus = "blocked";
  handoff.canProceedToCoding = false;
  handoff.requiredBeforeCoding = ["确认用户规模", "确认身份系统"];
  writeJson(path.join(runDir, "coding-handoff.json"), handoff);
  writeFileSync(path.join(runDir, "final-thinking-report.md"), "Do not hand off to Coding Agent yet.\n", "utf8");
  return runDir;
}

test("v2.4 classifies create planning, blockers, and toy eval intents", () => {
  const create = classifyConversationIntent("做一个医院实习轮转管理系统");
  assert.equal(create.intent, "create_planning_run");
  assert.ok(create.extractedGoal.includes("医院实习轮转"));

  const blockers = classifyConversationIntent("为什么 blocked");
  assert.equal(blockers.intent, "explain_blockers");

  const evalIntent = classifyConversationIntent("跑一次 toy eval");
  assert.equal(evalIntent.intent, "run_autocode_eval");
});

test("v2.4 blocked run prevents autocode execute and returns blocker explanation", async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "conversation-blocked-"));
  const runDir = makeBlockedRun(tmp);
  const storeOptions = {};
  storeOptions.rootDir = path.join(tmp, "conversation");
  storeOptions.sessionName = "test";
  const store = new ConversationStateStore(storeOptions);
  const state = store.saveState({
    sessionId: "conversation-test",
    latestRunDir: runDir,
    latestTargetRepo: path.join(tmp, "target"),
    unresolvedQuestions: [],
    userDecisions: [],
    updatedAt: new Date().toISOString(),
  });
  const intent = classifyConversationIntent("执行 autocode");
  const action = planRuntimeAction(intent, state);
  const unsafeAction = { ...action };
  unsafeAction.requiresConfirmation = false;
  const executeInput = {};
  executeInput.action = unsafeAction;
  executeInput.intent = intent;
  executeInput.state = state;
  const result = await executeRuntimeAction(executeInput);
  assert.equal(result.status, "blocked");
  assert.ok(result.summary.currentStatus.includes("blocked"));
  assert.ok(result.summary.blockers.join(" ").includes("canProceedToCoding=false"));
});

test("v2.4 inspect latest run reads latest-run-pointer and summarizes blockers", async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "conversation-latest-"));
  const runDir = makeBlockedRun(tmp);
  const storeOptions = {};
  storeOptions.rootDir = path.join(tmp, "conversation");
  storeOptions.sessionName = "test";
  const store = new ConversationStateStore(storeOptions);
  const pointer = {};
  pointer.latestRunDir = runDir;
  writeJson(store.latestRunPointerPath(), pointer);
  const turnInput = {};
  turnInput.message = "总结最新 run";
  turnInput.store = store;
  const result = await runConversationTurn(turnInput);
  assert.equal(result.intent.intent, "inspect_latest_run");
  assert.ok(result.summary.artifactPaths.some((item) => item.endsWith("selected-route.json")));
  assert.ok(result.response.includes("当前状态"));
  assert.ok(result.response.includes("Do not hand off to Coding Agent yet."));
});

test("v2.4 ArtifactSummarizer turns execution-task-graph blocking reasons into natural language", () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "conversation-summary-"));
  const runDir = makeBlockedRun(tmp);
  const summaryInput = {};
  summaryInput.runDir = runDir;
  const summary = summarizeArtifacts(summaryInput);
  assert.ok(summary.blockers.includes("审批规则缺失"));
  assert.ok(summary.currentStatus.includes("blocked"));
});

test("v2.4 side-effecting action creates pending confirmation and action log", async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "conversation-confirm-"));
  const storeOptions = {};
  storeOptions.rootDir = path.join(tmp, "conversation");
  storeOptions.sessionName = "test";
  const store = new ConversationStateStore(storeOptions);
  const turnInput = {};
  turnInput.message = "跑一次 toy eval";
  turnInput.store = store;
  const result = await runConversationTurn(turnInput);
  assert.equal(result.status, "pending-confirmation");
  assert.ok(result.state.pendingConfirmation.confirmationId.startsWith("confirm-"));
  assert.ok(existsSync(store.actionLogPath()));
  const log = JSON.parse(readFileSync(store.actionLogPath(), "utf8"));
  assert.equal(log.length, 1);
  assert.equal(log[0].status, "pending-confirmation");
});

test("v2.4 conversation state store remembers latestRunDir and latestEvalDir", () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "conversation-state-"));
  const storeOptions = {};
  storeOptions.rootDir = path.join(tmp, "conversation");
  storeOptions.sessionName = "test";
  const store = new ConversationStateStore(storeOptions);
  const state = store.saveState({
    sessionId: "conversation-test",
    latestRunDir: path.join(tmp, "run"),
    latestEvalDir: path.join(tmp, "eval"),
    unresolvedQuestions: [],
    userDecisions: [],
    updatedAt: new Date().toISOString(),
  });
  const loaded = store.loadState();
  assert.equal(loaded.latestRunDir, state.latestRunDir);
  assert.equal(loaded.latestEvalDir, state.latestEvalDir);
});