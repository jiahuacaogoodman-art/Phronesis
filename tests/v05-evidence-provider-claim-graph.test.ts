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

test("v0.5 produces provider-backed evidence, claim graph, and source quality", () => {
  for (const goal of goals) {
    const runDir = runThinking(goal);
    for (const fileName of ["evidence-ledger.json", "claim-graph.json", "decision-ledger.json"]) {
      assert.ok(existsSync(path.join(runDir, fileName)), `missing ${fileName}`);
    }

    const evidenceLedger = readJson(runDir, "evidence-ledger.json");
    const claimGraph = readJson(runDir, "claim-graph.json");
    const decisionLedger = readJson(runDir, "decision-ledger.json");
    const selectedRoute = readJson(runDir, "selected-route.json");
    const taskGraph = readJson(runDir, "execution-task-graph.json");
    const finalReport = readFileSync(path.join(runDir, "final-thinking-report.md"), "utf8");

    for (const key of [
      "providersUsed",
      "sourceQualitySummary",
      "weakEvidenceWarnings",
      "routeEvidenceCoverage",
      "decisionEvidenceCoverage",
    ]) {
      assert.ok(evidenceLedger[key], `evidence-ledger missing ${key}`);
    }

    const sourceTypes = new Set(evidenceLedger.evidenceItems.map((item) => item.sourceType));
    assert.ok(sourceTypes.size >= 4, "expected at least four evidence source types");

    const verificationStatuses = new Set(evidenceLedger.evidenceItems.map((item) => item.verificationStatus));
    assert.ok(verificationStatuses.has("observed"), "expected observed evidence");
    assert.ok(verificationStatuses.has("inferred"), "expected inferred evidence");
    assert.ok(verificationStatuses.has("assumed"), "expected assumed evidence");
    assert.ok(verificationStatuses.has("missing") || verificationStatuses.has("unverified"), "expected missing or unverified evidence");

    const qualities = new Set(evidenceLedger.evidenceItems.map((item) => item.sourceQuality));
    assert.ok(!(qualities.size === 1 && qualities.has("high")), "evidence quality must not all be high");

    for (const key of ["claims", "links", "unsupportedClaims", "contestedClaims", "decisionCriticalClaims"]) {
      assert.ok(claimGraph[key], `claim-graph missing ${key}`);
    }

    const claimTypes = new Set(claimGraph.claims.map((claim) => claim.claimType));
    for (const claimType of ["intent", "capability", "route", "risk", "critic-objection", "decision", "task"]) {
      assert.ok(claimTypes.has(claimType), `claim graph missing ${claimType} claims`);
    }

    for (const key of [
      "routeEvidenceCoverage",
      "decisiveClaims",
      "contestedClaims",
      "weakClaimsAccepted",
      "evidenceGapsAccepted",
      "whyAcceptedDespiteGaps",
      "routeSwitchTriggers",
    ]) {
      assert.ok(selectedRoute[key], `selected-route missing ${key}`);
    }

    const specificSelectedEvidence = selectedRoute.evidenceRefs.filter((ref) =>
      ref.startsWith("E-ROUTE") || ref.startsWith("E-RISK") || ref.startsWith("E-CRITIC") || ref.startsWith("C-")
    );
    assert.ok(specificSelectedEvidence.length >= 2, "selected route must cite route/risk/critic/claim-specific evidence");

    for (const decision of decisionLedger.decisions) {
      assert.ok(Array.isArray(decision.decisiveClaimRefs), `decision ${decision.id} missing decisiveClaimRefs`);
      assert.ok(Array.isArray(decision.contestedClaimRefs), `decision ${decision.id} missing contestedClaimRefs`);
      assert.ok(Array.isArray(decision.acceptedEvidenceGaps), `decision ${decision.id} missing acceptedEvidenceGaps`);
      assert.equal(typeof decision.evidenceCoverageScore, "number", `decision ${decision.id} missing evidenceCoverageScore`);
    }

    for (const task of taskGraph.tasks) {
      assert.ok(Array.isArray(task.claimRefs), `task ${task.id} missing claimRefs`);
      assert.ok(Array.isArray(task.requiredEvidenceBeforeExecution), `task ${task.id} missing requiredEvidenceBeforeExecution`);
      assert.ok(["low", "medium", "high"].includes(task.evidenceGapRisk), `task ${task.id} missing evidenceGapRisk`);
      assert.equal(typeof task.shouldBlockCodingUntilResolved, "boolean", `task ${task.id} missing shouldBlockCodingUntilResolved`);
    }

    for (const section of [
      "Evidence Provider Summary",
      "Source Quality Summary",
      "Claim Graph Summary",
      "Unsupported Claims",
      "Contested Claims",
      "Evidence Gaps Accepted",
      "Decisions That Should Be Revisited Before Coding",
    ]) {
      assert.ok(finalReport.includes(section), `final report missing ${section}`);
    }
  }
});

test("v0.5 still does not add UI surfaces", () => {
  const forbiddenPaths = ["web", "app", "pages", "components", "src/App.tsx", "vite.config.ts"];
  for (const forbiddenPath of forbiddenPaths) {
    assert.equal(existsSync(path.join(process.cwd(), forbiddenPath)), false, `Forbidden UI path exists: ${forbiddenPath}`);
  }
});