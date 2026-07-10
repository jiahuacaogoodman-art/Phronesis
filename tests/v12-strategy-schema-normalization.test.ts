import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { guardJsonOutput } from "../src/llm/schema-guard.js";
import { strategyGeneratorPrompt } from "../src/prompts/strategy-generator.prompt.js";

function tempRunDir() {
  return mkdtempSync(path.join(os.tmpdir(), "dtac-strategy-"));
}

function removeRunDir(runDir) {
  rmSync(runDir, JSON.parse('{"recursive":true,"force":true}'));
}

function request(runDir) {
  return {
    agentName: "StrategyGenerator",
    goal: "做一个医院实习轮转管理系统",
    systemPrompt: strategyGeneratorPrompt.systemPrompt,
    userPrompt: "user",
    schemaName: strategyGeneratorPrompt.outputSchemaName,
    schemaDescription: strategyGeneratorPrompt.outputSchemaDescription,
    examples: [],
    qualityChecklist: strategyGeneratorPrompt.qualityChecklist,
    temperature: 0.25,
    maxTokens: 1600,
    maxRetries: 2,
    runDir,
    expectedShape: strategyGeneratorPrompt.expectedShape,
    input: {},
  };
}

function route(index) {
  return {
    id: `S${index}`,
    title: `路线 ${index}`,
    thesis: "围绕医院实习轮转管理的技术路线。",
    targetFit: "适合院内轮转、审批、考核、归档场景。",
    architectureShape: "轮转计划模型；排班状态机；审批服务；审计日志",
    productCoverage: ["轮转计划", "调科审批", "出科考核"],
    risks: ["排班冲突", "权限越权"],
    estimatedComplexity: "high",
    evidenceRefs: ["E-INTENT-001"],
    confidence: 0.72,
    tradeoffSummary: "覆盖完整但首期复杂度较高。",
    missingEvidenceImpact: "审批链未知会影响状态机。",
  };
}

test("v1.2 StrategyGenerator canonicalizes string list fields into arrays", () => {
  const runDir = tempRunDir();
  try {
    const guarded = guardJsonOutput(
      JSON.stringify([route(1), route(2), route(3), route(4)]),
      request(runDir),
    );
    assert.equal(guarded.ok, true);
    assert.ok(Array.isArray(guarded.data[0].architectureShape));
    assert.ok(guarded.data[0].architectureShape.includes("排班状态机"));
    assert.ok(Array.isArray(guarded.data[0].securityAndAbuseResistance));
    assert.ok(Array.isArray(guarded.data[0].operationalModel));
    assert.ok(Array.isArray(guarded.data[0].modules));
    assert.equal(typeof guarded.data[0].demoTrapResistanceScore, "number");
    assert.ok(guarded.canonicalizationApplied.some((item) => String(item).includes("architectureShape")));
    assert.ok(guarded.missingFieldRepairs.some((repair) => String(repair.field).includes("securityAndAbuseResistance")));
  } finally {
    removeRunDir(runDir);
  }
});

test("v1.2 StrategyGenerator rejects empty critical route arrays", () => {
  const runDir = tempRunDir();
  try {
    const badRoute = {
      ...route(1),
      architectureShape: [],
      productCoverage: [],
      risks: [],
      evidenceRefs: [],
      securityAndAbuseResistance: [],
      operationalModel: [],
      pros: [],
      cons: [],
      demoTrapResistanceScore: 7,
    };
    const guarded = guardJsonOutput(
      JSON.stringify([badRoute, route(2), route(3), route(4)]),
      request(runDir),
    );
    assert.equal(guarded.ok, false);
    assert.ok(guarded.qualityChecklistFailures.some((message) => message.includes("architectureShape")));
    assert.ok(guarded.qualityChecklistFailures.some((message) => message.includes("productCoverage")));
    assert.ok(guarded.qualityChecklistFailures.some((message) => message.includes("risks")));
    assert.ok(guarded.qualityChecklistFailures.some((message) => message.includes("evidenceRefs")));
  } finally {
    removeRunDir(runDir);
  }
});