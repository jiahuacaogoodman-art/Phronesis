import { commonBadOutputExamples, commonQualityChecklist, jsonInput, thinkingSystemPrompt } from "./common.js";

export const problemSolutionResearchPrompt = {
  agentName: "ProblemSolutionResearchAgent",
  systemPrompt: [
    thinkingSystemPrompt,
    "You convert problem-specific technical search results into implementable technical solution decisions.",
    "Return only one root JSON object with technicalSolutionCandidates, technicalSolutionDecisionMatrix, and technicalSolutionIntegrationPlan.",
    "Do not invent URLs, titles, authors, dates, or source refs. Only use sourceRefs that appear in input.searchResults.",
    "If input.searchResults.status is not_configured or disabled, do not fabricate sourceRefs. Mark sourceEvidenceStatus as ruleFallback.",
    "Do not search generic product names. Focus on concrete technical solutions such as database constraints, workflow state machines, audit logs, RBAC/ABAC, transactional outbox, staging import, and retry/dead-letter handling.",
    "Do not output generic labels such as 权限、安全、数据、部署 without concrete data model, workflow, audit, permission, or testing impact.",
  ].join("\n"),
  buildUserPrompt(input: unknown) {
    return jsonInput({
      task: "Generate problem-solution technical research decisions from compressed route context, research plan, source-quality-filtered search results, and rule fallback candidates.",
      input,
    });
  },
  outputSchemaName: "problem-solution-research-result",
  outputSchemaDescription: "Object with technicalSolutionCandidates, technicalSolutionDecisionMatrix, and technicalSolutionIntegrationPlan.",
  expectedShape: {
    type: "object" as const,
    required: ["technicalSolutionCandidates", "technicalSolutionDecisionMatrix", "technicalSolutionIntegrationPlan"],
    arrays: [
      {
        path: "technicalSolutionCandidates.problems",
        minItems: 1,
        itemRequired: [
          "problemId",
          "problemStatement",
          "candidateSolutions",
          "recommendedSolution",
          "rejectedSolutions",
          "rationale",
          "implementationImpact",
          "sourceRefs",
          "confidence",
          "remainingUnknowns",
        ],
      },
      {
        path: "technicalSolutionDecisionMatrix.decisions",
        minItems: 1,
        itemRequired: [
          "problemId",
          "candidates",
          "criteriaScores",
          "selectedCandidate",
          "selectionReason",
          "fallbackCandidate",
          "whenToReconsider",
        ],
      },
      {
        path: "technicalSolutionIntegrationPlan.items",
        minItems: 1,
        itemRequired: [
          "problemId",
          "selectedSolution",
          "dataModelChanges",
          "serviceLayerChanges",
          "apiContractChanges",
          "workflowChanges",
          "permissionChanges",
          "auditChanges",
          "testingChanges",
          "migrationChanges",
          "operationRunbookChanges",
          "impactsCodingReadiness",
          "stillBlocksCoding",
        ],
      },
    ],
  },
  examples: [],
  badOutputExamples: commonBadOutputExamples,
  qualityChecklist: [
    ...commonQualityChecklist,
    "mustNotContain:generic SaaS",
    "mustNotContain:Product-Grade Web Application",
  ],
  temperature: 0.2,
  maxRetries: 2,
};