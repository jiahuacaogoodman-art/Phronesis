import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { conversationScenarios } from "./conversation-scenario-fixtures.js";
import { runConversationScenario } from "./conversation-scenario-runner.js";
import { checkConversationScenario } from "./conversation-e2e-checker.js";
import type {
  ConversationE2EAggregateReport,
  ConversationE2EOptions,
  ConversationEvalReport,
  ConversationEvalScenarioId,
  ConversationScenarioRun,
} from "../types/conversation-eval.js";

interface ScenarioResult {
  scenarioId: ConversationEvalScenarioId;
  outputDir: string;
  run: ConversationScenarioRun;
  report: ConversationEvalReport;
}

function evalId(): string {
  return new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14) + "-" + Math.random().toString(36).slice(2, 8);
}

function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function runConversationE2EHarness(options: ConversationE2EOptions = {}) {
  const id = options.evalId ?? evalId();
  const scenario = options.scenario ?? "all";
  const outputRoot = path.resolve(process.cwd(), options.outputDir ?? path.join(".conversation-eval-runs", id));
  mkdirSync(outputRoot, { recursive: true });
  const scenarioIds: ConversationEvalScenarioId[] = scenario === "all" ? conversationScenarios : [scenario];
  const results: ScenarioResult[] = [];

  const plan = { evalId: id, scenario, scenarios: scenarioIds, session: options.sessionName ?? "default" };
  writeJson(path.join(outputRoot, "conversation-eval-plan.json"), plan);

  for (const scenarioId of scenarioIds) {
    const scenarioOutput = scenario === "all" ? path.join(outputRoot, scenarioId) : outputRoot;
    mkdirSync(scenarioOutput, { recursive: true });
    const run = await runConversationScenario({ scenarioId, outputDir: scenarioOutput, sessionName: options.sessionName ?? "default" });
    const report = checkConversationScenario(run);
    results.push({ scenarioId, outputDir: scenarioOutput, run, report });
  }

  const resultSummaries = results.map((item) => ({
    scenarioId: item.scenarioId,
    outputDir: item.outputDir,
    passed: item.report.passed,
    failedChecks: item.report.failedChecks,
  }));
  const aggregate: ConversationE2EAggregateReport = {
    evalId: id,
    scenario,
    passed: results.every((item) => item.report.passed),
    results: resultSummaries,
    failedScenarios: resultSummaries.filter((item) => !item.passed).map((item) => item.scenarioId),
  };
  writeJson(path.join(outputRoot, "conversation-eval-report.json"), aggregate);
  writeFileSync(path.join(outputRoot, "conversation-eval-summary.md"), [
    "# Conversation E2E Reliability Summary",
    "",
    `Eval ID: ${id}`,
    `Scenario: ${scenario}`,
    `Passed: ${aggregate.passed}`,
    "",
    "## Scenarios",
    ...aggregate.results.map((item) => `- ${item.scenarioId}: ${item.passed ? "passed" : `failed (${item.failedChecks.join(", ")})`}`),
    "",
  ].join("\n"), "utf8");

  return { evalId: id, outputDir: outputRoot, scenario, results, report: aggregate };
}