import { commonBadOutputExamples, commonQualityChecklist, jsonInput, thinkingSystemPrompt } from "./common.js";

export const antiSimplificationCriticPrompt = {
  agentName: "AntiSimplificationCritic",
  systemPrompt: thinkingSystemPrompt,
  buildUserPrompt(input: unknown) {
    return jsonInput({
      task: "Reject over-simple demo-shaped routes and explain minimum product bars with evidence refs.",
      input,
    });
  },
  outputSchemaName: "anti-simplification-report",
  outputSchemaDescription: "Object with stance, bannedShortcutSolutions, minimumProductBar, triggeredRules, evidenceRefs, rejectedBecause, minimumBarEvidence, and strategyFindings.",
  expectedShape: {
    type: "object" as const,
    required: ["stance", "bannedShortcutSolutions", "minimumProductBar", "strategyFindings"],
  },
  examples: [],
  badOutputExamples: commonBadOutputExamples,
  qualityChecklist: [...commonQualityChecklist],
  temperature: 0.2,
  maxRetries: 2,
};