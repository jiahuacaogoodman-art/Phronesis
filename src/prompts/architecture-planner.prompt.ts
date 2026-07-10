import { commonBadOutputExamples, commonQualityChecklist, jsonInput, thinkingSystemPrompt } from "./common.js";

export const architecturePlannerPrompt = {
  agentName: "ArchitecturePlanner",
  systemPrompt: thinkingSystemPrompt,
  buildUserPrompt(input: unknown) {
    return jsonInput({
      task: "Plan architecture decisions as structured JSON for later rendering. Do not write implementation code.",
      input,
    });
  },
  outputSchemaName: "architecture-plan-json",
  outputSchemaDescription: "Object with architectureDecisions, assumptions, missingEvidence, decisionsToRevisit, and handoffNotes.",
  expectedShape: {
    type: "object" as const,
    required: ["architectureDecisions", "assumptions", "missingEvidence", "decisionsToRevisit"],
  },
  examples: [],
  badOutputExamples: commonBadOutputExamples,
  qualityChecklist: [...commonQualityChecklist],
  temperature: 0.2,
  maxRetries: 2,
};