import type {
  DomainAnalysis,
  EvidenceLedger,
  ExecutionTask,
  ExecutionTaskGraph,
  ProductIntentModel,
  SelectedRoute,
  SynthesizedCapability,
} from "../types/artifacts.ts";

function task(
  id: string,
  title: string,
  dependsOn: string[],
  ownerAgent: string,
  purpose: string,
  deliverables: string[],
  acceptanceCriteria: string[],
  riskLevel: ExecutionTask["riskLevel"],
): ExecutionTask {
  return { id, title, dependsOn, ownerAgent, purpose, deliverables, acceptanceCriteria, riskLevel };
}

function hasAny(values, signals) {
  const joined = values.join(" ").toLowerCase();
  return signals.some((signal) => joined.includes(signal.toLowerCase()));
}

function add(tasks: ExecutionTask[], next: ExecutionTask) {
  if (!tasks.some((taskItem) => taskItem.id === next.id)) {
    tasks.push(next);
  }
}

function attendanceTasks() {
  return [
    task("authentication", "Define authentication model", [], "SecurityArchitectureAgent", "Specify identity assumptions and sign-in boundaries.", ["authentication-model.md"], ["Identity states and failure states are explicit."], "high"),
    task("roles", "Define roles and permissions", ["authentication"], "ProductSpecAgent", "Define participant, organizer, reviewer, admin, and auditor powers.", ["role-permission-matrix.md"], ["Each role/action pair is covered."], "high"),
    task("activity-management", "Design check-in activity management", ["roles"], "ProductSpecAgent", "Define event, roster, time window, policy, and lifecycle rules.", ["activity-management-spec.md"], ["Activity lifecycle covers draft, active, closed, export, and archived states."], "medium"),
    task("dynamic-qr", "Specify dynamic QR/token lifecycle", ["activity-management"], "BackendArchitectureAgent", "Define QR/token generation, rotation, expiry, and server validation.", ["dynamic-qr-token-spec.md"], ["Expired, reused, and malformed tokens are rejected."], "high"),
    task("checkin-flow", "Specify participant check-in flow", ["dynamic-qr"], "UXFlowAgent", "Map participant states from scan to success, duplicate, expired, and review-required.", ["checkin-flow.md"], ["Happy path and failure states are represented."], "medium"),
    task("device-binding", "Specify device binding and risk signals", ["checkin-flow"], "SecurityCriticAgent", "Define privacy-aware device memory, reset, and suspicious behavior handling.", ["device-binding-risk-spec.md"], ["Device and risk signals have privacy and appeal boundaries."], "high"),
    task("admin-dashboard", "Plan admin management surface", ["roles", "activity-management", "device-binding"], "FrontendArchitectureAgent", "Plan admin activity, roster, review, settings, and status surfaces without implementing UI.", ["admin-surface-plan.md"], ["No UI code is created; surfaces are planning artifacts only."], "medium"),
    task("export", "Specify export and reporting", ["activity-management"], "DataModelAgent", "Define export fields, filters, file formats, and status semantics.", ["export-spec.md"], ["Exports include attendance status, review notes, and metadata."], "medium"),
    task("audit-log", "Specify audit log", ["roles", "export"], "SecurityArchitectureAgent", "Define immutable audit events for sensitive actions and record changes.", ["audit-log-spec.md"], ["Audit events cover login, config, review, export, and policy changes."], "high"),
    task("deployment", "Plan deployment and operations", ["admin-dashboard", "audit-log"], "DevOpsPlanningAgent", "Define runtime topology, backups, monitoring, configuration, and runbook.", ["deployment-plan.md", "ops-runbook.md"], ["Plan states how the system runs outside a laptop."], "medium"),
  ];
}

function medicalQuizTasks() {
  return [
    task("question-bank", "Design question bank model", [], "DataModelAgent", "Define question, option, answer, source, and version models.", ["question-bank-model.md"], ["Question lifecycle and versioning are explicit."], "high"),
    task("taxonomy", "Design taxonomy and tags", ["question-bank"], "ContentArchitectureAgent", "Define subject, chapter, knowledge point, difficulty, and question type taxonomy.", ["taxonomy-spec.md"], ["Each question can be classified by learning-relevant dimensions."], "high"),
    task("answer-explanation", "Specify answer and explanation management", ["question-bank", "taxonomy"], "ContentReviewAgent", "Define explanations, option analysis, source notes, and correction workflow.", ["explanation-management-spec.md"], ["Explanations can be edited, reviewed, and traced."], "high"),
    task("practice-flow", "Specify practice flow", ["answer-explanation"], "UXFlowAgent", "Map learner flow for answering, viewing explanation, collecting, and continuing.", ["practice-flow.md"], ["Practice states include answer, feedback, explanation, next, and review."], "medium"),
    task("exam-mode", "Design exam mode and scoring", ["question-bank", "taxonomy"], "LearningEngineAgent", "Define timed sessions, submission, scoring, review, and result records.", ["exam-mode-spec.md"], ["Exam mode has deterministic scoring and review states."], "high"),
    task("wrong-question-book", "Design wrong-question book", ["practice-flow", "exam-mode"], "LearningEngineAgent", "Define automatic wrong-question capture, removal, retry, and mastery state.", ["wrong-question-book-spec.md"], ["Wrong questions can be reviewed and cleared through defined rules."], "medium"),
    task("progress-analytics", "Specify learning progress analytics", ["wrong-question-book", "taxonomy"], "AnalyticsAgent", "Define progress, accuracy, weak knowledge points, trends, and dashboards as data specs only.", ["progress-analytics-spec.md"], ["Analytics formulas and data sources are documented."], "medium"),
    task("import-export", "Specify question import/export", ["question-bank", "taxonomy"], "DataOpsAgent", "Define templates, validation, error reporting, export, and backup boundaries.", ["question-import-export-spec.md"], ["Invalid imports produce actionable validation reports."], "medium"),
    task("content-review", "Design content review workflow", ["answer-explanation", "import-export"], "ContentReviewAgent", "Define draft, review, publish, reject, correct, and retire states.", ["content-review-workflow.md"], ["Only approved content is published to learners."], "high"),
    task("tests", "Plan domain acceptance tests", ["practice-flow", "exam-mode", "wrong-question-book", "progress-analytics", "content-review"], "TestingStrategyAgent", "Define tests for scoring, explanations, wrong-question behavior, progress stats, import validation, and review workflow.", ["acceptance-test-plan.md"], ["Every core learning loop has test coverage."], "high"),
  ];
}

function scheduleTasks() {
  return [
    task("course-model", "Design course model", [], "DataModelAgent", "Define course, class, section, time slot, term, and schedule state.", ["course-model.md"], ["Course lifecycle and schedule state are explicit."], "high"),
    task("teacher-student-roles", "Define teacher/student roles", ["course-model"], "SecurityArchitectureAgent", "Define visibility and change permissions for students, teachers, administrators, and room managers.", ["schedule-permission-matrix.md"], ["Role/action boundaries are explicit."], "high"),
    task("room-resource-model", "Design room resource model", ["course-model"], "ResourcePlanningAgent", "Define room capacity, equipment, location, availability, and occupancy.", ["room-resource-model.md"], ["Room constraints can be used by conflict detection."], "high"),
    task("recurrence-rules", "Specify recurrence rules", ["course-model"], "SchedulingRulesAgent", "Define weekly, odd/even week, date exception, holiday, and end rules.", ["recurrence-rules-spec.md"], ["Recurring courses expand predictably across a term."], "high"),
    task("conflict-detection", "Design conflict detection", ["teacher-student-roles", "room-resource-model", "recurrence-rules"], "SchedulingRulesAgent", "Define teacher, student, class, room, and time conflicts.", ["conflict-detection-spec.md"], ["Conflicts are detected before publish or change approval."], "high"),
    task("rescheduling-flow", "Specify rescheduling and suspension flow", ["conflict-detection"], "WorkflowAgent", "Define adjustment, suspension, approval, audit, and affected-user handling.", ["rescheduling-flow.md"], ["调课 and 停课 flows include validation and notification hooks."], "high"),
    task("notification", "Plan notification events", ["rescheduling-flow"], "NotificationPlanningAgent", "Define change events, recipients, channels, templates, and retry expectations.", ["notification-plan.md"], ["Affected users receive relevant schedule-change notices."], "medium"),
    task("calendar-view", "Plan calendar views", ["recurrence-rules", "notification"], "FrontendArchitectureAgent", "Define day/week/month, personal, class, teacher, and room calendar projections without implementing UI.", ["calendar-view-plan.md"], ["No UI code is created; views are planning artifacts only."], "medium"),
    task("import-export", "Specify import/export and validation", ["course-model", "conflict-detection"], "DataOpsAgent", "Define import templates, validation reports, export formats, and conflict feedback.", ["schedule-import-export-spec.md"], ["Import reports missing fields, conflicts, duplicates, and invalid recurrence."], "medium"),
    task("backup", "Plan backup and recovery", ["import-export", "rescheduling-flow"], "DevOpsPlanningAgent", "Define backup, restore, change audit, and recovery operations.", ["backup-recovery-plan.md"], ["Schedule data can be restored and important changes are traceable."], "medium"),
  ];
}

function compositionalTasks(intent: ProductIntentModel) {
  const tasks: ExecutionTask[] = [];
  add(tasks, task("resource-model", "Model core resources", [], "DataModelAgent", `Model ${intent.coreResources.slice(0, 4).join("、")}.`, ["resource-model.md"], ["Core resources, identifiers, ownership, and states are defined."], "high"));
  add(tasks, task("role-permission", "Define roles and permissions", ["resource-model"], "SecurityArchitectureAgent", `Define access for ${[...intent.primaryActors, ...intent.secondaryActors].join("、")}.`, ["role-permission-matrix.md"], ["Every actor/resource/action boundary is explicit."], "high"));
  add(tasks, task("lifecycle-state-machine", "Define lifecycle state machine", ["resource-model"], "WorkflowAgent", `Define stages ${intent.lifecycleStages.join("、")}.`, ["lifecycle-state-machine.md"], ["All important state transitions and rejected transitions are defined."], "high"));

  if (hasAny([...intent.coreWorkflows, ...intent.riskSurfaces, ...intent.coreResources], ["预约", "时段", "设备", "实验室"])) {
    add(tasks, task("availability-rules", "Define availability rules", ["resource-model"], "SchedulingRulesAgent", "Define available slots, blackout windows, ownership, and reservation limits.", ["availability-rules.md"], ["Availability can be validated before reservation."], "high"));
    add(tasks, task("conflict-detection", "Define conflict detection", ["availability-rules"], "SchedulingRulesAgent", "Detect duplicate reservations, time overlap, capacity, and resource conflicts.", ["conflict-detection.md"], ["Conflicts are detected before approval or confirmation."], "high"));
    add(tasks, task("reservation-workflow", "Design reservation workflow", ["conflict-detection", "role-permission"], "WorkflowAgent", "Design request, approval, cancellation, usage, and exception states.", ["reservation-workflow.md"], ["Reservation lifecycle covers pending, approved, cancelled, used, and abnormal states."], "high"));
  }

  if (hasAny(intent.coreWorkflows, ["审批", "审核", "确认"])) {
    add(tasks, task("approval-flow", "Design approval/review flow", ["role-permission", "lifecycle-state-machine"], "WorkflowAgent", "Define queue, reviewer powers, approve/reject actions, and comments.", ["approval-flow.md"], ["Approval decisions change state and write audit events."], "high"));
  }

  if (hasAny([...intent.coreResources, ...intent.coreWorkflows], ["题目", "题库", "知识点", "学习", "解析"])) {
    add(tasks, task("content-model", "Design content model", ["resource-model"], "ContentArchitectureAgent", "Define content entities, versions, publishing states, and ownership.", ["content-model.md"], ["Content can be created, reviewed, published, corrected, and retired."], "high"));
    add(tasks, task("taxonomy", "Design taxonomy", ["content-model"], "ContentArchitectureAgent", "Define classification, tags, difficulty, chapters, and knowledge points.", ["taxonomy.md"], ["Content can be filtered and reported by taxonomy."], "medium"));
    add(tasks, task("learning-flow", "Design learning flow", ["taxonomy"], "LearningEngineAgent", "Define practice, review, collection, wrong-item retry, and completion states.", ["learning-flow.md"], ["Learning workflow has records and review states."], "medium"));
    add(tasks, task("progress-tracking", "Plan progress tracking", ["learning-flow"], "AnalyticsAgent", "Define progress records, mastery, trends, and weak-area signals.", ["progress-tracking.md"], ["Progress metrics have explicit formulas."], "medium"));
    add(tasks, task("review-system", "Design content review system", ["content-model"], "ContentReviewAgent", "Define draft, review, correction, publish, and takedown workflow.", ["review-system.md"], ["Only approved content enters user-facing flow."], "high"));
  }

  if (hasAny([...intent.coreResources, ...intent.coreWorkflows], ["课程", "日历", "排课", "调课", "教室"])) {
    add(tasks, task("recurrence-rules", "Specify recurrence rules", ["resource-model"], "SchedulingRulesAgent", "Define repeated time rules, exceptions, and end conditions.", ["recurrence-rules.md"], ["Recurring events expand predictably."], "high"));
    add(tasks, task("calendar-view", "Plan calendar view", ["recurrence-rules"], "FrontendArchitectureAgent", "Define calendar projections as planning artifacts only.", ["calendar-view-plan.md"], ["No UI code is created; only view-state planning exists."], "medium"));
    add(tasks, task("rescheduling-flow", "Design rescheduling flow", ["conflict-detection"], "WorkflowAgent", "Define change requests, validation, notification, and audit.", ["rescheduling-flow.md"], ["Changes validate conflicts and notify affected users."], "high"));
  }

  if (hasAny(intent.coreWorkflows, ["项目", "成员", "任务", "里程碑", "文档", "成果", "进度"])) {
    add(tasks, task("project-model", "Design project model", ["resource-model"], "ProjectArchitectureAgent", "Define project, member, milestone, task, document, result, and progress records.", ["project-model.md"], ["Project collaboration entities and ownership are explicit."], "high"));
    add(tasks, task("task-milestone-workflow", "Design task and milestone workflow", ["project-model", "role-permission"], "WorkflowAgent", "Define assignment, status, due dates, evidence, and completion review.", ["task-milestone-workflow.md"], ["Tasks and milestones can be tracked and reviewed."], "high"));
    add(tasks, task("document-result-management", "Plan document and result management", ["project-model"], "CollaborationAgent", "Define versioning, permissions, attachments, outputs, and attribution.", ["document-result-management.md"], ["Documents and成果 are traceable."], "medium"));
    add(tasks, task("progress-tracking", "Plan progress tracking", ["task-milestone-workflow"], "AnalyticsAgent", "Define progress indicators, milestone health, and completion reporting.", ["progress-tracking.md"], ["Project progress has explicit metrics."], "medium"));
  }

  if (hasAny(intent.coreWorkflows, ["报名", "活动", "名额", "名单"])) {
    add(tasks, task("activity-model", "Design activity model", ["resource-model"], "DataModelAgent", "Define activity, registration form, capacity, attendee list, and status.", ["activity-model.md"], ["Activity registration entities and capacity rules are explicit."], "high"));
    add(tasks, task("capacity-rules", "Define capacity and quota rules", ["activity-model"], "RulesAgent", "Define capacity, waitlist, duplicate registration, and eligibility rules.", ["capacity-rules.md"], ["Over-capacity and duplicate registration are prevented."], "high"));
    add(tasks, task("registration-workflow", "Design registration workflow", ["capacity-rules", "role-permission"], "WorkflowAgent", "Define submit, confirm, reject, waitlist, cancel, and export states.", ["registration-workflow.md"], ["Registration lifecycle is explicit and auditable."], "high"));
    add(tasks, task("list-management", "Plan list management", ["registration-workflow"], "DataOpsAgent", "Define attendee list filters, export, confirmation, and check states.", ["list-management.md"], ["名单 can be filtered, confirmed, and exported."], "medium"));
  }

  if (hasAny(intent.operationalNeeds, ["通知", "提醒"]) || hasAny(intent.coreWorkflows, ["通知", "确认", "调课", "审批"])) {
    add(tasks, task("notification", "Plan notification events", ["lifecycle-state-machine"], "NotificationPlanningAgent", "Define events, recipients, templates, channels, and retry expectations.", ["notification-plan.md"], ["Important state changes notify affected actors."], "medium"));
  }

  add(tasks, task("audit-log", "Specify audit log", ["role-permission", "lifecycle-state-machine"], "SecurityArchitectureAgent", "Define audit events for key actions, state changes, approvals, exports, and admin operations.", ["audit-log-spec.md"], ["Critical operations are traceable."], "high"));
  add(tasks, task("reporting", "Plan reporting and export", ["resource-model"], "AnalyticsAgent", `Define reports: ${intent.reportingNeeds.join("、")}.`, ["reporting-export-plan.md"], ["Reports and exports map to product records."], "medium"));
  add(tasks, task("admin-console", "Plan admin console surfaces", ["resource-model", "role-permission"], "ProductSpecAgent", "Plan management surfaces for resources, workflows, rules, review, reporting, and audit without UI implementation.", ["admin-console-plan.md"], ["No UI code is created; surfaces are planning artifacts only."], "medium"));
  add(tasks, task("deployment-backup", "Plan deployment and backup", ["admin-console", "audit-log"], "DevOpsPlanningAgent", "Define deployment assumptions, backup, recovery, monitoring, and runbook.", ["deployment-backup-plan.md"], ["Product can run beyond a local demo."], "medium"));

  return tasks;
}

function fallbackIntent() {
  return {
    rawGoal: "generic",
    normalizedGoal: "generic",
    domainId: "generic-software-product",
    primaryActors: ["最终用户", "运营人员"],
    secondaryActors: ["系统管理员"],
    coreResources: ["业务对象"],
    coreWorkflows: ["创建", "管理", "查询"],
    dataObjects: ["业务记录"],
    lifecycleStages: ["草稿", "有效", "归档"],
    permissionBoundaries: ["用户", "管理员"],
    riskSurfaces: ["权限滥用", "数据错误"],
    operationalNeeds: ["后台管理", "部署运维"],
    reportingNeeds: ["数据导出"],
    integrationNeeds: [],
    deploymentAssumptions: ["标准部署"],
    uncertaintyNotes: [],
  };
}

export function buildExecutionTaskGraph(
  selectedRoute: SelectedRoute,
  domainAnalysis: DomainAnalysis,
  productIntent?: ProductIntentModel,
  synthesizedCapabilities: SynthesizedCapability[] = [],
  evidenceLedger?: EvidenceLedger,
): ExecutionTaskGraph {
  let tasks;
  if (domainAnalysis.domainId === "attendance-checkin") {
    tasks = attendanceTasks();
  } else if (domainAnalysis.domainId === "medical-quiz-practice") {
    tasks = medicalQuizTasks();
  } else if (domainAnalysis.domainId === "schedule-calendar-management") {
    tasks = scheduleTasks();
  } else {
    tasks = compositionalTasks(productIntent ?? fallbackIntent());
  }

  const riskRefs = productIntent?.riskSurfaces ?? [];
  const enrichedTasks = tasks.map((taskItem) => {
    const capabilityHits = synthesizedCapabilities
      .filter((capability) => {
        const haystack = `${taskItem.id} ${taskItem.title} ${taskItem.purpose} ${taskItem.ownerAgent}`;
        return haystack.includes(capability.id) ||
          haystack.includes(capability.name) ||
          capability.triggeredBy.some((trigger) => haystack.includes(trigger.split(":").pop() ?? trigger));
      })
      .map((capability) => capability.id);
    const derivedFromCapabilities = capabilityHits.length > 0
      ? Array.from(new Set(capabilityHits)).slice(0, 5)
      : synthesizedCapabilities.slice(0, 3).map((capability) => capability.id);
    const evidenceRefs = Array.from(new Set([
      "E-INTENT-002",
      "E-INTENT-003",
      taskItem.id.includes("conflict") ? "E-RISK-002" : "",
      taskItem.id.includes("audit") || taskItem.id.includes("approval") ? "E-RISK-003" : "",
      taskItem.id.includes("report") || taskItem.id.includes("export") ? "E-REPORT-001" : "",
      ...(selectedRoute.evidenceRefs ?? []),
    ].filter(Boolean))).filter((ref) => !evidenceLedger || evidenceLedger.evidenceItems.some((item) => item.id === ref)).slice(0, 6);

    return {
      ...taskItem,
      evidenceRefs: evidenceRefs.length > 0 ? evidenceRefs : ["E-INTENT-002", "E-PRINCIPLE-001"],
      decisionRefs: ["D-TASK-GRAPH", "D-ROUTE-SELECT"],
      derivedFromCapabilities,
      derivedFromRisks: riskRefs.slice(0, 4),
      verificationHint: `Verify ${taskItem.id} against evidence ${evidenceRefs.slice(0, 3).join(", ")} and risks ${riskRefs.slice(0, 2).join("、") || "none listed"}.`,
    };
  });

  return {
    graphType: "directed-acyclic-task-graph",
    handoffPurpose: `Prepare later coding agents to execute selected route ${selectedRoute.selectedStrategyId} (${selectedRoute.selectedTitle}) without collapsing into a demo. Task graph was shaped by ${productIntent ? "Product Intent Model" : "domain fallback"}.`,
    tasks: enrichedTasks,
    suggestedExecutionOrder: enrichedTasks.map((item) => item.id),
  };
}