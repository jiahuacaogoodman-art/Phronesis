import type { ProblemResolutionPlan, TechnicalSolutionResearchPlan } from "../types/artifacts.js";

interface TechnicalSearchPlanningInput {
  goal: string;
  problemResolutionPlan: ProblemResolutionPlan;
}

interface QueryPlanTemplate {
  technicalQuestion: string;
  searchQueries: string[];
  expectedSolutionTypes: string[];
}

function slug(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "problem";
}

function includesAny(value: unknown, signals: string[]): boolean {
  const text = String(value ?? "").toLowerCase();
  return signals.some((signal) => text.includes(String(signal).toLowerCase()));
}

function problemKind(statement: string): string {
  if (includesAny(statement, ["科室容量", "轮转计划冲突", "排班", "capacity", "scheduling"])) return "capacity-conflict";
  if (includesAny(statement, ["通知失败", "通知", "消息", "dead letter"])) return "notification-failure";
  if (includesAny(statement, ["请假", "补轮转", "资格", "审批", "workflow"])) return "leave-workflow";
  if (includesAny(statement, ["带教", "导师", "mentor", "assignment"])) return "mentor-history";
  if (includesAny(statement, ["补录考勤", "手工补录", "考勤", "audit"])) return "attendance-audit";
  if (includesAny(statement, ["主数据", "名单错配", "人事", "同步", "master data"])) return "master-data-sync";
  if (includesAny(statement, ["权限", "越权", "院区", "科室权限", "RBAC", "ABAC"])) return "permission-boundary";
  if (includesAny(statement, ["批量导入", "脏数据", "CSV", "import"])) return "bulk-import";
  if (includesAny(statement, ["考核模板", "历史成绩", "版本"])) return "evaluation-versioning";
  if (includesAny(statement, ["历史归档", "追责", "导出", "archive"])) return "archive-accountability";
  return "generic-technical-problem";
}

const plansByKind: Record<string, QueryPlanTemplate> = {
  "capacity-conflict": {
    technicalQuestion: "如何在数据库和应用层共同防止轮转排班日期重叠、科室容量超额和变更后既有计划冲突？",
    searchQueries: [
      "PostgreSQL exclusion constraint date range overlap",
      "scheduling conflict detection database constraints",
      "OR-Tools CP-SAT scheduling NoOverlap",
      "capacity planning scheduling algorithm",
    ],
    expectedSolutionTypes: ["database hard constraint", "application dry-run checker", "constraint programming optimizer"],
  },
  "leave-workflow": {
    technicalQuestion: "如何把请假、补轮转、资格影响和审批链做成可审计的长流程状态机？",
    searchQueries: [
      "approval workflow state machine database design",
      "durable workflow long running approval process",
      "workflow state transition audit trail",
    ],
    expectedSolutionTypes: ["explicit state machine", "transition table", "durable workflow engine"],
  },
  "mentor-history": {
    technicalQuestion: "如何保存带教分配责任历史并把评价归属绑定到有效时间区间？",
    searchQueries: [
      "temporal data model assignment history",
      "effective dated records database design",
      "slowly changing dimension type 2 assignment history",
    ],
    expectedSolutionTypes: ["effective-dated records", "temporal assignment history", "SCD type 2"],
  },
  "attendance-audit": {
    technicalQuestion: "如何让手工补录考勤既能运营兜底又不破坏审计可信度？",
    searchQueries: [
      "append only audit log design",
      "audit trail manual override approval",
      "tamper evident audit log application design",
    ],
    expectedSolutionTypes: ["append-only event log", "manual override approval", "tamper-evident audit trail"],
  },
  "master-data-sync": {
    technicalQuestion: "如何处理教务、人事、科室目录和本地影子表之间的幂等同步与冲突报告？",
    searchQueries: [
      "master data synchronization idempotent API design",
      "outbox pattern data synchronization",
      "CDC data sync consistency pattern",
    ],
    expectedSolutionTypes: ["local shadow table", "idempotent sync", "outbox or CDC integration"],
  },
  "permission-boundary": {
    technicalQuestion: "如何组合 RBAC、ABAC/data scope 与可选数据库行级安全，防止跨院区/跨科室越权？",
    searchQueries: [
      "RBAC ABAC PostgreSQL Row Level Security",
      "multi tenant department level authorization design",
      "healthcare application access control audit",
    ],
    expectedSolutionTypes: ["RBAC", "ABAC data scope", "PostgreSQL Row Level Security"],
  },
  "notification-failure": {
    technicalQuestion: "如何让审批、排班和带教确认通知具备可重试、可追踪、可人工补发能力？",
    searchQueries: [
      "transactional outbox notification pattern",
      "retry dead letter queue notification system",
      "idempotent notification delivery design",
    ],
    expectedSolutionTypes: ["transactional outbox", "retry policy", "dead letter queue", "idempotency key"],
  },
  "bulk-import": {
    technicalQuestion: "如何让学期初批量导入先 dry-run 校验、生成逐行错误报告、确认后再入正式表？",
    searchQueries: [
      "bulk import validation dry run design",
      "staging table data validation import workflow",
      "CSV import validation error report design",
    ],
    expectedSolutionTypes: ["staging table", "dry-run validation", "row-level error report", "rollback batch"],
  },
  "evaluation-versioning": {
    technicalQuestion: "如何保存考核模板版本，让历史成绩和新版评分口径可解释、不可被覆盖？",
    searchQueries: [
      "versioned form template database design",
      "audit trail score change history",
      "effective dated template versioning",
    ],
    expectedSolutionTypes: ["versioned template", "score snapshot", "change audit"],
  },
  "archive-accountability": {
    technicalQuestion: "如何让归档数据在只读、可导出、可追责和权限受控之间取得平衡？",
    searchQueries: [
      "immutable archive audit log export design",
      "records retention audit trail application design",
      "read only archive data model export audit",
    ],
    expectedSolutionTypes: ["immutable archive", "retention policy", "audit export package"],
  },
  "generic-technical-problem": {
    technicalQuestion: "如何把该成品化问题转成可验证的数据模型、流程和运维方案？",
    searchQueries: [
      "application workflow audit trail design",
      "domain model validation rules application design",
      "operational runbook failure mode software design",
    ],
    expectedSolutionTypes: ["domain model", "workflow validation", "operational runbook"],
  },
};

export function planTechnicalSolutionResearch(input: TechnicalSearchPlanningInput): TechnicalSolutionResearchPlan {
  const problems = (input.problemResolutionPlan?.problems ?? []).map((problem, index) => {
    const kind = problemKind(problem.problem);
    const plan = plansByKind[kind] ?? plansByKind["generic-technical-problem"];
    return {
      problemId: `PS-${String(index + 1).padStart(2, "0")}-${slug(kind)}`,
      problemStatement: problem.problem,
      technicalQuestion: plan.technicalQuestion,
      searchQueries: plan.searchQueries,
      expectedSolutionTypes: plan.expectedSolutionTypes,
      sourceTypesWanted: ["official technical documentation", "database/framework official docs", "authoritative security standard", "mature engineering guide", "open-source project documentation"],
      disallowedSourceTypes: ["dictionary page", "SEO aggregator", "pure marketing page", "unrelated product page", "page with no technical body"],
      decisionCriteria: ["correctness", "implementationComplexity", "operationalComplexity", "auditability", "scalability", "explainability", "fitForMVP", "fitForProductGrade"],
    };
  });
  return {
    generatedAt: new Date().toISOString(),
    goal: input.goal,
    searchStatus: problems.length > 0 ? "planned" : "disabled",
    problems,
  };
}

export function problemKindForStatement(statement: string): string {
  return problemKind(statement);
}