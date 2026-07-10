import type {
  CriticCouncilReport,
  EvidenceLedger,
  ExecutionTaskGraph,
  ProductExpansion,
  ProductIntentModel,
  ReconstructedIntent,
  RiskLevel,
  RouteDeepDiveReport,
  SelectedRoute,
  StrategyCandidate,
  TechnicalProductizationPlannerResult,
} from "../types/artifacts.js";

type TechnicalRoute = TechnicalProductizationPlannerResult["technicalRoutePlan"]["routes"][number];
type ForecastItem = TechnicalProductizationPlannerResult["productizationForecast"]["items"][number];
type ResolutionItem = TechnicalProductizationPlannerResult["problemResolutionPlan"]["problems"][number];
type BackendModule = TechnicalRoute["backendModules"][number];
type DatabaseModel = TechnicalRoute["databaseModel"];
type StateMachine = TechnicalRoute["stateMachines"][number];
type RouteScore = TechnicalProductizationPlannerResult["technicalRouteScorecard"]["routeScores"][number];

interface TechnicalProductizationSourceInput {
  goal: string;
  reconstructedIntent: ReconstructedIntent;
  productIntent: ProductIntentModel;
  selectedRoute: SelectedRoute;
  criticCouncilReport: CriticCouncilReport;
  routeDeepDive?: RouteDeepDiveReport;
  strategyCandidates: StrategyCandidate[];
  productExpansion: ProductExpansion;
  evidenceLedger: EvidenceLedger;
  executionTaskGraph: ExecutionTaskGraph;
}

interface ReducedStrategy {
  id: string;
  title: string;
  thesis: string;
  architectureShape: string[];
  productCoverage: string[];
  operationalModel: string[];
  risks: string[];
  evidenceRefs: string[];
}

interface TechnicalProductizationInput {
  goal: string;
  reconstructedIntent: {
    normalizedGoal?: string;
    category?: string;
    successCriteria: string[];
    ambiguities: string[];
  };
  productIntentEssential: Pick<ProductIntentModel,
    "domainId" | "normalizedGoal" | "primaryActors" | "secondaryActors" | "coreResources" | "coreWorkflows" |
    "dataObjects" | "lifecycleStages" | "permissionBoundaries" | "riskSurfaces" | "integrationNeeds" |
    "operationalNeeds" | "reportingNeeds">;
  selectedRouteSummary: {
    selectedStrategyId: string;
    selectedTitle: string;
    selectionStatus?: SelectedRoute["selectionStatus"];
    canProceedToCoding: boolean;
    blockingReasons: string[];
    requiredClarificationsBeforeCoding: string[];
    scoreBreakdown?: SelectedRoute["selectionScoreBreakdown"];
  };
  routes: ReducedStrategy[];
  topRouteRisks: Array<{ strategyId: string; title: string; risks: string[]; hiddenComplexities: string[]; validationBeforeCoding: string[] }>;
  topCriticObjections: Array<{ critic: string; strategyId: string; score: number; objections: string[] }>;
  blockingReasons: string[];
  requiredClarifications: string[];
  topCapabilities: string[];
  topEvidenceGaps: string[];
  executionTaskSummary: {
    canProceedToCoding: boolean;
    globalBlockingReasons: string[];
    tasks: Array<{ id: string; title: string; riskLevel: RiskLevel; shouldBlockCodingUntilResolved?: boolean }>;
  };
}

function uniq(items: Array<string | undefined>): string[] {
  return Array.from(new Set(items.filter((item): item is string => Boolean(item))));
}

function first(items: string[], fallback: string): string {
  return items[0] ?? fallback;
}

function compact(items: Array<string | undefined>, count = 6): string[] {
  return uniq(items).slice(0, count);
}

function textIncludesAny(value: unknown, signals: string[]): boolean {
  const text = String(value ?? "").toLowerCase();
  return signals.some((signal) => text.includes(String(signal).toLowerCase()));
}

function isMedicalInternRotation(input: TechnicalProductizationInput): boolean {
  const intent = input.productIntentEssential;
  return textIncludesAny(JSON.stringify(intent), ["medical-intern-rotation-management", "医院实习", "轮转", "科室", "带教", "出科"]);
}

export function buildTechnicalProductizationInput(input: TechnicalProductizationSourceInput): TechnicalProductizationInput {
  const selectedRoute = input.selectedRoute;
  const selectedRouteSummary = {
    selectedStrategyId: selectedRoute.selectedStrategyId,
    selectedTitle: selectedRoute.selectedTitle,
    selectionStatus: selectedRoute.selectionStatus,
    canProceedToCoding: selectedRoute.canProceedToCoding !== false,
    blockingReasons: selectedRoute.blockingReasons ?? [],
    requiredClarificationsBeforeCoding: selectedRoute.requiredClarificationsBeforeCoding ?? [],
    scoreBreakdown: selectedRoute.selectionScoreBreakdown,
  };
  const topCriticObjections = (input.criticCouncilReport?.reviews ?? [])
    .filter((review) => (review.blockingIssues ?? []).length > 0 || review.disagreementLevel !== "low")
    .slice(0, 16)
    .map((review) => ({
      critic: review.critic,
      strategyId: review.strategyId,
      score: review.score,
      objections: compact([...(review.blockingIssues ?? []), ...(review.nearBlockingConcerns ?? []), ...(review.objections ?? [])], 5),
    }));
  const topRouteRisks = (input.routeDeepDive?.routeAnalyses ?? []).map((analysis) => ({
    strategyId: analysis.strategyId,
    title: analysis.title,
    risks: compact((analysis.riskRegister ?? []).map((risk) => risk.risk), 5),
    hiddenComplexities: compact(analysis.hiddenComplexities ?? analysis.likelyHiddenComplexities ?? [], 4),
    validationBeforeCoding: compact(analysis.validationBeforeCoding ?? analysis.recommendedValidationBeforeCoding ?? [], 4),
  }));

  return {
    goal: input.goal,
    reconstructedIntent: {
      normalizedGoal: input.reconstructedIntent?.normalizedGoal,
      category: input.reconstructedIntent?.inferredProductCategory,
      successCriteria: compact(input.reconstructedIntent?.successCriteria ?? [], 6),
      ambiguities: compact(input.reconstructedIntent?.ambiguities ?? [], 6),
    },
    productIntentEssential: {
      domainId: input.productIntent?.domainId,
      normalizedGoal: input.productIntent?.normalizedGoal,
      primaryActors: compact(input.productIntent?.primaryActors ?? [], 6),
      secondaryActors: compact(input.productIntent?.secondaryActors ?? [], 6),
      coreResources: compact(input.productIntent?.coreResources ?? [], 8),
      coreWorkflows: compact(input.productIntent?.coreWorkflows ?? [], 8),
      dataObjects: compact(input.productIntent?.dataObjects ?? [], 8),
      lifecycleStages: compact(input.productIntent?.lifecycleStages ?? [], 8),
      permissionBoundaries: compact(input.productIntent?.permissionBoundaries ?? [], 8),
      riskSurfaces: compact(input.productIntent?.riskSurfaces ?? [], 8),
      integrationNeeds: compact(input.productIntent?.integrationNeeds ?? [], 8),
      operationalNeeds: compact(input.productIntent?.operationalNeeds ?? [], 8),
      reportingNeeds: compact(input.productIntent?.reportingNeeds ?? [], 6),
    },
    selectedRouteSummary,
    routes: (input.strategyCandidates ?? []).map((strategy) => ({
      id: strategy.id,
      title: strategy.title,
      thesis: strategy.thesis,
      architectureShape: compact(strategy.architectureShape ?? [], 6),
      productCoverage: compact(strategy.productCoverage ?? [], 8),
      operationalModel: compact(strategy.operationalModel ?? [], 6),
      risks: compact([...(strategy.risks ?? []), ...(strategy.majorRisks ?? [])], 8),
      evidenceRefs: compact(strategy.evidenceRefs ?? [], 6),
    })),
    topRouteRisks,
    topCriticObjections,
    blockingReasons: selectedRoute.blockingReasons ?? [],
    requiredClarifications: selectedRoute.requiredClarificationsBeforeCoding ?? [],
    topCapabilities: compact((input.productExpansion?.coreCapabilities ?? []).map((capability) => capability.name), 10),
    topEvidenceGaps: compact((input.evidenceLedger?.missingEvidence ?? []).map((gap) => `${gap.id}: ${gap.question}`), 8),
    executionTaskSummary: {
      canProceedToCoding: input.executionTaskGraph?.canProceedToCoding !== false,
      globalBlockingReasons: input.executionTaskGraph?.globalBlockingReasons ?? [],
      tasks: (input.executionTaskGraph?.tasks ?? []).slice(0, 12).map((task) => ({
        id: task.id,
        title: task.title,
        riskLevel: task.riskLevel,
        shouldBlockCodingUntilResolved: task.shouldBlockCodingUntilResolved,
      })),
    },
  };
}

function routeModules(strategy: ReducedStrategy, medical: boolean): BackendModule[] {
  if (medical) {
    const modules: Array<[string, string[], string[]]> = [
      ["rotation-plan", ["轮转计划模型、批次、周期、状态历史", "轮转生命周期状态机", "补轮转规则"], ["容量变更后既有计划冲突"]],
      ["department-capacity", ["科室容量名额模型、容量版本、占用明细", "dry-run 容量冲突检测", "受影响学生清单"], ["容量版本不清导致超额排班"]],
      ["intern-profile", ["实习生档案模型、学籍/医院身份映射", "科室轮转履历", "归档导出"], ["主数据不同步导致名单错配"]],
      ["mentor-assignment", ["带教分配模型、带教历史、时间边界责任", "评价归属", "调整原因"], ["带教临时调整后评价责任不清"]],
      ["attendance-evaluation", ["考勤/签到记录模型、手工补录标记", "出科考核模型、模板版本", "申诉与更正"], ["补录考勤削弱审计可信度"]],
      ["leave-transfer-approval", ["请假调岗记录模型、审批链", "资格影响计算", "延期/补轮转要求"], ["请假后补轮转规则不清导致争议"]],
    ];
    return modules.map(([name, responsibilities, keyRisks]) => ({ name, responsibilities, keyRisks }));
  }
  return [
    { name: "domain-core", responsibilities: [`${first(strategy.productCoverage, "核心能力")} 领域模型`, "资源生命周期", "业务规则校验"], keyRisks: compact(strategy.risks, 2) },
    { name: "workflow-engine", responsibilities: ["状态机", "审批/异常处理", "通知触发"], keyRisks: ["流程只覆盖 happy path"] },
    { name: "operations-console", responsibilities: ["导入导出", "审计查询", "配置与备份"], keyRisks: ["真实运营不可维护"] },
  ];
}

function routeDatabaseModel(medical: boolean): DatabaseModel {
  if (!medical) {
    return {
      entities: [
        { name: "core_resource", fields: ["id", "owner_id", "status", "created_at", "updated_at"], relationships: ["belongs to actor", "has workflow events"] },
        { name: "workflow_event", fields: ["id", "resource_id", "from_state", "to_state", "actor_id", "reason"], relationships: ["records lifecycle transition"] },
      ],
      constraints: ["resource state must match workflow guards", "bulk import must be idempotent"],
      versioningNeeds: ["configuration version", "audit history"],
    };
  }
  return {
    entities: [
      { name: "轮转计划", fields: ["plan_id", "学期/批次", "学生_id", "科室_id", "开始日期", "结束日期", "状态", "容量版本"], relationships: ["关联实习生档案", "关联科室容量名额", "产生排班日历"] },
      { name: "科室容量名额", fields: ["department_id", "周期", "容量上限", "容量版本", "生效时间", "变更原因"], relationships: ["约束轮转计划", "生成容量冲突检测结果"] },
      { name: "实习生档案", fields: ["student_id", "院校/医院身份", "年级", "实习批次", "资格状态", "归档状态"], relationships: ["拥有轮转履历", "关联请假调岗记录"] },
      { name: "排班日历", fields: ["calendar_id", "轮转计划_id", "日期", "班次", "科室", "带教老师", "冲突标记"], relationships: ["由轮转计划展开", "被通知提醒消费"] },
      { name: "带教分配", fields: ["assignment_id", "学生_id", "带教老师_id", "科室_id", "开始/结束时间", "责任范围", "变更原因"], relationships: ["决定评价权限", "关联考勤确认"] },
      { name: "请假调岗记录", fields: ["request_id", "类型", "影响天数", "影响轮转", "审批状态", "补轮转要求", "资格影响"], relationships: ["触发审批流状态机", "更新轮转资格"] },
      { name: "出科考核", fields: ["evaluation_id", "模板版本", "评分项", "评价人", "成绩", "申诉状态", "归档时间"], relationships: ["归属带教责任", "影响出科资格"] },
      { name: "考勤记录", fields: ["attendance_id", "来源", "签到时间", "迟到/缺勤", "手工补录标记", "审批人", "证据附件占位"], relationships: ["支撑出科考核", "进入审计导出"] },
    ],
    constraints: ["同一学生同一日期不得分配多个冲突科室", "科室容量版本变更必须先 dry-run", "请假影响出科资格时必须生成补轮转要求", "考核模板版本不得覆盖历史成绩"],
    versioningNeeds: ["科室容量版本", "考核模板版本", "带教责任历史", "审批配置版本"],
  };
}

function routeStateMachines(medical: boolean): StateMachine[] {
  if (!medical) {
    return [
      { name: "资源生命周期状态机", states: ["draft", "active", "suspended", "archived"], transitions: ["draft->active", "active->suspended", "active->archived"], guards: ["权限校验", "必填字段", "审计原因"] },
      { name: "审批流状态机", states: ["submitted", "reviewing", "approved", "rejected", "cancelled"], transitions: ["submitted->reviewing", "reviewing->approved", "reviewing->rejected"], guards: ["审批人角色", "影响范围计算"] },
    ];
  }
  return [
    { name: "轮转生命周期状态机", states: ["草稿", "待发布", "已发布", "轮转中", "请假中", "补轮转待安排", "已出科", "已归档"], transitions: ["草稿->待发布", "待发布->已发布", "已发布->轮转中", "轮转中->请假中", "请假中->补轮转待安排", "轮转中->已出科", "已出科->已归档"], guards: ["容量冲突检测通过", "带教分配存在", "考勤/出科考核完整", "归档前无未决申诉"] },
    { name: "审批流状态机", states: ["已提交", "教学秘书初审", "科室带教确认", "科教管理员终审", "已批准", "已驳回", "已撤销"], transitions: ["已提交->教学秘书初审", "教学秘书初审->科室带教确认", "科室带教确认->科教管理员终审", "科教管理员终审->已批准", "任意审批中->已驳回/已撤销"], guards: ["审批链按请假/调岗类型配置", "资格影响已计算", "通知送达或补偿任务已生成"] },
  ];
}

function routePlanFor(strategy: ReducedStrategy, input: TechnicalProductizationInput): TechnicalRoute {
  const medical = isMedicalInternRotation(input);
  const selected = input.selectedRouteSummary ?? {};
  return {
    strategyId: strategy.id,
    routeTitle: strategy.title,
    recommendedArchitecture: medical
      ? ["领域模块化单体优先", "轮转计划/容量/审批/考核/审计模块边界清晰", "先固化医院实习轮转核心模型，再评估院内系统集成"]
      : [`${strategy.title} 的模块化领域架构`, "核心流程状态机", "审计与运维边界"],
    backendModules: routeModules(strategy, medical),
    frontendBoundaries: medical
      ? ["科教管理员：轮转计划、科室容量、批量导入、冲突处理", "教学秘书：科室接收、带教调整、考勤审核", "带教老师：学生确认、考勤确认、出科考核", "实习生：排班日历、请假调岗、考核结果确认"]
      : ["资源管理边界", "流程审批边界", "运营配置边界"],
    databaseModel: routeDatabaseModel(medical),
    stateMachines: routeStateMachines(medical),
    permissionModel: {
      roles: medical ? ["实习生", "科室带教老师", "教学秘书", "医院科教管理员", "审计/只读角色"] : input.productIntentEssential.primaryActors,
      resourceActions: medical
        ? ["轮转计划:create/update/publish/archive", "科室容量:version/change/dry-run", "带教分配:assign/change/evaluate", "考勤记录:create/manual-override/approve/export", "出科考核:score/version/archive"]
        : ["resource:create/update/archive", "workflow:approve/reject", "audit:read/export"],
      boundaries: medical
        ? ["本科室仅看本科室学生和带教关系", "带教老师只能评价责任时间段内学生", "实习生只看本人排班、考勤和考核", "跨院区/跨科室访问需要科教管理员授权"]
        : input.productIntentEssential.permissionBoundaries,
    },
    conflictDetectionModel: {
      checkedObjects: medical ? ["轮转计划", "科室容量名额", "排班日历", "带教分配", "请假调岗记录"] : input.productIntentEssential.coreResources,
      rules: medical
        ? ["容量版本变更先 dry-run", "同一学生同一时间不可跨科室冲突", "请假天数自动计算补轮转要求", "带教调整需重算评价责任窗口", "出科前检查考勤和考核完整性"]
        : ["资源时间范围冲突", "状态迁移冲突", "审批人权限冲突"],
      outputs: medical ? ["冲突清单", "受影响学生列表", "管理员确认项", "回滚计划", "审计事件"] : ["冲突列表", "修复建议", "审计记录"],
    },
    approvalWorkflowModel: {
      workflows: medical ? ["请假审批", "调岗审批", "手工补录考勤审批", "容量变更确认", "考核更正/申诉"] : input.productIntentEssential.coreWorkflows,
      states: medical ? ["提交", "初审", "带教/科室确认", "科教管理员终审", "批准/驳回/撤销"] : ["submitted", "reviewing", "approved", "rejected"],
      escalationRules: medical ? ["通知失败生成补偿任务", "超过时限提醒教学秘书", "影响出科资格必须终审"] : ["超时提醒", "异常升级"],
    },
    auditLogModel: {
      events: medical ? ["审计日志", "轮转计划发布/撤回", "容量版本变更", "带教调整", "请假调岗审批", "手工补录考勤", "出科考核评分/更正", "归档导出"] : ["审计日志", "资源变更", "审批动作", "导入导出"],
      actorContext: medical ? ["操作者", "角色", "科室/院区", "前后值", "原因", "证据附件占位"] : ["actor", "role", "before/after", "reason"],
      retention: medical ? ["实习档案归档后仍支持追责查询", "导出记录单独留痕", "敏感字段访问审计"] : ["审计留存", "导出留痕"],
    },
    importExportModel: {
      importSources: medical ? ["院校/教务实习名单", "医院人事身份", "科室目录", "带教老师名单", "考勤源数据"] : ["CSV/Excel", "external master data"],
      validationRules: medical ? ["学生身份匹配", "科室容量校验", "带教老师有效期", "模板版本校验", "重复/脏数据隔离"] : ["唯一性", "必填", "引用完整性"],
      exportPackages: medical ? ["轮转安排", "科室容量占用", "考勤记录", "出科考核", "归档审计包"] : ["业务报表", "审计报表"],
    },
    integrationAdapters: medical ? ["院内身份系统边界", "人事/带教老师主数据边界", "教务学生名单边界", "考勤系统边界", "通知短信/企业微信边界"] : input.productIntentEssential.integrationNeeds,
    deploymentTopology: ["单体应用 + 关系型数据库优先", "后台任务队列处理导入、通知和归档", "内网部署或院内云部署", "外部集成用 adapter 隔离"],
    observabilityPlan: medical ? ["导入失败率", "容量冲突数量", "审批超时", "通知失败", "考勤补录比例", "出科资格异常"] : ["workflow latency", "import error rate", "approval backlog"],
    backupAndRecoveryPlan: medical ? ["每日数据库备份", "容量/考核模板版本可回滚", "批量导入回滚包", "归档数据恢复演练"] : ["daily backup", "restore drill", "import rollback"],
    testingPlan: medical ? ["容量冲突测试", "请假补轮转资格测试", "带教责任历史测试", "考勤补录审计测试", "考核模板版本回归测试", "多院区权限测试"] : ["domain model tests", "workflow tests", "permission tests"],
    migrationPlan: medical ? ["先导入科室/带教/学生主数据", "再导入历史轮转和考勤", "考核模板按版本迁移", "历史归档只读验证"] : ["seed master data", "migrate history", "verify audit"],
    codingReadiness: selected.canProceedToCoding === false ? "blocked" : "conditional",
    unresolvedTechnicalQuestions: compact([
      ...(input.requiredClarifications ?? []),
      ...(input.topEvidenceGaps ?? []),
      medical ? "补轮转资格规则是否由医院统一配置？" : undefined,
      medical ? "院内身份/人事/考勤/通知系统接口是否可用？" : undefined,
    ], 10),
  };
}

function forecastItems(medical: boolean): ForecastItem[] {
  type ForecastTuple = [string, string, string, string[], RiskLevel, string, string, string, string];
  const scenarios: ForecastTuple[] = medical
    ? [
        ["PF-01", "科室容量变更导致既有轮转计划冲突。", "科室容量常随带教资源、床位和教学安排变化。", ["科室容量名额", "轮转计划", "排班日历"], "high", "容量版本变更后冲突数量突然上升", "capacity versioning + dry-run conflict check + affected students list", "容量下调后已有排班冲突测试", "容量变更审批与回滚手册"],
        ["PF-02", "学生请假后补轮转规则不清导致出科资格争议。", "请假类型、影响天数和出科资格常存在人工解释空间。", ["请假调岗记录", "轮转计划", "出科考核"], "high", "请假审批后资格状态不一致", "leave type + affected rotation days + make-up requirement + eligibility status", "不同请假类型触发补轮转测试", "资格争议人工复核手册"],
        ["PF-03", "带教老师临时调整后评价责任不清。", "带教资源会因值班、调岗和离院临时变动。", ["带教分配", "出科考核", "审计日志"], "medium", "评价人与责任时间段不匹配", "mentor assignment history + time-bounded responsibility + evaluation ownership", "带教中途调整后评价归属测试", "带教变更确认手册"],
        ["PF-04", "手工补录考勤导致审计可信度下降。", "线下实习场景会出现漏签、补录和设备异常。", ["考勤记录", "审批流", "审计日志"], "high", "手工补录比例异常升高", "manual override flag + approval requirement + evidence attachment placeholder", "补录考勤审批和导出标记测试", "补录证据审核手册"],
        ["PF-05", "教务/人事主数据不同步导致名单错配。", "学生、带教和科室主数据来源不同且更新节奏不一致。", ["实习生档案", "院内身份集成", "导入导出"], "high", "导入名单与身份系统匹配失败", "master data reconciliation + id mapping + quarantine dirty rows", "主数据错配隔离测试", "主数据同步失败处理手册"],
        ["PF-06", "考核模板版本变更导致历史成绩不可比。", "教学评价表常会按学期或专业调整。", ["出科考核", "模板版本", "归档"], "medium", "同一报表混用不同评分口径", "evaluation template versioning + historical score freeze", "模板升级后历史成绩不变测试", "模板变更发布手册"],
        ["PF-07", "多院区/多科室权限边界错误导致越权查看。", "多科室协作容易混淆管理范围和只读范围。", ["权限模型", "实习生档案", "审计日志"], "high", "跨科室访问审计出现异常", "resource scoped RBAC + department/campus boundary tests", "跨院区/跨科室权限矩阵测试", "越权事件响应手册"],
        ["PF-08", "通知失败导致学生或带教错过审批/确认。", "通知依赖外部渠道且可能被限流或失败。", ["通知适配器", "审批流", "排班日历"], "medium", "审批超时和未确认数量上升", "notification delivery receipt + retry + fallback task", "通知失败重试和补偿任务测试", "通知失败人工提醒手册"],
        ["PF-09", "历史归档后仍需追责或导出。", "教学管理存在事后申诉、检查和归档导出需求。", ["归档", "审计日志", "导出"], "medium", "归档数据查询/导出请求增加", "immutable archive + audit export package + retention policy", "归档后审计导出测试", "归档查询授权手册"],
        ["PF-10", "学期初高峰批量导入导致脏数据进入系统。", "学期初名单、科室、带教和排班会集中导入。", ["导入导出", "科室容量", "实习生档案"], "high", "导入错误率、重复行和隔离数据增加", "staging import + validation report + rollback package", "批量导入脏数据隔离测试", "导入失败回滚手册"],
      ]
    : [
        ["PF-01", "批量导入导致脏数据进入系统。", "真实运营会集中导入历史和主数据。", ["导入导出", "核心资源"], "high", "导入错误率升高", "staging import + validation report + rollback", "脏数据隔离测试", "导入回滚手册"],
        ["PF-02", "权限边界错误导致越权访问。", "多角色产品容易出现资源范围误判。", ["权限模型", "审计日志"], "high", "跨资源访问审计异常", "resource scoped RBAC", "权限矩阵测试", "越权响应手册"],
      ];
  return scenarios.map(([id, scenario, whyLikely, affectedModules, severity, earlyWarningSignal, designCountermeasure, testCaseNeeded, operationalPlaybookNeeded]) => ({
    id,
    scenario,
    whyLikely,
    affectedModules,
    severity,
    earlyWarningSignal,
    designCountermeasure,
    testCaseNeeded,
    operationalPlaybookNeeded,
  }));
}

function resolutionFor(item: ForecastItem, selectedCanProceed: boolean): ResolutionItem {
  const scenario = item.scenario;
  if (textIncludesAny(scenario, ["科室容量"])) {
    return {
      problem: scenario,
      rootCause: "科室容量被当成当前值而非可追溯版本，缺少影响分析和回滚路径。",
      recommendedSolution: "capacity versioning, impact analysis, dry-run conflict check, affected students list, admin confirmation, rollback plan, audit log",
      dataModelChange: ["科室容量名额增加容量版本和生效时间", "轮转计划保存容量版本引用", "冲突检测结果保存受影响学生列表"],
      workflowChange: ["容量变更先 dry-run", "管理员确认影响范围", "发布后生成通知和回滚包"],
      permissionChange: ["仅科教管理员可发布容量版本", "教学秘书可提交变更建议"],
      auditRequirement: ["记录前后容量、原因、确认人、受影响学生、回滚包"],
      validationRule: ["容量下调不得静默覆盖既有轮转计划", "未确认冲突不得发布"],
      testCases: ["容量下调产生冲突清单", "容量变更回滚恢复原计划", "受影响学生列表准确"],
      operationalFallback: "保留原容量版本并导出冲突清单给科教管理员人工确认。",
      residualRisk: "外部线下安排仍可能绕过系统，需要定期对账。",
      blocksCodingUntilResolved: !selectedCanProceed,
    };
  }
  if (textIncludesAny(scenario, ["请假", "补轮转"])) {
    return {
      problem: scenario,
      rootCause: "请假类型、影响轮转天数和出科资格没有被统一规则化。",
      recommendedSolution: "leave type, affected rotation days, qualification impact, make-up rotation requirement, approval chain, final graduation eligibility status",
      dataModelChange: ["请假调岗记录增加 leave type", "保存 affected rotation days", "保存 make-up rotation requirement 和 final eligibility status"],
      workflowChange: ["提交时计算资格影响", "影响出科资格时进入科教管理员终审", "批准后生成补轮转任务"],
      permissionChange: ["学生可提交本人请假", "带教/教学秘书确认事实", "科教管理员确认资格影响"],
      auditRequirement: ["记录请假原因、审批链、资格计算结果、补轮转安排"],
      validationRule: ["请假天数影响出科资格时必须有补轮转要求", "未完成补轮转不得自动出科"],
      testCases: ["病假/事假/调岗不同规则测试", "补轮转完成后资格恢复测试"],
      operationalFallback: "争议请求进入人工复核队列，冻结最终出科状态。",
      residualRisk: "不同院校政策差异仍需配置化确认。",
      blocksCodingUntilResolved: !selectedCanProceed,
    };
  }
  if (textIncludesAny(scenario, ["带教"])) {
    return {
      problem: scenario,
      rootCause: "带教分配只保存当前责任人，缺少历史和责任时间窗。",
      recommendedSolution: "mentor assignment history, time-bounded responsibility, evaluation ownership, change reason, audit trail",
      dataModelChange: ["带教分配增加开始/结束时间", "保存 change reason", "评价记录引用责任时间窗"],
      workflowChange: ["带教调整需确认责任切换时间", "未完成评价自动提醒原/新带教"],
      permissionChange: ["带教只能评价责任时间段内学生", "教学秘书可发起调整"],
      auditRequirement: ["记录调整前后带教、原因、操作者、评价归属"],
      validationRule: ["评价时间必须落入带教责任窗口", "带教变更不得删除历史责任"],
      testCases: ["中途换带教后评价归属测试", "历史责任查询测试"],
      operationalFallback: "责任冲突时由科教管理员指定评价归属并留痕。",
      residualRisk: "线下实际带教可能未及时同步。",
      blocksCodingUntilResolved: !selectedCanProceed,
    };
  }
  if (textIncludesAny(scenario, ["手工补录", "考勤"])) {
    return {
      problem: scenario,
      rootCause: "考勤补录缺少来源、审批、原因和证据标记。",
      recommendedSolution: "original source, manual override flag, approval requirement, reason, evidence attachment placeholder, audit export marker",
      dataModelChange: ["考勤记录增加 original source", "manual override flag", "reason", "evidence attachment placeholder"],
      workflowChange: ["补录必须提交审批", "批准后进入审计导出标记"],
      permissionChange: ["学生不能直接补录生效", "带教/教学秘书审核", "审计角色只读查看"],
      auditRequirement: ["记录补录前后值、审批人、证据占位、导出标记"],
      validationRule: ["手工补录没有原因和审批不得生效", "补录记录必须进入审计导出"],
      testCases: ["漏签补录审批测试", "补录导出标记测试"],
      operationalFallback: "无法提供证据时记录为争议考勤，交由科教管理员复核。",
      residualRisk: "证据附件真实性仍需线下制度约束。",
      blocksCodingUntilResolved: !selectedCanProceed,
    };
  }
  return {
    problem: scenario,
    rootCause: "真实运营边界、数据版本、权限范围或外部系统契约未完全明确。",
    recommendedSolution: `${item.designCountermeasure} plus validation, audit trail, operator fallback, and regression tests before coding handoff.`,
    dataModelChange: ["增加版本/来源/状态/责任字段", "保存导入或集成映射关系"],
    workflowChange: ["增加预检、审批、回滚和异常处理步骤"],
    permissionChange: ["按角色、科室/院区、资源动作拆分授权"],
    auditRequirement: ["保存操作者、时间、前后值、原因和导出记录"],
    validationRule: [item.designCountermeasure, "异常输入不得静默进入主流程"],
    testCases: [item.testCaseNeeded, "权限与审计回归测试"],
    operationalFallback: item.operationalPlaybookNeeded,
    residualRisk: "外部制度或接口变化仍需人工确认。",
    blocksCodingUntilResolved: !selectedCanProceed && item.severity === "high",
  };
}

export function planTechnicalProductization(input: TechnicalProductizationInput): TechnicalProductizationPlannerResult {
  const medical = isMedicalInternRotation(input);
  const selectedCanProceed = input.selectedRouteSummary?.canProceedToCoding !== false;
  const routes = (input.routes ?? []).map((strategy) => routePlanFor(strategy, input));
  const forecast = forecastItems(medical);
  const routeScores = routes.map<RouteScore>((route) => ({
    strategyId: route.strategyId,
    routeTitle: route.routeTitle,
    architectureMaturity: medical ? 7 : 6,
    domainModelCompleteness: medical ? 8 : 6,
    workflowRobustness: medical ? 7 : 6,
    permissionSafety: medical ? 7 : 6,
    auditability: medical ? 8 : 6,
    integrationReadiness: medical ? 5 : 5,
    productizationRisk: selectedCanProceed ? 5 : 8,
    testingFeasibility: medical ? 7 : 6,
    operationalMaintainability: medical ? 7 : 6,
    codingReadiness: selectedCanProceed ? "conditional" : "blocked",
    finalRecommendation: selectedCanProceed
      ? "Can be used as a technical planning baseline after normal readiness review."
      : "Planning hypothesis only. Do not hand off to Coding Agent until route blockers and evidence gaps are resolved.",
  }));
  return {
    technicalRoutePlan: {
      generatedAt: new Date().toISOString(),
      planningStatus: selectedCanProceed ? "coding-ready" : "planning-only",
      routes,
    },
    productizationForecast: {
      generatedAt: new Date().toISOString(),
      items: forecast,
    },
    problemResolutionPlan: {
      generatedAt: new Date().toISOString(),
      problems: forecast.map((item) => resolutionFor(item, selectedCanProceed)),
    },
    technicalRouteScorecard: {
      generatedAt: new Date().toISOString(),
      canProceedToCoding: selectedCanProceed,
      inheritedBlockingReasons: compact([
        ...(input.blockingReasons ?? []),
        ...(input.requiredClarifications ?? []),
        ...(input.executionTaskSummary?.globalBlockingReasons ?? []),
      ], 16),
      routeScores,
    },
  };
}