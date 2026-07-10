import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const goals = [
  "做一个实验室设备预约系统",
  "做一个科研项目管理系统",
  "做一个社团活动报名系统",
];

function runThinking(goal) {
  const result = spawnSync("pnpm", ["think:run", "--goal", goal], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `think:run failed for ${goal}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  const match = result.stdout.match(/Run directory:\s*(.+)/);
  assert.ok(match, `Run directory was not printed for ${goal}`);
  return match[1].trim();
}

function readJson(runDir, fileName) {
  return JSON.parse(readFileSync(path.join(runDir, fileName), "utf8"));
}

test("v0.4 produces evidence-driven decisions for compositional goals", () => {
  for (const goal of goals) {
    const runDir = runThinking(goal);
    assert.ok(existsSync(path.join(runDir, "evidence-ledger.json")), "missing evidence-ledger.json");
    assert.ok(existsSync(path.join(runDir, "decision-ledger.json")), "missing decision-ledger.json");

    const evidenceLedger = readJson(runDir, "evidence-ledger.json");
    const decisionLedger = readJson(runDir, "decision-ledger.json");
    const expansion = readJson(runDir, "product-expansion.json");
    const strategies = readJson(runDir, "strategy-candidates.json");
    const criticReport = readJson(runDir, "critic-council-report.json");
    const selectedRoute = readJson(runDir, "selected-route.json");
    const taskGraph = readJson(runDir, "execution-task-graph.json");
    const finalReport = readFileSync(path.join(runDir, "final-thinking-report.md"), "utf8");

    assert.ok(evidenceLedger.evidenceItems.length >= 8, "expected at least 8 evidence items");
    assert.ok(evidenceLedger.assumptions.length >= 3, "expected at least 3 assumptions");
    assert.ok(evidenceLedger.missingEvidence.length >= 3, "expected at least 3 missing evidence entries");
    assert.ok(evidenceLedger.inferredClaims.length >= 3, "expected at least 3 inferred claims");
    assert.ok(decisionLedger.decisions.length >= 5, "expected multiple ledger decisions");

    const capabilities = [
      ...expansion.coreCapabilities,
      ...expansion.operationalCapabilities,
      ...expansion.nonFunctionalRequirements,
    ];
    for (const capability of capabilities) {
      assert.ok(Array.isArray(capability.evidenceRefs), `capability ${capability.id} missing evidenceRefs`);
      assert.equal(typeof capability.confidence, "number", `capability ${capability.id} missing confidence`);
    }

    for (const strategy of strategies) {
      assert.ok(Array.isArray(strategy.evidenceRefs), `strategy ${strategy.id} missing evidenceRefs`);
      assert.equal(typeof strategy.confidence, "number", `strategy ${strategy.id} missing confidence`);
      assert.ok(strategy.tradeoffSummary, `strategy ${strategy.id} missing tradeoffSummary`);
      assert.ok(strategy.missingEvidenceImpact, `strategy ${strategy.id} missing missingEvidenceImpact`);
    }

    for (const review of criticReport.reviews) {
      assert.ok(Array.isArray(review.evidenceRefs), `review ${review.critic}/${review.strategyId} missing evidenceRefs`);
      assert.ok(["low", "medium", "high"].includes(review.disagreementLevel), `review ${review.critic}/${review.strategyId} missing disagreementLevel`);
    }
    assert.ok(criticReport.reviews.filter((review) => review.disagreementLevel === "high").length >= 1, "expected at least one high disagreement");
    assert.ok(criticReport.reviews.filter((review) => review.disagreementLevel === "medium").length >= 2, "expected at least two medium disagreements");

    assert.ok(Array.isArray(selectedRoute.evidenceRefs), "selectedRoute missing evidenceRefs");
    assert.ok(Array.isArray(selectedRoute.decisionRefs), "selectedRoute missing decisionRefs");
    assert.equal(typeof selectedRoute.confidence, "number", "selectedRoute missing confidence");
    assert.ok(selectedRoute.selectionScoreBreakdown, "selectedRoute missing selectionScoreBreakdown");
    assert.ok(Array.isArray(selectedRoute.dissentSummary), "selectedRoute missing dissentSummary");
    assert.ok(Array.isArray(selectedRoute.missingEvidenceThatCouldChangeDecision), "selectedRoute missing missingEvidenceThatCouldChangeDecision");

    for (const task of taskGraph.tasks) {
      assert.ok(Array.isArray(task.evidenceRefs), `task ${task.id} missing evidenceRefs`);
      assert.ok(Array.isArray(task.decisionRefs), `task ${task.id} missing decisionRefs`);
      assert.ok(Array.isArray(task.derivedFromCapabilities), `task ${task.id} missing derivedFromCapabilities`);
      assert.ok(task.verificationHint, `task ${task.id} missing verificationHint`);
    }

    for (const section of [
      "Evidence Ledger Summary",
      "Decision Ledger Summary",
      "Assumption Register",
      "Missing Evidence",
      "Dissent and Tradeoffs",
      "Conditions to Revisit Decisions",
    ]) {
      assert.ok(finalReport.includes(section), `final report missing ${section}`);
    }
  }
});

test("v0.4 still does not add UI surfaces", () => {
  const forbiddenPaths = ["web", "app", "pages", "components", "src/App.tsx", "vite.config.ts"];
  for (const forbiddenPath of forbiddenPaths) {
    assert.equal(existsSync(path.join(process.cwd(), forbiddenPath)), false, `Forbidden UI path exists: ${forbiddenPath}`);
  }
});