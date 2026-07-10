import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { evaluateThinkingQuality } from "../src/evaluation/thinking-quality-evaluator.js";

const goal = "做一个医院实习轮转管理系统";

function runCli(args, env = {}) {
  const result = spawnSync("pnpm", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  assert.equal(result.status, 0, `command failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return result.stdout;
}

function extractRunDir(stdout) {
  const match = stdout.match(/Run directory:\s*(.+)/);
  assert.ok(match, "Run directory was not printed.");
  return match[1].trim();
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

test("v0.7 think:evaluate generates thinking-quality-report.json with all score dimensions", () => {
  const runStdout = runCli(["think:run", "--goal", goal, "--mode", "rule"]);
  const runDir = extractRunDir(runStdout);
  runCli(["think:evaluate", "--run", runDir]);

  const reportPath = path.join(runDir, "thinking-quality-report.json");
  assert.ok(existsSync(reportPath), "thinking-quality-report.json was not created");
  const report = readJson(reportPath);

  for (const key of [
    "goalSpecificity",
    "productIntentDepth",
    "capabilityRelevance",
    "routeDiversity",
    "antiSimplificationStrength",
    "criticDisagreementQuality",
    "evidenceGapAwareness",
    "taskGraphExecutability",
    "avoidsGenericSaaSTalk",
    "finalReportUsefulness",
  ]) {
    assert.equal(typeof report.scores[key].score, "number", `missing score for ${key}`);
    assert.equal(typeof report.scores[key].reason, "string", `missing reason for ${key}`);
  }
});

test("v0.7 evaluator warns on generic language and rewards specificity", () => {
  const genericArtifacts = {
    goal: { runId: "generic", rawGoal: goal },
    productIntent: {
      primaryActors: ["用户"],
      secondaryActors: ["管理员"],
      coreResources: ["轮转计划", "科室安排"],
      coreWorkflows: ["排班", "审批"],
      riskSurfaces: ["冲突", "权限滥用"],
    },
    productExpansion: { coreCapabilities: [{ whyItMatters: "generic SaaS user management", acceptanceSignal: "admin dashboard" }] },
    strategyCandidates: [{ title: "Product-Grade Web Application", routeArchetype: "admin-web-first", productCoverage: [], risks: [], evidenceRefs: [], confidence: 0.5 }],
    antiSimplificationReport: { bannedShortcutSolutions: [], triggeredRules: [] },
    criticCouncilReport: { reviews: [{ disagreementLevel: "low", objections: ["modern architecture"], strategyId: "S1" }] },
    selectedRoute: { evidenceGapsAccepted: [], whyAcceptedDespiteGaps: [] },
    evidenceLedger: { missingEvidence: [], routeEvidenceCoverage: [] },
    executionTaskGraph: { tasks: [{ shouldBlockCodingUntilResolved: false, requiredEvidenceBeforeExecution: [], claimRefs: [] }] },
    finalThinkingReport: { markdown: "Product-Grade Web Application with scalable platform and admin dashboard" },
    architecturePlan: { markdown: "modern architecture and generic SaaS admin dashboard" },
    llmRunMetadata: { mode: "rule", agentsUsingLLM: [] },
  };

  const specificArtifacts = {
    goal: { runId: "specific", rawGoal: goal },
    productIntent: {
      primaryActors: ["实习生", "教学秘书"],
      secondaryActors: ["带教老师", "管理员"],
      coreResources: ["轮转计划", "科室安排", "带教记录"],
      coreWorkflows: ["轮转排班", "冲突审批", "带教确认"],
      riskSurfaces: ["轮转冲突", "权限滥用", "记录缺失"],
    },
    productExpansion: {
      coreCapabilities: [
        { whyItMatters: "轮转计划需要按科室和月份编排", acceptanceSignal: "轮转计划按科室排班" },
        { whyItMatters: "冲突审批必须保留带教确认记录", acceptanceSignal: "审批链可追溯" },
      ],
    },
    strategyCandidates: [
      { title: "医院实习轮转排班与审批路线", routeArchetype: "admin-web-first", productCoverage: ["轮转计划"], risks: ["轮转冲突"], evidenceRefs: ["E-RISK-001"], confidence: 0.8 },
      { title: "带教记录与轮转合规路线", routeArchetype: "audit-and-compliance-first", productCoverage: ["带教记录"], risks: ["记录缺失"], evidenceRefs: ["E-RISK-002"], confidence: 0.78 },
    ],
    antiSimplificationReport: { bannedShortcutSolutions: ["HTML + localStorage"], triggeredRules: [{ ruleId: "R1" }] },
    criticCouncilReport: { reviews: [{ disagreementLevel: "high", objections: ["轮转冲突必须审批"], strategyId: "S1" }] },
    selectedRoute: { evidenceGapsAccepted: ["ME-001"], whyAcceptedDespiteGaps: ["需要先确认轮转规模"] },
    evidenceLedger: { missingEvidence: [{ id: "ME-001" }], routeEvidenceCoverage: [] },
    executionTaskGraph: {
      tasks: [
        { shouldBlockCodingUntilResolved: true, requiredEvidenceBeforeExecution: ["ME-001"], claimRefs: ["C-TASK-ROTATION"] },
        { shouldBlockCodingUntilResolved: false, requiredEvidenceBeforeExecution: ["ME-002"], claimRefs: ["C-TASK-APPROVAL"] },
      ],
    },
    finalThinkingReport: { markdown: "实习生、教学秘书、轮转计划、轮转排班、冲突审批、带教确认、轮转冲突、记录缺失" },
    architecturePlan: { markdown: "轮转计划、科室安排、带教记录" },
    llmRunMetadata: { mode: "rule", agentsUsingLLM: [] },
  };

  const genericReport = evaluateThinkingQuality({ goal, runDir: process.cwd(), artifacts: genericArtifacts });
  const specificReport = evaluateThinkingQuality({ goal, runDir: process.cwd(), artifacts: specificArtifacts });

  assert.ok(genericReport.genericLanguageWarnings.length > 0, "generic language warnings expected");
  assert.ok(specificReport.scores.goalSpecificity.score > genericReport.scores.goalSpecificity.score, "specific artifacts should score higher on goal specificity");
  assert.ok(specificReport.scores.productIntentDepth.score >= genericReport.scores.productIntentDepth.score, "specific artifacts should not score lower on product intent depth");
});

test("v0.7 think:compare detects hybrid fallback without claiming AI improvement", () => {
  const stdout = runCli(["think:compare", "--goal", goal]);
  const match = stdout.match(/Comparison report:\s*(.+)/);
  assert.ok(match, "comparison report path not printed");
  const comparison = readJson(match[1].trim());
  assert.equal(comparison.whetherHybridIsActuallyBetter, false);
  assert.ok(String(comparison.recommendation).includes("fell back to rule"), "comparison should explain fallback");
});

test("v0.7 think:compare shows hybrid improvement with valid mock provider", () => {
  const stdout = runCli(["think:compare", "--goal", goal], {
    "THINK_LLM_PROVIDER": "mock",
    "THINK_MOCK_LLM_BEHAVIOR": "valid",
  });
  const match = stdout.match(/Comparison report:\s*(.+)/);
  assert.ok(match, "comparison report path not printed");
  const comparison = readJson(match[1].trim());
  assert.ok(comparison.hybridScore >= comparison.ruleScore, "mock valid hybrid should not score below rule");
  assert.equal(typeof comparison.whetherHybridIsActuallyBetter, "boolean");
});

test("v0.7 still does not add UI surfaces", () => {
  const forbiddenPaths = ["web", "app", "pages", "components", "src/App.tsx", "vite.config.ts"];
  for (const forbiddenPath of forbiddenPaths) {
    assert.equal(existsSync(path.join(process.cwd(), forbiddenPath)), false, `Forbidden UI path exists: ${forbiddenPath}`);
  }
});