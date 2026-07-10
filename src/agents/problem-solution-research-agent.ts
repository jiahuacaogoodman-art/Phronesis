import { problemKindForStatement } from "../lib/technical-search-query-planner.js";
import { classifySolutionSource } from "../lib/solution-source-quality.js";
import type {
  Complexity,
  ExecutionTaskGraph,
  ProblemResolutionPlan,
  ProblemSolutionResearchResult,
  ProductIntentModel,
  ProductizationForecast,
  RiskLevel,
  RouteDeepDiveReport,
  SelectedRoute,
  TechnicalRoutePlan,
  TechnicalRouteScorecard,
  TechnicalSolutionCandidates,
  TechnicalSolutionDecisionMatrix,
  TechnicalSolutionIntegrationPlan,
  TechnicalSolutionResearchPlan,
  TechnicalSolutionSearchResults,
} from "../types/artifacts.js";

type ResearchProblem = TechnicalSolutionResearchPlan["problems"][number];
type QueryResult = TechnicalSolutionSearchResults["resultsByProblem"][number]["queryResults"][number];
type CandidateSolution = TechnicalSolutionCandidates["problems"][number]["candidateSolutions"][number];
type MatrixScore = TechnicalSolutionDecisionMatrix["decisions"][number]["criteriaScores"][number];

interface RawSearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface SearchOptions {
  online?: boolean;
  provider?: string;
}

interface CandidateDefinition {
  recommendedName: string;
  candidates: CandidateSolution[];
  rejected: Array<{ name: string; reason: string }>;
}

interface ProblemSolutionResearchInputSource {
  goal: string;
  productIntent?: ProductIntentModel;
  selectedRoute?: SelectedRoute;
  routeDeepDive?: RouteDeepDiveReport;
  technicalRoutePlan?: TechnicalRoutePlan;
  productizationForecast?: ProductizationForecast;
  problemResolutionPlan?: ProblemResolutionPlan;
  technicalRouteScorecard?: TechnicalRouteScorecard;
  executionTaskGraph?: ExecutionTaskGraph;
}

interface BuildResearchResultInput {
  researchPlan: TechnicalSolutionResearchPlan;
  searchResults?: TechnicalSolutionSearchResults;
  selectedRoute?: { canProceedToCoding?: boolean };
  technicalRouteScorecard?: { canProceedToCoding?: boolean };
  executionTaskGraph?: { canProceedToCoding?: boolean };
  problemResolutionPlan?: ProblemResolutionPlan;
}

interface IntegrationProblem {
  problemId: string;
  problemStatement: string;
  dataModelChange?: string[];
  workflowChange?: string[];
  permissionChange?: string[];
  auditRequirement?: string[];
  testCases?: string[];
}

function uniq(items: readonly string[]): string[] {
  return Array.from(new Set((items ?? []).filter(Boolean)));
}

function compact(items: readonly string[], count = 6): string[] {
  return uniq(items).slice(0, count);
}

function includesAny(value: unknown, signals: readonly string[]): boolean {
  const text = String(value ?? "").toLowerCase();
  return signals.some((signal) => text.includes(String(signal).toLowerCase()));
}

function sourceRefsForProblem(
  searchResults: TechnicalSolutionSearchResults | undefined,
  problemId: string,
): string[] {
  return (searchResults?.resultsByProblem ?? [])
    .filter((problem) => problem.problemId === problemId)
    .flatMap((problem) => problem.queryResults ?? [])
    .flatMap((queryResult) => queryResult.results ?? [])
    .filter((result) => result.accepted)
    .map((result) => result.sourceRef);
}

function mockResultsForQuery(query: string): RawSearchResult[] {
  if (includesAny(query, ["PostgreSQL exclusion", "date range overlap"])) {
    return [
      { title: "PostgreSQL Documentation: Range Types", url: "https://www.postgresql.org/docs/current/rangetypes.html", snippet: "Range types support overlap operators and exclusion constraints for scheduling-like data." },
      { title: "PostgreSQL Documentation: Constraints", url: "https://www.postgresql.org/docs/current/ddl-constraints.html", snippet: "Exclusion constraints ensure that if any two rows are compared the specified operators do not all return true." },
    ];
  }
  if (includesAny(query, ["OR-Tools", "CP-SAT", "NoOverlap"])) {
    return [
      { title: "Google OR-Tools Scheduling", url: "https://developers.google.com/optimization/scheduling", snippet: "OR-Tools supports CP-SAT scheduling models and no-overlap constraints for optimization problems." },
    ];
  }
  if (includesAny(query, ["workflow", "state machine", "durable workflow"])) {
    return [
      { title: "Temporal Documentation: Workflows", url: "https://docs.temporal.io/workflows", snippet: "Temporal workflows model durable long-running processes with retries and state." },
      { title: "Martin Fowler: Workflow Patterns", url: "https://martinfowler.com/eaaDev/Workflow.html", snippet: "Workflow design separates state transitions and process coordination." },
    ];
  }
  if (includesAny(query, ["effective dated", "slowly changing", "assignment history", "temporal data"])) {
    return [
      { title: "Microsoft Learn: Slowly Changing Dimension Transformation", url: "https://learn.microsoft.com/en-us/sql/integration-services/data-flow/transformations/slowly-changing-dimension-transformation", snippet: "Slowly changing dimensions preserve historical attribute changes over time." },
      { title: "Temporal Data Modeling Patterns", url: "https://martinfowler.com/eaaDev/timeNarrative.html", snippet: "Temporal object modeling captures changes in facts across time." },
    ];
  }
  if (includesAny(query, ["append only audit", "manual override", "tamper evident"])) {
    return [
      { title: "OWASP Logging Cheat Sheet", url: "https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html", snippet: "Application logging should record security events and support integrity and accountability." },
      { title: "AWS Prescriptive Guidance: Audit Trail", url: "https://docs.aws.amazon.com/prescriptive-guidance/latest/patterns/build-an-audit-trail.html", snippet: "Audit trails record events for accountability and investigation." },
    ];
  }
  if (includesAny(query, ["master data", "outbox", "CDC", "synchronization"])) {
    return [
      { title: "Microservices.io: Transactional Outbox", url: "https://microservices.io/patterns/data/transactional-outbox.html", snippet: "The transactional outbox pattern reliably publishes messages after database updates." },
      { title: "Debezium Documentation", url: "https://debezium.io/documentation/", snippet: "Debezium provides change data capture for propagating database changes." },
    ];
  }
  if (includesAny(query, ["RBAC", "ABAC", "Row Level Security", "access control"])) {
    return [
      { title: "NIST RBAC Model", url: "https://csrc.nist.gov/projects/role-based-access-control", snippet: "NIST describes role based access control models and security properties." },
      { title: "PostgreSQL Documentation: Row Security Policies", url: "https://www.postgresql.org/docs/current/ddl-rowsecurity.html", snippet: "PostgreSQL row security policies restrict which rows can be returned or modified." },
      { title: "OWASP Authorization Cheat Sheet", url: "https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html", snippet: "Authorization checks should be enforced consistently and tested." },
    ];
  }
  if (includesAny(query, ["notification", "dead letter", "idempotent notification", "retry"])) {
    return [
      { title: "Microservices.io: Transactional Outbox", url: "https://microservices.io/patterns/data/transactional-outbox.html", snippet: "Use outbox records to avoid lost notifications when database updates and message publishing must align." },
      { title: "AWS Dead-letter Queues", url: "https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html", snippet: "Dead-letter queues isolate messages that cannot be processed successfully." },
    ];
  }
  if (includesAny(query, ["bulk import", "staging table", "CSV import", "validation error"])) {
    return [
      { title: "PostgreSQL Documentation: COPY", url: "https://www.postgresql.org/docs/current/sql-copy.html", snippet: "COPY moves data between files and tables and is commonly used in import workflows." },
      { title: "Microsoft Learn: Data Quality and Cleansing", url: "https://learn.microsoft.com/en-us/sql/integration-services/data-flow/transformations/data-cleansing", snippet: "Data cleansing and validation can identify invalid rows before loading." },
    ];
  }
  return [
    { title: "Engineering Guide: Audit Trail Design", url: "https://martinfowler.com/eaaDev/AuditLog.html", snippet: "Audit logs record meaningful business events for accountability." },
  ];
}

function attachQuality(
  problemId: string,
  query: string,
  queryIndex: number,
  rawResults: RawSearchResult[],
  seenUrls: Set<string>,
): QueryResult {
  const retrievedAt = new Date().toISOString();
  const results: QueryResult["results"] = [];
  for (const raw of rawResults) {
    if (seenUrls.has(raw.url)) continue;
    seenUrls.add(raw.url);
    const quality = classifySolutionSource(raw);
    results.push({
      sourceRef: `TS-${problemId}-Q${queryIndex + 1}-${String(results.length + 1).padStart(2, "0")}`,
      title: raw.title,
      url: raw.url,
      snippet: raw.snippet,
      query,
      rank: results.length + 1,
      retrievedAt,
      sourceQuality: quality.sourceQuality,
      sourceType: quality.sourceType,
      qualityReason: quality.qualityReason,
      accepted: quality.accepted,
    });
  }
  return { query, retrievedAt, results };
}

export async function searchTechnicalSolutions(
  researchPlan: TechnicalSolutionResearchPlan,
  options: SearchOptions = {},
): Promise<TechnicalSolutionSearchResults> {
  const provider = options.provider ?? process.env.THINK_TECHNICAL_SEARCH_PROVIDER ?? "none";
  if (!options.online) {
    return {
      generatedAt: new Date().toISOString(),
      status: "disabled",
      provider: "none",
      reason: "Technical solution search disabled. Use --online with a configured technical search provider.",
      resultsByProblem: researchPlan.problems.map((problem) => ({
        problemId: problem.problemId,
        problemStatement: problem.problemStatement,
        queryResults: [],
      })),
    };
  }
  if (provider !== "mock") {
    return {
      generatedAt: new Date().toISOString(),
      status: "not_configured",
      provider,
      reason: "online requested but live provider not configured",
      resultsByProblem: researchPlan.problems.map((problem) => ({
        problemId: problem.problemId,
        problemStatement: problem.problemStatement,
        queryResults: [],
      })),
    };
  }

  const seenUrls = new Set<string>();
  return {
    generatedAt: new Date().toISOString(),
    status: "completed",
    provider: "mock",
    resultsByProblem: researchPlan.problems.map((problem) => ({
      problemId: problem.problemId,
      problemStatement: problem.problemStatement,
      queryResults: problem.searchQueries.slice(0, 4).map((query, queryIndex) => attachQuality(problem.problemId, query, queryIndex, mockResultsForQuery(query), seenUrls)),
    })),
  };
}

export function buildProblemSolutionResearchInput(input: ProblemSolutionResearchInputSource) {
  return {
    goal: input.goal,
    productIntent: {
      domainId: input.productIntent?.domainId,
      primaryActors: compact(input.productIntent?.primaryActors ?? [], 6),
      coreResources: compact(input.productIntent?.coreResources ?? [], 8),
      coreWorkflows: compact(input.productIntent?.coreWorkflows ?? [], 8),
      riskSurfaces: compact(input.productIntent?.riskSurfaces ?? [], 8),
      integrationNeeds: compact(input.productIntent?.integrationNeeds ?? [], 8),
    },
    selectedRoute: {
      selectedStrategyId: input.selectedRoute?.selectedStrategyId,
      selectedTitle: input.selectedRoute?.selectedTitle,
      canProceedToCoding: input.selectedRoute?.canProceedToCoding !== false,
      blockingReasons: input.selectedRoute?.blockingReasons ?? [],
      requiredClarificationsBeforeCoding: input.selectedRoute?.requiredClarificationsBeforeCoding ?? [],
    },
    routeDeepDive: {
      topRisks: (input.routeDeepDive?.routeAnalyses ?? []).flatMap((analysis) => (analysis.riskRegister ?? []).slice(0, 4).map((risk) => risk.risk)).slice(0, 12),
      validationBeforeCoding: (input.routeDeepDive?.routeAnalyses ?? []).flatMap((analysis) => analysis.validationBeforeCoding ?? analysis.recommendedValidationBeforeCoding ?? []).slice(0, 10),
    },
    technicalRoutePlan: {
      routes: (input.technicalRoutePlan?.routes ?? []).map((route) => ({
        strategyId: route.strategyId,
        routeTitle: route.routeTitle,
        databaseEntities: (route.databaseModel?.entities ?? []).map((entity) => entity.name).slice(0, 10),
        stateMachines: (route.stateMachines ?? []).map((machine) => machine.name).slice(0, 6),
        conflictRules: route.conflictDetectionModel?.rules ?? [],
        integrationAdapters: route.integrationAdapters ?? [],
        codingReadiness: route.codingReadiness,
      })),
    },
    productizationForecast: {
      scenarios: (input.productizationForecast?.items ?? []).map((item) => ({
        id: item.id,
        scenario: item.scenario,
        severity: item.severity,
        countermeasure: item.designCountermeasure,
      })),
    },
    problemResolutionPlan: {
      problems: (input.problemResolutionPlan?.problems ?? []).map((problem) => ({
        problem: problem.problem,
        recommendedSolution: problem.recommendedSolution,
        validationRule: problem.validationRule,
        blocksCodingUntilResolved: problem.blocksCodingUntilResolved,
      })),
    },
    technicalRouteScorecard: {
      canProceedToCoding: input.technicalRouteScorecard?.canProceedToCoding !== false,
      inheritedBlockingReasons: input.technicalRouteScorecard?.inheritedBlockingReasons ?? [],
    },
    executionTaskGraph: {
      canProceedToCoding: input.executionTaskGraph?.canProceedToCoding !== false,
      globalBlockingReasons: input.executionTaskGraph?.globalBlockingReasons ?? [],
    },
  };
}

function candidate(
  name: string,
  solutionType: string,
  whenToUse: string,
  whenNotToUse: string,
  pros: string[],
  cons: string[],
  complexity: Complexity,
  operationalRisk: RiskLevel,
  sourceRefs: string[],
  applicability: string,
): CandidateSolution {
  return {
    name,
    solutionType,
    whenToUse,
    whenNotToUse,
    pros,
    cons,
    complexity,
    operationalRisk,
    sourceRefs,
    sourceEvidenceStatus: sourceRefs.length > 0 ? "searched" : "ruleFallback",
    applicabilityToCurrentRoute: applicability,
  };
}

function candidatesFor(problem: ResearchProblem, sourceRefs: string[]): CandidateDefinition {
  const kind = problemKindForStatement(problem.problemStatement);
  if (kind === "capacity-conflict") {
    return {
      recommendedName: "PostgreSQL range/exclusion constraints + application dry-run conflict checker",
      candidates: [
        candidate(
          "PostgreSQL range/exclusion constraints + application dry-run checker",
          "database constraint plus application validation",
          "Use for hard overlap prevention, capacity guardrails, and pre-publish impact analysis.",
          "Do not use as the only mechanism when optimization rules are unstable or multi-object constraints exceed database expressiveness.",
          ["Prevents hard overlap at persistence layer", "Dry-run can show affected students list before publishing", "Explainable enough for admins"],
          ["Requires careful range modeling and migration tests", "Complex optimization still needs a later solver"],
          "medium",
          "medium",
          sourceRefs,
          "Best first-phase fit for 科室容量名额 and 轮转计划冲突.",
        ),
        candidate(
          "OR-Tools CP-SAT scheduling optimizer",
          "constraint programming optimizer",
          "Use later when rules are stable and automatic schedule optimization is required.",
          "Avoid as first-phase default before hospital-specific rotation, leave, mentor, and capacity rules are confirmed.",
          ["Handles complex NoOverlap and optimization objectives", "Can optimize across many resources"],
          ["Higher model complexity", "Harder for administrators to explain and override"],
          "very-high",
          "high",
          sourceRefs,
          "Useful future option, not the safest MVP baseline.",
        ),
      ],
      rejected: [{ name: "application-only conflict check", reason: "Can miss race conditions without database-level protection." }],
    };
  }
  if (kind === "leave-workflow") {
    return {
      recommendedName: "Explicit workflow state machine + transition table + audit log",
      candidates: [
        candidate("Explicit workflow state machine + transition table + audit log", "state machine", "Use for leave type, affected rotation days, qualification impact, make-up requirement, and approval chain.", "Avoid if cross-system orchestration becomes long-running and requires durable retries.", ["Transparent state transitions", "Easy to audit", "Keeps first-phase implementation bounded"], ["Requires up-front transition matrix"], "medium", "medium", sourceRefs, "Fits 请假补轮转 and 出科资格 dispute prevention."),
        candidate("Temporal durable workflow", "durable workflow engine", "Use later when approvals span multiple systems and long-running retries dominate.", "Avoid first-phase if process rules are still changing.", ["Durable retries", "Good long-running process model"], ["Extra infrastructure and operational learning curve"], "high", "medium", sourceRefs, "Later upgrade path for cross-system approval orchestration."),
      ],
      rejected: [{ name: "status field only", reason: "Cannot explain transitions, approval ownership, or audit history." }],
    };
  }
  if (kind === "mentor-history") {
    return {
      recommendedName: "Effective-dated MentorAssignment history",
      candidates: [
        candidate("Effective-dated MentorAssignment history", "temporal data model", "Use when evaluation ownership depends on validFrom and validTo intervals.", "Avoid only if mentor responsibility is never changed, which is unrealistic.", ["Preserves responsibility history", "Binds evaluation ownership to assignment interval", "Supports change reason and operator audit"], ["Requires interval overlap checks"], "medium", "low", sourceRefs, "Directly fits 带教责任历史."),
        candidate("SCD Type 2 assignment dimension", "historical dimension", "Use for analytics-heavy history tracking.", "Avoid as only operational model if live workflow validation is needed.", ["Good reporting history", "Preserves historical rows"], ["May be less natural for operational approvals"], "medium", "medium", sourceRefs, "Useful reporting pattern but less direct for workflow ownership."),
      ],
      rejected: [{ name: "overwrite current mentor_id", reason: "Destroys responsibility history and makes evaluation disputes untraceable." }],
    };
  }
  if (kind === "attendance-audit") {
    return {
      recommendedName: "Append-only AttendanceEvent with manual override approval",
      candidates: [
        candidate("Append-only AttendanceEvent with manualOverride approval", "audit event model", "Use for original source, manual override flag, approval requirement, reason, evidence attachment placeholder, and audit export marker.", "Avoid if the institution does not need post-hoc accountability, which conflicts with the stated goal.", ["Strong audit trail", "Preserves original and override events", "Supports export markers"], ["More records and reporting logic"], "medium", "medium", sourceRefs, "Fits 手工补录考勤 and audit credibility."),
        candidate("Mutable Attendance row with audit columns", "simple audit columns", "Use only for low-risk internal tools.", "Avoid for medical teaching accountability.", ["Simple to implement"], ["Weak tamper evidence", "Harder to reconstruct event sequence"], "low", "high", sourceRefs, "Too weak for the target route unless heavily constrained."),
      ],
      rejected: [{ name: "overwrite attendance result", reason: "Removes original source and makes manual补录 impossible to audit." }],
    };
  }
  if (kind === "master-data-sync") {
    return {
      recommendedName: "Local shadow table + externalId mapping + idempotent sync + staging conflict report",
      candidates: [
        candidate("Local shadow table + externalId mapping + idempotent sync", "master data sync pattern", "Use when 教务/人事/科室目录 are external sources with delayed or partial updates.", "Avoid if all master data is manually maintained locally.", ["Stable local references", "Retry-safe updates", "Conflict report protects official records"], ["Needs reconciliation jobs and ownership rules"], "high", "medium", sourceRefs, "Fits 教务/人事主数据不同步."),
        candidate("CDC/outbox integration", "event-driven sync", "Use when upstream systems can publish reliable changes.", "Avoid if upstream integration contracts are unavailable.", ["Near-real-time updates", "Better eventual consistency"], ["Requires upstream support and monitoring"], "high", "medium", sourceRefs, "Good later integration path."),
      ],
      rejected: [{ name: "direct live lookup only", reason: "Creates brittle runtime dependency and weak audit history." }],
    };
  }
  if (kind === "permission-boundary") {
    return {
      recommendedName: "RBAC actions + ABAC/data scope + optional PostgreSQL Row Level Security",
      candidates: [
        candidate("RBAC actions + ABAC/data scope", "authorization model", "Use for department, campus, batch, role, and ownership boundaries.", "Do not rely on RBAC alone when data scope matters.", ["Clear action permissions", "Data scope handles 科室/院区/批次 boundaries", "Permission matrix tests are explainable"], ["Needs careful policy design"], "medium", "medium", sourceRefs, "Best fit for multi-role hospital rotation management."),
        candidate("PostgreSQL Row Level Security defense in depth", "database authorization defense", "Use as optional layer for sensitive row-level access after app policy stabilizes.", "Avoid as the only authorization model because business rules still need app-level explanations.", ["Defense in depth", "Limits accidental broad queries"], ["Policy debugging complexity"], "high", "medium", sourceRefs, "Good optional hardening layer."),
      ],
      rejected: [{ name: "global role-only RBAC", reason: "Cannot prevent cross-department or cross-campus over-read." }],
    };
  }
  if (kind === "notification-failure") {
    return {
      recommendedName: "Transactional outbox + retry policy + idempotency key + delivery status + dead letter queue",
      candidates: [
        candidate("Transactional outbox notification pipeline", "reliable notification pattern", "Use when workflow changes and notifications must not diverge.", "Avoid if notifications are purely informational and loss is acceptable.", ["Prevents lost events", "Supports retries and manual resend", "Records delivery status"], ["Requires worker and monitoring"], "medium", "medium", sourceRefs, "Fits approval and confirmation notifications."),
        candidate("Direct send inside request", "simple send", "Use only for low-risk prototypes.", "Avoid for approval-critical notifications.", ["Simple"], ["Can lose messages on failure", "No dead letter or resend trail"], "low", "high", sourceRefs, "Too weak for product-grade approval flows."),
      ],
      rejected: [{ name: "fire-and-forget notification", reason: "Cannot prove whether students or mentors missed approval/confirmation." }],
    };
  }
  if (kind === "bulk-import") {
    return {
      recommendedName: "Staging table + dry-run validation + row-level error report + admin confirmation + rollback batch",
      candidates: [
        candidate("Staging table dry-run import workflow", "bulk import validation pattern", "Use for 学期初 high-volume CSV/Excel imports before official writes.", "Avoid only when import volumes are tiny and manually reviewed.", ["Isolates dirty rows", "Produces row-level error report", "Supports duplicate detection and rollback batch"], ["Requires staging schema and validation UI/API"], "medium", "medium", sourceRefs, "Best fit for student, mentor, department, and schedule imports."),
        candidate("Direct import into production tables", "direct bulk load", "Use only for controlled admin scripts with perfect source data.", "Avoid for product-grade operations.", ["Fast"], ["Dirty data enters official workflow", "Poor rollback and audit"], "low", "high", sourceRefs, "Rejected for current route."),
      ],
      rejected: [{ name: "direct production import", reason: "No dry-run, row-level error report, admin confirmation, or rollback batch." }],
    };
  }
  return {
    recommendedName: "Domain-specific state, validation, audit, and operational fallback",
    candidates: [
      candidate("Domain-specific validation with audit trail", "domain engineering pattern", "Use when the problem has workflow and accountability impact.", "Avoid if the problem is purely cosmetic.", ["Keeps model explicit", "Supports tests and operations"], ["Needs domain rules"], "medium", "medium", sourceRefs, "General fallback for unresolved productization risk."),
    ],
    rejected: [{ name: "generic CRUD-only solution", reason: "Does not solve the technical risk." }],
  };
}

function matrixScores(candidateName: string, selectedName: string): MatrixScore {
  const selected = candidateName === selectedName;
  return {
    candidate: candidateName,
    correctness: selected ? 8 : 6,
    implementationComplexity: includesAny(candidateName, ["OR-Tools", "Temporal", "Row Level Security"]) ? 5 : 7,
    operationalComplexity: includesAny(candidateName, ["OR-Tools", "Temporal", "CDC"]) ? 5 : 7,
    auditability: includesAny(candidateName, ["audit", "Append-only", "state machine", "outbox", "RBAC"]) ? 8 : 6,
    scalability: includesAny(candidateName, ["OR-Tools", "outbox", "CDC", "Row Level Security"]) ? 8 : 7,
    explainability: includesAny(candidateName, ["OR-Tools", "Temporal"]) ? 5 : 8,
    fitForMVP: selected ? 8 : 5,
    fitForProductGrade: selected ? 8 : 7,
    totalScore: selected ? 62 : 49,
  };
}

function integrationFor(
  problem: IntegrationProblem,
  selectedName: string,
  selectedCanProceed: boolean,
): TechnicalSolutionIntegrationPlan["items"][number] {
  const kind = problemKindForStatement(problem.problemStatement);
  const common = {
    problemId: problem.problemId,
    problemStatement: problem.problemStatement,
    selectedSolution: selectedName,
    impactsCodingReadiness: selectedCanProceed ? "Improves readiness but still requires normal handoff review." : "Adds technical clarity but does not override selected-route blocking state.",
    stillBlocksCoding: !selectedCanProceed,
  };
  if (kind === "capacity-conflict") {
    return {
      ...common,
      dataModelChanges: ["tsrange/date range fields on rotation plan", "capacity version table", "exclusion constraint for overlapping rotations", "conflict_check_result table"],
      serviceLayerChanges: ["dry-run conflict checker", "affected students list builder", "admin confirmation service", "rollback package generator"],
      apiContractChanges: ["POST /rotation-plans/dry-run", "POST /capacity-versions/:id/confirm", "GET /conflicts/:batchId"],
      workflowChanges: ["capacity changes must dry-run before publish", "blocking conflicts require admin confirmation"],
      permissionChanges: ["capacity publish restricted to hospital education admin"],
      auditChanges: ["log capacity before/after, affected students, operator, confirmation, rollback id"],
      testingChanges: ["overlap constraint test", "capacity downsize conflict test", "rollback test"],
      migrationChanges: ["backfill date ranges and capacity version ids"],
      operationRunbookChanges: ["capacity change runbook with dry-run, confirm, notify, rollback"],
    };
  }
  if (kind === "permission-boundary") {
    return {
      ...common,
      dataModelChanges: ["role table", "resource scope table", "department/campus/batch scope mapping", "optional row level security policy metadata"],
      serviceLayerChanges: ["authorization policy evaluator", "permission matrix test fixture", "sensitive export gate"],
      apiContractChanges: ["include actor scope in auth context", "return forbidden with policy reason code"],
      workflowChanges: ["cross-department access requires explicit admin grant"],
      permissionChanges: ["RBAC for actions plus ABAC/data scope for department/campus/batch"],
      auditChanges: ["log denied access, cross-scope grants, sensitive exports"],
      testingChanges: ["RBAC matrix tests", "ABAC data scope tests", "optional PostgreSQL RLS defense tests"],
      migrationChanges: ["assign existing users to roles and scopes"],
      operationRunbookChanges: ["permission grant review and over-access incident response"],
    };
  }
  if (kind === "bulk-import") {
    return {
      ...common,
      dataModelChanges: ["import_batch", "staging rows", "row-level validation errors", "rollback batch id"],
      serviceLayerChanges: ["dry-run validator", "duplicate detector", "admin confirmation loader", "rollback service"],
      apiContractChanges: ["POST /imports/dry-run", "GET /imports/:id/errors", "POST /imports/:id/confirm", "POST /imports/:id/rollback"],
      workflowChanges: ["import must stage, validate, report, confirm, then commit"],
      permissionChanges: ["bulk import restricted to education admin or delegated operator"],
      auditChanges: ["log file metadata, operator, row counts, error counts, confirm/rollback"],
      testingChanges: ["dirty row isolation", "duplicate detection", "rollback batch test"],
      migrationChanges: ["create staging schema and import audit tables"],
      operationRunbookChanges: ["semester-start import playbook"],
    };
  }
  return {
    ...common,
    dataModelChanges: problem.dataModelChange ?? ["add explicit source, status, version, and audit fields"],
    serviceLayerChanges: ["domain validation service", "workflow transition service", "audit recording service"],
    apiContractChanges: ["add validation endpoint and status transition endpoint"],
    workflowChanges: problem.workflowChange ?? ["add precheck, approval, rollback, and manual fallback"],
    permissionChanges: problem.permissionChange ?? ["resource-scoped permission checks"],
    auditChanges: problem.auditRequirement ?? ["record actor, before/after, reason, source, export marker"],
    testingChanges: problem.testCases ?? ["domain validation tests", "permission tests", "audit tests"],
    migrationChanges: ["backfill status and audit references for existing records"],
    operationRunbookChanges: ["failure handling and manual review runbook"],
  };
}

export function buildProblemSolutionResearchResult(
  input: BuildResearchResultInput,
): ProblemSolutionResearchResult {
  const sourceSearchCompleted = input.searchResults?.status === "completed";
  const selectedCanProceed = input.selectedRoute?.canProceedToCoding !== false && input.technicalRouteScorecard?.canProceedToCoding !== false && input.executionTaskGraph?.canProceedToCoding !== false;
  const problemOutputs: TechnicalSolutionCandidates["problems"] = input.researchPlan.problems.map((problem) => {
    const refs = sourceSearchCompleted ? sourceRefsForProblem(input.searchResults, problem.problemId) : [];
    const definition = candidatesFor(problem, refs);
    return {
      problemId: problem.problemId,
      problemStatement: problem.problemStatement,
      candidateSolutions: definition.candidates,
      recommendedSolution: {
        name: definition.recommendedName,
        summary: definition.candidates[0]?.applicabilityToCurrentRoute ?? definition.recommendedName,
        sourceRefs: refs,
        sourceEvidenceStatus: refs.length > 0 ? "searched" : "ruleFallback",
      },
      rejectedSolutions: definition.rejected,
      rationale: [
        `${definition.recommendedName} is the most explainable first-phase fit for the current route.`,
        "More complex engines are kept as later options unless rules stabilize and optimization pressure is proven.",
      ],
      implementationImpact: [
        "Data model, workflow, permission, audit, and testing changes must be reflected before coding handoff.",
        sourceSearchCompleted ? "Source refs were attached from accepted technical search results." : "No live technical source refs are attached, so this remains ruleFallback guidance.",
      ],
      sourceRefs: refs,
      confidence: refs.length > 0 ? 0.76 : 0.58,
      remainingUnknowns: problem.decisionCriteria.includes("fitForProductGrade")
        ? ["Confirm institution-specific workflow rules before coding.", "Confirm integration contracts and operational ownership."]
        : ["Confirm product-grade acceptance criteria."],
    };
  });

  const decisions: TechnicalSolutionDecisionMatrix["decisions"] = problemOutputs.map((problem) => {
    const candidates = problem.candidateSolutions.map((item) => item.name);
    const selectedCandidate = problem.recommendedSolution.name;
    return {
      problemId: problem.problemId,
      candidates,
      criteriaScores: candidates.map((name) => matrixScores(name, selectedCandidate)),
      selectedCandidate,
      selectionReason: `${selectedCandidate} balances correctness, auditability, explainability, and first-phase product readiness.`,
      fallbackCandidate: candidates.find((name) => name !== selectedCandidate) ?? selectedCandidate,
      whenToReconsider: ["If route blockers are resolved and optimization/integration complexity becomes proven.", "If high-quality official sources contradict the ruleFallback recommendation."],
    };
  });

  const problemById = new Map(
    (input.problemResolutionPlan?.problems ?? []).map((problem) => [problem.problem, problem] as const),
  );
  const integrationItems: TechnicalSolutionIntegrationPlan["items"] = problemOutputs.map((problem) => {
    const original = problemById.get(problem.problemStatement);
    return integrationFor({
      problemId: problem.problemId,
      problemStatement: problem.problemStatement,
      dataModelChange: original?.dataModelChange,
      workflowChange: original?.workflowChange,
      permissionChange: original?.permissionChange,
      auditRequirement: original?.auditRequirement,
      testCases: original?.testCases,
    }, problem.recommendedSolution.name, selectedCanProceed);
  });

  return {
    technicalSolutionCandidates: {
      generatedAt: new Date().toISOString(),
      problems: problemOutputs,
    },
    technicalSolutionDecisionMatrix: {
      generatedAt: new Date().toISOString(),
      decisions,
    },
    technicalSolutionIntegrationPlan: {
      generatedAt: new Date().toISOString(),
      items: integrationItems,
    },
  };
}