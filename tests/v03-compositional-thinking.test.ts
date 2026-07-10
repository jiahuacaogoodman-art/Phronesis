import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const targets = [
  {
    label: "labReservation",
    goal: "做一个实验室设备预约系统",
    requiredText: ["设备", "预约", "冲突", "审批", "使用记录", "资源管理"],
    expectedTasks: ["resource-model", "availability-rules", "conflict-detection", "reservation-workflow", "approval-flow", "notification", "audit-log", "reporting", "admin-console"],
  },
  {
    label: "researchProject",
    goal: "做一个科研项目管理系统",
    requiredText: ["项目", "成员", "里程碑", "任务", "文档", "成果", "进度", "权限"],
    expectedTasks: ["project-model", "task-milestone-workflow", "document-result-management", "progress-tracking", "role-permission", "audit-log", "reporting", "admin-console"],
  },
  {
    label: "clubRegistration",
    goal: "做一个社团活动报名系统",
    requiredText: ["活动", "报名", "名额", "审核", "确认", "通知", "导出", "名单"],
    expectedTasks: ["activity-model", "capacity-rules", "registration-workflow", "approval-flow", "notification", "list-management", "audit-log", "reporting", "admin-console"],
  },
];

const requiredArtifacts = [
  "domain-analysis.json",
  "product-intent.json",
  "product-expansion.json",
  "strategy-candidates.json",
  "anti-simplification-report.json",
  "critic-council-report.json",
  "selected-route.json",
  "execution-task-graph.json",
  "final-thinking-report.md",
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

function searchableIntentAndExpansion(intent, expansion) {
  const capabilities = [
    ...expansion.coreCapabilities,
    ...expansion.operationalCapabilities,
    ...expansion.nonFunctionalRequirements,
  ];
  return JSON.stringify({ intent, capabilities }, null, 2);
}

function intersection(left, right) {
  const rightSet = new Set(right);
  return left.filter((item) => rightSet.has(item));
}

test("v0.3 composes product intent, capabilities, routes, and task graphs for unknown goals", () => {
  const runs = targets.map((target) => {
    const runDir = runThinking(target.goal);
    for (const artifact of requiredArtifacts) {
      assert.ok(existsSync(path.join(runDir, artifact)), `${target.label} missing ${artifact}`);
    }
    const intent = readJson(runDir, "product-intent.json");
    const expansion = readJson(runDir, "product-expansion.json");
    const strategies = readJson(runDir, "strategy-candidates.json");
    const antiSimplification = readJson(runDir, "anti-simplification-report.json");
    const graph = readJson(runDir, "execution-task-graph.json");
    const finalReport = readFileSync(path.join(runDir, "final-thinking-report.md"), "utf8");

    const searchable = searchableIntentAndExpansion(intent, expansion);
    for (const required of target.requiredText) {
      assert.ok(searchable.includes(required), `${target.label} should include ${required}`);
    }

    const taskIds = graph.tasks.map((task) => task.id);
    for (const expectedTask of target.expectedTasks) {
      assert.ok(taskIds.includes(expectedTask), `${target.label} missing task ${expectedTask}`);
    }

    assert.ok(strategies.length >= 4, `${target.label} should generate multiple routes.`);
    assert.ok(strategies.every((strategy) => strategy.routeArchetype), `${target.label} routes should include routeArchetype.`);
    assert.ok(!strategies.every((strategy) => strategy.title === "Product-Grade Web Application"), `${target.label} must not collapse to generic web app.`);
    assert.ok(Array.isArray(antiSimplification.compositionalRuleResults), `${target.label} missing compositionalRuleResults.`);
    assert.ok(antiSimplification.compositionalRuleResults.some((rule) => rule.triggered), `${target.label} should trigger compositional anti-simplification rules.`);
    assert.ok(finalReport.includes("## Product Intent Model"), `${target.label} report missing Product Intent Model section.`);
    assert.ok(finalReport.includes("## Capability Synthesis"), `${target.label} report missing Capability Synthesis section.`);
    assert.ok(finalReport.includes("## Route Synthesis Rationale"), `${target.label} report missing Route Synthesis Rationale section.`);

    return {
      ...target,
      runDir,
      intent,
      expansion,
      strategies,
      antiSimplification,
      taskIds,
    };
  });

  const strategyTitleSets = runs.map((run) => run.strategies.map((strategy) => strategy.title).join("|"));
  assert.equal(new Set(strategyTitleSets).size, 3, "Unknown goals should not share identical strategy title sets.");

  const taskSets = runs.map((run) => run.taskIds.join("|"));
  assert.equal(new Set(taskSets).size, 3, "Unknown goals should not share identical task graphs.");

  assert.equal(intersection(runs[0].taskIds, runs[1].taskIds).includes("reservation-workflow"), false);
  assert.equal(intersection(runs[1].taskIds, runs[2].taskIds).includes("project-model"), false);
});

test("v0.3 still does not add UI surfaces", () => {
  const forbiddenPaths = ["web", "app", "pages", "components", "src/App.tsx", "vite.config.ts"];
  for (const forbiddenPath of forbiddenPaths) {
    assert.equal(existsSync(path.join(process.cwd(), forbiddenPath)), false, `Forbidden UI path exists: ${forbiddenPath}`);
  }
});