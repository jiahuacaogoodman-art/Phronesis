import type { EvidenceMap, ProductExpansion, ResearchPlan, ReconstructedIntent } from "../types/artifacts.js";

export function buildEvidenceMap(
  intent: ReconstructedIntent,
  expansion: ProductExpansion,
  researchPlan: ResearchPlan,
): EvidenceMap {
  return {
    evidencePolicy: "Rule-based evidence is planning evidence, not externally verified fact.",
    items: [
      {
        id: "E1",
        claim: "A product-grade plan must include roles, data lifecycle, security, testing, and deployment.",
        supportType: "rule-based-prior",
        confidence: "high",
        implication: "Strategies missing these dimensions should be penalized.",
      },
      {
        id: "E2",
        claim: `The goal category '${intent.inferredProductCategory}' requires more than a one-screen implementation.`,
        supportType: "derived-from-goal",
        confidence: "high",
        implication: "AntiSimplificationCritic should reject demo-only plans.",
      },
      {
        id: "E3",
        claim: `${expansion.coreCapabilities.length} core capabilities were inferred before technical route selection.`,
        supportType: "derived-from-goal",
        confidence: "medium",
        implication: "Route scoring should measure product coverage, not only engineering speed.",
      },
      {
        id: "E4",
        claim: "External maturity benchmarks still need validation before production implementation.",
        supportType: "requires-external-validation",
        confidence: "medium",
        implication: "Later versions should connect EvidenceCollector to real sources.",
      },
    ],
    openEvidenceGaps: researchPlan.researchQuestions.map((question) => question.question),
  };
}