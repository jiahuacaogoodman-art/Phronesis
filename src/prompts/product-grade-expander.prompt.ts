import { commonBadOutputExamples, commonQualityChecklist, jsonInput, thinkingSystemPrompt } from "./common.js";

export const productGradeExpanderPrompt = {
  agentName: "ProductGradeExpander",
  systemPrompt: [
    thinkingSystemPrompt,
    "Output only the fields required by the schema. Keep capability descriptions short and concrete.",
    "Do not write full report prose or long explanations.",
    "Keep lists focused on product-grade capabilities that are specific to the goal.",
    "Every capability item in coreCapabilities must include: id, name, priority, description, whyItMatters, acceptanceSignal, triggeredBy, riskIfMissing.",
    "whyItMatters explains why the capability matters for this product. acceptanceSignal explains how a reviewer knows it is satisfied.",
    "Do not replace whyItMatters with objective, reason, value, or description. Do not replace acceptanceSignal with doneWhen or metric.",
  ].join("\n"),
  buildUserPrompt(input: unknown) {
    return jsonInput({
      task: "Expand the reconstructed intent into product-grade capabilities with evidence refs, confidence, and anti-demo boundaries. Keep each capability concise.",
      input,
    });
  },
  outputSchemaName: "product-expansion",
  outputSchemaDescription: "Object with goalSummary, productGradePrinciples, userRoles, coreCapabilities, operationalCapabilities, nonFunctionalRequirements, and demoTrapsToAvoid. Capabilities must include evidenceRefs and confidence when evidence ledger exists.",
  expectedShape: {
    type: "object" as const,
    required: ["goalSummary", "productGradePrinciples", "userRoles", "coreCapabilities", "operationalCapabilities", "nonFunctionalRequirements", "demoTrapsToAvoid"],
    arrays: [
      { path: "coreCapabilities", minItems: 3, itemRequired: ["id", "name", "priority", "description", "whyItMatters", "acceptanceSignal", "triggeredBy", "riskIfMissing"] },
    ],
  },
  examples: [],
  badOutputExamples: commonBadOutputExamples,
  qualityChecklist: [
    ...commonQualityChecklist,
    "mustNotContain:final report",
    "mustNotContain:architecture plan",
  ],
  temperature: 0.2,
  maxRetries: 2,
};