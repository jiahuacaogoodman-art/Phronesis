import type { DomainAnalysis, ProductIntentModel } from "../types/artifacts.ts";

function includesAny(text: string, signals: string[]) {
  return signals.some((signal) => text.includes(signal.toLowerCase()));
}

function uniq(items: string[]) {
  return Array.from(new Set(items.filter(Boolean)));
}

function baseIntent(rawGoal: string, domainAnalysis: DomainAnalysis): ProductIntentModel {
  return {
    rawGoal,
    normalizedGoal: rawGoal.trim().replace(/\s+/g, " "),
    domainId: domainAnalysis.domainId,
    primaryActors: ["最终用户", "运营人员"],
    secondaryActors: ["系统管理员"],
    coreResources: ["业务对象", "用户", "记录"],
    coreWorkflows: ["创建", "管理", "查询", "状态更新"],
    dataObjects: ["用户记录", "业务记录", "操作日志"],
    lifecycleStages: ["草稿", "有效", "归档"],
    permissionBoundaries: ["普通用户", "运营人员", "管理员"],
    riskSurfaces: ["权限滥用", "数据错误", "操作不可追溯"],
    operationalNeeds: ["后台管理", "配置管理", "日志审计", "部署运维"],
    reportingNeeds: ["数据导出", "基础统计"],
    integrationNeeds: ["身份系统可选集成"],
    deploymentAssumptions: ["可部署到标准服务器或云平台", "需要备份和恢复策略"],
    uncertaintyNotes: ["目标信息较简略，需要后续确认用户规模、权限边界和部署环境。"],
  };
}

function attendanceIntent(rawGoal: string, domainAnalysis: DomainAnalysis): ProductIntentModel {
  return {
    ...baseIntent(rawGoal, domainAnalysis),
    primaryActors: ["参与者", "活动组织者", "审核员"],
    secondaryActors: ["系统管理员", "审计员"],
    coreResources: ["签到活动", "名单", "动态二维码", "设备", "签到记录", "异常审核记录"],
    coreWorkflows: ["活动创建", "名单导入", "扫码签到", "防代签校验", "异常审核", "结果导出"],
    dataObjects: ["用户身份", "活动配置", "签到记录", "设备记录", "审核记录", "审计日志"],
    lifecycleStages: ["活动草稿", "活动发布", "签到进行中", "活动结束", "审核归档"],
    permissionBoundaries: ["参与者只能提交本人签到", "组织者管理活动和名单", "审核员处理异常", "管理员配置策略"],
    riskSurfaces: ["代签", "二维码转发", "重复签到", "设备伪造", "异常记录不可追溯"],
    operationalNeeds: ["后台管理", "签到策略配置", "异常审核", "通知", "审计", "部署方案"],
    reportingNeeds: ["签到结果导出", "异常记录统计", "活动出勤率统计"],
    integrationNeeds: ["身份认证系统", "消息通知渠道", "名单数据导入"],
    deploymentAssumptions: ["签到高峰窗口需要稳定可用", "需要备份签到记录和审计日志"],
    uncertaintyNotes: ["需要确认身份源、地理位置要求、防代签强度和隐私边界。"],
  };
}

function medicalQuizIntent(rawGoal: string, domainAnalysis: DomainAnalysis): ProductIntentModel {
  return {
    ...baseIntent(rawGoal, domainAnalysis),
    primaryActors: ["学习者", "题库编辑", "内容审核员"],
    secondaryActors: ["教师", "系统管理员"],
    coreResources: ["题目", "题库", "章节", "知识点", "解析", "错题记录", "模拟试卷"],
    coreWorkflows: ["题库维护", "内容审核", "刷题练习", "查看解析", "错题复练", "考试模拟", "学习进度跟踪"],
    dataObjects: ["题目记录", "选项和答案", "解析", "标签", "作答记录", "错题本", "学习统计"],
    lifecycleStages: ["题目草稿", "待审核", "已发布", "已纠错", "已下架"],
    permissionBoundaries: ["学习者练习", "编辑维护题目", "审核员发布内容", "管理员管理权限"],
    riskSurfaces: ["题目错误", "解析缺失", "知识点标签混乱", "学习记录丢失", "内容未经审核"],
    operationalNeeds: ["题库管理", "内容审核", "导入导出", "纠错反馈", "备份恢复"],
    reportingNeeds: ["学习进度", "正确率统计", "知识点薄弱分析", "题目质量统计"],
    integrationNeeds: ["题库导入模板", "用户身份系统可选集成"],
    deploymentAssumptions: ["题库和学习记录需要长期保存", "内容更新需要审核和回滚能力"],
    uncertaintyNotes: ["需要确认医学题源、题型范围、知识点体系和内容审核责任。"],
  };
}

function scheduleIntent(rawGoal: string, domainAnalysis: DomainAnalysis): ProductIntentModel {
  return {
    ...baseIntent(rawGoal, domainAnalysis),
    primaryActors: ["学生", "教师", "教务管理员"],
    secondaryActors: ["教室管理员", "系统管理员"],
    coreResources: ["课程", "教师", "学生", "教室", "时间段", "重复规则", "调课记录"],
    coreWorkflows: ["课程创建", "排课", "冲突检测", "调课", "停课", "通知", "导入导出"],
    dataObjects: ["课程记录", "时间表", "教室占用", "重复规则", "变更记录", "通知记录"],
    lifecycleStages: ["草稿", "待发布", "已发布", "已调整", "已停课", "已归档"],
    permissionBoundaries: ["学生查看", "教师查看和申请调整", "教务管理员排课和审批", "教室管理员维护资源"],
    riskSurfaces: ["时间冲突", "教室冲突", "教师冲突", "调课通知遗漏", "导入数据错误"],
    operationalNeeds: ["课程管理", "教室资源配置", "冲突处理", "通知", "备份", "变更审计"],
    reportingNeeds: ["课程表导出", "教室使用统计", "调停课记录"],
    integrationNeeds: ["教务系统数据导入", "日历同步可选集成", "通知渠道"],
    deploymentAssumptions: ["课表数据需要长期可用", "批量导入和恢复能力重要"],
    uncertaintyNotes: ["需要确认是否接入教务系统、排课规则复杂度和通知渠道。"],
  };
}

function labEquipmentReservationIntent(rawGoal: string, domainAnalysis: DomainAnalysis): ProductIntentModel {
  return {
    ...baseIntent(rawGoal, domainAnalysis),
    primaryActors: ["学生", "教师", "实验室管理员"],
    secondaryActors: ["设备负责人", "系统管理员"],
    coreResources: ["设备", "预约时段", "实验室", "用户", "审批记录", "使用记录"],
    coreWorkflows: ["设备浏览", "预约申请", "时间冲突检测", "审批", "取消预约", "使用记录登记", "违规或损坏记录"],
    dataObjects: ["设备档案", "可用时段", "预约单", "审批记录", "使用记录", "通知记录", "审计日志"],
    lifecycleStages: ["设备可预约", "预约申请", "待审批", "已批准", "使用中", "已完成", "已取消", "异常记录"],
    permissionBoundaries: ["学生提交预约", "教师或负责人审批", "实验室管理员配置设备和规则", "管理员维护系统权限"],
    riskSurfaces: ["重复预约", "时间冲突", "权限滥用", "设备损坏责任不清", "爽约", "资源冲突"],
    operationalNeeds: ["后台管理", "资源配置", "预约规则", "审批流", "通知", "审计"],
    reportingNeeds: ["使用率统计", "预约记录导出", "设备利用率", "异常使用记录"],
    integrationNeeds: ["身份系统可选集成", "通知渠道", "实验室设备台账导入"],
    deploymentAssumptions: ["预约服务需要长期运行", "设备和预约记录需要备份恢复"],
    uncertaintyNotes: ["需要确认审批规则、可预约时间粒度、是否需要现场签到和设备损坏责任流程。"],
  };
}

function researchProjectIntent(rawGoal: string, domainAnalysis: DomainAnalysis): ProductIntentModel {
  return {
    ...baseIntent(rawGoal, domainAnalysis),
    primaryActors: ["项目负责人", "项目成员", "协作者"],
    secondaryActors: ["导师或 PI", "科研管理员", "系统管理员"],
    coreResources: ["项目", "成员", "里程碑", "任务", "文档", "成果", "进度记录"],
    coreWorkflows: ["项目创建", "成员协作", "任务分配", "里程碑跟踪", "文档或成果管理", "进度汇报", "权限协作"],
    dataObjects: ["项目档案", "成员角色", "任务记录", "里程碑", "文档", "成果", "进度日志", "讨论记录"],
    lifecycleStages: ["项目立项", "进行中", "阶段验收", "结题", "归档"],
    permissionBoundaries: ["负责人管理项目", "成员更新任务和文档", "管理员查看统计", "外部协作者受限访问"],
    riskSurfaces: ["任务延期", "成员权限混乱", "文档版本丢失", "进度不透明", "成果归属不清"],
    operationalNeeds: ["项目空间管理", "成员权限", "任务看板", "里程碑配置", "文档管理", "进度提醒"],
    reportingNeeds: ["项目进度统计", "任务完成率", "成果清单导出", "里程碑报告"],
    integrationNeeds: ["文件存储", "通知渠道", "身份系统可选集成"],
    deploymentAssumptions: ["需要长期保存项目文档和进度记录", "需要权限隔离和备份恢复"],
    uncertaintyNotes: ["需要确认是否面向课题组、学院还是个人团队，以及文档协作和成果审核流程。"],
  };
}

function clubActivityRegistrationIntent(rawGoal: string, domainAnalysis: DomainAnalysis): ProductIntentModel {
  return {
    ...baseIntent(rawGoal, domainAnalysis),
    primaryActors: ["报名者", "社团管理员", "活动负责人"],
    secondaryActors: ["审核员", "系统管理员"],
    coreResources: ["活动", "报名表", "名额", "参与名单", "审核或确认记录", "通知记录"],
    coreWorkflows: ["活动发布", "报名提交", "名额控制", "审核或确认", "通知", "名单管理", "导出"],
    dataObjects: ["活动信息", "报名记录", "名额配置", "审核状态", "名单", "通知记录", "导出文件"],
    lifecycleStages: ["活动草稿", "报名开放", "名额已满", "待审核", "已确认", "已结束", "名单归档"],
    permissionBoundaries: ["报名者提交和取消报名", "社团管理员配置活动和名额", "审核员确认报名", "管理员导出名单"],
    riskSurfaces: ["超额报名", "重复报名", "审核遗漏", "通知不到位", "名单导出错误"],
    operationalNeeds: ["活动后台管理", "报名规则", "名额配置", "审核确认", "通知", "名单管理"],
    reportingNeeds: ["报名名单导出", "活动报名统计", "候补和审核状态统计"],
    integrationNeeds: ["通知渠道", "身份系统可选集成", "表格导入导出"],
    deploymentAssumptions: ["活动报名高峰需要稳定可用", "报名数据需要备份和导出"],
    uncertaintyNotes: ["需要确认是否需要收费、候补、签到联动和报名资格校验。"],
  };
}

function genericInferredIntent(rawGoal: string, domainAnalysis: DomainAnalysis): ProductIntentModel {
  const lower = rawGoal.toLowerCase();
  if (includesAny(lower, ["预约", "预定", "设备", "实验室", "场地", "booking", "reservation"])) {
    return labEquipmentReservationIntent(rawGoal, domainAnalysis);
  }
  if (includesAny(lower, ["科研", "项目", "课题", "里程碑", "任务", "成果", "project"])) {
    return researchProjectIntent(rawGoal, domainAnalysis);
  }
  if (includesAny(lower, ["社团", "活动", "报名", "名额", "registration", "signup"])) {
    return clubActivityRegistrationIntent(rawGoal, domainAnalysis);
  }
  return baseIntent(rawGoal, domainAnalysis);
}

export function buildProductIntent(rawGoal: string, domainAnalysis: DomainAnalysis): ProductIntentModel {
  if (domainAnalysis.domainId === "attendance-checkin") {
    return attendanceIntent(rawGoal, domainAnalysis);
  }
  if (domainAnalysis.domainId === "medical-quiz-practice") {
    return medicalQuizIntent(rawGoal, domainAnalysis);
  }
  if (domainAnalysis.domainId === "schedule-calendar-management") {
    return scheduleIntent(rawGoal, domainAnalysis);
  }
  return genericInferredIntent(rawGoal, domainAnalysis);
}