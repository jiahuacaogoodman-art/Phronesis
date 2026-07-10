import { commonBadOutputExamples, commonQualityChecklist, jsonInput, thinkingSystemPrompt } from "./common.js";

export const criticCouncilPrompt = {
  agentName: "CriticCouncil",
  systemPrompt: [
    thinkingSystemPrompt,
    "You must output seven distinct critic voices: ProductCritic, ArchitectCritic, SecurityCritic, FrontendCritic, BackendCritic, DevOpsCritic, TestingCritic.",
    "Each critic must produce different objections and cite evidenceRefs or claimRefs when available.",
  ].join("\n"),
  buildUserPrompt(input: unknown) {
    return jsonInput({
      task: "Review every strategy with seven role-specific critics. Include disagreement levels, near-blocking concerns, evidence refs, and claim refs.",
      input,
    });
  },
  outputSchemaName: "critic-council-report",
  outputSchemaDescription: "Object with critics, reviews, and aggregate. Reviews must include critic, strategyId, score, strengths, objections, requiredImprovements, blockingIssues, evidenceRefs, disagreementLevel.",
  expectedShape: {
    type: "object" as const,
    required: ["critics", "reviews", "aggregate"],
    arrays: [
      { path: "critics", minItems: 7 },
      { path: "reviews", minItems: 7, itemRequired: ["critic", "strategyId", "score", "strengths", "objections", "requiredImprovements", "blockingIssues", "evidenceRefs", "disagreementLevel"] },
    ],
  },
  examples: [],
  badOutputExamples: commonBadOutputExamples,
  qualityChecklist: [...commonQualityChecklist, "mustContain:SecurityCritic", "mustContain:TestingCritic"],
  temperature: 0.25,
  maxRetries: 2,
};

export function criticRolePrompt(critic: string) {
  return {
    agentName: `CriticCouncil.${critic}`,
    systemPrompt: [
      thinkingSystemPrompt,
      `You are ${critic}. Output only this critic's reviews as one root JSON array.`,
      "Review each route briefly. Keep objections concrete and evidence-aware.",
      "Do not generate reviews for other critic roles.",
    ].join("\n"),
    buildUserPrompt(input: unknown) {
      return jsonInput({
        task: `Review every strategy only as ${critic}. Return compact review objects.`,
        input,
      });
    },
    outputSchemaName: "critic-role-reviews",
    outputSchemaDescription: "Array of critic review objects with critic, strategyId, score, strengths, objections, requiredImprovements, blockingIssues, evidenceRefs, disagreementLevel.",
    expectedShape: {
      type: "array" as const,
      minItems: 1,
      itemRequired: ["critic", "strategyId", "score", "strengths", "objections", "requiredImprovements", "blockingIssues", "evidenceRefs", "disagreementLevel"],
      itemArrays: [
        { path: "strengths" },
        { path: "objections" },
        { path: "requiredImprovements" },
        { path: "blockingIssues" },
        { path: "evidenceRefs" },
      ],
    },
    examples: [],
    badOutputExamples: commonBadOutputExamples,
    qualityChecklist: [...commonQualityChecklist, `mustContain:${critic}`],
    temperature: 0.2,
    maxRetries: 1,
  };
}

export function criticRoutePrompt(strategyId: string) {
  return {
    agentName: `CriticCouncil.Route.${strategyId}`,
    systemPrompt: [
      thinkingSystemPrompt,
      `Review only route ${strategyId}. Output one root JSON array with the seven critic reviews for this route.`,
      "Include ProductCritic, ArchitectCritic, SecurityCritic, FrontendCritic, BackendCritic, DevOpsCritic, TestingCritic.",
      "Keep each review compact and concrete. Do not review other routes.",
    ].join("\n"),
    buildUserPrompt(input: unknown) {
      return jsonInput({
        task: `Review only strategy ${strategyId} with seven role-specific critics.`,
        input,
      });
    },
    outputSchemaName: "critic-route-reviews",
    outputSchemaDescription: "Array of critic review objects for one route.",
    expectedShape: {
      type: "array" as const,
      minItems: 7,
      itemRequired: ["critic", "strategyId", "score", "strengths", "objections", "requiredImprovements", "blockingIssues", "evidenceRefs", "disagreementLevel"],
      itemArrays: [
        { path: "strengths" },
        { path: "objections" },
        { path: "requiredImprovements" },
        { path: "blockingIssues" },
        { path: "evidenceRefs" },
      ],
    },
    examples: [],
    badOutputExamples: commonBadOutputExamples,
    qualityChecklist: [...commonQualityChecklist],
    temperature: 0.2,
    maxRetries: 1,
  };
}