import { commonBadOutputExamples, commonQualityChecklist, jsonInput, thinkingSystemPrompt } from "./common.js";

export const routeSelectorPrompt = {
  agentName: "RouteSelector",
  systemPrompt: thinkingSystemPrompt,
  buildUserPrompt(input: unknown) {
    return jsonInput({
      task: "Select the main route using critic dissent, evidence coverage, decisive claims, contested claims, and route switch triggers.",
      input,
    });
  },
  outputSchemaName: "selected-route",
  outputSchemaDescription: "Object with selectedStrategyId, selectedTitle, selectionRationale, rejectedRoutes, fallbackRoutes, evidenceRefs, decisionRefs, decisiveClaims, contestedClaims, evidenceGapsAccepted, and routeSwitchTriggers.",
  expectedShape: {
    type: "object" as const,
    required: ["selectedStrategyId", "selectedTitle", "selectionRationale", "rejectedRoutes", "fallbackRoutes"],
  },
  examples: [],
  badOutputExamples: commonBadOutputExamples,
  qualityChecklist: [...commonQualityChecklist],
  temperature: 0.2,
  maxRetries: 2,
};