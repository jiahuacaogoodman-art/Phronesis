import type {
  EvidenceLedger,
  ProductExpansion,
  ProductIntentModel,
  RiskLevel,
  RouteDeepDiveReport,
  StrategyCandidate,
} from "../types/artifacts.js";

type RouteAnalysis = RouteDeepDiveReport["routeAnalyses"][number];
type TechnicalAxis = RouteAnalysis["technicalImplementationAxes"][number];
type RouteRisk = RouteAnalysis["riskRegister"][number];
type ProductizationBar = RouteAnalysis["productizationBar"][number];
type OnlineResearch = RouteAnalysis["onlineResearch"];

interface SearchFinding {
  title: string;
  url: string;
  snippet: string;
}

interface SearchResult {
  query: string;
  findings: SearchFinding[];
  error?: string;
}

interface OnlineOptions {
  online?: boolean;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

interface RouteDeepDiveInput extends OnlineOptions {
  goal: string;
  strategies: StrategyCandidate[];
  productIntent: ProductIntentModel;
  productExpansion: ProductExpansion;
  evidenceLedger: EvidenceLedger;
}

function uniq(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)));
}

function first(items: string[], fallback: string): string {
  return items[0] ?? fallback;
}

function includesAny(values: string[], signals: string[]): boolean {
  const text = values.join(" ").toLowerCase();
  return signals.some((signal) => text.includes(signal.toLowerCase()));
}

const bannedGenericRiskLabels = new Set([
  "权限滥用",
  "数据错误",
  "操作不可追溯",
]);

function intentText(intent: ProductIntentModel): string {
  return [
    intent.domainId,
    intent.rawGoal,
    intent.normalizedGoal,
    ...intent.primaryActors,
    ...intent.secondaryActors,
    ...intent.coreResources,
    ...intent.coreWorkflows,
    ...intent.riskSurfaces,
    ...intent.operationalNeeds,
    ...intent.integrationNeeds,
  ].join(" ");
}

function isMedicalInternRotationIntent(intent: ProductIntentModel): boolean {
  return includesAny([intentText(intent)], ["medical-intern-rotation-management", "医院实习", "轮转", "带教", "科室", "出科"]);
}

function productIntentSignalsConsumed(intent: ProductIntentModel): NonNullable<RouteAnalysis["productIntentSignalsConsumed"]> {
  return {
    "coreResources": intent.coreResources,
    "coreWorkflows": intent.coreWorkflows,
    "riskSurfaces": intent.riskSurfaces,
    "integrationNeeds": intent.integrationNeeds,
    "operationalNeeds": intent.operationalNeeds,
  };
}

function severityFor(strategy: StrategyCandidate, risk: string): RiskLevel {
  const text = `${strategy.title} ${strategy.thesis} ${risk}`.toLowerCase();
  if (strategy.estimatedComplexity === "very-high" || includesAny([text], ["合规", "隐私", "越权", "集成", "主数据", "审计"])) return "high";
  if (strategy.estimatedComplexity === "high" || includesAny([text], ["冲突", "审批", "迁移", "同步", "签到"])) return "medium";
  return "low";
}

function technicalAxes(strategy: StrategyCandidate, intent: ProductIntentModel): TechnicalAxis[] {
  const resource = first(intent.coreResources, "核心资源");
  const workflow = first(intent.coreWorkflows, "核心流程");
  const risk = first(intent.riskSurfaces, "关键风险");
  const modules = strategy.modules?.length ? strategy.modules : strategy.architectureShape;
  const axes = [
    {
      "area": "domain-model",
      "deepDiveQuestion": `这条路线如何把 ${resource} 建成稳定领域模型？`,
      "implementationFocus": modules.slice(0, 3),
      "maturityBar": "核心资源必须有唯一标识、状态、所有权、审计字段和导入导出边界。",
      "failureMode": `${resource} 只作为表格字段存在，会导致权限、流程和报表后期返工。`,
    },
    {
      "area": "workflow-state",
      "deepDiveQuestion": `这条路线如何支撑 ${workflow} 的状态流转？`,
      "implementationFocus": intent.lifecycleStages.slice(0, 5),
      "maturityBar": "必须明确允许/禁止的状态迁移、异常回退、人工覆盖和历史留痕。",
      "failureMode": "只做当前状态而不保存状态历史，会让异常审核、复盘和追责失真。",
    },
    {
      "area": "security-and-abuse",
      "deepDiveQuestion": `这条路线如何处理 ${risk}？`,
      "implementationFocus": [...strategy.securityAndAbuseResistance, ...intent.permissionBoundaries].slice(0, 5),
      "maturityBar": "权限、风控、审计、敏感字段访问和批量导出都要可验证。",
      "failureMode": "只做登录不做资源级权限，会在多角色场景里产生越权和责任不清。",
    },
    {
      "area": "operations-and-productization",
      "deepDiveQuestion": "这条路线上线后如何被运营、监控、备份、回滚和持续迭代？",
      "implementationFocus": [...strategy.operationalModel, ...intent.operationalNeeds, ...intent.deploymentAssumptions].slice(0, 6),
      "maturityBar": "需要配置后台、异常处理台、日志审计、备份恢复、监控告警、版本迁移和支持流程。",
      "failureMode": "只完成主流程演示但缺少运营面，会在真实机构落地时不可维护。",
    },
  ];
  if (isMedicalInternRotationIntent(intent)) {
    return [
      {
        "area": "rotation-cycle-model",
        "deepDiveQuestion": "轮转周期如何表达开始/结束、批次、科室容量、延期和补轮转？",
        "implementationFocus": ["轮转周期模型", "批次/学期", "科室容量", "延期/补轮转", ...modules.slice(0, 2)],
        "maturityBar": "轮转计划必须支持周期、批次、科室容量、状态历史、延期和补轮转规则。",
        "failureMode": "只把轮转当成一行排班记录，会导致请假、延期、跨科室调整和出科资格无法判断。",
      },
      {
        "area": "student-department-mentor-relation",
        "deepDiveQuestion": "学生-科室-带教三方关系如何建模并处理带教临时调整？",
        "implementationFocus": ["学生", "科室", "带教老师", "教学秘书", "责任归属", "评价权限"],
        "maturityBar": "必须明确学生归属、科室接收、带教责任、评价权限和历史变更。",
        "failureMode": "带教关系只存当前值会让评价责任、考勤确认和申诉复盘失真。",
      },
      {
        "area": "capacity-conflict-and-rescheduling",
        "deepDiveQuestion": "科室容量、时间冲突、调换、请假和补轮转如何统一校验？",
        "implementationFocus": ["科室名额", "冲突检测", "调换审批", "请假审批", "补轮转流程", "跨科室调整"],
        "maturityBar": "排期变更必须先预演冲突，再记录审批、影响学生、通知和回滚路径。",
        "failureMode": "容量变更后不重算既有轮转，会产生超额、漏排和出科资格争议。",
      },
      {
        "area": "attendance-evaluation-and-audit",
        "deepDiveQuestion": "考勤、迟到、缺勤、出科考核和评价闭环如何形成可信证据链？",
        "implementationFocus": ["考勤记录", "迟到/缺勤", "手工补录", "出科考核", "评价闭环", "审计追责"],
        "maturityBar": "考勤和考核必须有来源、修改理由、审批链、申诉处理和归档留存。",
        "failureMode": "手工补录和评价修改缺少审计会直接削弱教学管理可信度。",
      },
      {
        "area": "integration-and-notification-boundary",
        "deepDiveQuestion": "教务/医院身份系统、科室目录、通知渠道和导入导出边界怎么定？",
        "implementationFocus": ["身份系统集成", "医院科室目录", "通知提醒", "导入导出", "归档", "隐私边界"],
        "maturityBar": "外部主数据同步、通知失败、导入校验、归档导出和隐私留存必须有明确契约。",
        "failureMode": "主数据不同步会造成学生名单、科室容量和带教分配错配。",
      },
    ];
  }
  return axes;
}

function routeRiskRegister(strategy: StrategyCandidate, intent: ProductIntentModel): RouteRisk[] {
  const risks = concreteRouteRisks(strategy, intent).slice(0, 8);

  return risks.map((risk, index) => ({
    "id": `${strategy.id}-R${index + 1}`,
    "risk": risk,
    "severity": severityFor(strategy, risk),
    "whyItMayHappen": `路线 ${strategy.title} 涉及 ${strategy.architectureShape.slice(0, 2).join("、")}，如果规则或边界没有被确认，${risk} 会在真实运行中放大。`,
    "mitigation": mitigationFor(risk, intent),
    "validationSignal": validationSignalFor(risk),
  }));
}

function concreteRouteRisks(strategy: StrategyCandidate, intent: ProductIntentModel): string[] {
  if (isMedicalInternRotationIntent(intent)) {
    return uniq([
      "科室容量变更导致既有轮转计划冲突",
      "学生请假后补轮转规则不清导致出科资格争议",
      "带教老师临时调整后评价责任不清",
      "手工补录考勤导致审计可信度下降",
      "教务系统主数据不同步导致名单错配",
      "跨科室调换缺少审批链导致责任追踪困难",
      "迟到/缺勤记录口径不一致影响出科考核",
      "出科评价表版本变化导致历史成绩不可比",
      ...strategy.risks,
      ...(strategy.majorRisks ?? []),
      ...intent.riskSurfaces,
    ]).filter((risk) => !bannedGenericRiskLabels.has(risk));
  }

  const resource = first(intent.coreResources, "核心资源");
  const workflow = first(intent.coreWorkflows, "核心流程");
  return uniq([
    ...intent.riskSurfaces.map((risk) => expandGenericRisk(risk, resource, workflow, intent)),
    ...strategy.risks.map((risk) => expandGenericRisk(risk, resource, workflow, intent)),
    ...(strategy.majorRisks ?? []).map((risk) => expandGenericRisk(risk, resource, workflow, intent)),
  ]).filter((risk) => !bannedGenericRiskLabels.has(risk));
}

function expandGenericRisk(risk: string, resource: string, workflow: string, intent: ProductIntentModel): string {
  if (risk === "权限滥用") return `${resource} 在 ${workflow} 中缺少资源级授权导致越权处理`;
  if (risk === "数据错误") return `${resource} 导入或状态变更错误导致 ${workflow} 结果不可用`;
  if (risk === "操作不可追溯") return `${workflow} 的人工调整缺少操作者、原因和前后状态审计`;
  if (risk.includes("权限")) return `${risk}：需限定 ${resource} 的角色、动作和数据范围`;
  if (risk.includes("数据")) return `${risk}：需校验 ${resource} 与 ${intent.dataObjects.slice(0, 2).join("、") || "核心数据"} 的一致性`;
  return risk;
}

function mitigationFor(risk: string, intent: ProductIntentModel): string {
  if (includesAny([risk], ["冲突", "名额", "排班", "调课", "轮转"])) return "引入冲突检测、容量规则、人工 override 留痕和批量变更预演。";
  if (includesAny([risk], ["越权", "权限", "隐私", "敏感"])) return "建立角色/资源/动作矩阵，覆盖导出、批量操作和审计查询。";
  if (includesAny([risk], ["集成", "同步", "主数据", "接口"])) return "先做接口契约、幂等同步、失败重试、数据责任边界和灰度开关。";
  if (includesAny([risk], ["签到", "代签", "考勤"])) return "组合身份校验、时间窗口、异常审核、设备/位置策略和审计证据链。";
  if (includesAny([risk], ["考核", "评分", "评价"])) return "版本化表单、评分权限、申诉/更正流程和结果归档。";
  return `把 ${first(intent.coreWorkflows, "核心流程")} 的异常路径、人工处理和审计证据写进任务图。`;
}

function validationSignalFor(risk: string): string {
  if (includesAny([risk], ["冲突", "名额", "排班"])) return "批量导入和变更时能发现冲突，并给出可审核的解决记录。";
  if (includesAny([risk], ["越权", "权限", "隐私"])) return "权限测试覆盖本人、本科室、跨科、全院和只读审计角色。";
  if (includesAny([risk], ["集成", "同步", "主数据"])) return "外部接口断开、重复回调、延迟同步时系统仍能保持一致性。";
  if (includesAny([risk], ["签到", "考勤"])) return "异常签到可以被识别、审核、导出，并保留证据。";
  return "存在可执行验收标准、异常案例和回归测试。";
}

function productizationBar(strategy: StrategyCandidate, intent: ProductIntentModel, expansion: ProductExpansion): ProductizationBar[] {
  const capabilityNames = expansion.coreCapabilities.map((capability) => capability.name);
  if (isMedicalInternRotationIntent(intent)) {
    return [
      {
        "dimension": "rotation-product-completeness",
        "mustHave": ["轮转周期模型", "学生-科室-带教三方关系", "科室容量", "请假/调换/补轮转", "出科考核"],
        "doneWhen": "轮转从排期、确认、考勤、请假、补轮转到出科评价都能闭环并可审计。",
      },
      {
        "dimension": "operation-and-exception-readiness",
        "mustHave": ["补录", "撤销", "申诉", "延期", "跨科室调整", "通知失败重试"],
        "doneWhen": "教学秘书能处理异常，系统保留审批理由、影响范围、通知结果和历史记录。",
      },
      {
        "dimension": "integration-readiness",
        "mustHave": ["医院身份系统", "科室目录", "学生名单", "带教老师目录", "消息通知渠道", "导入导出"],
        "doneWhen": "外部主数据同步、缺失、重复、延迟和人工修正都有明确处理策略。",
      },
      {
        "dimension": "privacy-and-audit-readiness",
        "mustHave": ["考勤留存", "评价访问边界", "导出审批", "审计日志", "数据归档", "申诉证据链"],
        "doneWhen": "敏感记录访问、修改、导出、归档和删除都有权限控制和追责证据。",
      },
    ];
  }
  return [
    {
      "dimension": "product-scope",
      "mustHave": uniq([...strategy.productCoverage, ...capabilityNames]).slice(0, 8),
      "doneWhen": "主流程、异常流程、后台运营、报表导出和权限边界同时可用。",
    },
    {
      "dimension": "enterprise-readiness",
      "mustHave": ["身份接入", "角色权限", "审计日志", "备份恢复", "配置管理", "导入导出"],
      "doneWhen": "管理员可以配置规则、追踪操作、恢复数据，并处理常见异常。",
    },
    {
      "dimension": "deployment-and-support",
      "mustHave": uniq([...intent.deploymentAssumptions, "监控告警", "变更发布", "数据迁移"]).slice(0, 8),
      "doneWhen": "上线、回滚、扩容、备份、故障定位和版本迁移都有明确操作路径。",
    },
    {
      "dimension": "evidence-before-coding",
      "mustHave": ["用户规模", "集成清单", "审批规则", "合规留存", "报表口径"],
      "doneWhen": "关键缺口被确认或作为编码前 blocker 写入任务图。",
    },
  ];
}

function maturityScore(strategy: StrategyCandidate, riskCount: number): number {
  const completeness = Number(strategy.productCompletenessScore ?? strategy.demoTrapResistanceScore ?? 7);
  const complexityPenalty = strategy.estimatedComplexity === "very-high" ? 1.2 : strategy.estimatedComplexity === "high" ? 0.7 : 0.2;
  const riskPenalty = Math.min(1.4, riskCount * 0.18);
  return Number(Math.max(1, Math.min(10, completeness - complexityPenalty - riskPenalty + 1.2)).toFixed(1));
}

function hiddenComplexities(strategy: StrategyCandidate, intent: ProductIntentModel, riskRegister: RouteRisk[], evidenceLedger: EvidenceLedger): string[] {
  const fallbackGaps = strategy.evidenceGaps && strategy.evidenceGaps.length > 0
    ? strategy.evidenceGaps
    : evidenceLedger.missingEvidence.map((gap) => gap.id);
  if (isMedicalInternRotationIntent(intent)) {
    return uniq([
      "轮转周期、科室容量、带教关系和考勤考核不是独立模块，变更会互相影响。",
      "请假、补录、撤销、申诉、延期和跨科室调整需要状态机与审批链共同约束。",
      "出科考核依赖带教责任、考勤证据和评价表版本，不能只做简单评分字段。",
      "医院身份、科室目录、学生名单和带教老师主数据不同步会破坏排期可信度。",
      "导入导出和归档涉及隐私、留存期限、审计查询和历史可追溯。",
      ...riskRegister.slice(0, 3).map((risk) => risk.risk),
      ...fallbackGaps.slice(0, 2),
    ]);
  }
  return uniq([
    ...riskRegister.slice(0, 4).map((risk) => risk.risk),
    `${first(intent.coreResources, "核心资源")} 与 ${first(intent.coreWorkflows, "核心流程")} 的状态、权限、审计和报表会互相耦合。`,
    ...fallbackGaps.slice(0, 4),
  ]);
}

function validationBeforeCoding(intent: ProductIntentModel): string[] {
  if (isMedicalInternRotationIntent(intent)) {
    return [
      "确认轮转周期、批次、科室容量、最小时长和补轮转资格规则。",
      "确认学生-科室-带教三方关系、临时带教调整和评价责任归属。",
      "确认请假、调换、补录、撤销、申诉、延期、跨科室调整的审批链。",
      "确认考勤口径、迟到/缺勤规则、手工补录证据和出科考核联动。",
      "确认教务/医院身份系统、科室目录、学生名单和通知渠道的集成边界。",
      "确认轮转记录、考勤、评价、导出和归档的隐私留存与审计要求。",
    ];
  }
  return [
    "确认真实用户角色、组织层级、权限边界和审批责任人。",
    "确认必须集成的身份、主数据、通知、考勤或档案系统。",
    "用异常案例走查状态机、审计、导出和回滚路径。",
    "把成品化验收标准转成后续 Coding Agent 的 blocking task。",
  ];
}

function integrationQuestions(intent: ProductIntentModel): string[] {
  if (isMedicalInternRotationIntent(intent)) {
    return [
      "医院或教务身份系统谁是学生、带教老师、教学秘书的主数据源？",
      "科室目录、科室容量和带教老师排班是否来自外部系统，更新频率如何？",
      "学生名单导入失败、重复、缺字段或延迟同步时谁有修正权限？",
      "通知渠道是否要求短信、企业微信、院内消息或邮件，多渠道失败如何回执？",
      "出科考核或档案归档是否需要同步到教务、规培或医院档案系统？",
    ];
  }
  return [
    `身份系统如何提供 ${intent.primaryActors.slice(0, 3).join("、") || "主要用户"} 的可信身份？`,
    `${intent.coreResources.slice(0, 3).join("、") || "核心资源"} 是否来自外部主数据源？`,
    "导入、导出、通知和审计日志是否有外部系统接收方？",
    "外部接口失败、重复、延迟和回滚如何处理？",
  ];
}

function operationalFailureModes(intent: ProductIntentModel): string[] {
  if (isMedicalInternRotationIntent(intent)) {
    return [
      "科室临时减少名额后，已安排学生无法自动重排或通知。",
      "学生请假审批通过但补轮转计划未生成，导致出科资格争议。",
      "带教老师调整后旧评价责任未冻结，新旧责任边界不清。",
      "考勤手工补录没有审批理由和原始证据，后续申诉无法复盘。",
      "教务导入名单与医院身份系统不一致，导致学生或科室错配。",
      "通知发送失败没有回执和补发策略，学生错过轮转调整。",
    ];
  }
  return [
    `${first(intent.coreResources, "核心资源")} 批量变更后未重算 ${first(intent.coreWorkflows, "核心流程")} 的影响范围。`,
    "审批或人工 override 没有原因、责任人和通知记录。",
    "导入导出缺少校验报告，错误数据进入正式流程。",
    "通知失败没有重试、回执和人工补救路径。",
  ];
}

function testStrategyImplications(intent: ProductIntentModel): string[] {
  if (isMedicalInternRotationIntent(intent)) {
    return [
      "用轮转周期、科室容量、学生批次和带教分配构造冲突检测测试。",
      "覆盖请假、调换、补轮转、撤销、申诉、延期和跨科室调整的状态迁移测试。",
      "覆盖考勤迟到、缺勤、手工补录、审批拒绝和出科资格计算测试。",
      "覆盖学生、带教、科室管理员、教学秘书、医院教务的权限隔离测试。",
      "用导入名单错配、科室容量变更、通知失败和外部身份延迟同步做集成异常测试。",
      "验证审计日志能还原考勤补录、评价修改、排期变更和导出操作。",
    ];
  }
  return [
    `围绕 ${first(intent.coreResources, "核心资源")} 的创建、变更、归档和权限做模型测试。`,
    `围绕 ${first(intent.coreWorkflows, "核心流程")} 的 happy path、异常、回滚和审计做流程测试。`,
    "覆盖导入、导出、通知、权限拒绝、批量变更和备份恢复。",
  ];
}

function queryForRoute(goal: string, strategy: StrategyCandidate, intent: ProductIntentModel): string[] {
  const resource = first(intent.coreResources, "clinical rotation");
  const workflow = first(intent.coreWorkflows, "scheduling");
  const hasRotationSignals = includesAny([goal, strategy.title, resource, workflow], ["医院", "实习", "轮转", "带教", "科室"]);
  const routeHint = hasRotationSignals
    ? "medical student clerkship rotation scheduling software"
    : `${resource} ${workflow} management`;
  return [
    `${routeHint} implementation challenges audit privacy integration`,
    `${routeHint} product requirements scheduling evaluation supervision`,
    `site:aamc.org clerkship scheduling medical education student records`,
    `site:acgme.org resident rotation schedule evaluation supervision`,
  ];
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function isUsefulSource(result: SearchFinding): boolean {
  const url = String(result.url ?? "").toLowerCase();
  const title = String(result.title ?? "").toLowerCase();
  const blockedDomains = [
    "iciba.com",
    "clinicaltrials.gov",
    "chictr.org.cn",
    "dictionary",
    "translate",
    "youdao.com",
    "baike.baidu.com",
    "zhidao.baidu.com",
    "bing.com/search",
    "duckduckgo.com",
  ];
  if (blockedDomains.some((domain) => url.includes(domain))) return false;
  if (["是什么意思", "翻译", "读音", "词典", "dictionary", "definition", "clinical trial", "trial register"].some((token) => title.includes(token))) return false;
  const relevanceText = `${url} ${title} ${String(result.snippet ?? "").toLowerCase()}`;
  const relevanceSignals = ["rotation", "clerkship", "scheduling", "education", "student", "residency", "management", "software", "evaluation", "supervision"];
  if (!relevanceSignals.some((signal) => relevanceText.includes(signal))) return false;
  return true;
}

function extractSearchResults(html: string): SearchFinding[] {
  const results: SearchFinding[] = [];
  const patterns = [
    /<li[^>]+class="b_algo"[\s\S]*?<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<p[^>]*>([\s\S]*?)<\/p>)?/g,
    /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]{0,900}?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g,
  ];
  for (const regex of patterns) {
    for (const match of html.matchAll(regex)) {
      let url = decodeHtml(match[1]);
      const title = decodeHtml(String(match[2] ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
      const snippet = decodeHtml(String(match[3] ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
      const redirect = url.match(/[?&]uddg=([^&]+)/);
      if (redirect) {
        try {
          url = decodeURIComponent(redirect[1]);
        } catch {
          url = redirect[1];
        }
      }
      const result = { "title": title, "url": url, "snippet": snippet };
      if (title && url && isUsefulSource(result) && !results.some((item) => item.url === url)) {
        results.push(result);
      }
      if (results.length >= 3) break;
    }
    if (results.length >= 3) break;
  }
  if (results.length > 0) return results;

  const fallback = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]{5,160}?)<\/a>/g;
  for (const match of html.matchAll(fallback)) {
    const url = decodeHtml(match[1]);
    const title = decodeHtml(String(match[2] ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    const result = { "title": title, "url": url, "snippet": "" };
    if (title && isUsefulSource(result) && !results.some((item) => item.url === url)) {
      results.push(result);
    }
    if (results.length >= 3) break;
  }
  return results;
}

async function fetchWithTimeout(url: string, timeoutMs: number, fetchImpl: typeof fetch): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {
      "signal": controller.signal,
      "headers": {
        "user-agent": "deliberative-thinking-agent-core/route-deep-dive",
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function onlineSearch(query: string, options: OnlineOptions): Promise<SearchResult> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) return { "query": query, "findings": [], "error": "fetch is not available" };
  const timeoutMs = options.timeoutMs ?? 10000;
  const urls = [
    `https://www.bing.com/search?q=${encodeURIComponent(query)}`,
    `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
  ];
  const errors: string[] = [];
  try {
    for (const url of urls) {
      const response = await fetchWithTimeout(url, timeoutMs, fetchImpl);
      if (!response.ok) {
        errors.push(`${url} HTTP ${response.status}`);
        continue;
      }
      const html = await response.text();
      const findings = extractSearchResults(html);
      if (findings.length > 0) {
        return { "query": query, "findings": findings, "error": undefined };
      }
      errors.push(`${url} returned no parseable findings`);
    }
    return { "query": query, "findings": [], "error": errors.join(" | ") || "no parseable findings" };
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    return { "query": query, "findings": [], "error": message };
  }
}

async function onlineEvidenceForRoute(goal: string, strategy: StrategyCandidate, intent: ProductIntentModel, options: OnlineOptions): Promise<OnlineResearch> {
  const queries = queryForRoute(goal, strategy, intent).slice(0, 4);
  if (!options.online) {
    return {
      "enabled": false,
      "queries": queries,
      "findings": [],
      "sources": [],
      "sourceCount": 0,
      "relevance": "none",
      "reason": "Online research disabled",
      "shouldNotUseAsEvidence": true,
      "limitations": ["Online research disabled for this run. Use --online to collect external risk/productization signals."],
    };
  }

  const searches: SearchResult[] = [];
  for (const query of queries) {
    searches.push(await onlineSearch(query, options));
  }
  const findings = searches.flatMap((search) =>
    search.findings.map((finding) => ({
      "query": search.query,
      "title": finding.title,
      "url": finding.url,
      "snippet": finding.snippet,
      "relevance": "Use as external clue only; verify before treating as implementation evidence.",
    })),
  ).slice(0, 5);
  const errors = searches.map((search) => search.error).filter((error): error is string => Boolean(error));
  if (findings.length === 0) {
    return {
      "enabled": true,
      "queries": queries,
      "findings": [],
      "sources": [],
      "sourceCount": 0,
      "relevance": "none",
      "reason": "No high-relevance sources found",
      "shouldNotUseAsEvidence": true,
      "limitations": [
        "No high-relevance external source was collected; do not use this as evidence.",
        "Route still needs manual research before coding.",
        ...errors.map((error) => `Search limitation: ${error}`),
      ],
    };
  }
  return {
    "enabled": true,
    "queries": queries,
    "findings": findings,
    "sources": findings.map((finding) => ({
      "title": finding.title,
      "url": finding.url,
      "snippet": finding.snippet,
    })),
    "sourceCount": findings.length,
    "relevance": "partial",
    "reason": "High-relevance search clues found, but they are not verified source-of-truth evidence.",
    "shouldNotUseAsEvidence": false,
    "limitations": [
      "Online findings are lightweight search clues, not authoritative implementation proof.",
      "External sources must be reviewed by a human before they can become hard product requirements.",
      ...errors.map((error) => `Search limitation: ${error}`),
    ],
  };
}

export async function buildRouteDeepDive(input: RouteDeepDiveInput): Promise<RouteDeepDiveReport> {
  const {
    goal,
    strategies,
    productIntent,
    productExpansion,
    evidenceLedger,
    online = false,
    fetchImpl,
    timeoutMs,
  } = input;

  const routeAnalyses: RouteAnalysis[] = [];
  for (const strategy of strategies) {
    const riskRegister = routeRiskRegister(strategy, productIntent);
    const onlineResearch = await onlineEvidenceForRoute(goal, strategy, productIntent, { online, fetchImpl, timeoutMs });
    const maturityChecklist = productizationBar(strategy, productIntent, productExpansion);
    const hiddenComplexityItems = hiddenComplexities(strategy, productIntent, riskRegister, evidenceLedger);
    const validationItems = validationBeforeCoding(productIntent);
    const integrationItems = integrationQuestions(productIntent);
    const operationalFailureItems = operationalFailureModes(productIntent);
    const testStrategyItems = testStrategyImplications(productIntent);
    routeAnalyses.push({
      "strategyId": strategy.id,
      "title": strategy.title,
      "productIntentSignalsConsumed": productIntentSignalsConsumed(productIntent),
      "domainModelImplications": technicalAxes(strategy, productIntent).map((axis) => axis.deepDiveQuestion),
      "technicalImplementationAxes": technicalAxes(strategy, productIntent),
      "riskRegister": riskRegister,
      "hiddenComplexities": hiddenComplexityItems,
      "likelyHiddenComplexities": hiddenComplexityItems,
      "productizationBar": maturityChecklist,
      "maturityScore": maturityScore(strategy, riskRegister.length),
      "validationBeforeCoding": validationItems,
      "recommendedValidationBeforeCoding": validationItems,
      "integrationQuestions": integrationItems,
      "operationalFailureModes": operationalFailureItems,
      "testStrategyImplications": testStrategyItems,
      "onlineResearch": onlineResearch,
    });
  }

  return {
    "onlineResearchEnabled": online,
    "generatedAt": new Date().toISOString(),
    "stance": "Deep-dive each route before selection: implementation shape, likely failures, external risk clues, and product-grade maturity must be explicit.",
    "routeAnalyses": routeAnalyses,
    "crossRouteProductizationPrinciples": [
      "Do not select a route only because it is easy to demo; select it because hidden workflow, data, permission, audit, and operations risks are named.",
      "Every route must expose what should block coding until clarified.",
      "Online findings are clues for mature-product pressure, not final truth.",
      "The selected route must carry residual risks into architecture and task graph artifacts.",
    ],
  };
}