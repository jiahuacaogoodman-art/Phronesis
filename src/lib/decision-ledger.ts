import type {
  AntiSimplificationReport,
  CriticCouncilReport,
  DecisionLedger,
  EvidenceLedger,
  ExecutionTaskGraph,
  ProductExpansion,
  ProductIntentModel,
  SelectedRoute,
  StrategyCandidate,
} from "../types/artifacts.ts";

function decision(
  id: string,
  decisionType: string,
  selectedOption: string,
  rejectedOptions: string[],
  rationale: string[],
  evidenceRefs: string[],
  assumptionRefs: string[],
  riskRefs: string[],
  confidence: number,
  reversibility: "low" | "medium" | "high",
  conditionsToRevisit: string[],
) {
  return {
    id,
    decisionType,
    selectedOption,
    rejectedOptions,
    rationale,
    evidenceRefs,
    assumptionRefs,
    riskRefs,
    confidence,
    reversibility,
    conditionsToRevisit,
  };
}

export function buildDecisionLedger(input) {
  const assumptions = input.evidenceLedger.assumptions.map((item) => item.id).slice(0, 3);
  const risks = input.evidenceLedger.evidenceItems
    .filter((item) => item.type === "risk-derived")
    .map((item) => item.id);
  const selectedStrategy = input.strategies.find((strategy) => strategy.id === input.selectedRoute.selectedStrategyId);
  const dissentReviews = input.criticCouncilReport.reviews.filter((review) => review.disagreementLevel !== "low");

  return {
    decisions: [
      decision(
        "D-CAPABILITY-EXPAND",
        "capability-expansion",
        `${input.productExpansion.coreCapabilities.length} capabilities synthesized and enhanced`,
        ["single generic product capability set", "UI-first feature list"],
        [
          "Capabilities were selected from Product Intent actors/resources/workflows/risks before domain enhancement.",
          "Capabilities with missing evidence remain lower confidence but still visible.",
        ],
        ["E-INTENT-001", "E-INTENT-002", "E-INTENT-003", "E-RISK-001", "E-PRINCIPLE-001"],
        assumptions,
        risks,
        0.82,
        "high",
        ["If Product Intent actor/resource extraction changes, regenerate capabilities."],
      ),
      decision(
        "D-ROUTE-SYNTHESIS",
        "strategy-generation",
        `${input.strategies.length} route candidates from route archetypes`,
        ["one Product-Grade Web Application route", "domain-template-only route set"],
        [
          "Routes were synthesized from archetypes and triggeredBy evidence.",
          "Route confidence is reduced by missing evidence and integration/deployment uncertainty.",
        ],
        Array.from(new Set(input.strategies.flatMap((strategy) => strategy.evidenceRefs ?? []))).slice(0, 8),
        assumptions,
        risks,
        0.78,
        "high",
        ["If ME-002 proves mandatory integration, reprioritize integration-first."],
      ),
      decision(
        "D-ANTI-SIMPLIFICATION",
        "anti-simplification-rejection",
        "Reject demo-shaped routes missing compositional minimum bars",
        input.antiSimplificationReport.bannedShortcutSolutions,
        [
          "Triggered rules prove why simple form/list/table approaches are not enough.",
          "Minimum bar evidence guards against route collapse into a demo.",
        ],
        input.antiSimplificationReport.evidenceRefs ?? ["E-PRINCIPLE-001"],
        assumptions,
        risks,
        0.8,
        "medium",
        ["If the goal is confirmed as a one-off internal script, simplify minimum bars."],
      ),
      decision(
        "D-CRITIC-DISSENT",
        "critic-dissent-handling",
        "Keep dissent as route conditions and task verification hints",
        dissentReviews.map((review) => `${review.critic}:${review.strategyId}:${review.disagreementLevel}`).slice(0, 12),
        [
          "Critic objections are not discarded; they reduce route confidence and feed revisit conditions.",
          "Near-blocking concerns are handled by task graph verification and missing evidence questions.",
        ],
        Array.from(new Set(dissentReviews.flatMap((review) => review.evidenceRefs ?? []))).slice(0, 8),
        assumptions,
        risks,
        0.74,
        "high",
        ["If any near-blocking concern becomes confirmed, re-run route selection."],
      ),
      decision(
        "D-ROUTE-SELECT",
        "route-selection",
        `${input.selectedRoute.selectedStrategyId}: ${input.selectedRoute.selectedTitle}`,
        input.selectedRoute.rejectedRoutes.map((route) => `${route.strategyId}: ${route.title}`),
        input.selectedRoute.selectionRationale,
        input.selectedRoute.evidenceRefs ?? ["E-GOAL-001", "E-RISK-001"],
        assumptions,
        risks,
        input.selectedRoute.confidence ?? 0.7,
        "high",
        input.selectedRoute.conditionsToRevisit ?? input.selectedRoute.conditionsToReconsider,
      ),
      decision(
        "D-TASK-GRAPH",
        "task-graph-generation",
        `${input.executionTaskGraph.tasks.length} evidence-backed task nodes`,
        ["template-only task graph", "patch-first execution plan"],
        [
          "Tasks were derived from selected route, synthesized capabilities, risk surfaces, and critic dissent.",
          "Each task includes evidenceRefs, decisionRefs, derivedFromCapabilities, derivedFromRisks, and verificationHint.",
        ],
        Array.from(new Set(input.executionTaskGraph.tasks.flatMap((task) => task.evidenceRefs ?? []))).slice(0, 10),
        assumptions,
        risks,
        0.79,
        "medium",
        ["If selected route changes, regenerate task graph."],
      ),
    ],
  };
}