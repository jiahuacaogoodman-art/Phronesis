import type {
  CriticCouncilReport,
  ClaimGraph,
  DecisionLedger,
  EvidenceLedger,
  ExecutionTaskGraph,
  ProductExpansion,
  ProductIntentModel,
  SelectedRoute,
  StrategyCandidate,
} from "../types/artifacts.js";

type Claim = ClaimGraph["claims"][number];
type ClaimLink = ClaimGraph["links"][number];
type ClaimStatus = Claim["status"];

interface BuildClaimGraphInput {
  productIntent: ProductIntentModel;
  productExpansion: ProductExpansion;
  strategies: StrategyCandidate[];
  selectedRoute: SelectedRoute;
  evidenceLedger: EvidenceLedger;
  criticCouncilReport: CriticCouncilReport;
  decisionLedger: DecisionLedger;
  executionTaskGraph: ExecutionTaskGraph;
}

function claimId(value: string): string {
  return `C-${value.toUpperCase().replace(/[^A-Z0-9]+/g, "-")}`;
}

function statusFor(evidenceRefs: string[], confidence: number, options: { contested?: boolean; missingEvidence?: boolean; weak?: boolean } = {}): ClaimStatus {
  if (options.contested) return "contested";
  if (options.missingEvidence) return "missing-evidence";
  if (evidenceRefs.length === 0) return "unsupported";
  if (confidence < 0.62 || options.weak) return "weakly-supported";
  return "supported";
}

function addClaim(claims: Claim[], claim: Claim): void {
  if (!claims.some((item) => item.id === claim.id)) {
    claims.push(claim);
  }
}

function addLink(links: ClaimLink[], from: string, to: string, linkType: ClaimLink["linkType"], evidenceRefs: string[] = []): void {
  if (from && to && from !== to) {
    links.push({ from, to, linkType, evidenceRefs });
  }
}

function evidenceIsWeak(refs: string[], ledger: EvidenceLedger): boolean {
  return refs.some((ref) => {
    const evidence = ledger.evidenceItems.find((item) => item.id === ref);
    return evidence?.evidenceStrength === "weak" || evidence?.evidenceStrength === "absent" || evidence?.sourceQuality === "missing";
  });
}

export function buildClaimGraph(input: BuildClaimGraphInput): ClaimGraph {
  const claims: Claim[] = [];
  const links: ClaimLink[] = [];
  const selectedRouteClaim = claimId(`route-${input.selectedRoute.selectedStrategyId}`);
  const selectedDecisionClaim = claimId("decision-route-select");
  const contestedClaimSet = new Set(input.selectedRoute.contestedClaims ?? []);

  addClaim(claims, {
    id: claimId("goal"),
    claimType: "goal",
    statement: `The raw goal is ${input.productIntent.rawGoal}.`,
    artifactRef: "goal.json#rawGoal",
    evidenceRefs: ["E-GOAL-001"],
    assumptionRefs: [],
    confidence: 0.9,
    status: "supported",
  });

  const intentClaims: Array<[string, string, string[]]> = [
    ["intent-actors", `Actors are ${input.productIntent.primaryActors.join("、")} / ${input.productIntent.secondaryActors.join("、")}.`, ["E-INTENT-001"]],
    ["intent-resources", `Core resources are ${input.productIntent.coreResources.join("、")}.`, ["E-INTENT-002"]],
    ["intent-workflows", `Core workflows are ${input.productIntent.coreWorkflows.join("、")}.`, ["E-INTENT-003"]],
  ];
  for (const [id, statement, refs] of intentClaims) {
    addClaim(claims, {
      id: claimId(id),
      claimType: "intent",
      statement,
      artifactRef: `product-intent.json#${id}`,
      evidenceRefs: refs,
      assumptionRefs: ["A-001"],
      confidence: 0.78,
      status: statusFor(refs, 0.78, { weak: evidenceIsWeak(refs, input.evidenceLedger) }),
    });
    addLink(links, claimId("goal"), claimId(id), "supports", ["E-GOAL-001"]);
  }

  addClaim(claims, {
    id: claimId("risk-general"),
    claimType: "risk",
    statement: `Risk surfaces are ${input.productIntent.riskSurfaces.join("、")}.`,
    artifactRef: "product-intent.json#riskSurfaces",
    evidenceRefs: ["E-RISK-001"],
    assumptionRefs: ["A-003"],
    confidence: 0.76,
    status: "supported",
  });

  for (const capability of input.productExpansion.coreCapabilities) {
    const refs = capability.evidenceRefs ?? [];
    const id = claimId(`capability-${capability.id}`);
    addClaim(claims, {
      id,
      claimType: "capability",
      statement: `${capability.name} is required because ${capability.whyItMatters}`,
      artifactRef: `product-expansion.json#coreCapabilities.${capability.id}`,
      evidenceRefs: refs,
      assumptionRefs: capability.assumptionRefs ?? [],
      confidence: capability.confidence ?? 0.62,
      status: statusFor(refs, capability.confidence ?? 0.62, { weak: evidenceIsWeak(refs, input.evidenceLedger) }),
    });
    addLink(links, claimId("intent-resources"), id, "supports", refs.slice(0, 2));
    addLink(links, claimId("risk-general"), id, "supports", refs.filter((ref) => ref.startsWith("E-RISK")));
  }

  for (const strategy of input.strategies) {
    const id = claimId(`route-${strategy.id}`);
    const refs = strategy.evidenceRefs ?? [];
    const contested = contestedClaimSet.has(id);
    addClaim(claims, {
      id,
      claimType: "route",
      statement: `${strategy.title}: ${strategy.thesis}`,
      artifactRef: `strategy-candidates.json#${strategy.id}`,
      evidenceRefs: refs,
      assumptionRefs: strategy.assumptionRefs ?? [],
      confidence: strategy.confidence ?? 0.62,
      status: statusFor(refs, strategy.confidence ?? 0.62, {
        contested,
        weak: (strategy.routeEvidenceProfile?.weak ?? 0) > 0,
        missingEvidence: (strategy.routeEvidenceProfile?.missing ?? 0) > 1,
      }),
    });
    addClaim(claims, {
      id: claimId(`risk-${strategy.id}`),
      claimType: "risk",
      statement: `Route ${strategy.id} carries risks: ${(strategy.majorRisks ?? strategy.risks).join("、")}.`,
      artifactRef: `strategy-candidates.json#${strategy.id}.risks`,
      evidenceRefs: refs.filter((ref) => ref.startsWith("E-RISK")),
      assumptionRefs: strategy.assumptionRefs ?? [],
      confidence: strategy.confidence ?? 0.62,
      status: contested ? "contested" : "weakly-supported",
    });
    addLink(links, claimId("intent-resources"), id, "supports", refs.filter((ref) => ref.startsWith("E-INTENT")));
    addLink(links, claimId("intent-workflows"), id, "supports", refs.filter((ref) => ref.startsWith("E-INTENT")));
    addLink(links, claimId(`risk-${strategy.id}`), id, "weakens", refs.filter((ref) => ref.startsWith("E-RISK")));
    if (strategy.id === input.selectedRoute.selectedStrategyId) {
      addLink(links, id, selectedDecisionClaim, "selected-because", refs);
    } else {
      addLink(links, id, selectedDecisionClaim, "rejected-because", refs);
    }
  }

  for (const review of input.criticCouncilReport.reviews.filter((item) => item.disagreementLevel !== "low").slice(0, 24)) {
    const id = claimId(`critic-${review.critic}-${review.strategyId}`);
    const refs = review.evidenceRefs ?? [];
    addClaim(claims, {
      id,
      claimType: "critic-objection",
      statement: `${review.critic} objects to ${review.strategyId}: ${review.objections.slice(0, 2).join(" ")}`,
      artifactRef: `critic-council-report.json#${review.critic}.${review.strategyId}`,
      evidenceRefs: refs,
      assumptionRefs: review.assumptionRefs ?? [],
      confidence: review.disagreementLevel === "high" ? 0.74 : 0.62,
      status: review.disagreementLevel === "high" ? "contested" : "weakly-supported",
    });
    addLink(links, id, claimId(`route-${review.strategyId}`), "weakens", refs);
  }

  for (const decision of input.decisionLedger.decisions) {
    const id = claimId(`decision-${decision.id.replace(/^D-/, "")}`);
    const refs = decision.evidenceRefs ?? [];
    addClaim(claims, {
      id,
      claimType: "decision",
      statement: `${decision.decisionType}: selected ${decision.selectedOption}.`,
      artifactRef: `decision-ledger.json#${decision.id}`,
      evidenceRefs: refs,
      assumptionRefs: decision.assumptionRefs ?? [],
      confidence: decision.confidence,
      status: statusFor(refs, decision.confidence, {
        contested: (decision.contestedClaimRefs ?? []).length > 0 && decision.id === "D-ROUTE-SELECT",
        weak: (decision.evidenceCoverageScore ?? 0) < 0.6,
      }),
    });
    for (const decisiveRef of decision.decisiveClaimRefs ?? []) {
      addLink(links, decisiveRef, id, "supports", refs.slice(0, 3));
    }
  }

  for (const task of input.executionTaskGraph.tasks) {
    const id = claimId(`task-${task.id}`);
    const refs = task.evidenceRefs ?? [];
    addClaim(claims, {
      id,
      claimType: "task",
      statement: `${task.title}: ${task.purpose}`,
      artifactRef: `execution-task-graph.json#${task.id}`,
      evidenceRefs: refs,
      assumptionRefs: ["A-001"],
      confidence: task.shouldBlockCodingUntilResolved ? 0.48 : 0.68,
      status: task.shouldBlockCodingUntilResolved ? "missing-evidence" : statusFor(refs, 0.68, { weak: task.evidenceGapRisk === "medium" }),
    });
    addLink(links, selectedDecisionClaim, id, "derives-task", refs.slice(0, 3));
    for (const claimRef of (task.claimRefs ?? []).filter((ref) => ref !== id).slice(0, 4)) {
      addLink(links, claimRef, id, "depends-on", refs.slice(0, 2));
    }
  }

  const unsupportedClaims = claims
    .filter((claim) => claim.status === "unsupported" || claim.status === "missing-evidence")
    .map((claim) => claim.id);
  const contestedClaims = claims
    .filter((claim) => claim.status === "contested")
    .map((claim) => claim.id);
  const decisionCriticalClaims = Array.from(new Set([
    ...(input.selectedRoute.decisiveClaims ?? []),
    selectedRouteClaim,
    selectedDecisionClaim,
    ...input.executionTaskGraph.tasks
      .filter((task) => task.shouldBlockCodingUntilResolved)
      .flatMap((task) => task.claimRefs ?? [claimId(`task-${task.id}`)]),
  ]));

  return {
    claims,
    links,
    unsupportedClaims,
    contestedClaims,
    decisionCriticalClaims,
  };
}