import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { refineDomainAnalysisFromProductIntent } from "../src/lib/goal-domain.js";
import { selectRoute } from "../src/agents/route-selector.js";
import { buildExecutionTaskGraph } from "../src/agents/execution-task-graph-builder.js";
import { guardJsonOutput } from "../src/llm/schema-guard.js";
import { productGradeExpanderPrompt } from "../src/prompts/product-grade-expander.prompt.js";

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

function minimalStrategy(id = "S1") {
  return {
    id,
    title: "测试路线",
    thesis: "测试路线",
    targetFit: "测试",
    architectureShape: ["模型"],
    productCoverage: ["能力"],
    securityAndAbuseResistance: ["权限"],
    operationalModel: ["运维"],
    pros: ["清晰"],
    cons: ["风险"],
    risks: ["科室容量变更导致既有轮转计划冲突"],
    estimatedComplexity: "high",
    demoTrapResistanceScore: 7,
    productCompletenessScore: 7,
    evidenceRefs: ["E-GOAL-001"],
    confidence: 0.5,
  };
}

test("v1.6 RouteSelector blocks coding when selected route has blocking issues", () => {
  const selected = selectRoute(
    [minimalStrategy()],
    { strategyFindings: [{ strategyId: "S1", simplificationRisk: "low", findings: [], requiredUpgrades: [], pass: true }] },
    {
      critics: ["ProductCritic"],
      reviews: [],
      aggregate: [{ strategyId: "S1", averageScore: 7, blockingIssueCount: 1, strongestArguments: [], sharpestObjections: [] }],
    },
    {
      missingEvidence: [],
      confidenceModel: { missingEvidencePenalty: 0, scoringBasis: [], confidenceBands: {} },
      evidenceItems: [],
      assumptions: [],
      inferredClaims: [],
    },
  );
  assert.equal(selected.canProceedToCoding, false);
  assert.equal(selected.selectionStatus, "blocked");
  assert.equal(selected.routeCanBeUsedOnlyAsPlanningHypothesis, true);
});

test("v1.6 RouteSelector marks low critic average as conditional or blocked", () => {
  const selected = selectRoute(
    [minimalStrategy()],
    { strategyFindings: [{ strategyId: "S1", simplificationRisk: "low", findings: [], requiredUpgrades: [], pass: true }] },
    {
      critics: ["ProductCritic"],
      reviews: [],
      aggregate: [{ strategyId: "S1", averageScore: 5.5, blockingIssueCount: 0, strongestArguments: [], sharpestObjections: [] }],
    },
    {
      missingEvidence: [],
      confidenceModel: { missingEvidencePenalty: 0, scoringBasis: [], confidenceBands: {} },
      evidenceItems: [],
      assumptions: [],
      inferredClaims: [],
    },
  );
  assert.equal(selected.canProceedToCoding, false);
  assert.ok(["conditional", "blocked"].includes(selected.selectionStatus));
});

test("v1.6 ExecutionTaskGraph inherits route blocking state", () => {
  const graph = buildExecutionTaskGraph(
    {
      selectedStrategyId: "S1",
      selectedTitle: "blocked route",
      canProceedToCoding: false,
      blockingReasons: ["critic average below threshold"],
      requiredClarificationsBeforeCoding: ["confirm rotation rules"],
      selectionRationale: [],
      rejectedRoutes: [],
      fallbackRoutes: [],
      conditionsToReconsider: [],
      residualRisks: [],
    },
    { domainId: "generic-software-product", domainName: "Generic", confidence: 0.35, matchedSignals: [], reasoningSummary: "" },
  );
  assert.equal(graph.canProceedToCoding, false);
  assert.ok(graph.globalBlockingReasons.includes("critic average below threshold"));
  assert.ok(graph.tasks.filter((task) => task.riskLevel === "high").every((task) => task.shouldBlockCodingUntilResolved));
});

test("v1.6 ProductIntent refines generic domain into medical intern rotation domain", () => {
  const refined = refineDomainAnalysisFromProductIntent(
    { domainId: "generic-software-product", domainName: "Generic", confidence: 0.35, matchedSignals: [], reasoningSummary: "" },
    {
      rawGoal: goal,
      normalizedGoal: "医院实习轮转管理",
      domainId: "generic-software-product",
      primaryActors: ["实习生", "带教老师"],
      secondaryActors: ["科教科管理员"],
      coreResources: ["轮转计划", "科室容量", "考核模板"],
      coreWorkflows: ["轮转排班", "带教确认", "出科考核"],
      dataObjects: [],
      lifecycleStages: [],
      permissionBoundaries: [],
      riskSurfaces: ["科室冲突"],
      operationalNeeds: [],
      reportingNeeds: [],
      integrationNeeds: [],
      deploymentAssumptions: [],
      uncertaintyNotes: [],
    },
  );
  assert.equal(refined.domainId, "medical-intern-rotation-management");
  assert.ok(refined.confidence >= 0.75);
  for (const signal of ["医院", "实习", "轮转", "科室", "带教", "考核"]) {
    assert.ok(refined.matchedSignals.includes(signal), `missing signal ${signal}`);
  }
});

test("v1.6 ProductGradeExpander missing whyItMatters acceptanceSignal fails guard for repair", () => {
  const guarded = guardJsonOutput(JSON.stringify({
    goalSummary: "x",
    productGradePrinciples: [],
    userRoles: [],
    coreCapabilities: [
      { id: "c1", name: "能力", priority: "must", description: "描述", triggeredBy: [], riskIfMissing: "风险" },
      { id: "c2", name: "能力2", priority: "must", description: "描述", triggeredBy: [], riskIfMissing: "风险" },
      { id: "c3", name: "能力3", priority: "should", description: "描述", triggeredBy: [], riskIfMissing: "风险" },
    ],
    operationalCapabilities: [],
    nonFunctionalRequirements: [],
    demoTrapsToAvoid: [],
  }), {
    agentName: "ProductGradeExpander",
    schemaName: productGradeExpanderPrompt.outputSchemaName,
    expectedShape: productGradeExpanderPrompt.expectedShape,
    qualityChecklist: productGradeExpanderPrompt.qualityChecklist,
  });
  assert.equal(guarded.ok, false);
  assert.ok(guarded.validationErrors.some((error) => error.includes("whyItMatters")));
  assert.ok(guarded.validationErrors.some((error) => error.includes("acceptanceSignal")));
});

test("v1.6 ProductGradeExpander repair attempt can recover missing fields in hybrid run", () => {
  const runDir = runThinking(["--goal", goal, "--mode", "hybrid"], {
    THINK_LLM_PROVIDER: "mock",
    THINK_MOCK_LLM_BEHAVIOR: "product-expansion-missing-fields",
    THINK_LLM_MODEL: "mock-json-model",
  });
  const metadata = readJson(runDir, "llm-run-metadata.json");
  const expansion = readJson(runDir, "product-expansion.json");
  assert.ok(metadata.schemaRepairAttempts.some((attempt) => attempt.agentName === "ProductGradeExpander"));
  assert.equal(metadata.agentsUsingLLM.includes("ProductGradeExpander"), true);
  assert.ok(expansion.coreCapabilities.every((capability) => capability.whyItMatters && capability.acceptanceSignal));
});

test("v1.6 per-role CriticCouncil fallback keeps council running when one critic fails", () => {
  const runDir = runThinking(["--goal", goal, "--mode", "hybrid"], {
    THINK_LLM_PROVIDER: "mock",
    THINK_MOCK_LLM_BEHAVIOR: "critic-one-invalid",
    THINK_LLM_MODEL: "mock-json-model",
    THINK_LLM_CRITIC_MODE: "per-role",
  });
  const metadata = readJson(runDir, "llm-run-metadata.json");
  const council = readJson(runDir, "critic-council-report.json");
  assert.ok(metadata.agentsUsingRuleFallback.includes("CriticCouncil.SecurityCritic"));
  assert.ok(metadata.agentsUsingLLM.includes("CriticCouncil.ProductCritic"));
  assert.ok(council.reviews.some((review) => review.critic === "SecurityCritic"));
  assert.ok(council.reviews.some((review) => review.critic === "TestingCritic"));
});

test("v1.6 full run writes blocked handoff language into final report when route is unsafe", () => {
  const runDir = runThinking(["--goal", goal, "--mode", "hybrid"], {
    THINK_LLM_PROVIDER: "mock",
    THINK_MOCK_LLM_BEHAVIOR: "low-critic-score",
    THINK_LLM_MODEL: "mock-json-model",
  });
  const selectedRoute = readJson(runDir, "selected-route.json");
  const graph = readJson(runDir, "execution-task-graph.json");
  const finalReport = readFileSync(path.join(runDir, "final-thinking-report.md"), "utf8");
  assert.equal(selectedRoute.canProceedToCoding, false);
  assert.equal(graph.canProceedToCoding, false);
  assert.ok(finalReport.includes("Do not hand off to Coding Agent yet."));
});