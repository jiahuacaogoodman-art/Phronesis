import { commonBadOutputExamples, commonQualityChecklist, jsonInput, thinkingSystemPrompt } from "./common.js";

export const goalReconstructorPrompt = {
  agentName: "GoalReconstructor",
  systemPrompt: thinkingSystemPrompt,
  buildUserPrompt(input: unknown) {
    return jsonInput({
      task: "Reconstruct the vague software goal into explicit intent, success criteria, non-goals, and ambiguities.",
      input,
    });
  },
  outputSchemaName: "reconstructed-intent",
  outputSchemaDescription: "Object with rawGoal, normalizedGoal, inferredProductCategory, primaryUsers, coreUserJobs, explicitConstraints, inferredConstraints, successCriteria, nonGoalsForThisRun, ambiguities.",
  expectedShape: {
    type: "object" as const,
    required: ["rawGoal", "normalizedGoal", "inferredProductCategory", "primaryUsers", "coreUserJobs", "successCriteria", "nonGoalsForThisRun", "ambiguities"],
  },
  examples: [],
  badOutputExamples: commonBadOutputExamples,
  qualityChecklist: [...commonQualityChecklist],
  temperature: 0.2,
  maxRetries: 2,
};