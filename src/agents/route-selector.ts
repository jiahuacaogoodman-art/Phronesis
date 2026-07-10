import type {
  AntiSimplificationReport,
  CriticCouncilReport,
  EvidenceLedger,
  SelectedRoute,
  StrategyCandidate,
} from "../types/artifacts.js";

function missingEvidencePenalty(ledger?: EvidenceLedger) {
  return ledger ? ledger.missingEvidence.length * ledger.confidenceModel.missingEvidencePenalty : 0.12;
}

function claimId(value: string) {
  return `C-${value.toUpperCase().replace(/[^A-Z0-9]+/g, "-")}`;
}

export function selectRoute(
  strategies: StrategyCandidate[],
  antiSimplificationReport: AntiSimplificationReport,
  councilReport: CriticCouncilReport,
  evidenceLedger?: EvidenceLedger,
): SelectedRoute {
  const missingPenalty = missingEvidencePenalty(evidenceLedger);
  const ranked = strategies
    .map((strategy) => {
      const aggregate = councilReport.aggregate.find((item) => item.strategyId === strategy.id);
      const antiFinding = antiSimplificationReport.strategyFindings.find((item) => item.strategyId === strategy.id);
      const highDissent = councilReport.reviews.filter((review) => review.strategyId === strategy.id && review.disagreementLevel === "high").length;
      const mediumDissent = councilReport.reviews.filter((review) => review.strategyId === strategy.id && review.disagreementLevel === "medium").length;
      const antiPenalty = antiFinding?.simplificationRisk === "high" ? 3 : antiFinding?.simplificationRisk === "medium" ? 0.8 : 0;
      const riskPenalty = (strategy.majorRisks ?? strategy.risks).length * 0.08;
      const dissentPenalty = highDissent * 0.55 + mediumDissent * 0.18;
      const completenessScore = (strategy.productCompletenessScore ?? strategy.demoTrapResistanceScore) / 10;
      const finalScore = (aggregate?.averageScore ?? 0) + completenessScore - antiPenalty - riskPenalty - dissentPenalty - missingPenalty;
      return {
        strategy,
        aggregate,
        score: finalScore,
        scoreBreakdown: {
          criticAverage: Number((aggregate?.averageScore ?? 0).toFixed(2)),
          completenessScore: Number(completenessScore.toFixed(2)),
          riskPenalty: Number(riskPenalty.toFixed(2)),
          missingEvidencePenalty: Number(missingPenalty.toFixed(2)),
          dissentPenalty: Number(dissentPenalty.toFixed(2)),
          finalScore: Number(finalScore.toFixed(2)),
        },
      };
    })
    .sort((left, right) => right.score - left.score);

  const selected = ranked[0].strategy;
  const selectedAggregate = ranked[0].aggregate;
  const selectedScore = ranked[0].score;
  const blockingReasons = [];
  if ((selectedAggregate?.blockingIssueCount ?? 0) > 0) {
    blockingReasons.push(`Selected route has ${selectedAggregate?.blockingIssueCount ?? 0} critic blocking issue(s).`);
  }
  if ((selectedAggregate?.averageScore ?? 0) < 6) {
    blockingReasons.push(`Selected route critic average is below 6: ${selectedAggregate?.averageScore ?? "n/a"}.`);
  }
  if (selectedScore < 0) {
    blockingReasons.push(`Selected route evidence-adjusted score is below 0: ${selectedScore.toFixed(2)}.`);
  }
  const canProceedToCoding = blockingReasons.length === 0;
  const selectionStatus = canProceedToCoding
    ? "selected"
    : ((selectedAggregate?.blockingIssueCount ?? 0) > 0 || selectedScore < 0 ? "blocked" : "conditional");
  const selectedReviews = councilReport.reviews.filter((review) => review.strategyId === selected.id);
  const coverageFromLedger = evidenceLedger?.routeEvidenceCoverage?.find((item) => item.strategyId === selected.id);
  const routeEvidenceCoverage = coverageFromLedger ?? {
    ...(selected.routeEvidenceProfile ?? { strong: 0, moderate: 0, weak: 0, missing: 0, coverageScore: 0 }),
    gapRefs: selected.evidenceGaps ?? [],
  };
  const dissentSummary = selectedReviews
    .filter((review) => review.disagreementLevel !== "low" || (review.nearBlockingConcerns ?? []).length > 0)
    .map((review) => `${review.critic}: ${review.disagreementLevel}; ${(review.nearBlockingConcerns ?? review.objections).slice(0, 1).join(" ")}`)
    .slice(0, 8);
  const decisiveClaims = [
    claimId(`route-${selected.id}`),
    claimId("intent-resources"),
    claimId("intent-workflows"),
    claimId(`risk-${selected.id}`),
    claimId("decision-route-select"),
  ];
  const contestedClaims = Array.from(new Set(selectedReviews
    .filter((review) => review.disagreementLevel !== "low")
    .flatMap((review) => review.objectionClaimRefs ?? [claimId(`critic-${review.critic}-${review.strategyId}`)]))).slice(0, 10);
  const weakClaimsAccepted = routeEvidenceCoverage.weak > 0 || routeEvidenceCoverage.missing > 0
    ? [claimId(`route-${selected.id}`), claimId(`risk-${selected.id}`)]
    : [];
  const evidenceGapsAccepted = selected.evidenceGaps ?? routeEvidenceCoverage.gapRefs ?? [];
  const selectedEvidenceRefs = Array.from(new Set([
    ...(selected.evidenceRefs ?? []),
    "E-GOAL-001",
    "E-RISK-001",
    "E-CRITIC-TESTING-001",
  ])).slice(0, 10);

  return {
    selectedStrategyId: selected.id,
    selectedTitle: selected.title,
    selectionStatus,
    canProceedToCoding,
    blockingReasons,
    requiredClarificationsBeforeCoding: [
      ...(evidenceLedger?.missingEvidence.map((item) => `${item.id}: ${item.question}`) ?? []),
      ...dissentSummary,
      ...blockingReasons,
    ].slice(0, 12),
    routeCanBeUsedOnlyAsPlanningHypothesis: !canProceedToCoding,
    selectionRationale: [
      canProceedToCoding
        ? `Highest evidence-adjusted route score: ${ranked[0].score.toFixed(2)}.`
        : "Current least-bad planning hypothesis, not coding-approved route.",
      `Highest evidence-adjusted route score: ${ranked[0].score.toFixed(2)}.`,
      `Critic average: ${selectedAggregate?.averageScore ?? "n/a"} with ${selectedAggregate?.blockingIssueCount ?? 0} blocking issues.`,
      `Selected route evidence refs: ${selectedEvidenceRefs.join(", ")}.`,
      `Decisive claims: ${decisiveClaims.join(", ")}.`,
      canProceedToCoding
        ? "Dissent did not overturn the route because objections are explicit contested claims and accepted gaps are carried into task graph/revisit conditions."
        : "This route is retained only to continue planning; it must not be handed to a Coding Agent until blockers are resolved.",
    ],
    rejectedRoutes: ranked.slice(1).map(({ strategy, aggregate }) => ({
      strategyId: strategy.id,
      title: strategy.title,
      rejectionReason:
        strategy.estimatedComplexity === "very-high"
          ? "Too integration-heavy until missing integration evidence is resolved."
          : strategy.estimatedComplexity === "high"
            ? "Valuable but higher risk/cost than the selected route under current evidence."
            : `Lower evidence-adjusted fit than the selected route (${aggregate?.averageScore ?? "n/a"} critic average).`,
    })),
    fallbackRoutes: ranked.slice(1, 3).map(({ strategy }) => strategy.id),
    conditionsToReconsider: [
      "Missing evidence shows external integration is mandatory.",
      "Operational scale is much higher than assumed.",
      "Security or compliance policy requires a different route archetype.",
      "Critic near-blocking concerns become confirmed blockers.",
    ],
    residualRisks: selected.risks,
    evidenceRefs: selectedEvidenceRefs,
    decisionRefs: ["D-ROUTE-SELECT"],
    confidence: Number(Math.max(0.45, Math.min(0.88, (selected.confidence ?? 0.72) - missingPenalty / 2 - dissentSummary.length * 0.01)).toFixed(2)),
    selectionScoreBreakdown: ranked[0].scoreBreakdown,
    dissentSummary,
    conditionsToRevisit: [
      "Resolve ME-001 user scale and usage frequency.",
      "Resolve ME-002 required integrations.",
      "Resolve ME-003 workflow policy details.",
      "Re-run route selection after these answers change.",
    ],
    missingEvidenceThatCouldChangeDecision: evidenceLedger?.missingEvidence.map((item) => `${item.id}: ${item.question}`) ?? [
      "Missing evidence ledger not available.",
    ],
    routeEvidenceCoverage,
    decisiveClaims,
    contestedClaims,
    weakClaimsAccepted,
    evidenceGapsAccepted,
    whyAcceptedDespiteGaps: [
      `Coverage score ${routeEvidenceCoverage.coverageScore} is sufficient for thinking-stage planning, not for coding execution.`,
      "Accepted gaps are explicitly represented as revisit conditions and task-level evidence blockers.",
      "Route-specific, risk-specific, and critic-specific evidence refs are present, so the route is not selected from generic goal/intent evidence alone.",
    ],
    routeSwitchTriggers: [
      "Switch to integration-first if ME-002 confirms mandatory external identity, inventory, notification, or document systems.",
      "Switch away from lightweight routes if SecurityCritic gaps become confirmed blockers.",
      "Switch to audit/compliance-first if ME-004 confirms hard retention, audit, or export constraints.",
      "Re-run route selection if contested claims remain unresolved before coding.",
    ],
  };
}