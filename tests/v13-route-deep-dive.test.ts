import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { buildProductIntent } from "../src/lib/product-intent.js";
import { analyzeGoalDomain } from "../src/lib/goal-domain.js";
import { synthesizeCapabilities } from "../src/lib/capability-synthesizer.js";
import { buildEvidenceLedger } from "../src/lib/evidence-ledger.js";
import { reconstructGoal } from "../src/agents/goal-reconstructor.js";
import { expandProductGradeRequirements } from "../src/agents/product-grade-expander.js";
import { generateStrategies } from "../src/agents/strategy-generator.js";
import { buildRouteDeepDive } from "../src/agents/route-deep-dive.js";

const goal = "做一个医院实习轮转管理系统";

function runThinking(args) {
  const result = spawnSync("pnpm", ["think:run", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `think:run failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  const match = result.stdout.match(/Run directory:\s*(.+)/);
  assert.ok(match, "Run directory was not printed.");
  return match[1].trim();
}

function readJson(runDir, fileName) {
  return JSON.parse(readFileSync(path.join(runDir, fileName), "utf8"));
}

function buildFixture() {
  const domainAnalysis = analyzeGoalDomain(goal);
  const productIntent = buildProductIntent(goal, domainAnalysis);
  const initialCapabilities = synthesizeCapabilities(productIntent);
  const evidenceLedger = buildEvidenceLedger({
    rawGoal: goal,
    domainAnalysis,
    productIntent,
    synthesizedCapabilities: initialCapabilities,
  });
  const capabilities = synthesizeCapabilities(productIntent, evidenceLedger);
  const reconstructedIntent = reconstructGoal(goal, domainAnalysis);
  const productExpansion = expandProductGradeRequirements(
    reconstructedIntent,
    domainAnalysis,
    productIntent,
    capabilities,
    evidenceLedger,
  );
  const strategies = generateStrategies(
    reconstructedIntent,
    productExpansion,
    domainAnalysis,
    productIntent,
    capabilities,
    evidenceLedger,
  );
  return { productIntent, productExpansion, strategies, evidenceLedger };
}

test("v1.3 route deep dive artifact is generated offline by default", () => {
  const runDir = runThinking(["--goal", goal, "--mode", "rule"]);
  assert.ok(existsSync(path.join(runDir, "route-deep-dive.json")), "route-deep-dive.json should exist");
  const deepDive = readJson(runDir, "route-deep-dive.json");
  const finalReport = readFileSync(path.join(runDir, "final-thinking-report.md"), "utf8");

  assert.equal(deepDive.onlineResearchEnabled, false);
  assert.ok(deepDive.routeAnalyses.length >= 4);
  assert.ok(deepDive.routeAnalyses.every((analysis) => analysis.technicalImplementationAxes.length >= 4));
  assert.ok(deepDive.routeAnalyses.every((analysis) => analysis.riskRegister.length > 0));
  assert.ok(deepDive.routeAnalyses.every((analysis) => analysis.productizationBar.length >= 4));
  assert.ok(deepDive.routeAnalyses.every((analysis) => analysis.onlineResearch.enabled === false));
  assert.ok(finalReport.includes("## Route Deep Dive"));
});

test("v1.3 route deep dive can collect online research clues with mock fetch", async () => {
  const fixture = buildFixture();
  const html = `
    <html><body>
      <li class="b_algo">
        <h2><a href="https://example.edu/rotation-risk">Clinical rotation scheduling risks</a></h2>
        <p>Scheduling systems must handle supervision, evaluation, privacy, and audit trails.</p>
      </li>
    </body></html>
  `;
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    text: async () => html,
  });

  const deepDive = await buildRouteDeepDive({
    goal,
    ...fixture,
    online: true,
    fetchImpl,
    timeoutMs: 100,
  });

  assert.equal(deepDive.onlineResearchEnabled, true);
  assert.ok(deepDive.routeAnalyses[0].onlineResearch.enabled);
  assert.ok(deepDive.routeAnalyses[0].onlineResearch.queries.length > 0);
  assert.ok(deepDive.routeAnalyses[0].onlineResearch.findings.length > 0);
  assert.ok(deepDive.routeAnalyses[0].onlineResearch.findings[0].url.includes("example.edu"));
});

test("v1.3 still does not add UI surfaces", () => {
  const forbiddenPaths = ["web", "app", "pages", "components", "src/App.tsx", "vite.config.ts"];
  for (const forbiddenPath of forbiddenPaths) {
    assert.equal(existsSync(path.join(process.cwd(), forbiddenPath)), false, `Forbidden UI path exists: ${forbiddenPath}`);
  }
});