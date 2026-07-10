import { commonBadOutputExamples, commonQualityChecklist, jsonInput, thinkingSystemPrompt } from "./common.js";

export const strategyRevisionPrompt = {
  agentName: "StrategyRevisionAgent",
  systemPrompt: [
    thinkingSystemPrompt,
    "Revise strategy candidates after critic debate. Output only one root JSON object.",
    "Do not hide unresolved evidence gaps. Do not force a blocked route to coding-approved.",
    "Every revised strategy must materially change route content, not only the title.",
    "Each strategyChangeLog item must include non-empty changedFields, changedBecause, criticObjectionsAddressed, newTradeoffsIntroduced, and evidenceGapsStillUnresolved.",
  ].join("\n"),
  buildUserPrompt(input: unknown) {
    return jsonInput({
      task: "Revise route strategies based on route deep dive, critic objections, selected route blockers, evidence gaps, and claim graph. Keep unresolved blockers explicit.",
      input,
    });
  },
  outputSchemaName: "strategy-revision-report",
  outputSchemaDescription: "Object with revisionRound, reasonForRevision, blockingIssuesAddressed, unresolvedBlockingIssues, revisedStrategies, strategyChangeLog, riskChangeLog, evidenceGapsStillAccepted, canReRunSelection, shouldStopRevision, stopReason.",
  expectedShape: {
    type: "object" as const,
    required: ["revisionRound", "reasonForRevision", "blockingIssuesAddressed", "unresolvedBlockingIssues", "revisedStrategies", "strategyChangeLog", "riskChangeLog", "evidenceGapsStillAccepted", "canReRunSelection", "shouldStopRevision", "stopReason"],
    arrays: [
      { path: "revisedStrategies", minItems: 1, itemRequired: ["id", "title", "thesis", "targetFit", "architectureShape", "productCoverage", "securityAndAbuseResistance", "operationalModel", "risks"] },
      { path: "strategyChangeLog", minItems: 1, itemRequired: ["strategyId", "changedFields", "changedBecause", "criticObjectionsAddressed", "newTradeoffsIntroduced", "evidenceGapsStillUnresolved"] },
      { path: "riskChangeLog", minItems: 1, itemRequired: ["strategyId", "addedRisks", "reducedRisks", "remainingRisks"] },
    ],
  },
  examples: [],
  badOutputExamples: commonBadOutputExamples,
  qualityChecklist: [
    ...commonQualityChecklist,
    "mustNotContain:coding-approved",
  ],
  temperature: 0.2,
  maxRetries: 2,
};