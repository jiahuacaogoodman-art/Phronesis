import type { CodingFailureAnalysis, CodingFeedbackAnalysisInput, CodingResultValidation } from "../types/coding-result.js";

function uniq(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)));
}

function failedAcceptanceCriteriaFrom(validation: CodingResultValidation): string[] {
  return uniq([
    ...(validation.failedAcceptanceCriteria ?? []),
    ...(validation.incompleteAcceptanceCheck ?? []).map((item) => `Missing result: ${item}`),
  ]);
}

function planningCausesFor(input: CodingFeedbackAnalysisInput): string[] {
  const causes: string[] = [];
  if (input.validation.forbiddenExecutionDetected) {
    causes.push("Handoff was blocked, so implementation should not have started.");
  }
  if (!input.validation.validTask) {
    causes.push("Coding result references a task outside approved or conditional handoff tasks.");
  }
  if ((input.validation.incompleteAcceptanceCheck ?? []).length > 0) {
    causes.push("Task package acceptance criteria were not fully checkable from the coding result.");
  }
  if ((input.validation.missingRequiredTests ?? []).length > 0) {
    causes.push("Task package required tests were not reported by the coding agent.");
  }
  if (input.codingResult?.needsPlannerRevision) {
    causes.push("Coding agent explicitly requested planner revision.");
  }
  return causes;
}

function codingCausesFor(input: CodingFeedbackAnalysisInput): string[] {
  const causes: string[] = [];
  if ((input.validation.failedTests ?? []).length > 0) {
    causes.push("Coding result reports failed tests.");
  }
  if ((input.validation.failedAcceptanceCriteria ?? []).length > 0) {
    causes.push("Coding result reports failed acceptance criteria.");
  }
  if ((input.validation.allowedChangeAreaViolations ?? []).length > 0) {
    causes.push("Changed files outside allowed change areas.");
  }
  if ((input.validation.forbiddenActionViolations ?? []).length > 0) {
    causes.push("Changed files or actions hit forbidden change areas.");
  }
  if (input.codingResult?.status === "failed") {
    causes.push(input.codingResult.failureSummary || "Coding agent reported failed status.");
  }
  return causes;
}

function failureTypeFor(input: CodingFeedbackAnalysisInput): string {
  if (input.validation.forbiddenExecutionDetected) return "forbidden-execution";
  if (!input.validation.matchedHandoffRunId) return "handoff-mismatch";
  if (!input.validation.validTask) return "invalid-task";
  if ((input.validation.allowedChangeAreaViolations ?? []).length > 0 || (input.validation.forbiddenActionViolations ?? []).length > 0) {
    return "constraint-violation";
  }
  if ((input.validation.failedTests ?? []).length > 0) return "test-failure";
  if ((input.validation.failedAcceptanceCriteria ?? []).length > 0 || (input.validation.incompleteAcceptanceCheck ?? []).length > 0) {
    return "acceptance-failure";
  }
  if ((input.validation.missingRequiredTests ?? []).length > 0) return "missing-required-tests";
  if (input.codingResult?.needsPlannerRevision) return "planner-revision-needed";
  if (["failed", "blocked", "rejected"].includes(input.codingResult?.status)) return "coding-agent-failed";
  return "none";
}

function recommendedActionFor(input: CodingFeedbackAnalysisInput, failureType: string): string {
  if (input.validation.forbiddenExecutionDetected) return "resolve blockers before coding";
  if (failureType === "handoff-mismatch") return "reject result and ingest the matching handoff run";
  if (failureType === "invalid-task") return "regenerate coding handoff after correcting task scope";
  if (input.codingResult?.needsPlannerRevision) return "rerun StrategyRevisionAgent or TechnicalProductizationPlanner";
  if (failureType === "constraint-violation") return "stop coding and regenerate handoff with corrected allowed and forbidden change areas";
  if (failureType === "test-failure" || failureType === "acceptance-failure" || failureType === "missing-required-tests") {
    return "send failure analysis to planner before continuing coding";
  }
  if (failureType === "coding-agent-failed") return "ask coding agent for missing details or regenerate handoff if specification is insufficient";
  return "accept coding result for planner review";
}

export function analyzeCodingFeedback(input: CodingFeedbackAnalysisInput): CodingFailureAnalysis {
  const failureType = failureTypeFor(input);
  const failedAcceptanceCriteria = failedAcceptanceCriteriaFrom(input.validation);
  const failedTests = uniq(input.validation.failedTests ?? []);
  const missingSpecification = uniq([
    ...(input.validation.missingRequiredTests ?? []).map((item) => `Required test not reported: ${item}`),
    ...(input.validation.incompleteAcceptanceCheck ?? []).map((item) => `Acceptance criterion missing result: ${item}`),
    ...(input.codingResult?.unresolvedQuestions ?? []),
  ]);
  const violatedConstraints = uniq([
    ...(input.validation.allowedChangeAreaViolations ?? []),
    ...(input.validation.forbiddenActionViolations ?? []),
    ...(input.validation.forbiddenExecutionDetected ? ["Blocked handoff received implementation result."] : []),
    ...(!input.validation.validTask ? [`Task ${input.codingResult?.codingTaskId ?? "unknown"} is not approved by handoff.`] : []),
  ]);
  const recommendedNextPlannerAction = recommendedActionFor(input, failureType);
  const shouldStopCoding = failureType !== "none" || input.handoff?.canProceedToCoding === false;
  return {
    failureType,
    failedAcceptanceCriteria,
    failedTests,
    likelyPlanningCause: planningCausesFor(input),
    likelyCodingCause: codingCausesFor(input),
    missingSpecification,
    violatedConstraints,
    recommendedNextPlannerAction,
    shouldRegenerateHandoff: ["invalid-task", "constraint-violation", "planner-revision-needed"].includes(failureType) || input.codingResult?.needsPlannerRevision === true,
    shouldReopenRouteSelection: input.validation.forbiddenExecutionDetected || failureType === "planner-revision-needed",
    shouldUpdateProblemResolutionPlan: ["test-failure", "acceptance-failure", "missing-required-tests", "planner-revision-needed"].includes(failureType) || input.codingResult?.needsPlannerRevision === true,
    shouldStopCoding,
  };
}