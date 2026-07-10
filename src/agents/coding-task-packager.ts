import type { ExecutionTask } from "../types/artifacts.js";
import type { CodingHandoffSourceArtifacts, CodingHandoffStatus, CodingTaskPackage, PreCodingResolutionPack } from "../types/coding-handoff.js";

type TechnicalRoute = CodingHandoffSourceArtifacts["technicalRoutePlan"]["routes"][number];
type IntegrationItem = CodingHandoffSourceArtifacts["technicalSolutionIntegrationPlan"]["items"][number];

export interface PreCodingMarkdownTask {
  fileName: string;
  markdown: string;
}

function uniq(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)));
}

function slug(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64) || "task";
}

function relevantIntegrationItems(artifacts: CodingHandoffSourceArtifacts, task: ExecutionTask): IntegrationItem[] {
  const taskText = JSON.stringify(task);
  return (artifacts.technicalSolutionIntegrationPlan?.items ?? [])
    .filter((item) => {
      const itemText = `${item.problemStatement} ${item.selectedSolution} ${JSON.stringify(item.dataModelChanges)} ${JSON.stringify(item.workflowChanges)}`;
      return task.derivedFromRisks?.some((risk) => itemText.includes(risk)) ||
        task.derivedFromCapabilities?.some((capability) => itemText.includes(capability)) ||
        itemText.includes(task.title) ||
        taskText.includes(item.problemId);
    })
    .slice(0, 4);
}

function selectedTechnicalRoute(artifacts: CodingHandoffSourceArtifacts): TechnicalRoute | undefined {
  return (artifacts.technicalRoutePlan?.routes ?? []).find((route) => route.strategyId === artifacts.selectedRoute.selectedStrategyId) ??
    (artifacts.technicalRoutePlan?.routes ?? [])[0];
}

function requirementsFromRoute(route: TechnicalRoute | undefined, key: "data" | "workflow" | "permission" | "audit" | "test"): string[] {
  if (!route) return [];
  if (key === "data") return [
    ...(route.databaseModel?.entities ?? []).map((entity) => `${entity.name}: ${(entity.fields ?? []).slice(0, 5).join(", ")}`),
    ...(route.databaseModel?.constraints ?? []),
  ].slice(0, 12);
  if (key === "workflow") return [
    ...(route.stateMachines ?? []).map((machine) => `${machine.name}: ${(machine.states ?? []).join(" -> ")}`),
    ...(route.approvalWorkflowModel?.workflows ?? []),
    ...(route.conflictDetectionModel?.rules ?? []),
  ].slice(0, 12);
  if (key === "permission") return [
    ...(route.permissionModel?.resourceActions ?? []),
    ...(route.permissionModel?.boundaries ?? []),
  ].slice(0, 12);
  if (key === "audit") return [
    ...(route.auditLogModel?.events ?? []),
    ...(route.auditLogModel?.actorContext ?? []),
    ...(route.auditLogModel?.retention ?? []),
  ].slice(0, 12);
  if (key === "test") return route.testingPlan ?? [];
  return [];
}

export function buildCodingTaskPackages(artifacts: CodingHandoffSourceArtifacts, handoffStatus: CodingHandoffStatus): CodingTaskPackage[] {
  if (handoffStatus === "blocked") return [];
  const route = selectedTechnicalRoute(artifacts);
  const sourceArtifacts = [
    "execution-task-graph.json",
    "technical-route-plan.json",
    "problem-resolution-plan.json",
    "technical-solution-integration-plan.json",
    "selected-route.json",
  ];
  return (artifacts.executionTaskGraph.tasks ?? [])
    .filter((task) => !task.shouldBlockCodingUntilResolved)
    .map((task) => {
      const integrations = relevantIntegrationItems(artifacts, task);
      const stopConditions = uniq([
        ...(artifacts.selectedRoute.requiredClarificationsBeforeCoding ?? []),
        ...(task.requiredEvidenceBeforeExecution ?? []),
        ...(handoffStatus === "conditional" ? ["Stop if implementation requires scope outside approved handoff.", "Stop if repository reality conflicts with planning artifacts."] : []),
      ]);
      return {
        taskId: task.id,
        title: task.title,
        planningSource: sourceArtifacts,
        goal: artifacts.goal.rawGoal,
        implementationIntent: task.purpose,
        inputArtifacts: sourceArtifacts,
        expectedOutputs: task.deliverables ?? [],
        allowedChangeAreas: [
          "Only files/modules discovered by the future Coding Agent as directly necessary for this approved task.",
          `Task scope: ${task.title}`,
          ...integrations.flatMap((item) => item.serviceLayerChanges ?? []).slice(0, 4),
        ],
        forbiddenChangeAreas: [
          "Do not implement tasks outside this task package.",
          "Do not reinterpret product scope.",
          "Do not add unrelated UI, dashboard, terminal, diff viewer, or landing page work.",
          "Do not modify repository-wide architecture without an explicit task package.",
        ],
        dependencies: task.dependsOn ?? [],
        dataModelRequirements: uniq([
          ...requirementsFromRoute(route, "data"),
          ...integrations.flatMap((item) => item.dataModelChanges ?? []),
        ]).slice(0, 16),
        workflowRequirements: uniq([
          ...requirementsFromRoute(route, "workflow"),
          ...integrations.flatMap((item) => item.workflowChanges ?? []),
        ]).slice(0, 16),
        permissionRequirements: uniq([
          ...requirementsFromRoute(route, "permission"),
          ...integrations.flatMap((item) => item.permissionChanges ?? []),
        ]).slice(0, 16),
        auditRequirements: uniq([
          ...requirementsFromRoute(route, "audit"),
          ...integrations.flatMap((item) => item.auditChanges ?? []),
        ]).slice(0, 16),
        validationRules: uniq([
          ...(task.acceptanceCriteria ?? []),
          ...integrations.flatMap((item) => item.workflowChanges ?? []),
          ...integrations.flatMap((item) => item.dataModelChanges ?? []),
        ]).slice(0, 16),
        testRequirements: uniq([
          ...(task.verificationHint ? [task.verificationHint] : []),
          ...requirementsFromRoute(route, "test"),
          ...integrations.flatMap((item) => item.testingChanges ?? []),
        ]).slice(0, 16),
        acceptanceCriteria: task.acceptanceCriteria ?? [],
        riskNotes: uniq([
          ...(task.derivedFromRisks ?? []),
          ...(task.evidenceGapRisk ? [`Evidence gap risk: ${task.evidenceGapRisk}`] : []),
          ...integrations.map((item) => item.impactsCodingReadiness),
        ]).slice(0, 12),
        stopConditions,
      };
    });
}

export function buildPreCodingTaskMarkdownTasks(preCodingPack: PreCodingResolutionPack): PreCodingMarkdownTask[] {
  const templates = [
    {
      fileName: "clarify-user-scale.md",
      title: "Clarify User Scale",
      body: ["Confirm expected student, mentor, department, admin, and semester/batch volumes.", "Decide whether scheduling optimization pressure exists in phase one."],
    },
    {
      fileName: "clarify-integration-systems.md",
      title: "Clarify Integration Systems",
      body: ["List identity, HR, education affairs, attendance, notification, archive, and export systems.", "Confirm ownership, API availability, sync frequency, and failure handling."],
    },
    {
      fileName: "clarify-workflow-policy.md",
      title: "Clarify Workflow Policy",
      body: ["Confirm leave types, make-up rotation rules, mentor responsibility windows, evaluation ownership, appeals, and approval chains."],
    },
    {
      fileName: "clarify-data-retention.md",
      title: "Clarify Data Retention",
      body: ["Confirm audit retention, archive export, privacy boundaries, sensitive access logging, and post-archive accountability needs."],
    },
  ];
  return templates.map((task) => ({
    fileName: task.fileName,
    markdown: [
      `# ${task.title}`,
      "",
      "This is a pre-coding clarification task. Do not implement code.",
      "",
      "## Why This Blocks Coding",
      ...(preCodingPack.blockingReasons ?? []).slice(0, 6).map((item) => `- ${item}`),
      "",
      "## Work To Do",
      ...task.body.map((item) => `- ${item}`),
      "",
      "## Evidence To Bring Back",
      ...(preCodingPack.requiredClarifications ?? []).slice(0, 6).map((item) => `- ${item}`),
      "",
      "## Stop Conditions",
      "- Do not create files.",
      "- Do not modify repository.",
      "- Return clarified decisions only.",
    ].join("\n"),
  }));
}

export function taskPackageFileName(taskPackage: CodingTaskPackage): string {
  return `${slug(taskPackage.taskId)}.json`;
}