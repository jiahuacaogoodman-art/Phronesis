import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { analyzeGoalDomain } from "../src/lib/goal-domain.js";
import { buildProductIntent } from "../src/lib/product-intent.js";
import { OpenAICompatibleProvider } from "../src/llm/openai-compatible-provider.js";
import { createThinkingRuntime } from "../src/llm/provider.js";
import { guardJsonOutput } from "../src/llm/schema-guard.js";
import { productIntentPrompt } from "../src/prompts/product-intent.prompt.js";

const goal = "做一个医院实习轮转管理系统";
const domainAnalysis = analyzeGoalDomain(goal);

function tempRunDir() {
  return mkdtempSync(path.join(os.tmpdir(), "dtac-product-intent-"));
}

function removeRunDir(runDir) {
  rmSync(runDir, JSON.parse('{"recursive":true,"force":true}'));
}

function productIntentRequest(runDir) {
  return {
    agentName: "ProductIntentBuilder",
    goal,
    systemPrompt: productIntentPrompt.systemPrompt,
    userPrompt: productIntentPrompt.buildUserPrompt({ rawGoal: goal, domainAnalysis }),
    schemaName: productIntentPrompt.outputSchemaName,
    schemaDescription: productIntentPrompt.outputSchemaDescription,
    examples: [],
    qualityChecklist: productIntentPrompt.qualityChecklist,
    temperature: 0.2,
    maxTokens: 1200,
    maxRetries: 2,
    runDir,
    expectedShape: productIntentPrompt.expectedShape,
    input: { rawGoal: goal, domainAnalysis },
  };
}

function validIntent(overrides = {}) {
  return {
    rawGoal: goal,
    normalizedGoal: goal,
    domainId: domainAnalysis.domainId,
    primaryActors: ["实习学生", "带教老师"],
    secondaryActors: ["教务管理员"],
    coreResources: ["轮转科室", "实习批次"],
    coreWorkflows: ["排班分配", "轮转确认"],
    dataObjects: ["轮转记录"],
    lifecycleStages: ["待分配", "轮转中"],
    permissionBoundaries: ["学生查看本人轮转"],
    riskSurfaces: ["排班冲突"],
    operationalNeeds: ["轮转管理"],
    reportingNeeds: ["轮转统计"],
    integrationNeeds: ["身份系统"],
    deploymentAssumptions: ["标准云部署"],
    uncertaintyNotes: ["需确认医院规则"],
    ...overrides,
  };
}

test("v1.1 ProductIntentBuilder unwraps productIntent wrapper before validation", () => {
  const guarded = guardJsonOutput(
    JSON.stringify({ productIntent: validIntent() }),
    productIntentRequest(tempRunDir()),
  );
  assert.equal(guarded.ok, true);
  assert.equal(guarded.data.rawGoal, goal);
  assert.ok(guarded.canonicalizationApplied.some((item) => String(item).includes("productIntent")));
});

test("v1.1 ProductIntentBuilder fills rawGoal normalizedGoal and domainId from input", () => {
  const input = validIntent();
  delete input.rawGoal;
  delete input.normalizedGoal;
  delete input.domainId;
  const guarded = guardJsonOutput(JSON.stringify(input), productIntentRequest(tempRunDir()));
  assert.equal(guarded.ok, true);
  assert.equal(guarded.data.rawGoal, goal);
  assert.equal(guarded.data.normalizedGoal, goal);
  assert.equal(guarded.data.domainId, domainAnalysis.domainId);
  assert.ok(guarded.missingFieldRepairs.some((repair) => repair.field === "rawGoal"));
  assert.ok(guarded.missingFieldRepairs.some((repair) => repair.field === "normalizedGoal"));
  assert.ok(guarded.missingFieldRepairs.some((repair) => repair.field === "domainId"));
});

test("v1.1 ProductIntentBuilder fills missing non-critical array fields and records repairs", () => {
  const input = validIntent();
  delete input.secondaryActors;
  delete input.dataObjects;
  delete input.lifecycleStages;
  const guarded = guardJsonOutput(JSON.stringify(input), productIntentRequest(tempRunDir()));
  assert.equal(guarded.ok, true);
  assert.deepEqual(guarded.data.secondaryActors, []);
  assert.deepEqual(guarded.data.dataObjects, []);
  assert.ok(guarded.missingFieldRepairs.some((repair) => repair.field === "secondaryActors"));
});

test("v1.1 empty critical ProductIntent arrays fail the quality checklist", () => {
  const guarded = guardJsonOutput(
    JSON.stringify(validIntent({
      primaryActors: [],
      coreResources: [],
      coreWorkflows: [],
      riskSurfaces: [],
    })),
    productIntentRequest(tempRunDir()),
  );
  assert.equal(guarded.ok, false);
  assert.ok(guarded.qualityChecklistFailures.some((message) => message.includes("primaryActors")));
  assert.ok(guarded.qualityChecklistFailures.some((message) => message.includes("coreResources")));
  assert.ok(guarded.qualityChecklistFailures.some((message) => message.includes("coreWorkflows")));
  assert.ok(guarded.qualityChecklistFailures.some((message) => message.includes("riskSurfaces")));
});

test("v1.1 schema guard failure triggers a repair retry and saves both raw attempts", async () => {
  const runDir = tempRunDir();
  const originalFetch = globalThis.fetch;
  const capturedBodies = [];
  globalThis.fetch = async (_url, options) => {
    capturedBodies.push(JSON.parse(String(options.body)));
    const content = capturedBodies.length === 1
      ? JSON.stringify({ actors: ["学生"], workflows: ["轮转"] })
      : JSON.stringify(validIntent());
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        choices: [{ message: { content } }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      }),
    };
  };

  try {
    const provider = new OpenAICompatibleProvider({
      baseUrl: "https://example.test/",
      apiKey: "sk-test-secret",
      model: "gpt-test",
    });
    const result = await provider.completeJson(productIntentRequest(runDir));
    assert.equal(result.ok, true);
    assert.equal(result.attempts, 2);
    assert.equal(result.schemaRepairAttempts.length, 1);
    assert.ok(capturedBodies[1].messages[1].content.includes("Previous raw output"));
    assert.ok(capturedBodies[1].messages[1].content.includes("Schema guard errors"));
    assert.ok(existsSync(path.join(runDir, "llm-raw", "product-intent-builder-attempt-1.txt")));
    assert.ok(existsSync(path.join(runDir, "llm-raw", "product-intent-builder-attempt-2-repair.txt")));
    assert.ok(!JSON.stringify(result).includes("sk-test-secret"));
  } finally {
    globalThis.fetch = originalFetch;
    removeRunDir(runDir);
  }
});

test("v1.1 llm mode fails when ProductIntent repair retry still fails", async () => {
  const runDir = tempRunDir();
  const previousEnv = {
    THINK_LLM_PROVIDER: process.env.THINK_LLM_PROVIDER,
    THINK_MOCK_LLM_BEHAVIOR: process.env.THINK_MOCK_LLM_BEHAVIOR,
    THINK_LLM_MODEL: process.env.THINK_LLM_MODEL,
  };
  process.env.THINK_LLM_PROVIDER = "mock";
  process.env.THINK_MOCK_LLM_BEHAVIOR = "invalid";
  process.env.THINK_LLM_MODEL = "mock-json-model";

  try {
    const runtime = createThinkingRuntime({ mode: "llm", runDir, goal });
    await assert.rejects(
      () => runtime.runJsonAgent(
        productIntentPrompt,
        { rawGoal: goal, domainAnalysis },
        buildProductIntent(goal, domainAnalysis),
      ),
      /ProductIntentBuilder failed in llm mode/,
    );
  } finally {
    if (previousEnv.THINK_LLM_PROVIDER == null) delete process.env.THINK_LLM_PROVIDER;
    else process.env.THINK_LLM_PROVIDER = previousEnv.THINK_LLM_PROVIDER;
    if (previousEnv.THINK_MOCK_LLM_BEHAVIOR == null) delete process.env.THINK_MOCK_LLM_BEHAVIOR;
    else process.env.THINK_MOCK_LLM_BEHAVIOR = previousEnv.THINK_MOCK_LLM_BEHAVIOR;
    if (previousEnv.THINK_LLM_MODEL == null) delete process.env.THINK_LLM_MODEL;
    else process.env.THINK_LLM_MODEL = previousEnv.THINK_LLM_MODEL;
    removeRunDir(runDir);
  }
});

test("v1.1 hybrid mode falls back to rule after ProductIntent repair retry fails", async () => {
  const runDir = tempRunDir();
  const previousEnv = {
    THINK_LLM_PROVIDER: process.env.THINK_LLM_PROVIDER,
    THINK_MOCK_LLM_BEHAVIOR: process.env.THINK_MOCK_LLM_BEHAVIOR,
    THINK_LLM_MODEL: process.env.THINK_LLM_MODEL,
  };
  process.env.THINK_LLM_PROVIDER = "mock";
  process.env.THINK_MOCK_LLM_BEHAVIOR = "invalid";
  process.env.THINK_LLM_MODEL = "mock-json-model";

  try {
    const ruleIntent = buildProductIntent(goal, domainAnalysis);
    const runtime = createThinkingRuntime({ mode: "hybrid", runDir, goal });
    const output = await runtime.runJsonAgent(
      productIntentPrompt,
      { rawGoal: goal, domainAnalysis },
      ruleIntent,
    );
    await runtime.writeMetadata();
    const metadata = JSON.parse(readFileSync(path.join(runDir, "llm-run-metadata.json"), "utf8"));
    assert.equal(output.rawGoal, ruleIntent.rawGoal);
    assert.ok(metadata.agentsUsingRuleFallback.includes("ProductIntentBuilder"));
    assert.ok(metadata.failedLLMCalls.some((call) => call.agentName === "ProductIntentBuilder"));
    assert.ok(metadata.schemaRepairAttempts.some((attempt) => attempt.agentName === "ProductIntentBuilder"));
    assert.ok(!JSON.stringify(metadata).includes("sk-test-secret"));
  } finally {
    if (previousEnv.THINK_LLM_PROVIDER == null) delete process.env.THINK_LLM_PROVIDER;
    else process.env.THINK_LLM_PROVIDER = previousEnv.THINK_LLM_PROVIDER;
    if (previousEnv.THINK_MOCK_LLM_BEHAVIOR == null) delete process.env.THINK_MOCK_LLM_BEHAVIOR;
    else process.env.THINK_MOCK_LLM_BEHAVIOR = previousEnv.THINK_MOCK_LLM_BEHAVIOR;
    if (previousEnv.THINK_LLM_MODEL == null) delete process.env.THINK_LLM_MODEL;
    else process.env.THINK_LLM_MODEL = previousEnv.THINK_LLM_MODEL;
    removeRunDir(runDir);
  }
});