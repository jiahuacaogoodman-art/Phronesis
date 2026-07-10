import type {
  AntiSimplificationReport,
  CriticCouncilReport,
  CriticReview,
  DomainAnalysis,
  EvidenceLedger,
  ProductExpansion,
  ProductIntentModel,
  StrategyCandidate,
  SynthesizedCapability,
} from "../types/artifacts.ts";

const critics = [
  "ProductCritic",
  "ArchitectCritic",
  "SecurityCritic",
  "FrontendCritic",
  "BackendCritic",
  "DevOpsCritic",
  "TestingCritic",
];

function first(values: string[], fallback: string) {
  return values[0] ?? fallback;
}

function complexityPenalty(strategy: StrategyCandidate) {
  if (strategy.estimatedComplexity === "very-high") return 1.4;
  if (strategy.estimatedComplexity === "high") return 0.8;
  return 0;
}

function baseScore(strategy: StrategyCandidate, expansion: ProductExpansion) {
  const coverageRatio = strategy.productCoverage.length / Math.max(1, expansion.coreCapabilities.length);
  const completenessBonus = (strategy.productCompletenessScore ?? strategy.demoTrapResistanceScore) / 10;
  return 5.2 + Math.min(2.3, coverageRatio * 1.4) + completenessBonus - complexityPenalty(strategy);
}

function references(intent: ProductIntentModel | undefined, capabilities: SynthesizedCapability[], strategy: StrategyCandidate) {
  return {
    actor: first(intent?.primaryActors ?? [], "主要用户"),
    resource: first(intent?.coreResources ?? [], "核心资源"),
    workflow: first(intent?.coreWorkflows ?? [], "核心流程"),
    risk: first(intent?.riskSurfaces ?? [], "关键风险"),
    capability: first(capabilities.map((capability) => capability.name), first(strategy.productCoverage, "合成能力")),
    routeArchetype: strategy.routeArchetype ?? "unspecified-archetype",
  };
}

function reviewForCritic(
  critic: string,
  strategy: StrategyCandidate,
  expansion: ProductExpansion,
  antiSimplificationReport: AntiSimplificationReport,
  domainAnalysis: DomainAnalysis,
  productIntent: ProductIntentModel | undefined,
  synthesizedCapabilities: SynthesizedCapability[],
  evidenceLedger?: EvidenceLedger,
): CriticReview {
  const refs = references(productIntent, synthesizedCapabilities, strategy);
  const antiFinding = antiSimplificationReport.strategyFindings.find((finding) => finding.strategyId === strategy.id);
  let score = baseScore(strategy, expansion);
  const strengths = [];
  const objections = [];
  const requiredImprovements = [];
  const blockingIssues = [];
  const nearBlockingConcerns = [];
  const evidenceRefs = Array.from(new Set([
    ...(strategy.evidenceRefs ?? []),
    "E-INTENT-001",
    "E-INTENT-002",
    "E-RISK-001",
  ])).slice(0, 6);
  const assumptionRefs = evidenceLedger?.assumptions.slice(0, 2).map((item) => item.id) ?? ["A-001"];

  if (critic === "ProductCritic") {
    strengths.push(`actor:${refs.actor} can follow workflow:${refs.workflow} around resource:${refs.resource}.`);
    objections.push(`Check whether capability:${refs.capability} fully covers actor:${refs.actor}'s real-world expectation.`);
    requiredImprovements.push(`Tie routeArchetype:${refs.routeArchetype} to explicit acceptance criteria for workflow:${refs.workflow}.`);
    if ((strategy.productCompletenessScore ?? 0) < 7.5) score -= 0.5;
  }

  if (critic === "ArchitectCritic") {
    strengths.push(`routeArchetype:${refs.routeArchetype} exposes modules: ${(strategy.modules ?? strategy.architectureShape).slice(0, 4).join(", ")}.`);
    objections.push(`resource:${refs.resource} needs a clear model boundary before coding.`);
    requiredImprovements.push(`Separate workflow:${refs.workflow} state transitions from UI concerns.`);
    if (strategy.architectureShape.length < 4) score -= 0.5;
    if (strategy.routeArchetype === "integration-first" || strategy.routeArchetype === "enterprise-governance") {
      nearBlockingConcerns.push(`routeArchetype:${refs.routeArchetype} depends on missing external integration evidence.`);
      score -= 0.8;
    }
  }

  if (critic === "SecurityCritic") {
    strengths.push(`riskSurface:${refs.risk} is visible in the route risk model.`);
    objections.push(`riskSurface:${refs.risk} must map to capability:角色权限 or capability:日志审计 before execution.`);
    requiredImprovements.push(`Add abuse and authorization tests for actor:${refs.actor} on resource:${refs.resource}.`);
    if (strategy.securityAndAbuseResistance.length < 3) score -= 0.8;
    if (strategy.routeArchetype === "lightweight-validated-product") {
      nearBlockingConcerns.push(`routeArchetype:${refs.routeArchetype} may under-handle riskSurface:${refs.risk}.`);
      score -= 0.7;
    }
  }

  if (critic === "FrontendCritic") {
    strengths.push(`User experience references actor:${refs.actor} and workflow:${refs.workflow}.`);
    objections.push(`workflow:${refs.workflow} must include empty, error, pending, and completed states.`);
    requiredImprovements.push(`Plan states for routeArchetype:${refs.routeArchetype}; do not implement UI in this phase.`);
    if ((strategy.userExperience ?? []).length < 2) score -= 0.4;
  }

  if (critic === "BackendCritic") {
    strengths.push(`Backend modules include resource:${refs.resource} and capability:${refs.capability}.`);
    objections.push(`workflow:${refs.workflow} needs API-level validation and lifecycle rules.`);
    requiredImprovements.push(`Define records for resource:${refs.resource}, audit events, and failure states.`);
    if (strategy.operationalModel.length < 3) score -= 0.4;
    if (strategy.routeArchetype === "analytics-first") {
      nearBlockingConcerns.push("analytics-first requires stable event schemas before analytics become trustworthy.");
      score -= 0.6;
    }
  }

  if (critic === "DevOpsCritic") {
    strengths.push(`Operational capability list includes ${(strategy.operationalCapability ?? strategy.operationalModel).slice(0, 3).join(", ")}.`);
    objections.push(`routeArchetype:${refs.routeArchetype} must state deployment, backup, and observability expectations.`);
    requiredImprovements.push(`Add runbook checks for resource:${refs.resource} and workflow:${refs.workflow}.`);
    if (!strategy.operationalModel.join(" ").includes("部署") && !strategy.operationalModel.join(" ").includes("备份")) score -= 0.5;
    if (strategy.routeArchetype === "integration-first" || strategy.routeArchetype === "offline-first") {
      nearBlockingConcerns.push(`routeArchetype:${refs.routeArchetype} has deployment and support uncertainty without ME-001/ME-002 resolution.`);
      score -= 0.9;
    }
  }

  if (critic === "TestingCritic") {
    strengths.push(`Testing can derive cases from workflow:${refs.workflow}, riskSurface:${refs.risk}, and capability:${refs.capability}.`);
    objections.push(`Route must not proceed until riskSurface:${refs.risk} has at least one acceptance or abuse-case test.`);
    requiredImprovements.push(`Create tests for actor:${refs.actor} acting on resource:${refs.resource} through workflow:${refs.workflow}.`);
    if ((strategy.majorRisks ?? strategy.risks).length > 2) score -= 0.3;
    if (strategy.routeArchetype === "audit-and-compliance-first") {
      nearBlockingConcerns.push("audit-first route needs evidence that review policies are known enough to test.");
      score -= 0.5;
    }
  }

  if (antiFinding && !antiFinding.pass) {
    blockingIssues.push("AntiSimplificationCritic marked this route as too demo-like for at least one domain or compositional rule.");
    score -= 1.2;
  }

  const boundedScore = Math.max(1, Math.min(10, Number(score.toFixed(1))));
  let disagreementLevel = boundedScore <= 5.8 || nearBlockingConcerns.length > 0 ? "high" : boundedScore <= 7.1 ? "medium" : "low";
  if (critic === "ProductCritic" && strategy.routeArchetype === "analytics-first") {
    disagreementLevel = "medium";
  }
  if (critic === "SecurityCritic" && strategy.routeArchetype === "lightweight-validated-product") {
    disagreementLevel = "high";
  }

  return {
    critic,
    strategyId: strategy.id,
    score: boundedScore,
    strengths,
    objections,
    requiredImprovements,
    blockingIssues,
    evidenceRefs,
    assumptionRefs,
    disagreementLevel,
    blockingIssueEvidence: blockingIssues.length > 0 ? evidenceRefs : [],
    nearBlockingConcerns,
  };
}

export function runCriticCouncil(
  expansion: ProductExpansion,
  strategies: StrategyCandidate[],
  antiSimplificationReport: AntiSimplificationReport,
  domainAnalysis: DomainAnalysis,
  productIntent?: ProductIntentModel,
  synthesizedCapabilities: SynthesizedCapability[] = [],
  evidenceLedger?: EvidenceLedger,
): CriticCouncilReport {
  const reviews = strategies.flatMap((strategy) =>
    critics.map((critic) =>
      reviewForCritic(
        critic,
        strategy,
        expansion,
        antiSimplificationReport,
        domainAnalysis,
        productIntent,
        synthesizedCapabilities,
        evidenceLedger,
      ),
    ),
  );

  const aggregate = strategies.map((strategy) => {
    const strategyReviews = reviews.filter((review) => review.strategyId === strategy.id);
    const averageScore =
      strategyReviews.reduce((sum, review) => sum + review.score, 0) / Math.max(1, strategyReviews.length);
    const blockingIssueCount = strategyReviews.reduce(
      (sum, review) => sum + review.blockingIssues.length,
      0,
    );
    return {
      strategyId: strategy.id,
      averageScore: Number(averageScore.toFixed(2)),
      blockingIssueCount,
      strongestArguments: strategyReviews.flatMap((review) => review.strengths).slice(0, 4),
      sharpestObjections: strategyReviews.flatMap((review) => review.objections).slice(0, 4),
    };
  });

  return {
    critics,
    reviews,
    aggregate,
  };
}