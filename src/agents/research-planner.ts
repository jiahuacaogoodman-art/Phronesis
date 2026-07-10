import type { ProductExpansion, ResearchPlan, ReconstructedIntent } from "../types/artifacts.js";

export function planResearch(intent: ReconstructedIntent, expansion: ProductExpansion): ResearchPlan {
  return {
    scope: "Create a research plan and evidence map without treating uncollected external evidence as fact.",
    researchQuestions: [
      {
        id: "RQ1",
        question: "What mature product patterns exist for this category?",
        neededFor: "Avoiding a demo-shaped architecture.",
        expectedEvidenceType: "Comparable products, platform docs, security guidance, and deployment case studies.",
      },
      {
        id: "RQ2",
        question: "Which abuse, failure, or operational scenarios are common?",
        neededFor: "Anti-simplification review and risk-driven route selection.",
        expectedEvidenceType: "Threat models, incident patterns, and domain operating procedures.",
      },
      {
        id: "RQ3",
        question: "Which route offers the best maturity-to-cost ratio?",
        neededFor: "RouteSelector tradeoff analysis.",
        expectedEvidenceType: "Implementation complexity estimates, integration constraints, and maintenance costs.",
      },
      {
        id: "RQ4",
        question: "What must be testable before coding starts?",
        neededFor: "Execution task graph and acceptance criteria.",
        expectedEvidenceType: "Workflow tests, security tests, permission tests, and deployment checks.",
      },
    ],
    benchmarkDimensions: [
      "product completeness",
      "security and abuse resistance",
      "operator workflow quality",
      "data lifecycle maturity",
      "deployment realism",
      "testability",
      "maintainability",
    ],
    sourcesToCheckLater: [
      "Official platform authentication and authorization documentation.",
      "Security and privacy guidance for the selected domain.",
      "Comparable mature products and their workflow patterns.",
      "Deployment platform documentation.",
      "Testing framework guidance for the eventual stack.",
    ],
    v01Constraint: `No external research is executed in this rule-based version. Expansion currently covers ${expansion.coreCapabilities.length} core capabilities for ${intent.inferredProductCategory}.`,
  };
}