import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const goals = [
  {
    label: "attendance",
    goal: "做一个签到系统",
    expectedDomainId: "attendance-checkin",
    requiredCapabilities: ["身份认证", "角色权限", "签到活动管理", "动态二维码", "防代签", "设备绑定", "数据导出", "异常签到审核", "日志审计", "部署方案"],
    requiredTasks: ["authentication", "roles", "activity-management", "dynamic-qr", "checkin-flow", "device-binding", "admin-dashboard", "export", "audit-log", "deployment"],
  },
  {
    label: "medicalQuiz",
    goal: "做一个医学刷题系统",
    expectedDomainId: "medical-quiz-practice",
    requiredCapabilities: ["题库管理", "错题本", "解析管理", "考试模式", "学习进度"],
    requiredTasks: ["question-bank", "taxonomy", "answer-explanation", "practice-flow", "exam-mode", "wrong-question-book", "progress-analytics", "import-export", "content-review", "tests"],
  },
  {
    label: "schedule",
    goal: "做一个课程表管理系统",
    expectedDomainId: "schedule-calendar-management",
    requiredCapabilities: ["课程管理", "时间冲突检测", "教室资源管理", "调课", "日历视图"],
    requiredTasks: ["course-model", "teacher-student-roles", "room-resource-model", "recurrence-rules", "conflict-detection", "rescheduling-flow", "notification", "calendar-view", "import-export", "backup"],
  },
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

function capabilityNames(productExpansion) {
  return [
    ...productExpansion.coreCapabilities,
    ...productExpansion.operationalCapabilities,
    ...productExpansion.nonFunctionalRequirements,
  ].map((capability) => capability.name);
}

function intersection(left, right) {
  const rightSet = new Set(right);
  return left.filter((item) => rightSet.has(item));
}

test("v0.2 generalizes across attendance, medical quiz, and schedule goals", () => {
  const runs = goals.map((item) => {
    const runDir = runThinking(item.goal);
    assert.ok(existsSync(runDir), `Run directory does not exist: ${runDir}`);
    assert.ok(existsSync(path.join(runDir, "domain-analysis.json")), "domain-analysis.json is missing");

    return {
      ...item,
      runDir,
      domain: readJson(runDir, "domain-analysis.json"),
      productExpansion: readJson(runDir, "product-expansion.json"),
      strategies: readJson(runDir, "strategy-candidates.json"),
      taskGraph: readJson(runDir, "execution-task-graph.json"),
    };
  });

  assert.deepEqual(
    runs.map((run) => run.domain.domainId),
    goals.map((goal) => goal.expectedDomainId),
  );
  assert.equal(new Set(runs.map((run) => run.domain.domainId)).size, 3, "Domain ids should be distinct.");

  for (const run of runs) {
    const names = capabilityNames(run.productExpansion);
    for (const requiredCapability of run.requiredCapabilities) {
      assert.ok(names.includes(requiredCapability), `${run.label} missing capability: ${requiredCapability}`);
    }

    const taskIds = run.taskGraph.tasks.map((task) => task.id);
    for (const requiredTask of run.requiredTasks) {
      assert.ok(taskIds.includes(requiredTask), `${run.label} missing task: ${requiredTask}`);
    }
  }

  const capabilitySets = runs.map((run) => capabilityNames(run.productExpansion).join("|"));
  assert.equal(new Set(capabilitySets).size, 3, "Capability maps should not collapse into one template.");

  const forbiddenCheckinCapabilities = ["动态二维码", "防代签", "设备绑定"];
  for (const label of ["medicalQuiz", "schedule"]) {
    const run = runs.find((item) => item.label === label);
    const names = capabilityNames(run.productExpansion);
    assert.equal(
      intersection(names, forbiddenCheckinCapabilities).length,
      0,
      `${label} should not inherit check-in-only capabilities.`,
    );
  }

  const strategyTitleSets = runs.map((run) => run.strategies.map((strategy) => strategy.title));
  assert.equal(new Set(strategyTitleSets.map((titles) => titles.join("|"))).size, 3, "Strategy titles should differ by domain.");
  assert.equal(intersection(strategyTitleSets[0], strategyTitleSets[1]).length, 0, "Attendance and medical strategy titles should differ.");
  assert.equal(intersection(strategyTitleSets[0], strategyTitleSets[2]).length, 0, "Attendance and schedule strategy titles should differ.");
  assert.equal(intersection(strategyTitleSets[1], strategyTitleSets[2]).length, 0, "Medical and schedule strategy titles should differ.");

  const taskIdSets = runs.map((run) => run.taskGraph.tasks.map((task) => task.id));
  assert.equal(new Set(taskIdSets.map((ids) => ids.join("|"))).size, 3, "Task graphs should differ by domain.");
});

test("v0.2 does not add UI surfaces", () => {
  const forbiddenPaths = [
    "web",
    "app",
    "pages",
    "components",
    "src/App.tsx",
    "vite.config.ts",
  ];

  for (const forbiddenPath of forbiddenPaths) {
    assert.equal(existsSync(path.join(process.cwd(), forbiddenPath)), false, `Forbidden UI path exists: ${forbiddenPath}`);
  }
});