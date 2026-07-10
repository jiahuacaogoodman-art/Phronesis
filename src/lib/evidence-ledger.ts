import type {
  DomainAnalysis,
  EvidenceLedger,
  LedgerEvidenceItem,
  ProductExpansion,
  ProductIntentModel,
  StrategyCandidate,
  SynthesizedCapability,
} from "../types/artifacts.ts";

function item(
  id: string,
  type: LedgerEvidenceItem["type"],
  claim: string,
  sourceArtifact: string,
  sourcePath: string,
  confidence: number,
  supports: string[],
  weakens: string[],
  notes: string,
): LedgerEvidenceItem {
  return { id, type, claim, sourceArtifact, sourcePath, confidence, supports, weakens, notes };
}

function assumption(id: string, claim: string, sourceArtifact: string, confidence: number, riskIfWrong: string) {
  return { id, claim, sourceArtifact, confidence, riskIfWrong };
}

function missing(id: string, question: string, affects: string[], impact: string) {
  return { id, question, affects, impact };
}

function inferred(id: string, claim: string, basedOn: string[], confidence: number) {
  return { id, claim, basedOn, confidence };
}

function hasAny(values: string[], signals: string[]) {
  const joined = values.join(" ").toLowerCase();
  return signals.some((signal) => joined.includes(signal.toLowerCase()));
}

export function buildEvidenceLedger(input) {
  const { rawGoal, domainAnalysis, productIntent, synthesizedCapabilities } = input;
  const evidenceItems: LedgerEvidenceItem[] = [
    item(
      "E-GOAL-001",
      "goal-signal",
      `用户目标是“${rawGoal}”，可作为产品意图分析的唯一直接输入。`,
      "goal.json",
      "rawGoal",
      0.95,
      ["intent:rawGoal", "decision:goal-reconstruction"],
      [],
      "这是用户显式输入，不代表所有业务约束都已知。",
    ),
    item(
      "E-DOMAIN-001",
      "domain-signal",
      `DomainAnalysis 输出 ${domainAnalysis.domainId}，置信度 ${domainAnalysis.confidence}。`,
      "domain-analysis.json",
      "domainId",
      domainAnalysis.confidence,
      ["decision:domain-analysis", `domain:${domainAnalysis.domainId}`],
      domainAnalysis.domainId === "generic-software-product" ? ["route:domain-template-only"] : [],
      "generic domain 表示不能依赖固定领域模板，必须使用组合式 Product Intent。",
    ),
    item(
      "E-INTENT-001",
      "intent-derived",
      `Product Intent 识别 primaryActors: ${productIntent.primaryActors.join("、")}。`,
      "product-intent.json",
      "primaryActors",
      0.84,
      ["capability:identity-and-auth", "capability:role-permission"],
      [],
      "多 actor 是身份和权限边界的直接证据。",
    ),
    item(
      "E-INTENT-002",
      "intent-derived",
      `Product Intent 识别 coreResources: ${productIntent.coreResources.join("、")}。`,
      "product-intent.json",
      "coreResources",
      0.86,
      ["capability:resource-management", "capability:admin-console"],
      [],
      "核心资源触发资源模型、后台管理和任务图资源节点。",
    ),
    item(
      "E-INTENT-003",
      "intent-derived",
      `Product Intent 识别 coreWorkflows: ${productIntent.coreWorkflows.join("、")}。`,
      "product-intent.json",
      "coreWorkflows",
      0.83,
      ["capability:workflow-management", "capability:lifecycle-state-machine", "route:workflow-first"],
      [],
      "多个 workflow 表示不能只输出静态页面或单表单。",
    ),
    item(
      "E-RISK-001",
      "risk-derived",
      `风险面包含：${productIntent.riskSurfaces.join("、")}。`,
      "product-intent.json",
      "riskSurfaces",
      0.82,
      ["capability:security-boundary", "capability:audit-log", "critic:security"],
      [],
      "风险面会影响路线置信度、critic 反对意见和任务图验证提示。",
    ),
    item(
      "E-OPS-001",
      "intent-derived",
      `运营需求包含：${productIntent.operationalNeeds.join("、")}。`,
      "product-intent.json",
      "operationalNeeds",
      0.8,
      ["capability:admin-console", "capability:notification", "capability:deployment-operation"],
      [],
      "运营需求是成品级方案与 demo 的分界之一。",
    ),
    item(
      "E-REPORT-001",
      "intent-derived",
      `报表需求包含：${productIntent.reportingNeeds.join("、")}。`,
      "product-intent.json",
      "reportingNeeds",
      0.78,
      ["capability:analytics-reporting", "capability:import-export"],
      [],
      "有数据沉淀时，导出和统计是产品级能力。",
    ),
    item(
      "E-STATE-001",
      "intent-derived",
      `生命周期阶段包含：${productIntent.lifecycleStages.join("、")}。`,
      "product-intent.json",
      "lifecycleStages",
      0.8,
      ["capability:lifecycle-state-machine", "task:lifecycle-state-machine"],
      [],
      "多状态流转需要状态机和合法迁移设计。",
    ),
    item(
      "E-PRINCIPLE-001",
      "principle",
      "先从 actors、resources、workflows、risks 推导能力，而不是直接套 UI 或技术栈。",
      "product-expansion.json",
      "productGradePrinciples",
      0.9,
      ["decision:capability-expansion", "decision:route-synthesis"],
      [],
      "这是 v0.3/v0.4 的核心原则。",
    ),
  ];

  if (hasAny([...productIntent.coreWorkflows, ...productIntent.coreResources, ...productIntent.riskSurfaces], ["预约", "时段", "排期", "课程", "教室", "名额", "容量", "冲突"])) {
    evidenceItems.push(item(
      "E-RISK-002",
      "risk-derived",
      "目标包含预约/排期/容量/冲突信号，因此冲突检测会影响路线选择和任务图。",
      "product-intent.json",
      "coreWorkflows|coreResources|riskSurfaces",
      0.86,
      ["capability:conflict-detection", "task:conflict-detection"],
      ["route:static-form-only"],
      "由 workflows/resources/risks 组合推导。",
    ));
  }

  if (hasAny([...productIntent.coreWorkflows, ...productIntent.lifecycleStages, ...productIntent.riskSurfaces], ["审批", "审核", "确认", "责任", "损坏", "成果", "归属", "异常"])) {
    evidenceItems.push(item(
      "E-RISK-003",
      "risk-derived",
      "目标包含审批、审核或责任追踪信号，因此需要审计和审核链路。",
      "product-intent.json",
      "coreWorkflows|lifecycleStages|riskSurfaces",
      0.84,
      ["capability:review-and-approval", "capability:audit-log", "task:audit-log"],
      ["route:no-audit-demo"],
      "如果缺失审计，争议与异常无法复盘。",
    ));
  }

  for (const capability of synthesizedCapabilities.slice(0, 8)) {
    evidenceItems.push(item(
      `E-CAP-${String(evidenceItems.length + 1).padStart(3, "0")}`,
      "intent-derived",
      `合成能力 ${capability.name} 来自 ${capability.triggeredBy.slice(0, 4).join("、")}。`,
      "product-expansion.json",
      `coreCapabilities.${capability.id}`,
      capability.confidence ?? 0.78,
      [`capability:${capability.id}`],
      [],
      capability.riskIfMissing,
    ));
  }

  const assumptions = [
    assumption("A-001", "用户目标中的名词足以推断初始 actors/resources/workflows，但仍需人工确认。", "product-intent.json", 0.72, "如果 actor 或 resource 推断错误，能力和任务图需要重排。"),
    assumption("A-002", "系统需要长期运行，而不是一次性脚本或静态文档。", "goal.json", 0.7, "如果只是临时工具，部署、备份和审计要求可以降低。"),
    assumption("A-003", "多角色系统默认需要权限边界和责任追踪。", "product-intent.json", 0.82, "如果所有用户都同权，权限模型可简化。"),
    assumption("A-004", "当前 v0.4 不联网，所有证据均来自目标和规则推断。", "evidence-ledger.json", 0.95, "缺少外部证据会降低路线置信度。"),
  ];

  const missingEvidence = [
    missing("ME-001", "实际用户规模、并发量和使用频率是多少？", ["route-selection", "deployment-operation"], "会影响 mobile-first、admin-web-first 和部署复杂度判断。"),
    missing("ME-002", "是否存在必须集成的外部身份、台账、教务、通知或文件系统？", ["integration-first", "role-permission"], "可能让 integration-first 从备选变成主路线。"),
    missing("ME-003", "审批、审核、冲突和异常处理的组织规则是否已经存在？", ["review-and-approval", "conflict-detection", "task-graph"], "会影响流程复杂度和任务图拆分。"),
    missing("ME-004", "数据合规、留存周期和导出格式是否有硬性要求？", ["compliance-privacy", "analytics-reporting"], "会影响审计、报表和备份设计。"),
  ];

  const inferredClaims = [
    inferred("IC-001", "多 actor + 多 resource 推导出身份、权限和后台管理能力。", ["E-INTENT-001", "E-INTENT-002"], 0.84),
    inferred("IC-002", "多 workflow + lifecycleStages 推导出流程管理和状态机。", ["E-INTENT-003", "E-STATE-001"], 0.8),
    inferred("IC-003", "riskSurfaces + reportingNeeds 推导出审计、导出和统计。", ["E-RISK-001", "E-REPORT-001"], 0.78),
    inferred("IC-004", "missingEvidence 会降低路线选择置信度，因此 selected route 必须列出可改变决策的证据缺口。", ["ME-001", "ME-002", "ME-003"], 0.76),
  ];

  return {
    evidenceItems,
    assumptions,
    missingEvidence,
    inferredClaims,
    confidenceModel: {
      scoringBasis: [
        "explicit goal signal > product intent inference > principle > missing evidence",
        "risk-derived evidence raises priority but can lower confidence when external validation is absent",
        "critic disagreement lowers final selection confidence",
      ],
      confidenceBands: {
        high: ">=0.80: strong internal evidence from goal and product intent",
        medium: "0.60-0.79: plausible inference with missing external validation",
        low: "<0.60: weak or placeholder inference",
      },
      missingEvidencePenalty: 0.04,
    },
  };
}

export function refsForCapability(capabilityId: string, ledger: EvidenceLedger): string[] {
  const refs = ledger.evidenceItems
    .filter((evidence) => evidence.supports.some((support) => support === `capability:${capabilityId}`))
    .map((evidence) => evidence.id);
  return refs.length > 0 ? refs.slice(0, 4) : ["E-PRINCIPLE-001", "E-INTENT-002"];
}

export function refsForRoute(strategy: StrategyCandidate, ledger: EvidenceLedger): string[] {
  const refs = ["E-GOAL-001", "E-INTENT-002", "E-INTENT-003", "E-RISK-001"];
  if ((strategy.routeArchetype ?? "").includes("integration")) refs.push("ME-002");
  if ((strategy.routeArchetype ?? "").includes("analytics")) refs.push("E-REPORT-001");
  if ((strategy.routeArchetype ?? "").includes("audit")) refs.push("E-RISK-003");
  return Array.from(new Set(refs.filter((ref) => ledger.evidenceItems.some((item) => item.id === ref) || ledger.missingEvidence.some((item) => item.id === ref)))).slice(0, 6);
}

export function assumptionRefsForLedger(ledger: EvidenceLedger): string[] {
  return ledger.assumptions.slice(0, 3).map((assumptionItem) => assumptionItem.id);
}