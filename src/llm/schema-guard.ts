import { tryRepairJsonText } from "./json-repair.js";
import type { ExpectedShape, LLMJsonRequest, SchemaGuardResult, SchemaRepairRecord } from "./types.js";

type JsonRecord = Record<string, unknown>;

interface CanonicalizationResult {
  data: unknown;
  canonicalizationApplied: SchemaRepairRecord[];
  missingFieldRepairs: SchemaRepairRecord[];
  qualityChecklistFailures: string[];
}

const productIntentRequiredFields = [
  "rawGoal",
  "normalizedGoal",
  "domainId",
  "primaryActors",
  "secondaryActors",
  "coreResources",
  "coreWorkflows",
  "dataObjects",
  "lifecycleStages",
  "permissionBoundaries",
  "riskSurfaces",
  "operationalNeeds",
  "reportingNeeds",
  "integrationNeeds",
  "deploymentAssumptions",
  "uncertaintyNotes",
];

const productIntentArrayFields = [
  "primaryActors",
  "secondaryActors",
  "coreResources",
  "coreWorkflows",
  "dataObjects",
  "lifecycleStages",
  "permissionBoundaries",
  "riskSurfaces",
  "operationalNeeds",
  "reportingNeeds",
  "integrationNeeds",
  "deploymentAssumptions",
  "uncertaintyNotes",
];

const criticalProductIntentArrayFields = [
  "primaryActors",
  "coreResources",
  "coreWorkflows",
  "riskSurfaces",
];

const productIntentWrapperKeys = [
  "productIntent",
  "intent",
  "data",
  "result",
  "output",
];

const strategyWrapperKeys = [
  "strategyCandidates",
  "strategies",
  "routes",
  "data",
  "result",
  "output",
];

const strategyRequiredFields = [
  "id",
  "title",
  "thesis",
  "targetFit",
  "architectureShape",
  "productCoverage",
  "securityAndAbuseResistance",
  "operationalModel",
  "pros",
  "cons",
  "risks",
  "estimatedComplexity",
  "demoTrapResistanceScore",
  "evidenceRefs",
  "confidence",
  "tradeoffSummary",
  "missingEvidenceImpact",
];

const strategyArrayFields = [
  "architectureShape",
  "productCoverage",
  "securityAndAbuseResistance",
  "operationalModel",
  "pros",
  "cons",
  "risks",
  "evidenceRefs",
  "modules",
  "conditionsToPreferThisRoute",
  "conditionsToRejectThisRoute",
  "majorRisks",
  "securityCapability",
  "operationalCapability",
  "userExperience",
  "triggeredBy",
  "applicableScenarios",
  "coreArchitecture",
  "whyItMightFail",
];

const criticalStrategyArrayFields = [
  "architectureShape",
  "productCoverage",
  "risks",
  "evidenceRefs",
];

function hasPath(value: unknown, path: string): boolean {
  const parts = path.split(".");
  let current: unknown = value;
  for (const part of parts) {
    if (!isPlainObject(current) || !(part in current)) return false;
    current = current[part];
  }
  return true;
}

function isPlainObject(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getPath(value: unknown, path: string): unknown {
  let current: unknown = value;
  for (const part of path.split(".")) {
    if (!isPlainObject(current)) return undefined;
    current = current[part];
  }
  return current;
}

function objectArray(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.filter((item): item is JsonRecord => isPlainObject(item))
    : [];
}

function valueArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isProductIntentRequest(request: LLMJsonRequest<unknown>): boolean {
  return request?.schemaName === "product-intent" || request?.agentName === "ProductIntentBuilder";
}

function isStrategyRequest(request: LLMJsonRequest<unknown>): boolean {
  return request?.schemaName === "strategy-candidates" || request?.agentName === "StrategyGenerator";
}

function isProductExpansionRequest(request: LLMJsonRequest<unknown>): boolean {
  return request?.schemaName === "product-expansion" || request?.agentName === "ProductGradeExpander";
}

function isStrategyRevisionRequest(request: LLMJsonRequest<unknown>): boolean {
  return request?.schemaName === "strategy-revision-report" || request?.agentName === "StrategyRevisionAgent";
}

function isTechnicalProductizationRequest(request: LLMJsonRequest<unknown>): boolean {
  return request?.schemaName === "technical-productization-planner-result" || request?.agentName === "TechnicalProductizationPlanner";
}

function isProblemSolutionResearchRequest(request: LLMJsonRequest<unknown>): boolean {
  return request?.schemaName === "problem-solution-research-result" || request?.agentName === "ProblemSolutionResearchAgent";
}

function productIntentSignalCount(value: unknown): number {
  if (!isPlainObject(value)) return 0;
  return productIntentRequiredFields.filter((field) => Object.prototype.hasOwnProperty.call(value, field)).length;
}

function strategySignalCount(value: unknown): number {
  if (!isPlainObject(value)) return 0;
  return strategyRequiredFields.filter((field) => Object.prototype.hasOwnProperty.call(value, field)).length;
}

function inputRawGoal(request: LLMJsonRequest<unknown>): string {
  return String(getPath(request.input, "rawGoal") ?? request.goal).trim();
}

function inputNormalizedGoal(request: LLMJsonRequest<unknown>): string {
  return String(
    getPath(request.input, "reconstructedIntent.normalizedGoal") ??
    getPath(request.input, "normalizedGoal") ??
    getPath(request.input, "rawGoal") ??
    request.goal ??
    "",
  ).trim();
}

function inputDomainId(request: LLMJsonRequest<unknown>): string {
  return String(getPath(request.input, "domainAnalysis.domainId") ?? "generic-software-product").trim() || "generic-software-product";
}

function canonicalizeProductIntent(data: unknown, request: LLMJsonRequest<unknown>): CanonicalizationResult {
  let next: unknown = data;
  const canonicalizationApplied: SchemaRepairRecord[] = [];
  const missingFieldRepairs: SchemaRepairRecord[] = [];
  const qualityChecklistFailures: string[] = [];

  if (isPlainObject(next)) {
    for (const key of productIntentWrapperKeys) {
      const candidate = next[key];
      if (isPlainObject(candidate) && productIntentSignalCount(candidate) > 0) {
        next = candidate;
        canonicalizationApplied.push(`unwrapped wrapper field: ${key}`);
        break;
      }
    }
  }

  if (!isPlainObject(next)) {
    return { data: next, canonicalizationApplied, missingFieldRepairs, qualityChecklistFailures };
  }

  const scalarRepairs: Array<[string, string]> = [
    ["rawGoal", inputRawGoal(request)],
    ["normalizedGoal", inputNormalizedGoal(request) || inputRawGoal(request)],
    ["domainId", inputDomainId(request)],
  ];

  for (const [field, value] of scalarRepairs) {
    if (next[field] == null || String(next[field]).trim() === "") {
      next[field] = value;
      missingFieldRepairs.push({ field, repair: "filled from run input" });
    }
  }

  for (const field of productIntentArrayFields) {
    if (next[field] == null) {
      next[field] = [];
      missingFieldRepairs.push({ field, repair: "filled with empty array" });
    }
  }

  for (const field of criticalProductIntentArrayFields) {
    if (!Array.isArray(next[field]) || next[field].length === 0) {
      qualityChecklistFailures.push(`ProductIntent critical field is empty: ${field}`);
    }
  }

  return { data: next, canonicalizationApplied, missingFieldRepairs, qualityChecklistFailures };
}

function splitListString(value: unknown): string[] {
  return String(value ?? "")
    .split(/\n|；|;|、|，|,/)
    .map((item) => item.replace(/^[-*\d.、)\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 8);
}

function toArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item) => item != null).map((item) => typeof item === "string" ? item : JSON.stringify(item));
  if (value == null) return [];
  if (typeof value === "string") return splitListString(value);
  return [JSON.stringify(value)];
}

function toNumber(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return Math.max(min, Math.min(max, numeric));
  return fallback;
}

function canonicalizeStrategies(data: unknown): CanonicalizationResult {
  let next: unknown = data;
  const canonicalizationApplied: SchemaRepairRecord[] = [];
  const missingFieldRepairs: SchemaRepairRecord[] = [];
  const qualityChecklistFailures: string[] = [];

  if (isPlainObject(next)) {
    for (const key of strategyWrapperKeys) {
      const candidate = next[key];
      if (Array.isArray(candidate) && candidate.some((item) => strategySignalCount(item) > 0)) {
        next = candidate;
        canonicalizationApplied.push(`unwrapped wrapper field: ${key}`);
        break;
      }
    }
  }

  if (!Array.isArray(next)) {
    return { data: next, canonicalizationApplied, missingFieldRepairs, qualityChecklistFailures };
  }

  next = next.map((strategy: unknown, index: number): unknown => {
    if (!isPlainObject(strategy)) return strategy;
    const item = { ...strategy };

    for (const field of strategyArrayFields) {
      if (item[field] == null) {
        item[field] = [];
        missingFieldRepairs.push({ field: `${index}.${field}`, repair: "filled with empty array" });
      } else if (!Array.isArray(item[field])) {
        item[field] = toArray(item[field]);
        canonicalizationApplied.push(`converted ${index}.${field} to array`);
      }
    }

    const securityAndAbuseResistance = toArray(item.securityAndAbuseResistance);
    const securityCapability = toArray(item.securityCapability);
    const risks = toArray(item.risks);
    const operationalModel = toArray(item.operationalModel);
    const operationalCapability = toArray(item.operationalCapability);
    const architectureShape = toArray(item.architectureShape);
    const modules = toArray(item.modules);
    const pros = toArray(item.pros);
    const cons = toArray(item.cons);
    const productCoverage = toArray(item.productCoverage);
    item.securityAndAbuseResistance = securityAndAbuseResistance;
    item.securityCapability = securityCapability;
    item.risks = risks;
    item.operationalModel = operationalModel;
    item.operationalCapability = operationalCapability;
    item.architectureShape = architectureShape;
    item.modules = modules;
    item.pros = pros;
    item.cons = cons;
    item.productCoverage = productCoverage;

    if (securityAndAbuseResistance.length === 0 && securityCapability.length > 0) {
      item.securityAndAbuseResistance = securityCapability;
      missingFieldRepairs.push({ field: `${index}.securityAndAbuseResistance`, repair: "filled from securityCapability" });
    }
    if (toArray(item.securityAndAbuseResistance).length === 0 && risks.length > 0) {
      item.securityAndAbuseResistance = risks.slice(0, 3).map((risk: string) => `Control risk: ${risk}`);
      missingFieldRepairs.push({ field: `${index}.securityAndAbuseResistance`, repair: "filled from risks" });
    }
    if (operationalModel.length === 0 && operationalCapability.length > 0) {
      item.operationalModel = operationalCapability;
      missingFieldRepairs.push({ field: `${index}.operationalModel`, repair: "filled from operationalCapability" });
    }
    if (toArray(item.operationalModel).length === 0 && architectureShape.length > 0) {
      item.operationalModel = architectureShape.slice(0, 3);
      missingFieldRepairs.push({ field: `${index}.operationalModel`, repair: "filled from architectureShape" });
    }
    if (modules.length === 0 && architectureShape.length > 0) {
      item.modules = architectureShape;
      missingFieldRepairs.push({ field: `${index}.modules`, repair: "filled from architectureShape" });
    }
    if (pros.length === 0) {
      item.pros = productCoverage.slice(0, 3);
      missingFieldRepairs.push({ field: `${index}.pros`, repair: "filled from productCoverage" });
    }
    if (cons.length === 0) {
      item.cons = risks.slice(0, 3);
      missingFieldRepairs.push({ field: `${index}.cons`, repair: "filled from risks" });
    }

    if (!item.estimatedComplexity) {
      item.estimatedComplexity = "medium";
      missingFieldRepairs.push({ field: `${index}.estimatedComplexity`, repair: "filled with medium" });
    }
    if (item.demoTrapResistanceScore == null) {
      item.demoTrapResistanceScore = toNumber(item.productCompletenessScore, 7, 0, 10);
      missingFieldRepairs.push({ field: `${index}.demoTrapResistanceScore`, repair: "filled from productCompletenessScore or default" });
    } else {
      item.demoTrapResistanceScore = toNumber(item.demoTrapResistanceScore, 7, 0, 10);
    }
    if (item.productCompletenessScore == null) {
      item.productCompletenessScore = toNumber(item.demoTrapResistanceScore, 7, 0, 10);
      missingFieldRepairs.push({ field: `${index}.productCompletenessScore`, repair: "filled from demoTrapResistanceScore" });
    } else {
      item.productCompletenessScore = toNumber(item.productCompletenessScore, 7, 0, 10);
    }
    item.confidence = toNumber(item.confidence, 0.65, 0, 1);

    for (const field of criticalStrategyArrayFields) {
      if (!Array.isArray(item[field]) || item[field].length === 0) {
        qualityChecklistFailures.push(`StrategyCandidate ${index} critical field is empty: ${field}`);
      }
    }

    return item;
  });

  return { data: next, canonicalizationApplied, missingFieldRepairs, qualityChecklistFailures };
}

function canonicalizeProductExpansion(data: unknown): CanonicalizationResult {
  const canonicalizationApplied: SchemaRepairRecord[] = [];
  const missingFieldRepairs: SchemaRepairRecord[] = [];
  const qualityChecklistFailures: string[] = [];

  if (!isPlainObject(data)) {
    return { data, canonicalizationApplied, missingFieldRepairs, qualityChecklistFailures };
  }

  const next = { ...data };
  for (const listName of ["coreCapabilities", "operationalCapabilities", "nonFunctionalRequirements"]) {
    if (next[listName] == null) {
      next[listName] = [];
      missingFieldRepairs.push({ field: listName, repair: "filled with empty array" });
    }
    if (!Array.isArray(next[listName])) {
      next[listName] = toArray(next[listName]);
      canonicalizationApplied.push(`converted ${listName} to array`);
    }
    const capabilities = valueArray(next[listName]);
    next[listName] = capabilities.map((capability: unknown, index: number): unknown => {
      if (!isPlainObject(capability)) return capability;
      const item = { ...capability };
      const prefix = `${listName}.${index}`;
      if (!item.description) {
        item.description = item.whyItMatters ?? item.whyNeeded ?? item.userValue ?? item.systemCapability ?? item.name ?? "";
        missingFieldRepairs.push({ field: `${prefix}.description`, repair: "filled from capability summary fields" });
      }
      if (item.triggeredBy == null) {
        item.triggeredBy = [];
        missingFieldRepairs.push({ field: `${prefix}.triggeredBy`, repair: "filled with empty array" });
      } else if (!Array.isArray(item.triggeredBy)) {
        item.triggeredBy = toArray(item.triggeredBy);
        canonicalizationApplied.push(`converted ${prefix}.triggeredBy to array`);
      }
      if (!item.riskIfMissing) {
        item.riskIfMissing = item.rejectionImpactIfMissing ?? item.missingEvidenceImpact ?? `Missing ${item.name ?? "capability"} can collapse the product into a demo.`;
        missingFieldRepairs.push({ field: `${prefix}.riskIfMissing`, repair: "filled from impact fields or default" });
      }
      return item;
    });
  }

  if (!Array.isArray(next.coreCapabilities) || next.coreCapabilities.length < 3) {
    qualityChecklistFailures.push("ProductExpansion coreCapabilities must contain at least 3 items.");
  }

  return { data: next, canonicalizationApplied, missingFieldRepairs, qualityChecklistFailures };
}

function validateStrategyRevision(data: unknown): string[] {
  const failures: string[] = [];
  if (!isPlainObject(data)) return failures;
  const changeLogs = objectArray(data.strategyChangeLog);
  for (const log of changeLogs) {
    const changedFields = toArray(log.changedFields);
    if (changedFields.length === 0) {
      failures.push(`Revision for ${String(log.strategyId ?? "unknown")} has empty changedFields.`);
    } else if (changedFields.every((field: string) => field === "title")) {
      failures.push(`Revision for ${String(log.strategyId ?? "unknown")} only changed title.`);
    }
  }
  for (const strategy of objectArray(data.revisedStrategies)) {
    const metaFields = toArray(getPath(strategy, "revisionMeta.changedFields"));
    if (metaFields.length > 0 && metaFields.every((field: string) => field === "title")) {
      failures.push(`Revision for ${String(strategy.id ?? "unknown")} only changed title in revisionMeta.`);
    }
    const log = changeLogs.find((item) => item.strategyId === strategy.id);
    const changedFields = toArray(log?.changedFields ?? metaFields);
    if (changedFields.length > 0) {
      const substantive = changedFields.some((field: string) => field !== "title");
      if (!substantive) failures.push(`Revision for ${String(strategy.id ?? "unknown")} has no substantive changed field.`);
    }
  }
  return failures;
}

function isMedicalTechnicalProductizationInput(request: LLMJsonRequest<unknown>): boolean {
  const text = JSON.stringify(getPath(request.input, "productIntentEssential") ?? request.input ?? {});
  return ["medical-intern-rotation-management", "医院实习", "轮转", "科室", "带教", "出科"].some((signal) => text.includes(signal));
}

function validateTechnicalProductization(data: unknown, request: LLMJsonRequest<unknown>): string[] {
  const failures: string[] = [];
  if (!isPlainObject(data)) return failures;
  const routes = objectArray(getPath(data, "technicalRoutePlan.routes"));
  const forecastItems = objectArray(getPath(data, "productizationForecast.items"));
  const problems = objectArray(getPath(data, "problemResolutionPlan.problems"));
  const scorecards = objectArray(getPath(data, "technicalRouteScorecard.routeScores"));
  if (routes.length === 0) failures.push("TechnicalProductizationPlanner must produce at least one technical route.");
  if (isMedicalTechnicalProductizationInput(request)) {
    const text = JSON.stringify(data);
    for (const signal of ["轮转", "科室", "带教", "考勤", "出科", "请假", "审批"]) {
      if (!text.includes(signal)) failures.push(`TechnicalProductizationPlanner missing medical intern rotation signal: ${signal}.`);
    }
  }
  for (const route of routes) {
    const text = JSON.stringify(route);
    const genericSignals = ["权限", "安全", "数据", "部署"];
    const domainSignals = [
      ...toArray(getPath(request.input, "productIntentEssential.coreResources")),
      ...toArray(getPath(request.input, "productIntentEssential.coreWorkflows")),
      ...toArray(getPath(request.input, "productIntentEssential.riskSurfaces")),
    ];
    const hasGeneric = genericSignals.some((signal) => text.includes(signal));
    const hasDomain = domainSignals.some((signal) => signal && text.includes(signal));
    if (hasGeneric && domainSignals.length > 0 && !hasDomain) {
      failures.push(`Technical route ${String(route.strategyId ?? "unknown")} is too generic and does not reference domain resources/workflows.`);
    }
  }
  for (const item of forecastItems) {
    if (!item.designCountermeasure) failures.push(`Forecast ${String(item.id ?? "unknown")} missing designCountermeasure.`);
  }
  for (const problem of problems) {
    if (!problem.recommendedSolution) failures.push(`Problem ${String(problem.problem ?? "unknown")} missing recommendedSolution.`);
  }
  for (const score of scorecards) {
    if (!score.codingReadiness) failures.push(`Scorecard ${String(score.strategyId ?? "unknown")} missing codingReadiness.`);
    const routeBlocked = getPath(request.input, "selectedRouteSummary.canProceedToCoding") === false || getPath(data, "technicalRouteScorecard.canProceedToCoding") === false;
    if (routeBlocked && String(score.codingReadiness).toLowerCase() === "approved") {
      failures.push(`Scorecard ${String(score.strategyId ?? "unknown")} cannot be codingReadiness approved while selected route is blocked.`);
    }
  }
  return failures;
}

function validSourceRefsFromInput(request: LLMJsonRequest<unknown>): Set<string> {
  const refs = objectArray(getPath(request.input, "searchResults.resultsByProblem"))
    .flatMap((problem) => objectArray(problem.queryResults))
    .flatMap((queryResult) => objectArray(queryResult.results))
    .filter((result) => result.accepted === true)
    .map((result) => result.sourceRef)
    .filter((ref): ref is string => typeof ref === "string");
  return new Set(refs);
}

function validateProblemSolutionResearch(data: unknown, request: LLMJsonRequest<unknown>): string[] {
  const failures: string[] = [];
  if (!isPlainObject(data)) return failures;
  const problems = objectArray(getPath(data, "technicalSolutionCandidates.problems"));
  const integrations = objectArray(getPath(data, "technicalSolutionIntegrationPlan.items"));
  const validRefs = validSourceRefsFromInput(request);
  const searchStatus = getPath(request.input, "searchResults.status");
  const noLiveProvider = searchStatus === "not_configured" || searchStatus === "disabled";

  for (const problem of problems) {
    const candidates = objectArray(problem.candidateSolutions);
    const recommended = isPlainObject(problem.recommendedSolution) ? problem.recommendedSolution : undefined;
    const problemId = String(problem.problemId ?? "unknown");
    if (candidates.length === 0) failures.push(`Problem ${problemId} has empty candidateSolutions.`);
    if (!recommended || !recommended.name) failures.push(`Problem ${problemId} missing recommendedSolution.`);
    if (valueArray(problem.implementationImpact).length === 0) failures.push(`Problem ${problemId} missing implementationImpact.`);
    for (const candidate of candidates) {
      for (const field of ["name", "solutionType", "whenToUse", "whenNotToUse", "pros", "cons", "complexity", "operationalRisk", "sourceRefs", "applicabilityToCurrentRoute"]) {
        if (!hasPath(candidate, field)) failures.push(`Candidate in ${problemId} missing ${field}.`);
      }
    }
    const rejectedSolutions = objectArray(problem.rejectedSolutions);
    if (candidates.length < 2 && (rejectedSolutions.length === 0 || rejectedSolutions.some((item) => !item.reason))) {
      failures.push(`Problem ${problemId} needs at least 2 candidates or a rejected solution reason.`);
    }
    const problemRefs = [
      ...toArray(problem.sourceRefs),
      ...toArray(recommended?.sourceRefs),
      ...candidates.flatMap((candidate) => toArray(candidate.sourceRefs)),
    ];
    if (noLiveProvider && problemRefs.length > 0) {
      failures.push(`Problem ${problemId} cannot contain sourceRefs when search status is ${String(searchStatus)}.`);
    }
    if (!noLiveProvider && recommended && toArray(recommended.sourceRefs).length === 0 && recommended.sourceEvidenceStatus !== "ruleFallback") {
      failures.push(`Problem ${problemId} recommendedSolution must include sourceRefs or sourceEvidenceStatus ruleFallback.`);
    }
    for (const ref of problemRefs) {
      if (validRefs.size > 0 && !validRefs.has(ref)) {
        failures.push(`Problem ${problemId} uses unknown sourceRef ${ref}.`);
      }
    }
    const text = JSON.stringify(problem);
    const genericOnly = ["权限", "安全", "数据", "部署"].includes(String(recommended?.name ?? problem.problemStatement ?? ""));
    if (genericOnly || !["constraint", "workflow", "state", "audit", "RBAC", "ABAC", "outbox", "staging", "dry-run", "history", "exclusion", "审批", "状态机", "审计", "补录", "导入"].some((token) => text.includes(token))) {
      failures.push(`Problem ${problemId} solution is too generic.`);
    }
  }
  for (const item of integrations) {
    for (const field of ["dataModelChanges", "serviceLayerChanges", "workflowChanges", "auditChanges", "testingChanges"]) {
      if (!Array.isArray(item[field]) || item[field].length === 0) {
        failures.push(`Integration item ${String(item.problemId ?? "unknown")} missing ${field}.`);
      }
    }
  }
  return failures;
}

function validateExpectedShape(data: unknown, expectedShape: ExpectedShape | undefined): string[] {
  const errors: string[] = [];
  if (!expectedShape) return errors;

  if (expectedShape.type === "array") {
    if (!Array.isArray(data)) {
      errors.push("Expected top-level array.");
      return errors;
    }
    if (expectedShape.minItems && data.length < expectedShape.minItems) {
      errors.push(`Expected at least ${expectedShape.minItems} items.`);
    }
    if (expectedShape.itemRequired) {
      const requiredFields = expectedShape.itemRequired;
      data.forEach((item: unknown, index: number) => {
        for (const field of requiredFields) {
          if (!hasPath(item, field)) errors.push(`Item ${index} missing ${field}.`);
        }
      });
    }
    if (expectedShape.itemArrays) {
      const itemArrays = expectedShape.itemArrays;
      data.forEach((item: unknown, index: number) => {
        for (const arrayRule of itemArrays) {
          const value = getPath(item, arrayRule.path);
          if (!Array.isArray(value)) {
            errors.push(`Item ${index} expected array at ${arrayRule.path}.`);
            continue;
          }
          if (arrayRule.minItems && value.length < arrayRule.minItems) {
            errors.push(`Item ${index} expected ${arrayRule.path} to have at least ${arrayRule.minItems} items.`);
          }
        }
      });
    }
    return errors;
  }

  if (expectedShape.type === "object") {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      errors.push("Expected top-level object.");
      return errors;
    }
    for (const field of expectedShape.required ?? []) {
      if (!hasPath(data, field)) errors.push(`Missing required field ${field}.`);
    }
    for (const arrayRule of expectedShape.arrays ?? []) {
      const value = getPath(data, arrayRule.path);
      if (!Array.isArray(value)) {
        errors.push(`Expected array at ${arrayRule.path}.`);
        continue;
      }
      if (arrayRule.minItems && value.length < arrayRule.minItems) {
        errors.push(`Expected ${arrayRule.path} to have at least ${arrayRule.minItems} items.`);
      }
      for (const item of value) {
        for (const field of arrayRule.itemRequired ?? []) {
          if (!hasPath(item, field)) errors.push(`Item in ${arrayRule.path} missing ${field}.`);
        }
      }
    }
  }

  return errors;
}

function validateChecklist(data: unknown, qualityChecklist: string[]): string[] {
  const failures: string[] = [];
  const text = JSON.stringify(data);
  for (const item of qualityChecklist ?? []) {
    if (item.startsWith("mustContain:")) {
      const token = item.slice("mustContain:".length).trim();
      if (token && !text.includes(token)) failures.push(`Checklist token missing: ${token}`);
    }
    if (item.startsWith("mustNotContain:")) {
      const token = item.slice("mustNotContain:".length).trim();
      if (token && text.includes(token)) failures.push(`Forbidden checklist token present: ${token}`);
    }
  }
  return failures;
}

export function guardJsonOutput<T>(rawText: string, request: LLMJsonRequest<T>): SchemaGuardResult<T> {
  const repaired = tryRepairJsonText(rawText);
  const validationErrors: string[] = [];
  const canonicalizationApplied: SchemaRepairRecord[] = [];
  const missingFieldRepairs: SchemaRepairRecord[] = [];
  const extraQualityFailures: string[] = [];
  let data: unknown;

  try {
    data = JSON.parse(repaired.text) as unknown;
  } catch (error) {
    validationErrors.push(`JSON.parse failed: ${error instanceof Error ? error.message : String(error)}`);
    return {
      ok: false,
      data: undefined,
      repaired: repaired.repaired,
      validationErrors,
      qualityChecklistFailures: [],
      canonicalizationApplied,
      missingFieldRepairs,
    };
  }

  if (isProductIntentRequest(request)) {
    const canonicalized = canonicalizeProductIntent(data, request as LLMJsonRequest<unknown>);
    data = canonicalized.data;
    canonicalizationApplied.push(...canonicalized.canonicalizationApplied);
    missingFieldRepairs.push(...canonicalized.missingFieldRepairs);
    extraQualityFailures.push(...canonicalized.qualityChecklistFailures);
  }

  if (isStrategyRequest(request)) {
    const canonicalized = canonicalizeStrategies(data);
    data = canonicalized.data;
    canonicalizationApplied.push(...canonicalized.canonicalizationApplied);
    missingFieldRepairs.push(...canonicalized.missingFieldRepairs);
    extraQualityFailures.push(...canonicalized.qualityChecklistFailures);
  }

  if (isProductExpansionRequest(request)) {
    const canonicalized = canonicalizeProductExpansion(data);
    data = canonicalized.data;
    canonicalizationApplied.push(...canonicalized.canonicalizationApplied);
    missingFieldRepairs.push(...canonicalized.missingFieldRepairs);
    extraQualityFailures.push(...canonicalized.qualityChecklistFailures);
  }

  if (isStrategyRevisionRequest(request)) {
    extraQualityFailures.push(...validateStrategyRevision(data));
  }

  if (isTechnicalProductizationRequest(request)) {
    extraQualityFailures.push(...validateTechnicalProductization(data, request as LLMJsonRequest<unknown>));
  }

  if (isProblemSolutionResearchRequest(request)) {
    extraQualityFailures.push(...validateProblemSolutionResearch(data, request as LLMJsonRequest<unknown>));
  }

  validationErrors.push(...validateExpectedShape(data, request.expectedShape));
  const qualityChecklistFailures = [
    ...validateChecklist(data, request.qualityChecklist),
    ...extraQualityFailures,
  ];

  return {
    ok: validationErrors.length === 0 && qualityChecklistFailures.length === 0,
    data: data as T,
    repaired: repaired.repaired,
    validationErrors,
    qualityChecklistFailures,
    canonicalizationApplied,
    missingFieldRepairs,
  };
}