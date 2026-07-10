import { commonBadOutputExamples, commonQualityChecklist, jsonInput, thinkingSystemPrompt } from "./common.js";

export const executionTaskGraphBuilderPrompt = {
  agentName: "ExecutionTaskGraphBuilder",
  systemPrompt: thinkingSystemPrompt,
  buildUserPrompt(input: unknown) {
    return jsonInput({
      task: "Generate a coding-agent handoff DAG as structured task graph JSON. Include evidence blockers before execution.",
      input,
    });
  },
  outputSchemaName: "execution-task-graph",
  outputSchemaDescription: "Object with graphType, handoffPurpose, tasks, and suggestedExecutionOrder. Tasks include id, title, dependsOn, ownerAgent, purpose, deliverables, acceptanceCriteria, riskLevel, claimRefs, requiredEvidenceBeforeExecution.",
  expectedShape: {
    type: "object" as const,
    required: ["graphType", "handoffPurpose", "tasks", "suggestedExecutionOrder"],
    arrays: [
      { path: "tasks", minItems: 3, itemRequired: ["id", "title", "dependsOn", "ownerAgent", "purpose", "deliverables", "acceptanceCriteria", "riskLevel"] },
    ],
  },
  examples: [],
  badOutputExamples: commonBadOutputExamples,
  qualityChecklist: [...commonQualityChecklist],
  temperature: 0.2,
  maxRetries: 2,
};