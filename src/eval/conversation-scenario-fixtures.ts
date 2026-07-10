import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ConversationEvalFixtures, ConversationEvalScenarioId, ConversationScenarioMessage } from "../types/conversation-eval.js";

function mkdirp(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export const conversationScenarios: ConversationEvalScenarioId[] = [
  "summarize-latest-run",
  "explain-blocked-run",
  "toy-eval-confirmation",
  "blocked-autocode-execute",
  "stale-confirmation",
  "continue-context",
];

export function createConversationEvalFixtures(outputDir: string): ConversationEvalFixtures {
  const fixturesDir = path.join(outputDir, "fixtures");
  const runDir = path.join(fixturesDir, "blocked-run");
  const targetRepo = path.join(fixturesDir, "target-repo");
  mkdirp(runDir);
  mkdirp(path.join(targetRepo, "src"));

  const goal = { runId: "conversation-eval-blocked-run", rawGoal: "做一个医院实习轮转管理系统" };
  writeJson(path.join(runDir, "goal.json"), goal);

  const productIntent = {
    domainId: "medical-intern-rotation-management",
    coreResources: ["实习生", "科室", "带教老师", "轮转计划"],
    coreWorkflows: ["轮转排班", "请假审批", "出科考核"],
  };
  writeJson(path.join(runDir, "product-intent.json"), productIntent);

  const selectedRoute = {
    selectedStrategyId: "S1",
    selectedTitle: "医院实习轮转运营后台路线",
    selectionStatus: "blocked",
    canProceedToCoding: false,
    blockingReasons: [
    "Selected route has 7 critic blocking issue(s).",
    "科室容量规则未确认",
    "请假补轮转审批规则缺失",
    ],
  };
  writeJson(path.join(runDir, "selected-route.json"), selectedRoute);

  const taskGraph = { canProceedToCoding: false, globalBlockingReasons: ["Do not hand off to Coding Agent yet.", "审批规则缺失", "身份系统集成未确认"] };
  writeJson(path.join(runDir, "execution-task-graph.json"), taskGraph);

  const criticCouncil = { summary: { blockingIssues: 7 } };
  writeJson(path.join(runDir, "critic-council-report.json"), criticCouncil);

  const scorecard = { canProceedToCoding: false, blockingReasons: ["critic average below 6"] };
  writeJson(path.join(runDir, "technical-route-scorecard.json"), scorecard);

  const handoff = {
    runId: "conversation-eval-blocked-run",
    goal: goal.rawGoal,
    handoffStatus: "blocked",
    canProceedToCoding: false,
    approvedCodingTasks: [],
    conditionalCodingTasks: [],
    requiredBeforeCoding: ["确认用户规模", "确认外部身份系统", "确认审批规则"],
  };
  writeJson(path.join(runDir, "coding-handoff.json"), handoff);

  const technicalRoute = { routeTitle: "医院实习轮转运营后台路线" };
  writeJson(path.join(runDir, "technical-route-plan.json"), technicalRoute);
  const technicalCandidates = { candidates: [] };
  writeJson(path.join(runDir, "technical-solution-candidates.json"), technicalCandidates);
  writeFileSync(path.join(runDir, "final-thinking-report.md"), "Do not hand off to Coding Agent yet.\nBlocking reasons include 科室容量规则未确认 and 审批规则缺失.\n", "utf8");
  writeFileSync(path.join(targetRepo, "src", "index.ts"), "export const untouched = true;\n", "utf8");

  return { fixturesDir, blockedRunDir: runDir, targetRepo };
}

export function scenarioMessages(scenarioId: ConversationEvalScenarioId): ConversationScenarioMessage[] {
  const messageTurn = (userMessage: string): ConversationScenarioMessage => ({ userMessage });
  const confirmTurn = (): ConversationScenarioMessage => ({ confirmPending: true });
  const staleConfirmTurn = (): ConversationScenarioMessage => ({ confirmationId: "confirm-does-not-exist" });
  if (scenarioId === "summarize-latest-run") return [messageTurn("总结最新 run")];
  if (scenarioId === "explain-blocked-run") return [messageTurn("为什么 blocked")];
  if (scenarioId === "toy-eval-confirmation") return [messageTurn("跑一次 toy eval"), confirmTurn()];
  if (scenarioId === "blocked-autocode-execute") return [messageTurn("对这个 run 执行 autocode execute")];
  if (scenarioId === "stale-confirmation") return [staleConfirmTurn()];
  if (scenarioId === "continue-context") return [messageTurn("继续")];
  return [];
}