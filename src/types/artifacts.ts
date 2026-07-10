export type Complexity = "low" | "medium" | "high" | "very-high";
export type Priority = "must" | "should" | "could";
export type RiskLevel = "low" | "medium" | "high";
export type SourceQuality = "high" | "medium" | "low" | "missing";
export type VerificationStatus = "observed" | "inferred" | "assumed" | "missing" | "unverified";
export type EvidenceStrength = "strong" | "moderate" | "weak" | "absent";
export type EvidenceSourceType =
  | "goal-input"
  | "intent-inference"
  | "product-principle"
  | "domain-heuristic"
  | "risk-inference"
  | "critic-analysis"
  | "route-analysis"
  | "manual-research-placeholder";
export type DomainId =
  | "attendance-checkin"
  | "medical-quiz-practice"
  | "medical-intern-rotation-management"
  | "schedule-calendar-management"
  | "generic-software-product";

export interface GoalArtifact {
  runId: string;
  createdAt: string;
  rawGoal: string;
  phase: "v0.26-engineering-baseline";
  guardrails: string[];
}

export interface DomainAnalysis {
  domainId: DomainId;
  domainName: string;
  confidence: number;
  matchedSignals: string[];
  reasoningSummary: string;
}

export interface ReconstructedIntent {
  rawGoal: string;
  normalizedGoal: string;
  inferredProductCategory: string;
  primaryUsers: string[];
  coreUserJobs: string[];
  explicitConstraints: string[];
  inferredConstraints: string[];
  successCriteria: string[];
  nonGoalsForThisRun: string[];
  ambiguities: string[];
}

export interface ProductIntentModel {
  rawGoal: string;
  normalizedGoal: string;
  domainId: DomainId;
  primaryActors: string[];
  secondaryActors: string[];
  coreResources: string[];
  coreWorkflows: string[];
  dataObjects: string[];
  lifecycleStages: string[];
  permissionBoundaries: string[];
  riskSurfaces: string[];
  operationalNeeds: string[];
  reportingNeeds: string[];
  integrationNeeds: string[];
  deploymentAssumptions: string[];
  uncertaintyNotes: string[];
}

export interface SynthesizedCapability {
  id: string;
  name: string;
  whyNeeded: string;
  triggeredBy: string[];
  userValue: string;
  systemCapability: string;
  riskIfMissing: string;
  priority: Priority;
  evidenceRefs?: string[];
  assumptionRefs?: string[];
  confidence?: number;
  rejectionImpactIfMissing?: string;
  missingEvidenceImpact?: string;
}

export interface ProductCapability {
  id: string;
  name: string;
  priority: Priority;
  description?: string;
  whyItMatters: string;
  acceptanceSignal: string;
  whyNeeded?: string;
  triggeredBy?: string[];
  userValue?: string;
  systemCapability?: string;
  riskIfMissing?: string;
  evidenceRefs?: string[];
  assumptionRefs?: string[];
  confidence?: number;
  rejectionImpactIfMissing?: string;
  missingEvidenceImpact?: string;
}

export type EvidenceItemType =
  | "goal-signal"
  | "domain-signal"
  | "intent-derived"
  | "risk-derived"
  | "principle"
  | "critic-objection"
  | "route-tradeoff"
  | "missing-evidence";

export interface LedgerEvidenceItem {
  id: string;
  type: EvidenceItemType;
  claim: string;
  sourceArtifact: string;
  sourcePath: string;
  confidence: number;
  supports: string[];
  weakens: string[];
  notes: string;
  providerId?: string;
  sourceType?: EvidenceSourceType;
  sourceQuality?: SourceQuality;
  verificationStatus?: VerificationStatus;
  applicability?: "direct" | "partial" | "indirect" | "unknown";
  freshness?: "current-run" | "static-principle" | "unknown" | "requires-research";
  biasRisk?: "low" | "medium" | "high";
  specificity?: "high" | "medium" | "low";
  evidenceStrength?: EvidenceStrength;
}

export interface EvidenceLedger {
  providersUsed?: Array<{
    providerId: string;
    providerType: EvidenceSourceType;
    evidenceCount: number;
  }>;
  evidenceItems: LedgerEvidenceItem[];
  assumptions: Array<{
    id: string;
    claim: string;
    sourceArtifact: string;
    confidence: number;
    riskIfWrong: string;
  }>;
  missingEvidence: Array<{
    id: string;
    question: string;
    affects: string[];
    impact: string;
  }>;
  inferredClaims: Array<{
    id: string;
    claim: string;
    basedOn: string[];
    confidence: number;
  }>;
  confidenceModel: {
    scoringBasis: string[];
    confidenceBands: Record<string, string>;
    missingEvidencePenalty: number;
  };
  sourceQualitySummary?: {
    bySourceQuality: Record<string, number>;
    byVerificationStatus: Record<string, number>;
    byEvidenceStrength: Record<string, number>;
    totalEvidenceItems: number;
  };
  weakEvidenceWarnings?: string[];
  routeEvidenceCoverage?: Array<{
    strategyId: string;
    title: string;
    strong: number;
    moderate: number;
    weak: number;
    missing: number;
    coverageScore: number;
    gapRefs: string[];
  }>;
  decisionEvidenceCoverage?: {
    selectedStrategyId?: string;
    selectedRouteCoverageScore?: number;
    sufficientForThinkingStage: boolean;
    routeSpecificEvidenceRefs: string[];
    riskSpecificEvidenceRefs: string[];
    criticSpecificEvidenceRefs: string[];
    acceptedGapRefs: string[];
    summary: string;
  };
}

export interface ProductExpansion {
  goalSummary: string;
  productGradePrinciples: string[];
  userRoles: string[];
  coreCapabilities: ProductCapability[];
  operationalCapabilities: ProductCapability[];
  nonFunctionalRequirements: ProductCapability[];
  demoTrapsToAvoid: string[];
}

export interface ResearchQuestion {
  id: string;
  question: string;
  neededFor: string;
  expectedEvidenceType: string;
}

export interface ResearchPlan {
  scope: string;
  researchQuestions: ResearchQuestion[];
  benchmarkDimensions: string[];
  sourcesToCheckLater: string[];
  v01Constraint: string;
}

export interface EvidenceItem {
  id: string;
  claim: string;
  supportType: "rule-based-prior" | "requires-external-validation" | "derived-from-goal";
  confidence: "low" | "medium" | "high";
  implication: string;
}

export interface EvidenceMap {
  evidencePolicy: string;
  items: EvidenceItem[];
  openEvidenceGaps: string[];
}

export interface StrategyCandidate {
  id: string;
  title: string;
  thesis: string;
  targetFit: string;
  architectureShape: string[];
  productCoverage: string[];
  securityAndAbuseResistance: string[];
  operationalModel: string[];
  pros: string[];
  cons: string[];
  risks: string[];
  estimatedComplexity: Complexity;
  demoTrapResistanceScore: number;
  routeArchetype?: string;
  triggeredBy?: string[];
  applicableScenarios?: string[];
  coreArchitecture?: string[];
  userExperience?: string[];
  securityCapability?: string[];
  operationalCapability?: string[];
  developmentCost?: Complexity;
  deploymentComplexity?: Complexity;
  maintenanceCost?: Complexity;
  majorRisks?: string[];
  whyItMightFail?: string[];
  modules?: string[];
  productCompletenessScore?: number;
  evidenceRefs?: string[];
  assumptionRefs?: string[];
  confidence?: number;
  tradeoffSummary?: string;
  missingEvidenceImpact?: string;
  routeEvidenceProfile?: {
    strong: number;
    moderate: number;
    weak: number;
    missing: number;
    coverageScore: number;
  };
  evidenceGaps?: string[];
  conditionsToPreferThisRoute?: string[];
  conditionsToRejectThisRoute?: string[];
  revisionMeta?: {
    revisionRound: number;
    changedFields: string[];
    changedBecause: string[];
    criticObjectionsAddressed: string[];
    newTradeoffsIntroduced: string[];
    evidenceGapsStillUnresolved: string[];
  };
}

export interface RouteDeepDiveReport {
  onlineResearchEnabled: boolean;
  generatedAt: string;
  stance: string;
  routeAnalyses: Array<{
    strategyId: string;
    title: string;
    productIntentSignalsConsumed?: {
      coreResources: string[];
      coreWorkflows: string[];
      riskSurfaces: string[];
      integrationNeeds: string[];
      operationalNeeds: string[];
    };
    domainModelImplications?: string[];
    technicalImplementationAxes: Array<{
      area: string;
      deepDiveQuestion: string;
      implementationFocus: string[];
      maturityBar: string;
      failureMode: string;
    }>;
    riskRegister: Array<{
      id: string;
      risk: string;
      severity: RiskLevel;
      whyItMayHappen: string;
      mitigation: string;
      validationSignal: string;
    }>;
    hiddenComplexities?: string[];
    productizationBar: Array<{
      dimension: string;
      mustHave: string[];
      doneWhen: string;
    }>;
    maturityScore: number;
    likelyHiddenComplexities: string[];
    validationBeforeCoding?: string[];
    recommendedValidationBeforeCoding: string[];
    integrationQuestions?: string[];
    operationalFailureModes?: string[];
    testStrategyImplications?: string[];
    onlineResearch: {
      enabled: boolean;
      queries: string[];
      findings: Array<{
        query: string;
        title: string;
        url: string;
        snippet: string;
        relevance: string;
      }>;
      sources?: Array<{
        title: string;
        url: string;
        snippet: string;
      }>;
      sourceCount: number;
      relevance?: string;
      reason?: string;
      shouldNotUseAsEvidence?: boolean;
      limitations: string[];
    };
  }>;
  crossRouteProductizationPrinciples: string[];
}

export interface StrategyRevisionReport {
  revisionRound: number;
  reasonForRevision: string;
  blockingIssuesAddressed: string[];
  unresolvedBlockingIssues: string[];
  revisedStrategies: StrategyCandidate[];
  strategyChangeLog: Array<{
    strategyId: string;
    changedFields: string[];
    changedBecause: string[];
    criticObjectionsAddressed: string[];
    newTradeoffsIntroduced: string[];
    evidenceGapsStillUnresolved: string[];
  }>;
  riskChangeLog: Array<{
    strategyId: string;
    addedRisks: string[];
    reducedRisks: string[];
    remainingRisks: string[];
  }>;
  evidenceGapsStillAccepted: string[];
  canReRunSelection: boolean;
  shouldStopRevision: boolean;
  stopReason: string;
}

export interface TechnicalRoutePlan {
  generatedAt: string;
  planningStatus: "planning-only" | "coding-ready";
  routes: Array<{
    strategyId: string;
    routeTitle: string;
    recommendedArchitecture: string[];
    backendModules: Array<{ name: string; responsibilities: string[]; keyRisks: string[] }>;
    frontendBoundaries: string[];
    databaseModel: {
      entities: Array<{ name: string; fields: string[]; relationships: string[] }>;
      constraints: string[];
      versioningNeeds: string[];
    };
    stateMachines: Array<{ name: string; states: string[]; transitions: string[]; guards: string[] }>;
    permissionModel: {
      roles: string[];
      resourceActions: string[];
      boundaries: string[];
    };
    conflictDetectionModel: {
      checkedObjects: string[];
      rules: string[];
      outputs: string[];
    };
    approvalWorkflowModel: {
      workflows: string[];
      states: string[];
      escalationRules: string[];
    };
    auditLogModel: {
      events: string[];
      actorContext: string[];
      retention: string[];
    };
    importExportModel: {
      importSources: string[];
      validationRules: string[];
      exportPackages: string[];
    };
    integrationAdapters: string[];
    deploymentTopology: string[];
    observabilityPlan: string[];
    backupAndRecoveryPlan: string[];
    testingPlan: string[];
    migrationPlan: string[];
    codingReadiness: "approved" | "conditional" | "blocked";
    unresolvedTechnicalQuestions: string[];
  }>;
}

export interface ProductizationForecast {
  generatedAt: string;
  items: Array<{
    id: string;
    scenario: string;
    whyLikely: string;
    affectedModules: string[];
    severity: RiskLevel;
    earlyWarningSignal: string;
    designCountermeasure: string;
    testCaseNeeded: string;
    operationalPlaybookNeeded: string;
  }>;
}

export interface ProblemResolutionPlan {
  generatedAt: string;
  problems: Array<{
    problem: string;
    rootCause: string;
    recommendedSolution: string;
    dataModelChange: string[];
    workflowChange: string[];
    permissionChange: string[];
    auditRequirement: string[];
    validationRule: string[];
    testCases: string[];
    operationalFallback: string;
    residualRisk: string;
    blocksCodingUntilResolved: boolean;
  }>;
}

export interface TechnicalRouteScorecard {
  generatedAt: string;
  canProceedToCoding: boolean;
  inheritedBlockingReasons: string[];
  routeScores: Array<{
    strategyId: string;
    routeTitle: string;
    architectureMaturity: number;
    domainModelCompleteness: number;
    workflowRobustness: number;
    permissionSafety: number;
    auditability: number;
    integrationReadiness: number;
    productizationRisk: number;
    testingFeasibility: number;
    operationalMaintainability: number;
    codingReadiness: "approved" | "conditional" | "blocked";
    finalRecommendation: string;
  }>;
}

export interface TechnicalProductizationPlannerResult {
  technicalRoutePlan: TechnicalRoutePlan;
  productizationForecast: ProductizationForecast;
  problemResolutionPlan: ProblemResolutionPlan;
  technicalRouteScorecard: TechnicalRouteScorecard;
}

export interface TechnicalSolutionResearchPlan {
  generatedAt: string;
  goal: string;
  searchStatus: "disabled" | "not_configured" | "planned" | "completed";
  problems: Array<{
    problemId: string;
    problemStatement: string;
    technicalQuestion: string;
    searchQueries: string[];
    expectedSolutionTypes: string[];
    sourceTypesWanted: string[];
    disallowedSourceTypes: string[];
    decisionCriteria: string[];
  }>;
}

export interface TechnicalSolutionSearchResults {
  generatedAt: string;
  status: "disabled" | "not_configured" | "completed" | "failed";
  provider: string;
  reason?: string;
  resultsByProblem: Array<{
    problemId: string;
    problemStatement: string;
    queryResults: Array<{
      query: string;
      retrievedAt: string;
      results: Array<{
        sourceRef: string;
        title: string;
        url: string;
        snippet: string;
        query: string;
        rank: number;
        retrievedAt: string;
        sourceQuality: "A" | "B" | "C" | "Reject";
        sourceType: string;
        qualityReason: string;
        accepted: boolean;
      }>;
    }>;
  }>;
}

export interface TechnicalSolutionCandidates {
  generatedAt: string;
  problems: Array<{
    problemId: string;
    problemStatement: string;
    candidateSolutions: Array<{
      name: string;
      solutionType: string;
      whenToUse: string;
      whenNotToUse: string;
      pros: string[];
      cons: string[];
      complexity: Complexity;
      operationalRisk: RiskLevel;
      sourceRefs: string[];
      sourceEvidenceStatus?: "searched" | "ruleFallback";
      applicabilityToCurrentRoute: string;
    }>;
    recommendedSolution: {
      name: string;
      summary: string;
      sourceRefs: string[];
      sourceEvidenceStatus?: "searched" | "ruleFallback";
    };
    rejectedSolutions: Array<{
      name: string;
      reason: string;
    }>;
    rationale: string[];
    implementationImpact: string[];
    sourceRefs: string[];
    confidence: number;
    remainingUnknowns: string[];
  }>;
}

export interface TechnicalSolutionDecisionMatrix {
  generatedAt: string;
  decisions: Array<{
    problemId: string;
    candidates: string[];
    criteriaScores: Array<{
      candidate: string;
      correctness: number;
      implementationComplexity: number;
      operationalComplexity: number;
      auditability: number;
      scalability: number;
      explainability: number;
      fitForMVP: number;
      fitForProductGrade: number;
      totalScore: number;
    }>;
    selectedCandidate: string;
    selectionReason: string;
    fallbackCandidate: string;
    whenToReconsider: string[];
  }>;
}

export interface TechnicalSolutionIntegrationPlan {
  generatedAt: string;
  items: Array<{
    problemId: string;
    problemStatement: string;
    selectedSolution: string;
    dataModelChanges: string[];
    serviceLayerChanges: string[];
    apiContractChanges: string[];
    workflowChanges: string[];
    permissionChanges: string[];
    auditChanges: string[];
    testingChanges: string[];
    migrationChanges: string[];
    operationRunbookChanges: string[];
    impactsCodingReadiness: string;
    stillBlocksCoding: boolean;
  }>;
}

export interface ProblemSolutionResearchResult {
  technicalSolutionCandidates: TechnicalSolutionCandidates;
  technicalSolutionDecisionMatrix: TechnicalSolutionDecisionMatrix;
  technicalSolutionIntegrationPlan: TechnicalSolutionIntegrationPlan;
}

export interface AntiSimplificationFinding {
  strategyId: string;
  simplificationRisk: RiskLevel;
  findings: string[];
  requiredUpgrades: string[];
  pass: boolean;
  evidenceRefs?: string[];
  rejectedBecause?: string[];
  minimumBarEvidence?: string[];
}

export interface AntiSimplificationReport {
  stance: string;
  bannedShortcutSolutions: string[];
  minimumProductBar: string[];
  compositionalRuleResults?: Array<{
    ruleId: string;
    ruleName?: string;
    triggered: boolean;
    triggeredBy?: string[];
    evidenceRefs?: string[];
    consequenceIfIgnored?: string;
    reason: string;
    evidence: string[];
    requiredCapability: string;
  }>;
  triggeredRules?: Array<{
    ruleId: string;
    ruleName: string;
    triggeredBy: string[];
    evidenceRefs: string[];
    consequenceIfIgnored: string;
  }>;
  evidenceRefs?: string[];
  rejectedBecause?: string[];
  minimumBarEvidence?: string[];
  strategyFindings: AntiSimplificationFinding[];
}

export interface CriticReview {
  critic: string;
  strategyId: string;
  score: number;
  strengths: string[];
  objections: string[];
  requiredImprovements: string[];
  blockingIssues: string[];
  evidenceRefs?: string[];
  assumptionRefs?: string[];
  disagreementLevel?: "low" | "medium" | "high";
  blockingIssueEvidence?: string[];
  nearBlockingConcerns?: string[];
  claimRefs?: string[];
  objectionClaimRefs?: string[];
}

export interface CriticCouncilReport {
  critics: string[];
  reviews: CriticReview[];
  aggregate: Array<{
    strategyId: string;
    averageScore: number;
    blockingIssueCount: number;
    strongestArguments: string[];
    sharpestObjections: string[];
  }>;
}

export interface SelectedRoute {
  selectedStrategyId: string;
  selectedTitle: string;
  selectionStatus?: "selected" | "conditional" | "blocked";
  canProceedToCoding?: boolean;
  blockingReasons?: string[];
  requiredClarificationsBeforeCoding?: string[];
  routeCanBeUsedOnlyAsPlanningHypothesis?: boolean;
  selectionRationale: string[];
  rejectedRoutes: Array<{
    strategyId: string;
    title: string;
    rejectionReason: string;
  }>;
  fallbackRoutes: string[];
  conditionsToReconsider: string[];
  residualRisks: string[];
  evidenceRefs?: string[];
  decisionRefs?: string[];
  confidence?: number;
  selectionScoreBreakdown?: {
    criticAverage: number;
    completenessScore: number;
    riskPenalty: number;
    missingEvidencePenalty: number;
    dissentPenalty: number;
    finalScore: number;
  };
  dissentSummary?: string[];
  conditionsToRevisit?: string[];
  missingEvidenceThatCouldChangeDecision?: string[];
  routeEvidenceCoverage?: {
    strong: number;
    moderate: number;
    weak: number;
    missing: number;
    coverageScore: number;
    gapRefs: string[];
  };
  decisiveClaims?: string[];
  contestedClaims?: string[];
  weakClaimsAccepted?: string[];
  evidenceGapsAccepted?: string[];
  whyAcceptedDespiteGaps?: string[];
  routeSwitchTriggers?: string[];
  revisionHistory?: Array<{
    revisionRound: number;
    blockingIssuesAddressed: string[];
    unresolvedBlockingIssues: string[];
    shouldStopRevision: boolean;
    stopReason: string;
  }>;
}

export interface DecisionLedger {
  decisions: Array<{
    id: string;
    decisionType: string;
    selectedOption: string;
    rejectedOptions: string[];
    rationale: string[];
    evidenceRefs: string[];
    assumptionRefs: string[];
    riskRefs: string[];
    confidence: number;
    reversibility: "low" | "medium" | "high";
    conditionsToRevisit: string[];
    decisiveClaimRefs?: string[];
    contestedClaimRefs?: string[];
    acceptedEvidenceGaps?: string[];
    rejectedDueToEvidenceGaps?: string[];
    evidenceCoverageScore?: number;
  }>;
}

export interface ClaimGraph {
  claims: Array<{
    id: string;
    claimType: "goal" | "intent" | "capability" | "route" | "risk" | "critic-objection" | "decision" | "task";
    statement: string;
    artifactRef: string;
    evidenceRefs: string[];
    assumptionRefs: string[];
    confidence: number;
    status: "supported" | "weakly-supported" | "contested" | "unsupported" | "missing-evidence";
  }>;
  links: Array<{
    from: string;
    to: string;
    linkType: "supports" | "weakens" | "depends-on" | "conflicts-with" | "selected-because" | "rejected-because" | "derives-task";
    evidenceRefs: string[];
  }>;
  unsupportedClaims: string[];
  contestedClaims: string[];
  decisionCriticalClaims: string[];
}

export interface ArchitecturePlan {
  markdown: string;
}

export interface ExecutionTask {
  id: string;
  title: string;
  dependsOn: string[];
  ownerAgent: string;
  purpose: string;
  deliverables: string[];
  acceptanceCriteria: string[];
  riskLevel: RiskLevel;
  evidenceRefs?: string[];
  decisionRefs?: string[];
  derivedFromCapabilities?: string[];
  derivedFromRisks?: string[];
  verificationHint?: string;
  claimRefs?: string[];
  requiredEvidenceBeforeExecution?: string[];
  evidenceGapRisk?: RiskLevel;
  shouldBlockCodingUntilResolved?: boolean;
}

export interface ExecutionTaskGraph {
  graphType: "directed-acyclic-task-graph";
  handoffPurpose: string;
  canProceedToCoding?: boolean;
  globalBlockingReasons?: string[];
  requiredClarificationsBeforeCoding?: string[];
  tasks: ExecutionTask[];
  suggestedExecutionOrder: string[];
}

export interface FinalThinkingReport {
  markdown: string;
}

export interface LLMRunMetadata {
  mode: "rule" | "hybrid" | "llm";
  provider: string;
  model: string;
  agentsUsingLLM: string[];
  agentsUsingRuleFallback: string[];
  failedLLMCalls: unknown[];
  validationFailures: unknown[];
  qualityChecklistFailures: unknown[];
  totalLatencyMs: number;
  totalUsage: Record<string, number>;
  agentMetrics?: Array<{
    agentName: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    latencyMs: number;
    rawTextLength: number;
    estimatedCost?: number;
    warnings?: Array<{ agentName: string; code: string; message: string }>;
  }>;
  fallbackReasons: unknown[];
  rawOutputSavedPaths: string[];
  warnings?: Array<{ agentName: string; code: string; message: string }>;
  schemaRepairAttempts?: unknown[];
  canonicalizationApplied?: unknown[];
  missingFieldRepairs?: unknown[];
  revisionRoundsExecuted?: number;
  revisionFallbacks?: unknown[];
  revisionValidationFailures?: unknown[];
}

export interface QualityScoreDimension {
  score: number;
  reason: string;
}

export interface ThinkingQualityReport {
  goal: string;
  runId: string;
  mode: "rule" | "hybrid" | "llm";
  scores: {
    goalSpecificity: QualityScoreDimension;
    productIntentDepth: QualityScoreDimension;
    capabilityRelevance: QualityScoreDimension;
    routeDiversity: QualityScoreDimension;
    antiSimplificationStrength: QualityScoreDimension;
    criticDisagreementQuality: QualityScoreDimension;
    evidenceGapAwareness: QualityScoreDimension;
    taskGraphExecutability: QualityScoreDimension;
    avoidsGenericSaaSTalk: QualityScoreDimension;
    finalReportUsefulness: QualityScoreDimension;
  };
  findings: string[];
  weaknesses: string[];
  genericLanguageWarnings: string[];
  missingSpecificityWarnings: string[];
  antiSimplificationStrength: number;
  routeDiversityScore: number;
  criticDissentScore: number;
  taskExecutabilityScore: number;
  evidenceAwarenessScore: number;
  overallScore: number;
  recommendation: string;
}

export interface ComparisonReport {
  goal: string;
  ruleRunId: string;
  hybridRunId: string;
  ruleScore: number;
  hybridScore: number;
  improvements: string[];
  regressions: string[];
  recommendation: string;
  whetherHybridIsActuallyBetter: boolean;
}

export interface ThinkingRunArtifacts {
  goal: GoalArtifact;
  domainAnalysis: DomainAnalysis;
  productIntent: ProductIntentModel;
  evidenceLedger: EvidenceLedger;
  reconstructedIntent: ReconstructedIntent;
  productExpansion: ProductExpansion;
  researchPlan: ResearchPlan;
  evidenceMap: EvidenceMap;
  strategyCandidates: StrategyCandidate[];
  strategyRevisionReport?: StrategyRevisionReport;
  revisionHistory?: StrategyRevisionReport[];
  routeDeepDive?: RouteDeepDiveReport;
  technicalRoutePlan?: TechnicalRoutePlan;
  productizationForecast?: ProductizationForecast;
  problemResolutionPlan?: ProblemResolutionPlan;
  technicalRouteScorecard?: TechnicalRouteScorecard;
  technicalSolutionResearchPlan?: TechnicalSolutionResearchPlan;
  technicalSolutionSearchResults?: TechnicalSolutionSearchResults;
  technicalSolutionCandidates?: TechnicalSolutionCandidates;
  technicalSolutionDecisionMatrix?: TechnicalSolutionDecisionMatrix;
  technicalSolutionIntegrationPlan?: TechnicalSolutionIntegrationPlan;
  antiSimplificationReport: AntiSimplificationReport;
  criticCouncilReport: CriticCouncilReport;
  selectedRoute: SelectedRoute;
  decisionLedger: DecisionLedger;
  claimGraph: ClaimGraph;
  architecturePlan: ArchitecturePlan;
  executionTaskGraph: ExecutionTaskGraph;
  finalThinkingReport: FinalThinkingReport;
  llmRunMetadata?: LLMRunMetadata;
  thinkingQualityReport?: ThinkingQualityReport;
  codingHandoff?: CodingHandoff;
  preCodingResolutionPack?: PreCodingResolutionPack;
}
import type { CodingHandoff, PreCodingResolutionPack } from "./coding-handoff.js";