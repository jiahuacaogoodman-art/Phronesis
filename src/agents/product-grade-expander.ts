import type {
  DomainAnalysis,
  ProductCapability,
  ProductExpansion,
  ProductIntentModel,
  ReconstructedIntent,
  SynthesizedCapability,
} from "../types/artifacts.js";

function capability(
  id: string,
  name: string,
  priority: ProductCapability["priority"],
  whyItMatters: string,
  acceptanceSignal: string,
  extras = {},
): ProductCapability {
  return { id, name, priority, description: whyItMatters, whyItMatters, acceptanceSignal, ...extras };
}

function domainExtras(confidence = 0.78) {
  return {
    evidenceRefs: ["E-DOMAIN-001", "E-PRINCIPLE-001"],
    assumptionRefs: ["A-001"],
    confidence,
    rejectionImpactIfMissing: "领域增强能力缺失会让方案退化为泛化产品方案，降低成品级适配度。",
    missingEvidenceImpact: "如果领域识别或真实流程规则被推翻，该领域增强能力需要重新评估。",
  };
}

function fromSynthesized(item: SynthesizedCapability): ProductCapability {
  return capability(
    item.id,
    item.name,
    item.priority,
    item.whyNeeded,
    item.systemCapability,
    {
      whyNeeded: item.whyNeeded,
      triggeredBy: item.triggeredBy,
      userValue: item.userValue,
      systemCapability: item.systemCapability,
      riskIfMissing: item.riskIfMissing,
      evidenceRefs: item.evidenceRefs,
      assumptionRefs: item.assumptionRefs,
      confidence: item.confidence,
      rejectionImpactIfMissing: item.rejectionImpactIfMissing,
      missingEvidenceImpact: item.missingEvidenceImpact,
    },
  );
}

function addUnique(items: ProductCapability[], capability: ProductCapability) {
  if (!items.some((item) => item.id === capability.id || item.name === capability.name)) {
    items.push(capability);
  }
}

function domainEnhancements(domainAnalysis: DomainAnalysis): ProductCapability[] {
  if (domainAnalysis.domainId === "attendance-checkin") {
    return [
      capability("domain-identity-authentication", "身份认证", "must", "签到记录需要可信主体。", "每条签到记录能追溯到已认证或风险评分身份。", domainExtras()),
      capability("domain-role-permissions", "角色权限", "must", "组织者、审核员、管理员不能共用同一权限。", "权限矩阵覆盖活动、审核、导出、配置和审计。", domainExtras()),
      capability("domain-activity-management", "签到活动管理", "must", "签到不是一次性表单，而是可配置活动。", "可创建活动、名单、时间窗口、签到策略和结束状态。", domainExtras()),
      capability("domain-dynamic-qr", "动态二维码", "must", "静态码和固定链接容易被转发。", "二维码或签到令牌具备过期、轮换和服务端校验。", domainExtras()),
      capability("domain-anti-proxy", "防代签", "must", "成品级签到需要识别低成本代签。", "系统记录并评估重复设备、异常时间、异常来源和令牌复用。", domainExtras()),
      capability("domain-device-binding", "设备绑定", "should", "设备记忆能辅助识别异常和重复行为。", "设备标识具备绑定、重置、申诉和隐私边界。", domainExtras(0.72)),
      capability("domain-geo-time-window", "地理位置或时间窗口", "should", "签到通常受地点或时间约束。", "活动可配置有效时间、迟到规则和可选位置策略。", domainExtras(0.72)),
      capability("domain-roster-import", "名单导入", "should", "真实活动常依赖既有名单。", "支持导入名单并处理重复、缺失和格式错误。", domainExtras(0.72)),
      capability("domain-data-export", "数据导出", "must", "签到结果需要用于统计和归档。", "导出包含筛选、状态、审核意见和审计信息。", domainExtras()),
      capability("domain-exception-review", "异常签到审核", "must", "异常不应直接丢弃或默认通过。", "异常记录可审核、备注、通过、驳回和追踪。", domainExtras()),
      capability("domain-audit-log", "日志审计", "must", "关键操作和记录变更需要可追溯。", "敏感操作写入不可随意篡改的审计日志。", domainExtras()),
      capability("domain-deployment-plan", "部署方案", "must", "系统需要运行在真实环境中。", "部署拓扑、配置、备份和监控策略明确。", domainExtras()),
    ];
  }

  if (domainAnalysis.domainId === "medical-quiz-practice") {
    return [
      capability("domain-question-bank", "题库管理", "must", "刷题系统需要可维护的题库而不是硬编码题目。", "可创建、编辑、禁用、版本化和批量管理题目。", domainExtras()),
      capability("domain-question-classification", "题目分类", "must", "用户需要按学科、题型和难度练习。", "题目可按科目、章节、题型、难度等维度筛选。", domainExtras()),
      capability("domain-taxonomy-tags", "章节/知识点标签", "must", "医学学习依赖知识结构。", "每题可绑定章节、知识点、疾病/系统等标签。", domainExtras()),
      capability("domain-wrong-question-book", "错题本", "must", "错题复盘是学习闭环核心。", "错误题目自动进入错题本并支持复练、移除和统计。", domainExtras()),
      capability("domain-favorite-questions", "收藏题", "should", "学习者需要保存重点题。", "用户可收藏、取消收藏和按收藏练习。", domainExtras(0.72)),
      capability("domain-practice-records", "刷题记录", "must", "学习进度和推荐都依赖历史记录。", "记录作答、耗时、正确率、解析查看和复练状态。", domainExtras()),
      capability("domain-explanation-management", "解析管理", "must", "医学题必须有高质量解析和纠错入口。", "每题支持答案解析、选项解释、来源说明和编辑审核。", domainExtras()),
      capability("domain-exam-mode", "考试模式", "must", "用户需要模拟正式测验场景。", "支持限时、交卷、评分、回顾和成绩记录。", domainExtras()),
      capability("domain-random-paper", "随机组卷", "should", "系统需要按规则生成练习或模拟卷。", "可按科目、章节、难度和题量生成试卷。", domainExtras(0.72)),
      capability("domain-learning-progress", "学习进度", "must", "用户需要知道弱项和完成度。", "展示正确率、知识点掌握、练习量和趋势。", domainExtras()),
      capability("domain-user-permissions", "用户权限", "must", "学习者、编辑和审核员权限不同。", "权限矩阵覆盖练习、题库编辑、审核、导入导出和统计。", domainExtras()),
      capability("domain-content-review", "内容审核", "must", "医学内容错误会造成高风险学习误导。", "题目和解析进入审核、纠错、发布和下架流程。", domainExtras()),
    ];
  }

  if (domainAnalysis.domainId === "schedule-calendar-management") {
    return [
      capability("domain-course-management", "课程管理", "must", "系统需要管理课程实体、班级和教学安排。", "可创建、编辑、发布、归档课程安排。", domainExtras()),
      capability("domain-teacher-student-roles", "教师/学生角色", "must", "不同用户看到和修改的内容不同。", "角色决定课程查看、编辑、调课、审批和通知权限。", domainExtras()),
      capability("domain-time-conflict", "时间冲突检测", "must", "排课核心风险是时间和资源冲突。", "保存或发布前检测教师、学生、班级、教室时间冲突。", domainExtras()),
      capability("domain-room-resource", "教室资源管理", "must", "教室容量、设备和可用时间影响排课。", "教室具备容量、位置、设备、可用时段和占用状态。", domainExtras()),
      capability("domain-recurrence-rules", "重复课程规则", "must", "课程通常按周或周期重复。", "支持周次、单双周、节次、例外日期和结束规则。", domainExtras()),
      capability("domain-rescheduling", "调课", "must", "真实课程经常需要调整。", "调课流程包含申请、审批、冲突检测、记录和通知。", domainExtras()),
      capability("domain-course-suspension", "停课", "should", "停课也是课程变更核心场景。", "支持停课原因、影响范围、补课关联和通知。", domainExtras(0.72)),
      capability("domain-calendar-view", "日历视图", "must", "课程表需要可视化时间布局。", "按日、周、月、个人、班级、教室视图查看课程。", domainExtras()),
      capability("domain-permission-management", "权限管理", "must", "教务操作需要边界。", "权限矩阵覆盖查看、编辑、调课、审批、导入导出。", domainExtras()),
      capability("domain-data-backup", "数据备份", "must", "课程安排是高价值运营数据。", "具备备份、恢复和变更记录。", domainExtras()),
    ];
  }

  return [];
}

function principlesFor(intent: ProductIntentModel, domainAnalysis: DomainAnalysis) {
  const base = [
    "先从 actors、resources、workflows、risks 推导能力，而不是直接套页面或技术栈。",
    "多角色、多资源、多状态系统必须把权限、生命周期和审计作为前置设计。",
    "有数据沉淀的目标必须规划导出、统计、备份和部署运维。",
  ];

  if (domainAnalysis.domainId === "attendance-checkin") {
    return ["签到记录必须绑定可信身份和可审计证据。", "签到凭证不能是可长期转发的静态链接。", ...base];
  }
  if (domainAnalysis.domainId === "medical-quiz-practice") {
    return ["刷题产品的核心是题库治理、学习闭环和内容质量控制。", "解析、错题和学习进度不能被降级成题目列表。", ...base];
  }
  if (domainAnalysis.domainId === "schedule-calendar-management") {
    return ["课程表系统不是静态表格，而是时间、角色、资源和规则的协调系统。", "冲突检测、调停课和通知是核心产品能力。", ...base];
  }
  return base;
}

function demoTrapsFor(intent: ProductIntentModel, domainAnalysis: DomainAnalysis) {
  const traps = [
    "只有一个表单或列表，没有资源、流程和状态设计。",
    "有多角色但没有权限系统。",
    "有核心资源但没有后台管理。",
    "有状态流转但没有生命周期状态机。",
    "有数据沉淀但没有导出、统计、备份或审计。",
  ];

  if (domainAnalysis.domainId === "attendance-checkin") {
    return ["HTML 表单 + localStorage。", "无认证签到。", "无防代签。", "无审计。", "无后台管理。", ...traps];
  }
  if (domainAnalysis.domainId === "medical-quiz-practice") {
    return ["只有题目列表。", "无解析。", "无错题本。", "无题库管理。", "无知识点体系。", "无学习记录。", ...traps];
  }
  if (domainAnalysis.domainId === "schedule-calendar-management") {
    return ["只有静态表格。", "无冲突检测。", "无调课机制。", "无通知。", "无权限。", "无教室资源模型。", ...traps];
  }
  if (intent.coreWorkflows.some((workflow) => workflow.includes("预约"))) {
    return ["只有预约表单。", "无资源可用性规则。", "无冲突检测。", "无审批。", "无使用记录或审计。", ...traps];
  }
  return traps;
}

export function expandProductGradeRequirements(
  intent: ReconstructedIntent,
  domainAnalysis: DomainAnalysis,
  productIntent: ProductIntentModel,
  synthesizedCapabilities: SynthesizedCapability[],
): ProductExpansion {
  const coreCapabilities = synthesizedCapabilities.map(fromSynthesized);
  for (const enhancement of domainEnhancements(domainAnalysis)) {
    addUnique(coreCapabilities, enhancement);
  }

  const operationalCapabilities: ProductCapability[] = [];
  for (const id of ["admin-console", "import-export", "analytics-reporting", "audit-log", "deployment-operation", "backup-recovery"]) {
    const found = synthesizedCapabilities.find((capability) => capability.id === id);
    if (found) {
      addUnique(operationalCapabilities, fromSynthesized(found));
    }
  }

  const nonFunctionalRequirements: ProductCapability[] = [];
  for (const id of ["security-boundary", "compliance-privacy", "deployment-operation", "backup-recovery"]) {
    const found = synthesizedCapabilities.find((capability) => capability.id === id);
    if (found) {
      addUnique(nonFunctionalRequirements, fromSynthesized(found));
    }
  }

  return {
    goalSummary: `Design a product-grade system for: ${intent.normalizedGoal}`,
    productGradePrinciples: principlesFor(productIntent, domainAnalysis),
    userRoles: [...productIntent.primaryActors, ...productIntent.secondaryActors],
    coreCapabilities,
    operationalCapabilities,
    nonFunctionalRequirements,
    demoTrapsToAvoid: demoTrapsFor(productIntent, domainAnalysis),
  };
}