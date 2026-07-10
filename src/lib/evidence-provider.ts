import type {
  DomainAnalysis,
  EvidenceSourceType,
  LedgerEvidenceItem,
  ProductIntentModel,
  SynthesizedCapability,
} from "../types/artifacts.js";

export interface EvidenceCollectionContext {
  synthesizedCapabilities?: SynthesizedCapability[];
}

export interface EvidenceProvider {
  providerId: string;
  providerType: EvidenceSourceType;
  collect(goal: string, domainAnalysis: DomainAnalysis, productIntent: ProductIntentModel, context?: EvidenceCollectionContext): LedgerEvidenceItem[];
}

function source(
  id: string,
  type: LedgerEvidenceItem["type"],
  claim: string,
  sourceArtifact: string,
  sourcePath: string,
  confidence: number,
  supports: string[],
  weakens: string[],
  notes: string,
  providerId: string,
  sourceType: EvidenceSourceType,
): LedgerEvidenceItem {
  return {
    id,
    type,
    claim,
    sourceArtifact,
    sourcePath,
    confidence,
    supports,
    weakens,
    notes,
    providerId,
    sourceType,
  };
}

function hasAny(values: string[], signals: string[]): boolean {
  const joined = values.join(" ").toLowerCase();
  return signals.some((signal) => joined.includes(signal.toLowerCase()));
}

function chooseRouteArchetypes(productIntent: ProductIntentModel): string[] {
  const selected: string[] = ["admin-web-first", "lightweight-validated-product"];
  if (hasAny(productIntent.coreWorkflows, ["报名", "签到", "预约", "练习", "查看", "通知"])) {
    selected.push("mobile-first");
  }
  if (productIntent.integrationNeeds.length > 0) {
    selected.push("integration-first");
  }
  if (hasAny([...productIntent.riskSurfaces, ...productIntent.permissionBoundaries, ...productIntent.coreWorkflows], ["审核", "审批", "责任", "审计", "损坏", "越权", "成果"])) {
    selected.push("audit-and-compliance-first");
  }
  if (productIntent.reportingNeeds.length > 0) {
    selected.push("analytics-first");
  }
  if (hasAny([...productIntent.deploymentAssumptions, ...productIntent.coreWorkflows], ["离线", "现场", "缓存", "网络"])) {
    selected.push("offline-first");
  }
  if (productIntent.primaryActors.length + productIntent.secondaryActors.length >= 4 || productIntent.permissionBoundaries.length >= 4) {
    selected.push("enterprise-governance");
  }
  return Array.from(new Set(selected)).slice(0, 6);
}

function provider(providerId: string, providerType: EvidenceSourceType, collect: EvidenceProvider["collect"]): EvidenceProvider {
  return { providerId, providerType, collect };
}

export const GoalInputEvidenceProvider = provider("goal-input-provider", "goal-input", (goal, domainAnalysis, productIntent) => [
  source(
    "E-GOAL-001",
    "goal-signal",
    `用户目标是“${goal}”，这是本轮思考唯一直接观察到的输入。`,
    "goal.json",
    "rawGoal",
    0.95,
    ["intent:rawGoal", "decision:goal-reconstruction", "claim:goal"],
    [],
    "Observed from user input, but it is brief and does not contain full operating constraints.",
    "goal-input-provider",
    "goal-input",
  ),
]);

export const IntentInferenceEvidenceProvider = provider("intent-inference-provider", "intent-inference", (goal, domainAnalysis, productIntent, context = {}) => {
  const items = [
    source(
      "E-INTENT-001",
      "intent-derived",
      `Product Intent 识别 primaryActors: ${productIntent.primaryActors.join("、")}。`,
      "product-intent.json",
      "primaryActors",
      0.84,
      ["capability:identity-and-auth", "capability:role-permission", "claim:intent:actors"],
      [],
      "Inferred from goal nouns and domain signals; should be confirmed before coding.",
      "intent-inference-provider",
      "intent-inference",
    ),
    source(
      "E-INTENT-002",
      "intent-derived",
      `Product Intent 识别 coreResources: ${productIntent.coreResources.join("、")}。`,
      "product-intent.json",
      "coreResources",
      0.86,
      ["capability:resource-management", "capability:admin-console", "route:admin-web-first", "claim:intent:resources"],
      [],
      "Core resources drive data model, admin operations, and task graph resource nodes.",
      "intent-inference-provider",
      "intent-inference",
    ),
    source(
      "E-INTENT-003",
      "intent-derived",
      `Product Intent 识别 coreWorkflows: ${productIntent.coreWorkflows.join("、")}。`,
      "product-intent.json",
      "coreWorkflows",
      0.83,
      ["capability:workflow-management", "capability:lifecycle-state-machine", "route:admin-web-first", "claim:intent:workflows"],
      [],
      "Workflow inference prevents the solution from collapsing into a static page or single form.",
      "intent-inference-provider",
      "intent-inference",
    ),
    source(
      "E-OPS-001",
      "intent-derived",
      `运营需求包含：${productIntent.operationalNeeds.join("、")}。`,
      "product-intent.json",
      "operationalNeeds",
      0.8,
      ["capability:admin-console", "capability:notification", "capability:deployment-operation"],
      [],
      "Operational needs separate product-grade design from demo-only flows.",
      "intent-inference-provider",
      "intent-inference",
    ),
    source(
      "E-REPORT-001",
      "intent-derived",
      `报表需求包含：${productIntent.reportingNeeds.join("、")}。`,
      "product-intent.json",
      "reportingNeeds",
      0.78,
      ["capability:analytics-reporting", "capability:import-export", "route:analytics-first"],
      [],
      "Reporting needs support export and analytics route variants.",
      "intent-inference-provider",
      "intent-inference",
    ),
    source(
      "E-STATE-001",
      "intent-derived",
      `生命周期阶段包含：${productIntent.lifecycleStages.join("、")}。`,
      "product-intent.json",
      "lifecycleStages",
      0.8,
      ["capability:lifecycle-state-machine", "task:lifecycle-state-machine", "claim:intent:lifecycle"],
      [],
      "Multiple lifecycle states imply explicit transitions and invalid-state handling.",
      "intent-inference-provider",
      "intent-inference",
    ),
  ];

  for (const capability of (context.synthesizedCapabilities ?? []).slice(0, 8)) {
    items.push(source(
      `E-CAP-${String(items.length + 1).padStart(3, "0")}`,
      "intent-derived",
      `合成能力 ${capability.name} 来自 ${capability.triggeredBy.slice(0, 4).join("、")}。`,
      "product-expansion.json",
      `coreCapabilities.${capability.id}`,
      capability.confidence ?? 0.78,
      [`capability:${capability.id}`, `claim:capability:${capability.id}`],
      [],
      capability.riskIfMissing,
      "intent-inference-provider",
      "intent-inference",
    ));
  }

  return items;
});

export const ProductPrincipleEvidenceProvider = provider("product-principle-provider", "product-principle", (goal, domainAnalysis, productIntent) => [
  source(
    "E-PRINCIPLE-001",
    "principle",
    "先从 actors、resources、workflows、risks 推导能力，而不是直接套 UI 或技术栈。",
    "product-expansion.json",
    "productGradePrinciples",
    0.72,
    ["decision:capability-expansion", "decision:route-synthesis", "claim:decision:anti-demo"],
    ["route:ui-first-demo"],
    "Principle-based evidence is useful planning input but is not externally verified.",
    "product-principle-provider",
    "product-principle",
  ),
  source(
    "E-PRINCIPLE-002",
    "principle",
    "成品级路线必须显式处理权限、生命周期、异常、审计、部署和数据恢复。",
    "product-expansion.json",
    "productGradePrinciples",
    0.7,
    ["decision:route-selection", "task:deployment-backup", "claim:risk:product-grade"],
    ["route:lightweight-validated-product"],
    "This is an architectural principle; it needs real stakeholder validation before coding scope is frozen.",
    "product-principle-provider",
    "product-principle",
  ),
]);

export const DomainHeuristicEvidenceProvider = provider("domain-heuristic-provider", "domain-heuristic", (goal, domainAnalysis, productIntent) => [
  source(
    "E-DOMAIN-001",
    "domain-signal",
    `DomainAnalysis 输出 ${domainAnalysis.domainId}，置信度 ${domainAnalysis.confidence}。`,
    "domain-analysis.json",
    "domainId",
    domainAnalysis.confidence,
    ["decision:domain-analysis", `domain:${domainAnalysis.domainId}`, "claim:intent:domain"],
    domainAnalysis.domainId === "generic-software-product" ? ["route:domain-template-only"] : [],
    "Generic domain means route generation must rely on compositional Product Intent instead of domain templates.",
    "domain-heuristic-provider",
    "domain-heuristic",
  ),
]);

export const RiskInferenceEvidenceProvider = provider("risk-inference-provider", "risk-inference", (goal, domainAnalysis, productIntent) => {
  const items = [
    source(
      "E-RISK-001",
      "risk-derived",
      `风险面包含：${productIntent.riskSurfaces.join("、")}。`,
      "product-intent.json",
      "riskSurfaces",
      0.82,
      ["capability:security-boundary", "capability:audit-log", "critic:security", "claim:risk:general"],
      ["route:lightweight-validated-product"],
      "Risk surfaces affect route confidence, critic disagreement, and task verification hints.",
      "risk-inference-provider",
      "risk-inference",
    ),
  ];

  if (hasAny([...productIntent.coreWorkflows, ...productIntent.coreResources, ...productIntent.riskSurfaces], ["预约", "时段", "排期", "课程", "教室", "名额", "容量", "冲突"])) {
    items.push(source(
      "E-RISK-002",
      "risk-derived",
      "目标包含预约/排期/容量/冲突信号，因此冲突检测会影响路线选择和任务图。",
      "product-intent.json",
      "coreWorkflows|coreResources|riskSurfaces",
      0.86,
      ["capability:conflict-detection", "task:conflict-detection", "claim:risk:conflict"],
      ["route:static-form-only", "route:lightweight-validated-product"],
      "Derived from workflow/resource/risk composition; requires real policy confirmation before implementation.",
      "risk-inference-provider",
      "risk-inference",
    ));
  }

  if (hasAny([...productIntent.coreWorkflows, ...productIntent.lifecycleStages, ...productIntent.riskSurfaces], ["审批", "审核", "确认", "责任", "损坏", "成果", "归属", "异常"])) {
    items.push(source(
      "E-RISK-003",
      "risk-derived",
      "目标包含审批、审核或责任追踪信号，因此需要审计和审核链路。",
      "product-intent.json",
      "coreWorkflows|lifecycleStages|riskSurfaces",
      0.84,
      ["capability:review-and-approval", "capability:audit-log", "task:audit-log", "route:audit-and-compliance-first", "claim:risk:audit"],
      ["route:no-audit-demo"],
      "If audit is missing, disputes and exceptions cannot be reconstructed.",
      "risk-inference-provider",
      "risk-inference",
    ));
  }

  return items;
});

export const RouteAnalysisEvidenceProvider = provider("route-analysis-provider", "route-analysis", (goal, domainAnalysis, productIntent) =>
  chooseRouteArchetypes(productIntent).map((archetype, index) => source(
    `E-ROUTE-${archetype.toUpperCase().replace(/[^A-Z0-9]+/g, "-")}`,
    "route-tradeoff",
    `路线 ${archetype} 由 actors/resources/workflows/risks 组合触发，而不是由固定业务模板触发。`,
    "strategy-candidates.json",
    `routeArchetype:${archetype}`,
    archetype === "lightweight-validated-product" ? 0.62 : 0.76,
    [`route:${archetype}`, `claim:route:${archetype}`, index === 0 ? "decision:route-selection" : "decision:fallback-route"],
    archetype === "lightweight-validated-product" ? ["claim:risk:product-grade"] : [],
    "Route evidence is inferred from current Product Intent and remains below direct research quality.",
    "route-analysis-provider",
    "route-analysis",
  ))
);

export const CriticAnalysisEvidenceProvider = provider("critic-analysis-provider", "critic-analysis", (goal, domainAnalysis, productIntent) => [
  source(
    "E-CRITIC-SECURITY-001",
    "critic-objection",
    "SecurityCritic 应反对缺少权限、审计或异常处理的轻量路线。",
    "critic-council-report.json",
    "SecurityCritic",
    0.66,
    ["critic:security", "claim:critic:security", "decision:critic-dissent"],
    ["route:lightweight-validated-product"],
    "This is a deterministic critic prior, not a human security review.",
    "critic-analysis-provider",
    "critic-analysis",
  ),
  source(
    "E-CRITIC-ARCHITECT-001",
    "critic-objection",
    "ArchitectCritic 应关注资源模型、状态机和外部集成证据是否足够。",
    "critic-council-report.json",
    "ArchitectCritic",
    0.64,
    ["critic:architect", "claim:critic:architecture", "decision:critic-dissent"],
    ["route:integration-first", "route:enterprise-governance"],
    "Architecture critique is inferred from route complexity and missing evidence.",
    "critic-analysis-provider",
    "critic-analysis",
  ),
  source(
    "E-CRITIC-TESTING-001",
    "critic-objection",
    "TestingCritic 应要求高风险 workflow 至少具备验收、失败状态和滥用场景测试。",
    "critic-council-report.json",
    "TestingCritic",
    0.65,
    ["critic:testing", "claim:critic:testing", "decision:critic-dissent"],
    [],
    "Testing critique links route weaknesses to later task verification hints.",
    "critic-analysis-provider",
    "critic-analysis",
  ),
]);

export const ManualResearchPlaceholderProvider = provider("manual-research-placeholder-provider", "manual-research-placeholder", () => [
  source(
    "E-MISSING-SCALE-001",
    "missing-evidence",
    "缺少真实用户规模、并发量和使用频率证据。",
    "research-plan.json",
    "researchQuestions.userScale",
    0.2,
    ["missing:ME-001"],
    ["decision:route-selection"],
    "missing evidence placeholder; unverified until manual research or stakeholder confirmation.",
    "manual-research-placeholder-provider",
    "manual-research-placeholder",
  ),
  source(
    "E-MISSING-INTEGRATION-001",
    "missing-evidence",
    "缺少外部身份、台账、通知、文件或教务系统集成约束证据。",
    "research-plan.json",
    "researchQuestions.integration",
    0.2,
    ["missing:ME-002"],
    ["route:integration-first", "decision:route-selection"],
    "missing evidence placeholder; unverified until integration constraints are confirmed.",
    "manual-research-placeholder-provider",
    "manual-research-placeholder",
  ),
  source(
    "E-MISSING-WORKFLOW-POLICY-001",
    "missing-evidence",
    "缺少审批、审核、冲突、异常处理组织规则证据。",
    "research-plan.json",
    "researchQuestions.workflowPolicy",
    0.2,
    ["missing:ME-003"],
    ["task:approval-flow", "task:conflict-detection", "decision:task-graph"],
    "missing evidence placeholder; unverified until operating policies are known.",
    "manual-research-placeholder-provider",
    "manual-research-placeholder",
  ),
  source(
    "E-MISSING-COMPLIANCE-001",
    "missing-evidence",
    "缺少数据合规、留存周期和导出格式硬约束证据。",
    "research-plan.json",
    "researchQuestions.compliance",
    0.2,
    ["missing:ME-004"],
    ["capability:compliance-privacy", "decision:route-selection"],
    "missing evidence placeholder; unverified until compliance requirements are confirmed.",
    "manual-research-placeholder-provider",
    "manual-research-placeholder",
  ),
]);

export const deterministicEvidenceProviders = [
  GoalInputEvidenceProvider,
  DomainHeuristicEvidenceProvider,
  IntentInferenceEvidenceProvider,
  ProductPrincipleEvidenceProvider,
  RiskInferenceEvidenceProvider,
  RouteAnalysisEvidenceProvider,
  CriticAnalysisEvidenceProvider,
  ManualResearchPlaceholderProvider,
];

export function collectEvidenceSources(goal: string, domainAnalysis: DomainAnalysis, productIntent: ProductIntentModel, context: EvidenceCollectionContext = {}): {
  evidenceItems: LedgerEvidenceItem[];
  providersUsed: Array<{ providerId: string; providerType: EvidenceSourceType; evidenceCount: number }>;
} {
  const evidenceItems: LedgerEvidenceItem[] = [];
  const providersUsed: Array<{ providerId: string; providerType: EvidenceSourceType; evidenceCount: number }> = [];
  for (const evidenceProvider of deterministicEvidenceProviders) {
    const collected = evidenceProvider.collect(goal, domainAnalysis, productIntent, context);
    evidenceItems.push(...collected);
    providersUsed.push({
      providerId: evidenceProvider.providerId,
      providerType: evidenceProvider.providerType,
      evidenceCount: collected.length,
    });
  }
  return { evidenceItems, providersUsed };
}