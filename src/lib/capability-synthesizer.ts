import type { EvidenceLedger, ProductIntentModel, SynthesizedCapability } from "../types/artifacts.ts";
import { assumptionRefsForLedger, refsForCapability } from "./evidence-ledger.ts";

function hasAny(values: string[], signals: string[]) {
  const joined = values.join(" ").toLowerCase();
  return signals.some((signal) => joined.includes(signal.toLowerCase()));
}

function evidence(label: string, values: string[]) {
  return values.map((value) => `${label}:${value}`);
}

function makeCapability(
  id: string,
  name: string,
  priority: SynthesizedCapability["priority"],
  whyNeeded: string,
  triggeredBy: string[],
  userValue: string,
  systemCapability: string,
  riskIfMissing: string,
): SynthesizedCapability {
  return {
    id,
    name,
    priority,
    whyNeeded,
    triggeredBy,
    userValue,
    systemCapability,
    riskIfMissing,
  };
}

function addUnique(capabilities: SynthesizedCapability[], capability: SynthesizedCapability) {
  if (!capabilities.some((item) => item.id === capability.id)) {
    capabilities.push(capability);
  }
}

export function synthesizeCapabilities(intent: ProductIntentModel, ledger?: EvidenceLedger): SynthesizedCapability[] {
  const capabilities: SynthesizedCapability[] = [];

  if (intent.primaryActors.length + intent.secondaryActors.length > 1) {
    addUnique(capabilities, makeCapability(
      "identity-and-auth",
      "身份与账号体系",
      "must",
      "多个参与方需要可区分、可追踪的身份边界。",
      evidence("actor", [...intent.primaryActors, ...intent.secondaryActors]),
      "用户能以明确身份进入自己的工作流。",
      "提供登录、身份绑定、会话和账号状态管理。",
      "无法追踪责任主体，权限和审计都会失效。",
    ));
    addUnique(capabilities, makeCapability(
      "role-permission",
      "角色权限",
      "must",
      "多角色系统需要限制不同 actor 的可见和可操作范围。",
      [...evidence("actor", intent.primaryActors), ...evidence("permission", intent.permissionBoundaries)],
      "不同用户只看到并操作自己被允许的内容。",
      "提供角色、权限矩阵、授权检查和拒绝状态。",
      "会出现越权操作、误改数据或协作边界不清。",
    ));
  }

  if (intent.coreResources.length > 0) {
    addUnique(capabilities, makeCapability(
      "resource-management",
      "资源管理",
      "must",
      "目标包含需要配置、维护或分配的核心资源。",
      evidence("resource", intent.coreResources),
      "运营者能维护资源，用户能围绕资源完成核心任务。",
      "提供资源 CRUD、状态、可用性、归档和管理入口。",
      "资源会变成散乱数据，无法支撑真实运营。",
    ));
  }

  if (intent.coreWorkflows.length > 0) {
    addUnique(capabilities, makeCapability(
      "workflow-management",
      "流程管理",
      "must",
      "目标包含多个业务步骤，需要明确流程而非单页提交。",
      evidence("workflow", intent.coreWorkflows),
      "用户知道当前步骤、下一步和失败处理方式。",
      "提供流程状态、动作、校验、错误状态和回退路径。",
      "系统只能覆盖 happy path，无法处理真实业务变化。",
    ));
  }

  if (intent.lifecycleStages.length > 2) {
    addUnique(capabilities, makeCapability(
      "lifecycle-state-machine",
      "生命周期状态机",
      "must",
      "业务对象存在多个状态，需要受控流转。",
      evidence("stage", intent.lifecycleStages),
      "用户能理解对象当前状态，运营者能控制状态变化。",
      "提供状态机、合法迁移、状态审计和异常状态处理。",
      "状态会混乱，审批、取消、归档和恢复难以可信执行。",
    ));
  }

  if (hasAny([...intent.coreWorkflows, ...intent.riskSurfaces, ...intent.coreResources], ["预约", "时段", "排期", "课程", "日历", "教室", "冲突", "名额", "容量", "resource", "schedule"])) {
    addUnique(capabilities, makeCapability(
      "conflict-detection",
      "冲突检测",
      "must",
      "目标涉及时间、容量、排期或资源占用，冲突是核心风险。",
      [...evidence("workflow", intent.coreWorkflows), ...evidence("risk", intent.riskSurfaces)],
      "用户能在提交前知道是否可用，运营者能避免资源冲突。",
      "提供时间/容量/资源冲突检测、冲突解释和替代建议。",
      "会出现重复预约、超额报名、时间冲突或资源占用错误。",
    ));
  }

  if (hasAny([...intent.coreWorkflows, ...intent.lifecycleStages, ...intent.operationalNeeds], ["审批", "审核", "确认", "review", "approval"])) {
    addUnique(capabilities, makeCapability(
      "review-and-approval",
      "审核与审批",
      "must",
      "流程中存在人工确认、审批或异常处理。",
      [...evidence("workflow", intent.coreWorkflows), ...evidence("stage", intent.lifecycleStages)],
      "需要被确认的事项能进入清晰队列并得到反馈。",
      "提供审核队列、审批动作、意见、驳回和状态更新。",
      "异常或待确认事项会丢失，责任边界不清。",
    ));
  }

  if (hasAny([...intent.operationalNeeds, ...intent.coreWorkflows], ["通知", "提醒", "消息", "notification"])) {
    addUnique(capabilities, makeCapability(
      "notification",
      "通知提醒",
      "should",
      "核心流程会影响用户行动，需要及时触达。",
      [...evidence("operation", intent.operationalNeeds), ...evidence("workflow", intent.coreWorkflows)],
      "用户能收到状态变化、审批结果或日程变化。",
      "提供通知事件、收件人、渠道、模板和重试策略。",
      "用户会错过变化，运营人员需要大量人工沟通。",
    ));
  }

  if (hasAny([...intent.reportingNeeds, ...intent.operationalNeeds], ["导入", "导出", "名单", "表格", "import", "export"])) {
    addUnique(capabilities, makeCapability(
      "import-export",
      "导入导出",
      "should",
      "业务数据需要批量迁移、名单管理或外部归档。",
      [...evidence("reporting", intent.reportingNeeds), ...evidence("operation", intent.operationalNeeds)],
      "运营者能批量维护和带走数据。",
      "提供模板导入、校验报告、筛选导出和格式定义。",
      "数据维护成本高，无法形成可信交付物。",
    ));
  }

  if (intent.reportingNeeds.length > 0 || hasAny(intent.coreWorkflows, ["进度", "统计", "记录", "跟踪"])) {
    addUnique(capabilities, makeCapability(
      "analytics-reporting",
      "统计报表",
      "should",
      "目标会沉淀记录，需要可解释的统计和导出。",
      evidence("reporting", intent.reportingNeeds),
      "管理者能理解使用情况、进度、结果和异常。",
      "提供指标定义、筛选、统计、报表和导出。",
      "数据只能堆积，无法支撑管理决策。",
    ));
  }

  if (hasAny([...intent.riskSurfaces, ...intent.operationalNeeds, ...intent.permissionBoundaries], ["责任", "审计", "滥用", "损坏", "越权", "变更", "审核", "归属", "成果", "approval", "audit"])) {
    addUnique(capabilities, makeCapability(
      "audit-log",
      "日志审计",
      "must",
      "系统包含责任追踪、权限边界或高价值记录变更。",
      [...evidence("risk", intent.riskSurfaces), ...evidence("permission", intent.permissionBoundaries)],
      "关键变更可追溯，争议和异常可复盘。",
      "记录关键动作、操作者、时间、对象、前后状态和原因。",
      "出现争议时无法说明谁做了什么。",
    ));
  }

  if (intent.operationalNeeds.length > 0 || intent.coreResources.length > 0) {
    addUnique(capabilities, makeCapability(
      "admin-console",
      "后台管理",
      "must",
      "长期运行的系统需要运营入口，而非只给终端用户一个表单。",
      [...evidence("operation", intent.operationalNeeds), ...evidence("resource", intent.coreResources)],
      "运营者能配置规则、维护资源、处理异常和查看状态。",
      "提供管理入口、筛选、配置、批量操作和异常处理。",
      "运营只能靠改数据或人工表格，系统无法成品化。",
    ));
  }

  addUnique(capabilities, makeCapability(
    "security-boundary",
    "安全边界",
    "must",
    "任何多用户产品都需要定义数据可见性、输入校验和权限边界。",
    [...evidence("actor", intent.primaryActors), ...evidence("risk", intent.riskSurfaces)],
    "用户数据和业务动作有清晰保护边界。",
    "提供授权检查、输入校验、数据隔离和错误处理。",
    "越权、脏数据和误操作风险无法控制。",
  ));

  addUnique(capabilities, makeCapability(
    "deployment-operation",
    "部署运维",
    "must",
    "产品级系统需要说明如何真实运行和维护。",
    evidence("deployment", intent.deploymentAssumptions),
    "系统能从设计进入可运行环境。",
    "定义部署拓扑、配置、监控、日志和运行手册。",
    "方案停留在 demo，无法交付给真实用户。",
  ));

  addUnique(capabilities, makeCapability(
    "backup-recovery",
    "备份恢复",
    "should",
    "目标会沉淀业务记录，需要应对误删、故障和迁移。",
    [...evidence("data", intent.dataObjects), ...evidence("deployment", intent.deploymentAssumptions)],
    "重要数据可恢复，运营风险可控。",
    "提供备份策略、恢复流程、保留周期和演练要求。",
    "数据丢失会直接破坏产品可信度。",
  ));

  if (hasAny([...intent.dataObjects, ...intent.riskSurfaces, ...intent.deploymentAssumptions], ["身份", "用户", "设备", "学习", "预约", "项目", "报名", "隐私", "合规"])) {
    addUnique(capabilities, makeCapability(
      "compliance-privacy",
      "合规与隐私",
      "should",
      "系统处理用户、行为或业务记录，需要定义收集和留存边界。",
      [...evidence("data", intent.dataObjects), ...evidence("risk", intent.riskSurfaces)],
      "用户和组织知道数据如何被使用和保留。",
      "定义数据最小化、访问控制、留存周期和删除/导出边界。",
      "后续上线会遇到隐私、合规或信任风险。",
    ));
  }

  if (!ledger) {
    return capabilities;
  }

  const assumptionRefs = assumptionRefsForLedger(ledger);
  return capabilities.map((capability) => {
    const evidenceRefs = refsForCapability(capability.id, ledger);
    const missingPenalty = ledger.missingEvidence.length * ledger.confidenceModel.missingEvidencePenalty;
    const baseConfidence = capability.priority === "must" ? 0.84 : capability.priority === "should" ? 0.76 : 0.68;
    return {
      ...capability,
      evidenceRefs,
      assumptionRefs,
      confidence: Number(Math.max(0.45, baseConfidence - missingPenalty / 2).toFixed(2)),
      rejectionImpactIfMissing: capability.riskIfMissing,
    };
  });
}