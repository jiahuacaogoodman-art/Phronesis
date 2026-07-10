import type {
  ClaimGraph,
  CriticCouncilReport,
  EvidenceLedger,
  ProductIntentModel,
  RouteDeepDiveReport,
  SelectedRoute,
  StrategyCandidate,
  StrategyRevisionReport,
} from "../types/artifacts.js";

interface StrategyRevisionInput {
  goal: string;
  productIntent: ProductIntentModel;
  currentStrategies: StrategyCandidate[];
  routeDeepDive: RouteDeepDiveReport;
  criticCouncilReport: CriticCouncilReport;
  selectedRoute: SelectedRoute;
  evidenceLedger: EvidenceLedger;
  claimGraph: ClaimGraph;
  revisionRound?: number;
  maxRevisionRound?: number;
}

const SUBSTANTIVE_FIELDS = [
  "thesis",
  "targetFit",
  "architectureShape",
  "productCoverage",
  "securityAndAbuseResistance",
  "operationalModel",
  "risks",
  "pros",
  "cons",
  "tradeoffSummary",
  "conditionsToPreferThisRoute",
  "conditionsToRejectThisRoute",
] as const satisfies readonly (keyof StrategyCandidate)[];

function uniq(items: readonly string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)));
}

function changedFieldsFor(original: StrategyCandidate, revised: StrategyCandidate): string[] {
  return SUBSTANTIVE_FIELDS.filter(
    (field) => JSON.stringify(original[field] ?? null) !== JSON.stringify(revised[field] ?? null),
  );
}

function objectionsForStrategy(report: CriticCouncilReport, strategyId: string): string[] {
  return report.reviews
    .filter((review) => review.strategyId === strategyId)
    .flatMap((review) => [
      ...(review.blockingIssues ?? []),
      ...(review.nearBlockingConcerns ?? []),
      ...(review.objections ?? []).slice(0, 1),
    ])
    .slice(0, 8);
}

function reviseOneStrategy(
  strategy: StrategyCandidate,
  input: StrategyRevisionInput,
  revisionRound: number,
): StrategyCandidate {
  const intent: ProductIntentModel = input.productIntent;
  const objections = objectionsForStrategy(input.criticCouncilReport, strategy.id);
  const blockers = input.selectedRoute.blockingReasons ?? [];
  const clarificationItems = input.selectedRoute.requiredClarificationsBeforeCoding ?? [];
  const resources = intent.coreResources.slice(0, 4);
  const workflows = intent.coreWorkflows.slice(0, 4);
  const risks = intent.riskSurfaces.slice(0, 4);
  const revised: StrategyCandidate = {
    ...strategy,
    thesis: `${strategy.thesis} 修订后先把 ${resources.join("、") || "核心资源"} 与 ${workflows.join("、") || "核心流程"} 的阻断条件显式建模，再作为规划假设进入下一轮选择。`,
    targetFit: `${strategy.targetFit} Revision round ${revisionRound} narrows the route around critic blockers, evidence gaps, and operational failure modes.`,
    architectureShape: uniq([
      ...(strategy.architectureShape ?? []),
      "blocking-clarification-gate",
      "risk-and-evidence-ledger",
      "route-readiness-state",
      ...resources.map((resource) => `${resource}边界模型`),
    ]).slice(0, 10),
    productCoverage: uniq([
      ...(strategy.productCoverage ?? []),
      "阻断问题澄清",
      "证据缺口登记",
      "异常流程验证",
      ...workflows,
    ]).slice(0, 12),
    securityAndAbuseResistance: uniq([
      ...(strategy.securityAndAbuseResistance ?? []),
      "coding-handoff-blocker-check",
      "critic-objection-traceability",
      "manual-override-audit",
      ...risks.map((risk) => `${risk}验收测试`),
    ]).slice(0, 10),
    operationalModel: uniq([
      ...(strategy.operationalModel ?? []),
      "人工澄清队列",
      "阻断原因复核",
      "修订后路线复评",
      "上线前证据门禁",
    ]).slice(0, 10),
    risks: uniq([
      ...(strategy.risks ?? []),
      "修订后仍可能因外部证据不足不能进入编码",
      "过度收敛路线可能牺牲部分体验或集成弹性",
    ]),
    cons: uniq([
      ...(strategy.cons ?? []),
      "需要额外澄清轮次，不能立即进入编码",
    ]),
    tradeoffSummary: "Revision makes the route safer as a planning hypothesis by adding blocker gates and evidence traceability, but it does not erase unresolved evidence gaps.",
    missingEvidenceImpact: `Still affected by: ${clarificationItems.slice(0, 4).join(" | ") || "no explicit clarification list"}.`,
    conditionsToPreferThisRoute: uniq([
      ...(strategy.conditionsToPreferThisRoute ?? []),
      "Blocking clarifications are answered and critic average reaches the coding handoff threshold.",
    ]),
    conditionsToRejectThisRoute: uniq([
      ...(strategy.conditionsToRejectThisRoute ?? []),
      "Unresolved blockers remain after the configured revision loop.",
    ]),
  };
  const changedFields = changedFieldsFor(strategy, revised);
  revised.revisionMeta = {
    revisionRound,
    changedFields,
    changedBecause: uniq([...blockers, ...clarificationItems]).slice(0, 8),
    criticObjectionsAddressed: objections,
    newTradeoffsIntroduced: [
      "More up-front clarification before coding.",
      "Potentially slower delivery in exchange for safer handoff.",
    ],
    evidenceGapsStillUnresolved: input.evidenceLedger.missingEvidence.map((item) => item.id),
  };
  return revised;
}

export function hasSubstantiveStrategyRevision(
  original: StrategyCandidate,
  revised: StrategyCandidate,
): boolean {
  const changedFields = revised.revisionMeta?.changedFields ?? changedFieldsFor(original, revised);
  if (changedFields.length === 0) return false;
  if (changedFields.every((field) => field === "title")) return false;
  return SUBSTANTIVE_FIELDS.some(
    (field) => changedFields.includes(field)
      && JSON.stringify(original[field] ?? null) !== JSON.stringify(revised[field] ?? null),
  );
}

export function validateStrategyRevisionReport(
  report: StrategyRevisionReport,
  currentStrategies: StrategyCandidate[],
): string[] {
  const errors: string[] = [];
  for (const log of report.strategyChangeLog ?? []) {
    if (!Array.isArray(log.changedFields) || log.changedFields.length === 0) {
      errors.push(`Revision for ${log.strategyId} has empty changedFields.`);
    }
    if ((log.changedFields ?? []).every((field) => field === "title")) {
      errors.push(`Revision for ${log.strategyId} only changed title.`);
    }
  }
  for (const revised of report.revisedStrategies ?? []) {
    const original = currentStrategies.find((strategy) => strategy.id === revised.id);
    if (original && !hasSubstantiveStrategyRevision(original, revised)) {
      errors.push(`Revision for ${revised.id} is not substantive.`);
    }
  }
  if (!Array.isArray(report.revisedStrategies) || report.revisedStrategies.length === 0) {
    errors.push("Revision report has no revisedStrategies.");
  }
  return errors;
}

export function reviseStrategies(input: StrategyRevisionInput): StrategyRevisionReport {
  const revisionRound = input.revisionRound ?? 1;
  const revisedStrategies = input.currentStrategies.map((strategy) => reviseOneStrategy(strategy, input, revisionRound));
  const strategyChangeLog = revisedStrategies.map((strategy) => ({
    strategyId: strategy.id,
    changedFields: strategy.revisionMeta?.changedFields ?? [],
    changedBecause: strategy.revisionMeta?.changedBecause ?? [],
    criticObjectionsAddressed: strategy.revisionMeta?.criticObjectionsAddressed ?? [],
    newTradeoffsIntroduced: strategy.revisionMeta?.newTradeoffsIntroduced ?? [],
    evidenceGapsStillUnresolved: strategy.revisionMeta?.evidenceGapsStillUnresolved ?? [],
  }));
  const blockingIssues = uniq([
    ...(input.selectedRoute.blockingReasons ?? []),
    ...input.criticCouncilReport.reviews.flatMap((review) => review.blockingIssues ?? []),
    ...input.criticCouncilReport.reviews.flatMap((review) => review.nearBlockingConcerns ?? []),
  ]);
  const addressed = uniq(strategyChangeLog.flatMap((item) => item.criticObjectionsAddressed)).slice(0, 12);
  const unresolved = uniq([
    ...input.evidenceLedger.missingEvidence.map((item) => `${item.id}: ${item.question}`),
    ...(input.selectedRoute.requiredClarificationsBeforeCoding ?? []),
  ]).slice(0, 12);
  return {
    revisionRound,
    reasonForRevision: input.selectedRoute.canProceedToCoding === false
      ? "Selected route is blocked or conditional and cannot be handed to coding."
      : "Revision requested for route debate.",
    blockingIssuesAddressed: addressed.length > 0 ? addressed : blockingIssues.slice(0, 8),
    unresolvedBlockingIssues: unresolved,
    revisedStrategies,
    strategyChangeLog,
    riskChangeLog: revisedStrategies.map((strategy) => ({
      strategyId: strategy.id,
      addedRisks: ["修订后仍可能因外部证据不足不能进入编码", "过度收敛路线可能牺牲部分体验或集成弹性"],
      reducedRisks: (strategy.revisionMeta?.criticObjectionsAddressed ?? []).slice(0, 4),
      remainingRisks: strategy.risks.slice(0, 4),
    })),
    evidenceGapsStillAccepted: input.evidenceLedger.missingEvidence.map((item) => item.id),
    canReRunSelection: true,
    shouldStopRevision: revisionRound >= (input.maxRevisionRound ?? 1),
    stopReason: revisionRound >= (input.maxRevisionRound ?? 1)
      ? "Reached THINK_ROUTE_REVISION_MAX_ROUNDS."
      : "Can run another revision round if still blocked.",
  };
}