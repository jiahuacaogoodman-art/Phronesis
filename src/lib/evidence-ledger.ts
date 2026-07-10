import type {
  EvidenceLedger,
  DomainAnalysis,
  LedgerEvidenceItem,
  ProductIntentModel,
  SelectedRoute,
  StrategyCandidate,
  SynthesizedCapability,
} from "../types/artifacts.js";
import { collectEvidenceSources } from "./evidence-provider.js";
import {
  applySourceQuality,
  evidenceCoverageForRefs,
  evidenceStrengthScore,
  summarizeSourceQuality,
  weakEvidenceWarnings,
} from "./source-quality.js";

interface BuildEvidenceLedgerInput {
  rawGoal: string;
  domainAnalysis: DomainAnalysis;
  productIntent: ProductIntentModel;
  synthesizedCapabilities: SynthesizedCapability[];
}

function assumption(id: string, claim: string, sourceArtifact: string, confidence: number, riskIfWrong: string): EvidenceLedger["assumptions"][number] {
  return { id, claim, sourceArtifact, confidence, riskIfWrong };
}

function missing(id: string, question: string, affects: string[], impact: string): EvidenceLedger["missingEvidence"][number] {
  return { id, question, affects, impact };
}

function inferred(id: string, claim: string, basedOn: string[], confidence: number): EvidenceLedger["inferredClaims"][number] {
  return { id, claim, basedOn, confidence };
}

function uniqueEvidenceItems(items: LedgerEvidenceItem[]): LedgerEvidenceItem[] {
  const seen = new Set<string>();
  const unique: LedgerEvidenceItem[] = [];
  for (const item of items) {
    if (!seen.has(item.id)) {
      unique.push(item);
      seen.add(item.id);
    }
  }
  return unique;
}

function existingEvidenceRefs(refs: string[], ledger: EvidenceLedger): string[] {
  return Array.from(new Set(refs)).filter((ref) => ledger.evidenceItems.some((item) => item.id === ref));
}

function defaultMissingEvidence(): EvidenceLedger["missingEvidence"] {
  return [
    missing("ME-001", "实际用户规模、并发量和使用频率是多少？", ["route-selection", "deployment-operation"], "会影响 mobile-first、admin-web-first 和部署复杂度判断。"),
    missing("ME-002", "是否存在必须集成的外部身份、台账、教务、通知或文件系统？", ["integration-first", "role-permission"], "可能让 integration-first 从备选变成主路线。"),
    missing("ME-003", "审批、审核、冲突和异常处理的组织规则是否已经存在？", ["review-and-approval", "conflict-detection", "task-graph"], "会影响流程复杂度和任务图拆分。"),
    missing("ME-004", "数据合规、留存周期和导出格式是否有硬性要求？", ["compliance-privacy", "analytics-reporting"], "会影响审计、报表和备份设计。"),
  ];
}

export function buildEvidenceLedger(input: BuildEvidenceLedgerInput): EvidenceLedger {
  const { rawGoal, domainAnalysis, productIntent, synthesizedCapabilities } = input;
  const collected = collectEvidenceSources(rawGoal, domainAnalysis, productIntent, { synthesizedCapabilities });
  const evidenceItems = uniqueEvidenceItems(collected.evidenceItems).map(applySourceQuality);
  const missingEvidence = defaultMissingEvidence();

  const assumptions = [
    assumption("A-001", "用户目标中的名词足以推断初始 actors/resources/workflows，但仍需人工确认。", "product-intent.json", 0.72, "如果 actor 或 resource 推断错误，能力和任务图需要重排。"),
    assumption("A-002", "系统需要长期运行，而不是一次性脚本或静态文档。", "goal.json", 0.7, "如果只是临时工具，部署、备份和审计要求可以降低。"),
    assumption("A-003", "多角色系统默认需要权限边界和责任追踪。", "product-intent.json", 0.82, "如果所有用户都同权，权限模型可简化。"),
    assumption("A-004", "未启用可验证外部来源时，manual research provider 只能输出 missing/unverified 占位。", "evidence-ledger.json", 0.95, "缺少外部证据会降低路线置信度，不能当作已调研事实。"),
  ];

  const inferredClaims = [
    inferred("IC-001", "多 actor + 多 resource 推导出身份、权限和后台管理能力。", ["E-INTENT-001", "E-INTENT-002"], 0.82),
    inferred("IC-002", "多 workflow + lifecycleStages 推导出流程管理和状态机。", ["E-INTENT-003", "E-STATE-001"], 0.8),
    inferred("IC-003", "riskSurfaces + reportingNeeds 推导出审计、导出和统计。", ["E-RISK-001", "E-REPORT-001"], 0.76),
    inferred("IC-004", "route-analysis 和 critic-analysis 可以支撑前置思考，但不能替代真实调研。", ["E-ROUTE-ADMIN-WEB-FIRST", "E-CRITIC-SECURITY-001", "E-MISSING-SCALE-001"], 0.68),
  ];

  return {
    providersUsed: collected.providersUsed,
    evidenceItems,
    assumptions,
    missingEvidence,
    inferredClaims,
    confidenceModel: {
      scoringBasis: [
        "observed goal signal > inferred product intent > risk inference > route/critic analysis > principle > missing evidence placeholder",
        "sourceQuality and evidenceStrength reduce confidence when evidence is assumed, weak, missing, or unverified",
        "selected route must include route-specific, risk-specific, and critic-specific evidence, not only generic goal/intent evidence",
      ],
      confidenceBands: {
        high: ">=0.80: multiple direct or moderate evidence sources with low missing-evidence pressure",
        medium: "0.60-0.79: plausible inference with missing external validation",
        low: "<0.60: weak, contested, or placeholder-backed inference",
      },
      missingEvidencePenalty: 0.04,
    },
    sourceQualitySummary: summarizeSourceQuality(evidenceItems),
    weakEvidenceWarnings: weakEvidenceWarnings(evidenceItems),
    routeEvidenceCoverage: [],
    decisionEvidenceCoverage: {
      sufficientForThinkingStage: false,
      routeSpecificEvidenceRefs: [],
      riskSpecificEvidenceRefs: [],
      criticSpecificEvidenceRefs: [],
      acceptedGapRefs: missingEvidence.map((item) => item.id),
      summary: "Route selection has not been evaluated yet.",
    },
  };
}

export function refsForCapability(capabilityId: string, ledger: EvidenceLedger): string[] {
  const directRefs = ledger.evidenceItems
    .filter((evidence) => evidence.supports.some((support) => support === `capability:${capabilityId}`))
    .map((evidence) => evidence.id);
  const mappedRefs: string[] = [];

  if (["identity-and-auth", "role-permission"].includes(capabilityId)) {
    mappedRefs.push("E-INTENT-001", "E-RISK-001");
  }
  if (["resource-management", "admin-console", "import-export"].includes(capabilityId)) {
    mappedRefs.push("E-INTENT-002", "E-OPS-001");
  }
  if (["workflow-management", "lifecycle-state-machine", "notification"].includes(capabilityId)) {
    mappedRefs.push("E-INTENT-003", "E-STATE-001");
  }
  if (capabilityId === "conflict-detection") {
    mappedRefs.push("E-RISK-002", "E-INTENT-002");
  }
  if (["review-and-approval", "audit-log", "security-boundary", "compliance-privacy"].includes(capabilityId)) {
    mappedRefs.push("E-RISK-001", "E-RISK-003", "E-CRITIC-SECURITY-001");
  }
  if (["analytics-reporting"].includes(capabilityId)) {
    mappedRefs.push("E-REPORT-001", "E-MISSING-COMPLIANCE-001");
  }
  if (["deployment-operation", "backup-recovery"].includes(capabilityId)) {
    mappedRefs.push("E-OPS-001", "E-MISSING-SCALE-001", "E-PRINCIPLE-002");
  }

  const refs = existingEvidenceRefs([...directRefs, ...mappedRefs, "E-PRINCIPLE-001"], ledger);
  if (refs.length >= 2) {
    return refs.slice(0, 5);
  }
  return existingEvidenceRefs([...refs, "E-INTENT-002", "E-RISK-001", "E-PRINCIPLE-001"], ledger).slice(0, 5);
}

type RouteEvidenceInput = Pick<StrategyCandidate, "routeArchetype" | "evidenceRefs">;

export function refsForRoute(strategy: RouteEvidenceInput, ledger: EvidenceLedger): string[] {
  const archetype = strategy.routeArchetype ?? "";
  const routeRefs = ledger.evidenceItems
    .filter((item) => item.supports.includes(`route:${archetype}`))
    .map((item) => item.id);
  const riskRefs = ledger.evidenceItems
    .filter((item) => item.sourceType === "risk-inference")
    .map((item) => item.id)
    .slice(0, 3);
  const criticRefs: string[] = [];

  if (archetype === "lightweight-validated-product") {
    criticRefs.push("E-CRITIC-SECURITY-001");
  }
  if (archetype === "integration-first" || archetype === "enterprise-governance") {
    criticRefs.push("E-CRITIC-ARCHITECT-001", "E-MISSING-INTEGRATION-001");
  }
  if (archetype === "audit-and-compliance-first") {
    criticRefs.push("E-CRITIC-TESTING-001", "E-RISK-003");
  }
  if (archetype === "analytics-first") {
    criticRefs.push("E-REPORT-001", "E-MISSING-COMPLIANCE-001");
  }
  criticRefs.push("E-CRITIC-TESTING-001");

  return existingEvidenceRefs([
    ...routeRefs,
    ...riskRefs,
    ...criticRefs,
    "E-INTENT-002",
    "E-INTENT-003",
  ], ledger).slice(0, 8);
}

export function routeEvidenceGapsFor(strategy: RouteEvidenceInput, ledger: EvidenceLedger): string[] {
  const archetype = strategy.routeArchetype ?? "";
  const gaps = ["ME-001", "ME-003"];
  if (archetype === "integration-first" || archetype === "enterprise-governance") {
    gaps.push("ME-002");
  }
  if (archetype === "audit-and-compliance-first" || archetype === "analytics-first") {
    gaps.push("ME-004");
  }
  if (archetype === "offline-first") {
    gaps.push("ME-001", "ME-002");
  }
  return Array.from(new Set(gaps)).filter((ref) => ledger.missingEvidence.some((item) => item.id === ref));
}

export function routeEvidenceProfileFor(strategy: RouteEvidenceInput, ledger: EvidenceLedger): NonNullable<StrategyCandidate["routeEvidenceProfile"]> & { gapRefs: string[] } {
  return evidenceCoverageForRefs([...(strategy.evidenceRefs ?? refsForRoute(strategy, ledger)), ...routeEvidenceGapsFor(strategy, ledger)], ledger);
}

export function confidenceFromEvidenceRefs(refs: string[], ledger: EvidenceLedger, baseConfidence = 0.72): number {
  const evidenceItems = refs
    .map((ref) => ledger.evidenceItems.find((item) => item.id === ref))
    .filter((item): item is LedgerEvidenceItem => item !== undefined);
  if (evidenceItems.length === 0) {
    return Number(Math.max(0.42, baseConfidence - 0.18).toFixed(2));
  }
  const averageStrength = evidenceItems.reduce((sum, item) => sum + evidenceStrengthScore(item.evidenceStrength), 0) / evidenceItems.length;
  const missingPenalty = ledger.missingEvidence.length * ledger.confidenceModel.missingEvidencePenalty;
  return Number(Math.max(0.42, Math.min(0.9, baseConfidence * 0.35 + averageStrength * 0.65 - missingPenalty / 2)).toFixed(2));
}

export function addRouteEvidenceCoverage(ledger: EvidenceLedger, strategies: StrategyCandidate[]): EvidenceLedger {
  const routeEvidenceCoverage = strategies.map((strategy) => {
    const coverage = routeEvidenceProfileFor(strategy, ledger);
    return {
      strategyId: strategy.id,
      title: strategy.title,
      strong: coverage.strong,
      moderate: coverage.moderate,
      weak: coverage.weak,
      missing: coverage.missing,
      coverageScore: coverage.coverageScore,
      gapRefs: coverage.gapRefs,
    };
  });

  return {
    ...ledger,
    routeEvidenceCoverage,
  };
}

export function addDecisionEvidenceCoverage(ledger: EvidenceLedger, selectedRoute: SelectedRoute): EvidenceLedger {
  const evidenceRefs = selectedRoute.evidenceRefs ?? [];
  const routeSpecificEvidenceRefs = evidenceRefs.filter((ref) =>
    ledger.evidenceItems.some((item) => item.id === ref && item.sourceType === "route-analysis")
  );
  const riskSpecificEvidenceRefs = evidenceRefs.filter((ref) =>
    ledger.evidenceItems.some((item) => item.id === ref && item.sourceType === "risk-inference")
  );
  const criticSpecificEvidenceRefs = evidenceRefs.filter((ref) =>
    ledger.evidenceItems.some((item) => item.id === ref && item.sourceType === "critic-analysis")
  );
  const coverage = selectedRoute.routeEvidenceCoverage ?? evidenceCoverageForRefs(evidenceRefs, ledger);
  const acceptedGapRefs = selectedRoute.evidenceGapsAccepted ?? ledger.missingEvidence.map((item) => item.id);

  return {
    ...ledger,
    decisionEvidenceCoverage: {
      selectedStrategyId: selectedRoute.selectedStrategyId,
      selectedRouteCoverageScore: coverage.coverageScore,
      sufficientForThinkingStage:
        routeSpecificEvidenceRefs.length > 0 &&
        riskSpecificEvidenceRefs.length > 0 &&
        criticSpecificEvidenceRefs.length > 0 &&
        coverage.coverageScore >= 0.45,
      routeSpecificEvidenceRefs,
      riskSpecificEvidenceRefs,
      criticSpecificEvidenceRefs,
      acceptedGapRefs,
      summary: `Selected route uses ${routeSpecificEvidenceRefs.length} route-specific, ${riskSpecificEvidenceRefs.length} risk-specific, and ${criticSpecificEvidenceRefs.length} critic-specific evidence refs, accepted gaps: ${acceptedGapRefs.join(", ")}.`,
    },
  };
}

export function assumptionRefsForLedger(ledger: EvidenceLedger): string[] {
  return ledger.assumptions.slice(0, 3).map((assumptionItem) => assumptionItem.id);
}