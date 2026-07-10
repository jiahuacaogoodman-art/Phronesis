import { readFileSync } from "node:fs";
import path from "node:path";
import type { QualityScoreDimension, ThinkingQualityReport } from "../types/artifacts.js";

type JsonRecord = Record<string, unknown>;

interface EvaluationProductIntent {
  primaryActors?: string[];
  secondaryActors?: string[];
  coreResources?: string[];
  coreWorkflows?: string[];
  dataObjects?: string[];
  lifecycleStages?: string[];
  permissionBoundaries?: string[];
  riskSurfaces?: string[];
  operationalNeeds?: string[];
  reportingNeeds?: string[];
  integrationNeeds?: string[];
  deploymentAssumptions?: string[];
}

interface EvaluationArtifacts {
  goal: { runId: string; rawGoal?: string };
  productIntent: EvaluationProductIntent;
  productExpansion: {
    coreCapabilities: Array<{ whyItMatters: string; acceptanceSignal: string }>;
  };
  strategyCandidates: Array<{
    title: string;
    routeArchetype?: string;
    productCoverage?: string[];
    risks?: string[];
    evidenceRefs?: string[];
    confidence?: number;
  }>;
  antiSimplificationReport: {
    bannedShortcutSolutions: string[];
    triggeredRules?: Array<{ ruleId: string }>;
  };
  criticCouncilReport: {
    reviews: Array<{
      disagreementLevel?: "low" | "medium" | "high";
      objections?: string[];
      strategyId: string;
    }>;
  };
  selectedRoute: {
    evidenceGapsAccepted?: string[];
    whyAcceptedDespiteGaps?: string[];
  };
  evidenceLedger: {
    missingEvidence: Array<{ id: string }>;
    routeEvidenceCoverage?: unknown[];
  };
  executionTaskGraph: {
    tasks: Array<{
      shouldBlockCodingUntilResolved?: boolean;
      requiredEvidenceBeforeExecution?: string[];
      claimRefs?: string[];
    }>;
  };
  finalThinkingReport?: { markdown: string };
  architecturePlan?: { markdown: string };
  llmRunMetadata?: {
    mode: "rule" | "hybrid" | "llm";
    agentsUsingLLM?: string[];
  };
}

interface EvaluateThinkingQualityInput {
  goal: string;
  runDir: string;
  artifacts: EvaluationArtifacts;
}

const genericPhrases = [
  "Product-Grade Web Application",
  "Mobile-First Workflow Product",
  "Enterprise Integration Product",
  "generic SaaS",
  "scalable platform",
  "modern architecture",
  "user management",
  "admin dashboard",
];

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readJsonUnknown(runDir: string, fileName: string): unknown {
  return JSON.parse(readFileSync(path.join(runDir, fileName), "utf8")) as unknown;
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function recordArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter((item): item is JsonRecord => isRecord(item)) : [];
}

function clampScore(score: number): number {
  return Number(Math.max(0, Math.min(10, score)).toFixed(1));
}

function scoreWithReason(score: number, reason: string): QualityScoreDimension {
  return { score: clampScore(score), reason };
}

function countMatches(text: string, needle: string): number {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(escaped, "gi"));
  return match ? match.length : 0;
}

function specificitySignals(artifacts: EvaluationArtifacts): string[] {
  const intent = artifacts.productIntent;
  return [
    ...(intent.primaryActors ?? []),
    ...(intent.secondaryActors ?? []),
    ...(intent.coreResources ?? []),
    ...(intent.coreWorkflows ?? []),
    ...(intent.riskSurfaces ?? []),
  ].filter(Boolean);
}

function scoreGoalSpecificity(artifacts: EvaluationArtifacts, finalReportText: string): QualityScoreDimension {
  const signals = specificitySignals(artifacts);
  const matched = signals.filter((signal) => finalReportText.includes(signal));
  const score = 4 + Math.min(6, matched.length * 0.45);
  return scoreWithReason(score, `Final report explicitly reflects ${matched.length}/${signals.length} actor/resource/workflow/risk signals from product intent.`);
}

function scoreProductIntentDepth(artifacts: EvaluationArtifacts): QualityScoreDimension {
  const intent = artifacts.productIntent;
  const populatedSections = [
    intent.primaryActors ?? [],
    intent.secondaryActors ?? [],
    intent.coreResources ?? [],
    intent.coreWorkflows ?? [],
    intent.dataObjects ?? [],
    intent.lifecycleStages ?? [],
    intent.permissionBoundaries ?? [],
    intent.riskSurfaces ?? [],
    intent.operationalNeeds ?? [],
    intent.reportingNeeds ?? [],
    intent.integrationNeeds ?? [],
    intent.deploymentAssumptions ?? [],
  ].filter((items) => items.length > 0).length;
  const score = 3 + populatedSections * 0.55;
  return scoreWithReason(score, `Product intent populates ${populatedSections} structural sections beyond the raw goal.`);
}

function scoreCapabilityRelevance(artifacts: EvaluationArtifacts): QualityScoreDimension {
  const resources = artifacts.productIntent.coreResources ?? [];
  const workflows = artifacts.productIntent.coreWorkflows ?? [];
  const capabilities = artifacts.productExpansion.coreCapabilities ?? [];
  const matched = capabilities.filter((capability) =>
    resources.some((resource) => capability.whyItMatters.includes(resource) || capability.acceptanceSignal.includes(resource)) ||
    workflows.some((workflow) => capability.whyItMatters.includes(workflow) || capability.acceptanceSignal.includes(workflow))
  ).length;
  const score = 4 + Math.min(6, matched * 0.55);
  return scoreWithReason(score, `${matched} capabilities are clearly tied to goal-specific resources or workflows.`);
}

function scoreRouteDiversity(artifacts: EvaluationArtifacts): QualityScoreDimension {
  const titles = artifacts.strategyCandidates.map((strategy) => strategy.title);
  const archetypes = new Set(artifacts.strategyCandidates.map((strategy) => strategy.routeArchetype).filter(Boolean));
  const uniqueTitleTokens = new Set(titles.flatMap((title) => title.split(/[^\p{L}\p{N}]+/u).filter(Boolean)));
  const score = 3 + Math.min(4, archetypes.size * 0.8) + Math.min(3, uniqueTitleTokens.size / 12);
  return scoreWithReason(score, `Route set spans ${archetypes.size} archetypes with ${titles.length} distinct route titles.`);
}

function scoreAntiSimplificationStrength(artifacts: EvaluationArtifacts): QualityScoreDimension {
  const report = artifacts.antiSimplificationReport;
  const bannedCount = (report.bannedShortcutSolutions ?? []).length;
  const triggeredCount = (report.triggeredRules ?? []).length;
  const score = 4 + Math.min(3, bannedCount * 0.3) + Math.min(3, triggeredCount * 0.5);
  return scoreWithReason(score, `Anti-simplification layer bans ${bannedCount} shortcuts and triggers ${triggeredCount} structural rules.`);
}

function scoreCriticDisagreementQuality(artifacts: EvaluationArtifacts): QualityScoreDimension {
  const reviews = artifacts.criticCouncilReport.reviews;
  const high = reviews.filter((review) => review.disagreementLevel === "high").length;
  const medium = reviews.filter((review) => review.disagreementLevel === "medium").length;
  const riskLinked = reviews.filter((review) =>
    (review.objections ?? []).some((objection) => (artifacts.productIntent.riskSurfaces ?? []).some((risk) => objection.includes(risk)))
  ).length;
  const score = 3 + Math.min(3, high * 0.5) + Math.min(2, medium * 0.15) + Math.min(2, riskLinked * 0.2);
  return scoreWithReason(score, `Critic council includes ${high} high and ${medium} medium disagreements, with ${riskLinked} objections tied to risk surfaces.`);
}

function scoreEvidenceGapAwareness(artifacts: EvaluationArtifacts): QualityScoreDimension {
  const selectedRoute = artifacts.selectedRoute;
  const score =
    3 +
    Math.min(2.5, (artifacts.evidenceLedger.missingEvidence ?? []).length * 0.45) +
    Math.min(2.5, (selectedRoute.evidenceGapsAccepted ?? []).length * 0.45) +
    Math.min(2, (selectedRoute.whyAcceptedDespiteGaps ?? []).length * 0.6);
  return scoreWithReason(score, `Evidence gaps are surfaced in the ledger and accepted explicitly in route selection with rationale.`);
}

function scoreTaskGraphExecutability(artifacts: EvaluationArtifacts): QualityScoreDimension {
  const tasks = artifacts.executionTaskGraph.tasks;
  const blocked = tasks.filter((task) => task.shouldBlockCodingUntilResolved).length;
  const withEvidence = tasks.filter((task) => (task.requiredEvidenceBeforeExecution ?? []).length > 0).length;
  const withClaims = tasks.filter((task) => (task.claimRefs ?? []).length > 0).length;
  const score = 3 + Math.min(3, withEvidence * 0.2) + Math.min(2, withClaims * 0.2) + Math.min(2, blocked * 0.15);
  return scoreWithReason(score, `${withEvidence} tasks declare evidence prerequisites, ${withClaims} tasks declare claim refs, and ${blocked} tasks correctly block coding until evidence resolves.`);
}

function scoreAvoidsGenericSaaS(
  artifacts: EvaluationArtifacts,
  finalReportText: string,
  architecturePlanText: string,
): { dimension: QualityScoreDimension; warnings: string[] } {
  const strategyText = JSON.stringify(artifacts.strategyCandidates);
  const fullText = `${finalReportText}\n${architecturePlanText}\n${strategyText}`;
  const genericHits = genericPhrases.map((phrase) => ({ phrase, count: countMatches(fullText, phrase) })).filter((item) => item.count > 0);
  const specificitySignalCount = specificitySignals(artifacts).filter((signal) => fullText.includes(signal)).length;
  const penalty = genericHits.reduce((sum, item) => sum + item.count, 0) * (specificitySignalCount < 8 ? 0.8 : 0.35);
  const score = 9 - penalty;
  return {
    dimension: scoreWithReason(score, `Generic phrase count: ${genericHits.reduce((sum, item) => sum + item.count, 0)}; specificity signal count: ${specificitySignalCount}.`),
    warnings: genericHits.map((item) => `${item.phrase} appears ${item.count} time(s) without enough goal-specific grounding.`),
  };
}

function scoreFinalReportUsefulness(artifacts: EvaluationArtifacts, finalReportText: string): QualityScoreDimension {
  const requiredSections = [
    "Reconstructed Intent",
    "Product Intent Model",
    "Evidence Ledger Summary",
    "Claim Graph Summary",
    "Selected Route",
    "Decision Ledger Summary",
  ];
  const present = requiredSections.filter((section) => finalReportText.includes(section)).length;
  const score = 4 + present * 1;
  return scoreWithReason(score, `Final report includes ${present}/${requiredSections.length} high-signal sections.`);
}

function missingSpecificityWarnings(artifacts: EvaluationArtifacts, finalReportText: string): string[] {
  const warnings: string[] = [];
  const intent = artifacts.productIntent;
  if (!artifacts.strategyCandidates.some((strategy) => (intent.coreResources ?? []).some((resource) => JSON.stringify(strategy).includes(resource)))) {
    warnings.push("Strategy candidates do not clearly reference coreResources.");
  }
  if (!artifacts.executionTaskGraph.tasks.some((task) => (intent.coreWorkflows ?? []).some((workflow) => JSON.stringify(task).includes(workflow)))) {
    warnings.push("Execution task graph does not clearly reference coreWorkflows.");
  }
  if (!artifacts.criticCouncilReport.reviews.some((review) => (intent.riskSurfaces ?? []).some((risk) => JSON.stringify(review.objections ?? []).includes(risk)))) {
    warnings.push("Critic objections do not clearly reference riskSurfaces.");
  }
  const signalGroups = [
    { name: "actors", values: [...(intent.primaryActors ?? []), ...(intent.secondaryActors ?? [])] },
    { name: "resources", values: intent.coreResources ?? [] },
    { name: "workflows", values: intent.coreWorkflows ?? [] },
    { name: "risks", values: intent.riskSurfaces ?? [] },
  ];
  for (const group of signalGroups) {
    if (!group.values.some((value) => finalReportText.includes(value))) {
      warnings.push(`Final report does not clearly surface ${group.name}.`);
    }
  }
  return warnings;
}

function calculateOverallScore(scores: ThinkingQualityReport["scores"]): number {
  const values = Object.values(scores).map((item) => item.score);
  return clampScore(values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length));
}

function recommendation(
  overallScore: number,
  genericWarnings: string[],
  specificityWarnings: string[],
  mode: ThinkingQualityReport["mode"],
  llmMetadata: EvaluationArtifacts["llmRunMetadata"],
): string {
  if (mode === "hybrid" && (llmMetadata?.agentsUsingLLM?.length ?? 0) === 0) {
    return "Hybrid run fell back to rule output, so this score is a runtime stability baseline rather than evidence of AI improvement.";
  }
  if (overallScore >= 8 && genericWarnings.length === 0 && specificityWarnings.length <= 1) {
    return "Quality is strong enough to justify using this run as a higher-confidence planning handoff.";
  }
  if (overallScore >= 6) {
    return "Quality is usable, but weak specificity or generic phrasing should be tightened before claiming AI produced a better thinking artifact.";
  }
  return "Quality is too weak to claim meaningful thinking improvement; revisit specificity, route diversity, critic sharpness, and evidence-gap handling.";
}

export function evaluateThinkingQuality({
  goal,
  runDir,
  artifacts,
}: EvaluateThinkingQualityInput): ThinkingQualityReport {
  const finalReportText = artifacts.finalThinkingReport?.markdown ?? readFileSync(path.join(runDir, "final-thinking-report.md"), "utf8");
  const architecturePlanText = artifacts.architecturePlan?.markdown ?? readFileSync(path.join(runDir, "architecture-plan.md"), "utf8");

  const goalSpecificity = scoreGoalSpecificity(artifacts, finalReportText);
  const productIntentDepth = scoreProductIntentDepth(artifacts);
  const capabilityRelevance = scoreCapabilityRelevance(artifacts);
  const routeDiversity = scoreRouteDiversity(artifacts);
  const antiSimplificationStrength = scoreAntiSimplificationStrength(artifacts);
  const criticDisagreementQuality = scoreCriticDisagreementQuality(artifacts);
  const evidenceGapAwareness = scoreEvidenceGapAwareness(artifacts);
  const taskGraphExecutability = scoreTaskGraphExecutability(artifacts);
  const genericAnalysis = scoreAvoidsGenericSaaS(artifacts, finalReportText, architecturePlanText);
  const finalReportUsefulness = scoreFinalReportUsefulness(artifacts, finalReportText);
  const specificityWarnings = missingSpecificityWarnings(artifacts, finalReportText);

  const scores: ThinkingQualityReport["scores"] = {
    goalSpecificity,
    productIntentDepth,
    capabilityRelevance,
    routeDiversity,
    antiSimplificationStrength,
    criticDisagreementQuality,
    evidenceGapAwareness,
    taskGraphExecutability,
    avoidsGenericSaaSTalk: genericAnalysis.dimension,
    finalReportUsefulness,
  };

  const findings = [
    goalSpecificity.reason,
    routeDiversity.reason,
    criticDisagreementQuality.reason,
    evidenceGapAwareness.reason,
  ];
  const weaknesses = [
    ...genericAnalysis.warnings,
    ...specificityWarnings,
  ];
  const overallScore = calculateOverallScore(scores);

  return {
    goal,
    runId: artifacts.goal.runId,
    mode: artifacts.llmRunMetadata?.mode ?? "rule",
    scores,
    findings,
    weaknesses,
    genericLanguageWarnings: genericAnalysis.warnings,
    missingSpecificityWarnings: specificityWarnings,
    antiSimplificationStrength: antiSimplificationStrength.score,
    routeDiversityScore: routeDiversity.score,
    criticDissentScore: criticDisagreementQuality.score,
    taskExecutabilityScore: taskGraphExecutability.score,
    evidenceAwarenessScore: evidenceGapAwareness.score,
    overallScore,
    recommendation: recommendation(overallScore, genericAnalysis.warnings, specificityWarnings, artifacts.llmRunMetadata?.mode ?? "rule", artifacts.llmRunMetadata),
  };
}

export function loadArtifactsForEvaluation(runDir: string): EvaluationArtifacts {
  const goal = readJsonUnknown(runDir, "goal.json");
  const goalRecord = isRecord(goal) ? goal : {};
  const intentValue = readJsonUnknown(runDir, "product-intent.json");
  const intent = isRecord(intentValue) ? intentValue : {};
  const expansionValue = readJsonUnknown(runDir, "product-expansion.json");
  const expansion = isRecord(expansionValue) ? expansionValue : {};
  const strategiesValue = readJsonUnknown(runDir, "strategy-candidates.json");
  const antiValue = readJsonUnknown(runDir, "anti-simplification-report.json");
  const anti = isRecord(antiValue) ? antiValue : {};
  const councilValue = readJsonUnknown(runDir, "critic-council-report.json");
  const council = isRecord(councilValue) ? councilValue : {};
  const selectedValue = readJsonUnknown(runDir, "selected-route.json");
  const selected = isRecord(selectedValue) ? selectedValue : {};
  const ledgerValue = readJsonUnknown(runDir, "evidence-ledger.json");
  const ledger = isRecord(ledgerValue) ? ledgerValue : {};
  const taskGraphValue = readJsonUnknown(runDir, "execution-task-graph.json");
  const taskGraph = isRecord(taskGraphValue) ? taskGraphValue : {};
  const metadataValue = readJsonUnknown(runDir, "llm-run-metadata.json");
  const metadata = isRecord(metadataValue) ? metadataValue : {};
  const metadataMode = metadata.mode === "hybrid" || metadata.mode === "llm" ? metadata.mode : "rule";

  return {
    goal: {
      runId: stringValue(goalRecord.runId, path.basename(runDir)),
      rawGoal: stringValue(goalRecord.rawGoal),
    },
    productIntent: {
      primaryActors: stringArray(intent.primaryActors),
      secondaryActors: stringArray(intent.secondaryActors),
      coreResources: stringArray(intent.coreResources),
      coreWorkflows: stringArray(intent.coreWorkflows),
      dataObjects: stringArray(intent.dataObjects),
      lifecycleStages: stringArray(intent.lifecycleStages),
      permissionBoundaries: stringArray(intent.permissionBoundaries),
      riskSurfaces: stringArray(intent.riskSurfaces),
      operationalNeeds: stringArray(intent.operationalNeeds),
      reportingNeeds: stringArray(intent.reportingNeeds),
      integrationNeeds: stringArray(intent.integrationNeeds),
      deploymentAssumptions: stringArray(intent.deploymentAssumptions),
    },
    productExpansion: {
      coreCapabilities: recordArray(expansion.coreCapabilities).map((item) => ({
        whyItMatters: stringValue(item.whyItMatters),
        acceptanceSignal: stringValue(item.acceptanceSignal),
      })),
    },
    strategyCandidates: recordArray(strategiesValue).map((item) => ({
      title: stringValue(item.title),
      routeArchetype: typeof item.routeArchetype === "string" ? item.routeArchetype : undefined,
      productCoverage: stringArray(item.productCoverage),
      risks: stringArray(item.risks),
      evidenceRefs: stringArray(item.evidenceRefs),
      confidence: typeof item.confidence === "number" ? item.confidence : undefined,
    })),
    antiSimplificationReport: {
      bannedShortcutSolutions: stringArray(anti.bannedShortcutSolutions),
      triggeredRules: recordArray(anti.triggeredRules).map((item) => ({ ruleId: stringValue(item.ruleId) })),
    },
    criticCouncilReport: {
      reviews: recordArray(council.reviews).map((review) => ({
        strategyId: stringValue(review.strategyId),
        disagreementLevel: review.disagreementLevel === "high" || review.disagreementLevel === "medium" || review.disagreementLevel === "low"
          ? review.disagreementLevel
          : undefined,
        objections: stringArray(review.objections),
      })),
    },
    selectedRoute: {
      evidenceGapsAccepted: stringArray(selected.evidenceGapsAccepted),
      whyAcceptedDespiteGaps: stringArray(selected.whyAcceptedDespiteGaps),
    },
    evidenceLedger: {
      missingEvidence: recordArray(ledger.missingEvidence).map((item) => ({ id: stringValue(item.id) })),
      routeEvidenceCoverage: recordArray(ledger.routeEvidenceCoverage),
    },
    executionTaskGraph: {
      tasks: recordArray(taskGraph.tasks).map((task) => ({
        shouldBlockCodingUntilResolved: task.shouldBlockCodingUntilResolved === true,
        requiredEvidenceBeforeExecution: stringArray(task.requiredEvidenceBeforeExecution),
        claimRefs: stringArray(task.claimRefs),
      })),
    },
    finalThinkingReport: { markdown: readFileSync(path.join(runDir, "final-thinking-report.md"), "utf8") },
    architecturePlan: { markdown: readFileSync(path.join(runDir, "architecture-plan.md"), "utf8") },
    llmRunMetadata: {
      mode: metadataMode,
      agentsUsingLLM: stringArray(metadata.agentsUsingLLM),
    },
  };
}