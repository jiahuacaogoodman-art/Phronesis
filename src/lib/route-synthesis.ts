import type {
  Complexity,
  DomainAnalysis,
  EvidenceLedger,
  ProductIntentModel,
  StrategyCandidate,
  SynthesizedCapability,
} from "../types/artifacts.js";
import {
  assumptionRefsForLedger,
  confidenceFromEvidenceRefs,
  refsForRoute,
  routeEvidenceGapsFor,
  routeEvidenceProfileFor,
} from "./evidence-ledger.js";

const routeArchetypes = [
  "admin-web-first",
  "mobile-first",
  "integration-first",
  "offline-first",
  "audit-and-compliance-first",
  "analytics-first",
  "lightweight-validated-product",
  "enterprise-governance",
] as const;

type RouteArchetype = (typeof routeArchetypes)[number];

function hasAny(values: string[], signals: string[]) {
  const joined = values.join(" ").toLowerCase();
  return signals.some((signal) => joined.includes(signal.toLowerCase()));
}

function mainResource(intent: ProductIntentModel) {
  return intent.coreResources[0] ?? "核心资源";
}

function workflowPhrase(intent: ProductIntentModel) {
  return intent.coreWorkflows.slice(0, 3).join("、") || "核心业务流程";
}

function archetypeTitle(archetype: RouteArchetype, intent: ProductIntentModel, domainAnalysis: DomainAnalysis): string {
  const resource = mainResource(intent);
  if (domainAnalysis.domainId === "attendance-checkin") {
    const titles: Record<RouteArchetype, string> = {
      "admin-web-first": "Web 管理后台 + 动态二维码签到路线",
      "mobile-first": "微信/小程序扫码签到路线",
      "integration-first": "学校账号体系集成签到路线",
      "audit-and-compliance-first": "设备绑定 + 风控审核签到路线",
      "offline-first": "离线局域网签到 + 同步路线",
      "analytics-first": "签到数据统计与异常洞察路线",
      "lightweight-validated-product": "轻量可验证签到产品路线",
      "enterprise-governance": "机构级考勤治理路线",
    };
    return titles[archetype] ?? `${resource}组合式签到路线`;
  }
  if (domainAnalysis.domainId === "medical-quiz-practice") {
    const titles: Record<RouteArchetype, string> = {
      "admin-web-first": "题库驱动刷题系统路线",
      "mobile-first": "多端学习平台路线",
      "integration-first": "题库导入与教学系统集成路线",
      "audit-and-compliance-first": "内容管理与审核系统路线",
      "analytics-first": "学习分析与错题闭环路线",
      "lightweight-validated-product": "轻量题库练习闭环路线",
      "enterprise-governance": "教学机构题库治理路线",
      "offline-first": "离线练习与同步路线",
    };
    return titles[archetype] ?? `${resource}学习路线`;
  }
  if (domainAnalysis.domainId === "schedule-calendar-management") {
    const titles: Record<RouteArchetype, string> = {
      "admin-web-first": "日历核心课程表路线",
      "integration-first": "教务系统集成路线",
      "audit-and-compliance-first": "冲突检测与调课流程路线",
      "analytics-first": "教室与课表统计分析路线",
      "mobile-first": "通知提醒与日历同步路线",
      "enterprise-governance": "教务排课治理路线",
      "lightweight-validated-product": "轻量课程表发布路线",
      "offline-first": "离线课表缓存与同步路线",
    };
    return titles[archetype] ?? `${resource}日历管理路线`;
  }

  if (hasAny(intent.coreWorkflows, ["预约", "审批", "取消预约"])) {
    const titles: Record<RouteArchetype, string> = {
      "admin-web-first": `${resource}预约后台管理优先路线`,
      "mobile-first": `移动端${resource}预约体验路线`,
      "integration-first": `${resource}台账/身份集成优先路线`,
      "audit-and-compliance-first": `${resource}使用记录与审计优先路线`,
      "analytics-first": `${resource}利用率分析路线`,
      "lightweight-validated-product": `轻量可验证${resource}预约路线`,
      "enterprise-governance": `${resource}预约治理路线`,
      "offline-first": `现场使用记录离线同步路线`,
    };
    return titles[archetype] ?? `${resource}预约路线`;
  }

  if (hasAny(intent.coreResources, ["项目", "里程碑", "任务", "成果"])) {
    const titles: Record<RouteArchetype, string> = {
      "admin-web-first": "科研项目协作管理路线",
      "mobile-first": "项目进度移动协同路线",
      "integration-first": "文档/成果系统集成路线",
      "audit-and-compliance-first": "项目过程审计与成果追踪路线",
      "analytics-first": "里程碑与进度分析路线",
      "lightweight-validated-product": "轻量项目任务闭环路线",
      "enterprise-governance": "科研团队治理路线",
      "offline-first": "离线记录与后同步项目路线",
    };
    return titles[archetype] ?? "科研项目路线";
  }

  if (hasAny(intent.coreWorkflows, ["报名", "活动发布", "名额"])) {
    const titles: Record<RouteArchetype, string> = {
      "admin-web-first": "活动报名后台管理路线",
      "mobile-first": "移动端活动报名体验路线",
      "integration-first": "社团成员/通知渠道集成路线",
      "audit-and-compliance-first": "报名审核与名单审计路线",
      "analytics-first": "活动报名统计分析路线",
      "lightweight-validated-product": "轻量活动报名闭环路线",
      "enterprise-governance": "社团活动治理路线",
      "offline-first": "现场名单离线核验路线",
    };
    return titles[archetype] ?? "活动报名路线";
  }

  const readable = intent.normalizedGoal.replace(/^做一个/, "").replace(/系统$/, "");
  const titles: Record<RouteArchetype, string> = {
    "admin-web-first": `${readable}运营后台优先路线`,
    "mobile-first": `${readable}移动体验优先路线`,
    "integration-first": `${readable}集成优先路线`,
    "offline-first": `${readable}离线韧性路线`,
    "audit-and-compliance-first": `${readable}审计合规优先路线`,
    "analytics-first": `${readable}统计分析优先路线`,
    "lightweight-validated-product": `${readable}轻量可验证产品路线`,
    "enterprise-governance": `${readable}企业治理路线`,
  };
  return titles[archetype] ?? `${readable}组合路线`;
}

function chooseArchetypes(intent: ProductIntentModel): RouteArchetype[] {
  const selected: RouteArchetype[] = ["admin-web-first", "lightweight-validated-product"];

  if (hasAny(intent.coreWorkflows, ["报名", "签到", "预约", "练习", "查看", "通知"])) {
    selected.push("mobile-first");
  }
  if (intent.integrationNeeds.length > 0) {
    selected.push("integration-first");
  }
  if (hasAny([...intent.riskSurfaces, ...intent.permissionBoundaries, ...intent.coreWorkflows], ["审核", "审批", "责任", "审计", "损坏", "越权", "成果"])) {
    selected.push("audit-and-compliance-first");
  }
  if (intent.reportingNeeds.length > 0) {
    selected.push("analytics-first");
  }
  if (hasAny([...intent.deploymentAssumptions, ...intent.coreWorkflows], ["离线", "现场", "缓存", "网络"])) {
    selected.push("offline-first");
  }
  if (intent.primaryActors.length + intent.secondaryActors.length >= 4 || intent.permissionBoundaries.length >= 4) {
    selected.push("enterprise-governance");
  }

  return Array.from(new Set(selected)).filter((item) => routeArchetypes.includes(item)).slice(0, 6);
}

function complexityFor(archetype: RouteArchetype): Complexity {
  if (archetype === "integration-first" || archetype === "enterprise-governance") {
    return "very-high";
  }
  if (archetype === "offline-first" || archetype === "audit-and-compliance-first" || archetype === "analytics-first") {
    return "high";
  }
  if (archetype === "lightweight-validated-product") {
    return "medium";
  }
  return "medium";
}

function routeModules(archetype: RouteArchetype, intent: ProductIntentModel, capabilities: SynthesizedCapability[]): string[] {
  const common = [
    `${mainResource(intent)}模型`,
    "角色权限",
    "流程状态",
  ];
  const byCapability = capabilities.slice(0, 5).map((capability) => capability.name);

  if (archetype === "admin-web-first") {
    return [...common, "后台管理", "导入导出", "审计日志"];
  }
  if (archetype === "mobile-first") {
    return [...common, "移动端主流程", "通知提醒", "个人记录"];
  }
  if (archetype === "integration-first") {
    return [...common, "外部系统适配器", "数据同步", "导入校验"];
  }
  if (archetype === "offline-first") {
    return [...common, "本地缓存", "同步队列", "冲突合并"];
  }
  if (archetype === "audit-and-compliance-first") {
    return [...common, "审批审核", "审计日志", "责任追踪"];
  }
  if (archetype === "analytics-first") {
    return [...common, "统计指标", "报表导出", "分析看板规划"];
  }
  if (archetype === "enterprise-governance") {
    return [...common, "组织权限", "治理策略", "合规报表"];
  }
  return [...common, ...byCapability];
}

function buildRoute(archetype: RouteArchetype, index: number, intent: ProductIntentModel, domainAnalysis: DomainAnalysis, capabilities: SynthesizedCapability[], evidenceLedger?: EvidenceLedger): StrategyCandidate {
  const title = archetypeTitle(archetype, intent, domainAnalysis);
  const triggeredBy = [
    ...intent.primaryActors.slice(0, 2).map((actor) => `actor:${actor}`),
    ...intent.coreResources.slice(0, 3).map((resource) => `resource:${resource}`),
    ...intent.coreWorkflows.slice(0, 3).map((workflow) => `workflow:${workflow}`),
    ...intent.riskSurfaces.slice(0, 2).map((risk) => `risk:${risk}`),
  ];
  const modules = routeModules(archetype, intent, capabilities);
  const developmentCost = complexityFor(archetype);
  const completeness = Math.min(10, 6.8 + Math.min(2, capabilities.length / 8) + (archetype === "lightweight-validated-product" ? -0.4 : 0));
  const evidenceRefs = evidenceLedger ? refsForRoute({ routeArchetype: archetype }, evidenceLedger) : ["E-GOAL-001", "E-INTENT-002", "E-INTENT-003"];
  const assumptionRefs = evidenceLedger ? assumptionRefsForLedger(evidenceLedger) : ["A-001"];
  const missingEvidencePenalty = evidenceLedger ? evidenceLedger.missingEvidence.length * evidenceLedger.confidenceModel.missingEvidencePenalty : 0.12;
  const evidenceGaps = evidenceLedger ? routeEvidenceGapsFor({ routeArchetype: archetype }, evidenceLedger) : ["ME-001"];
  let routeEvidenceProfile = { strong: 0, moderate: 2, weak: 0, missing: 1, coverageScore: 0.58, gapRefs: ["ME-001"] };
  if (evidenceLedger) {
    routeEvidenceProfile = routeEvidenceProfileFor({ routeArchetype: archetype, evidenceRefs }, evidenceLedger);
  }
  const routePenalty =
    archetype === "integration-first" ? 0.12 :
    archetype === "enterprise-governance" ? 0.1 :
    archetype === "offline-first" ? 0.08 :
    0.02;
  const confidence = evidenceLedger
    ? confidenceFromEvidenceRefs(evidenceRefs, evidenceLedger, completeness / 10 - routePenalty)
    : Number(Math.max(0.46, Math.min(0.9, completeness / 10 - missingEvidencePenalty - routePenalty)).toFixed(2));

  return {
    id: `S${index + 1}`,
    title,
    routeArchetype: archetype,
    triggeredBy,
    applicableScenarios: [
      `目标包含 ${workflowPhrase(intent)}。`,
      `核心资源包括 ${intent.coreResources.slice(0, 4).join("、")}。`,
      `主要风险包括 ${intent.riskSurfaces.slice(0, 3).join("、")}。`,
    ],
    coreArchitecture: modules,
    userExperience: [
      `${intent.primaryActors[0] ?? "用户"}围绕${mainResource(intent)}完成核心流程。`,
      "运营人员通过后台管理资源、状态、异常和报表。",
      "异常状态有明确提示、审核或恢复路径。",
    ],
    securityCapability: capabilities
      .filter((capability) => ["identity-and-auth", "role-permission", "security-boundary", "audit-log", "compliance-privacy", "review-and-approval"].includes(capability.id))
      .map((capability) => capability.name),
    operationalCapability: capabilities
      .filter((capability) => ["resource-management", "workflow-management", "admin-console", "import-export", "analytics-reporting", "deployment-operation", "backup-recovery"].includes(capability.id))
      .map((capability) => capability.name),
    developmentCost,
    deploymentComplexity: archetype === "integration-first" || archetype === "offline-first" ? "high" : "medium",
    maintenanceCost: archetype === "enterprise-governance" || archetype === "integration-first" ? "high" : "medium",
    majorRisks: intent.riskSurfaces.slice(0, 4),
    whyItMightFail: [
      "关键角色、资源规则或状态流转确认不足。",
      "首版范围过大，导致核心闭环没有先跑通。",
      archetype === "integration-first" ? "外部系统接口、权限或数据质量不可控。" : "缺少真实运营反馈会让规则设计偏离场景。",
    ],
    modules,
    pros: [
      "由 Product Intent Model 推导，能覆盖目标的核心资源和流程。",
      "比固定领域模板更容易迁移到相似但未写死的新目标。",
      "保留后续 Coding Agent 可执行的模块边界。",
    ],
    cons: [
      "当前路线仍包含规则推导和证据占位，需要后续用户确认不确定点。",
      "复杂流程需要真实业务访谈校准。",
    ],
    productCompletenessScore: Number(completeness.toFixed(1)),
    evidenceRefs,
    assumptionRefs,
    confidence,
    tradeoffSummary: `${title} prioritizes ${archetype} for ${mainResource(intent)}. It improves ${modules.slice(0, 3).join("、")} but carries ${developmentCost} development cost and ${archetype === "integration-first" ? "external dependency risk" : "scope calibration risk"}.`,
    missingEvidenceImpact: evidenceLedger
      ? `Missing evidence ${evidenceLedger.missingEvidence.map((item) => item.id).slice(0, 3).join(", ")} may change route priority, especially user scale, integration constraints, and workflow rules.`
      : "Missing external validation may change route priority.",
    routeEvidenceProfile,
    evidenceGaps,
    conditionsToPreferThisRoute: [
      `Prefer when ${mainResource(intent)} management and ${workflowPhrase(intent)} need to be productized before coding.`,
      `Prefer if route-specific evidence ${(evidenceRefs.filter((ref) => ref.startsWith("E-ROUTE")).join(", ") || "is added")} remains valid after stakeholder confirmation.`,
      archetype === "integration-first" ? "Prefer if ME-002 confirms mandatory external systems." : "Prefer if external integration is optional for the first delivery slice.",
    ],
    conditionsToRejectThisRoute: [
      `Reject if evidence gaps ${evidenceGaps.join(", ")} invalidate the assumed workflow or operating model.`,
      archetype === "lightweight-validated-product" ? "Reject if security, audit, or compliance evidence confirms product-grade risk." : "Reject if cost/complexity blocks a coherent first executable slice.",
      archetype === "analytics-first" ? "Reject if event and reporting definitions are not stable enough for analytics." : "Reject if critic-specific evidence becomes a confirmed blocker.",
    ],

    thesis: `${title}：围绕 ${mainResource(intent)}、${workflowPhrase(intent)} 和 ${intent.riskSurfaces.slice(0, 2).join("、")} 组合架构能力。`,
    targetFit: `适合 ${intent.normalizedGoal} 中由 ${triggeredBy.slice(0, 4).join("、")} 触发的产品级路线。`,
    architectureShape: modules,
    productCoverage: capabilities.map((capability) => capability.name),
    securityAndAbuseResistance: capabilities
      .filter((capability) => ["identity-and-auth", "role-permission", "security-boundary", "audit-log", "review-and-approval"].includes(capability.id))
      .map((capability) => capability.name),
    operationalModel: capabilities
      .filter((capability) => ["admin-console", "resource-management", "workflow-management", "notification", "import-export", "analytics-reporting", "deployment-operation"].includes(capability.id))
      .map((capability) => capability.name),
    risks: intent.riskSurfaces.slice(0, 4),
    estimatedComplexity: developmentCost,
    demoTrapResistanceScore: Math.round(completeness),
  };
}

export function synthesizeRoutes(
  intent: ProductIntentModel,
  domainAnalysis: DomainAnalysis,
  capabilities: SynthesizedCapability[],
  evidenceLedger?: EvidenceLedger,
): StrategyCandidate[] {
  const archetypes = chooseArchetypes(intent);
  return archetypes.map((archetype, index) => buildRoute(archetype, index, intent, domainAnalysis, capabilities, evidenceLedger));
}