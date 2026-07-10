import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

test("v0.1 baseline CLI produces core thinking artifacts", () => {
  const result = spawnSync("pnpm", ["think:run", "--goal", "做一个签到系统"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.equal(result.status, 0, `think:run failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  const match = result.stdout.match(/Run directory:\s*(.+)/);
  assert.ok(match, "Run directory was not printed.");
  const runDir = match[1].trim();

  for (const artifact of [
    "goal.json",
    "reconstructed-intent.json",
    "product-expansion.json",
    "research-plan.json",
    "evidence-map.json",
    "strategy-candidates.json",
    "anti-simplification-report.json",
    "critic-council-report.json",
    "selected-route.json",
    "architecture-plan.md",
    "execution-task-graph.json",
    "final-thinking-report.md",
  ]) {
    assert.ok(existsSync(path.join(runDir, artifact)), `Missing baseline artifact: ${artifact}`);
  }
});