export type Complexity = "low" | "medium" | "high" | "very-high";
export type Priority = "must" | "should" | "could";
export type RiskLevel = "low" | "medium" | "high";
export type DomainId =
  | "attendance-checkin"
  | "medical-quiz-practice"
  | "schedule-calendar-management"
  | "generic-software-product";

export interface GoalArtifact {
  runId: string;
  createdAt: string;
  rawGoal: string;
  phase: "v0.4-evidence-driven-thinking-only";
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
}

export interface ProductCapability {
  id: string;
  name: string;
  priority: Priority;
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
}

export interface EvidenceLedger {
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
  }>;
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
}

export interface ExecutionTaskGraph {
  graphType: "directed-acyclic-task-graph";
  handoffPurpose: string;
  tasks: ExecutionTask[];
  suggestedExecutionOrder: string[];
}

export interface FinalThinkingReport {
  markdown: string;
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
  antiSimplificationReport: AntiSimplificationReport;
  criticCouncilReport: CriticCouncilReport;
  selectedRoute: SelectedRoute;
  decisionLedger: DecisionLedger;
  architecturePlan: ArchitecturePlan;
  executionTaskGraph: ExecutionTaskGraph;
  finalThinkingReport: FinalThinkingReport;
}