import type {
  AntiSimplificationReport,
  CriticCouncilReport,
  EvidenceLedger,
  SelectedRoute,
  StrategyCandidate,
} from "../types/artifacts.ts";

function missingEvidencePenalty(ledger?: EvidenceLedger) {
  return ledger ? ledger.missingEvidence.length * ledger.confidenceModel.missingEvidencePenalty : 0.12;
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
  const selectedReviews = councilReport.reviews.filter((review) => review.strategyId === selected.id);
  const dissentSummary = selectedReviews
    .filter((review) => review.disagreementLevel !== "low" || (review.nearBlockingConcerns ?? []).length > 0)
    .map((review) => `${review.critic}: ${review.disagreementLevel}; ${(review.nearBlockingConcerns ?? review.objections).slice(0, 1).join(" ")}`)
    .slice(0, 8);

  return {
    selectedStrategyId: selected.id,
    selectedTitle: selected.title,
    selectionRationale: [
      `Highest evidence-adjusted route score: ${ranked[0].score.toFixed(2)}.`,
      `Critic average: ${selectedAggregate?.averageScore ?? "n/a"} with ${selectedAggregate?.blockingIssueCount ?? 0} blocking issues.`,
      `Selected route evidence refs: ${(selected.evidenceRefs ?? []).join(", ")}.`,
      "Dissent did not overturn the route because objections are addressable in task graph and revisit conditions.",
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
    evidenceRefs: Array.from(new Set([...(selected.evidenceRefs ?? []), "E-GOAL-001", "E-RISK-001"])).slice(0, 8),
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
  };
}