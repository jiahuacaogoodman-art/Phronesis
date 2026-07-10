import type {
  AntiSimplificationReport,
  CriticCouncilReport,
  DomainAnalysis,
  EvidenceMap,
  ExecutionTaskGraph,
  ProductExpansion,
  ReconstructedIntent,
  ResearchPlan,
  SelectedRoute,
  StrategyCandidate,
} from "../types/artifacts.ts";

export function buildFinalThinkingReport(input) {
  const selectedAggregate = input.councilReport.aggregate.find(
    (item) => item.strategyId === input.selectedRoute.selectedStrategyId,
  );

  return `# Final Thinking Report

## Goal

${input.intent.rawGoal}

## Reconstructed Intent

- Detected domain: ${input.domainAnalysis.domainId} (${input.domainAnalysis.domainName})
- Domain confidence: ${input.domainAnalysis.confidence}
- Matched signals: ${input.domainAnalysis.matchedSignals.length > 0 ? input.domainAnalysis.matchedSignals.join(", ") : "none"}
- Domain reasoning: ${input.domainAnalysis.reasoningSummary}
- Category: ${input.intent.inferredProductCategory}
- Normalized goal: ${input.intent.normalizedGoal}
- Primary users: ${input.intent.primaryUsers.join(", ")}

## Product Intent Model

- Primary actors: ${input.productIntent.primaryActors.join(", ")}
- Secondary actors: ${input.productIntent.secondaryActors.join(", ")}
- Core resources: ${input.productIntent.coreResources.join(", ")}
- Core workflows: ${input.productIntent.coreWorkflows.join(", ")}
- Data objects: ${input.productIntent.dataObjects.join(", ")}
- Lifecycle stages: ${input.productIntent.lifecycleStages.join(", ")}
- Permission boundaries: ${input.productIntent.permissionBoundaries.join("; ")}
- Risk surfaces: ${input.productIntent.riskSurfaces.join(", ")}
- Operational needs: ${input.productIntent.operationalNeeds.join(", ")}
- Reporting needs: ${input.productIntent.reportingNeeds.join(", ")}
- Integration needs: ${input.productIntent.integrationNeeds.join(", ")}
- Deployment assumptions: ${input.productIntent.deploymentAssumptions.join(", ")}
- Uncertainty notes: ${input.productIntent.uncertaintyNotes.join("; ")}

## Capability Synthesis

Capabilities were synthesized from actors, resources, workflows, risks, operations, reporting, and deployment assumptions before domain-specific enhancement.

${input.synthesizedCapabilities.map((capability) => `- **${capability.name}** (${capability.id}, ${capability.priority}): triggered by ${capability.triggeredBy.slice(0, 4).join(", ")}. Risk if missing: ${capability.riskIfMissing}`).join("\n")}

## Product-Grade Expansion

The goal was expanded into ${input.expansion.coreCapabilities.length} core capabilities, ${input.expansion.operationalCapabilities.length} operational capabilities, and ${input.expansion.nonFunctionalRequirements.length} non-functional requirements.

Key capabilities:

${input.expansion.coreCapabilities.map((capability) => `- ${capability.name}: ${capability.acceptanceSignal}`).join("\n")}

## Research And Evidence Status

v0.4 does not claim completed external research. It creates a rule-based Evidence Ledger and Decision Ledger without networking.

Research questions:

${input.researchPlan.researchQuestions.map((question) => `- ${question.id}: ${question.question}`).join("\n")}

Evidence posture:

${input.evidenceMap.items.map((item) => `- ${item.id}: ${item.claim} (${item.supportType}, ${item.confidence})`).join("\n")}

## Evidence Ledger Summary

- Evidence items: ${input.evidenceLedger.evidenceItems.length}
- Assumptions: ${input.evidenceLedger.assumptions.length}
- Missing evidence: ${input.evidenceLedger.missingEvidence.length}
- Inferred claims: ${input.evidenceLedger.inferredClaims.length}

Key evidence:

${input.evidenceLedger.evidenceItems.slice(0, 8).map((item) => `- **${item.id}** (${item.type}, ${item.confidence}): ${item.claim}`).join("\n")}

## Assumption Register

${input.evidenceLedger.assumptions.map((assumption) => `- **${assumption.id}** (${assumption.confidence}): ${assumption.claim}; risk if wrong: ${assumption.riskIfWrong}`).join("\n")}

## Missing Evidence

${input.evidenceLedger.missingEvidence.map((missing) => `- **${missing.id}**: ${missing.question}; impact: ${missing.impact}`).join("\n")}

## Strategy Candidates

${input.strategies.map((strategy) => `- **${strategy.id} ${strategy.title}**: ${strategy.thesis}`).join("\n")}

## Route Synthesis Rationale

${input.strategies.map((strategy) => `- **${strategy.id} ${strategy.routeArchetype ?? "unspecified"}**: triggered by ${(strategy.triggeredBy ?? []).slice(0, 6).join(", ")}; modules: ${(strategy.modules ?? []).slice(0, 6).join(", ")}; completeness: ${strategy.productCompletenessScore ?? strategy.demoTrapResistanceScore}/10.`).join("\n")}

## Anti-Simplification Review

${input.antiSimplificationReport.stance}

Banned shortcuts:

${input.antiSimplificationReport.bannedShortcutSolutions.map((shortcut) => `- ${shortcut}`).join("\n")}

Compositional rule results:

${(input.antiSimplificationReport.compositionalRuleResults ?? []).map((rule) => `- ${rule.ruleId}: ${rule.triggered ? "triggered" : "not triggered"}; requires ${rule.requiredCapability}; ${rule.reason}`).join("\n")}

## Critic Council Summary

Critics: ${input.councilReport.critics.join(", ")}

Aggregate scores:

${input.councilReport.aggregate.map((item) => `- ${item.strategyId}: ${item.averageScore}/10, blocking issues: ${item.blockingIssueCount}`).join("\n")}

## Dissent and Tradeoffs

${input.councilReport.reviews.filter((review) => review.disagreementLevel !== "low" || (review.nearBlockingConcerns ?? []).length > 0).slice(0, 12).map((review) => `- ${review.critic} on ${review.strategyId}: ${review.disagreementLevel}; evidence ${(review.evidenceRefs ?? []).join(", ")}; concerns ${(review.nearBlockingConcerns ?? review.objections).slice(0, 2).join(" | ")}`).join("\n")}

## Selected Route

**${input.selectedRoute.selectedStrategyId}: ${input.selectedRoute.selectedTitle}**

Selection rationale:

${input.selectedRoute.selectionRationale.map((reason) => `- ${reason}`).join("\n")}

Selected aggregate: ${selectedAggregate?.averageScore ?? "n/a"}/10.

Selected route evidence: ${(input.selectedRoute.evidenceRefs ?? []).join(", ")}

Selected route decisions: ${(input.selectedRoute.decisionRefs ?? []).join(", ")}

Selection confidence: ${input.selectedRoute.confidence ?? "n/a"}

Rejected routes:

${input.selectedRoute.rejectedRoutes.map((route) => `- ${route.strategyId}: ${route.rejectionReason}`).join("\n")}

## Architecture Handoff

The architecture plan is written to \`architecture-plan.md\`. It is a planning artifact only and deliberately contains no implementation code.

## Execution Task Graph

The handoff DAG contains ${input.taskGraph.tasks.length} tasks:

${input.taskGraph.tasks.map((task) => `- ${task.id}: ${task.title} -> ${task.ownerAgent}`).join("\n")}

## Decision Ledger Summary

${input.decisionLedger.decisions.map((decision) => `- **${decision.id}** (${decision.decisionType}, ${decision.confidence}): selected ${decision.selectedOption}; evidence ${decision.evidenceRefs.join(", ")}`).join("\n")}

## Conditions to Revisit Decisions

${input.decisionLedger.decisions.flatMap((decision) => decision.conditionsToRevisit.map((condition) => `- ${decision.id}: ${condition}`)).slice(0, 16).join("\n")}

## Explicit Boundary

This run did not create a webpage, dashboard, React page, login page, repository scan, patch, diff viewer, terminal UI, or business implementation. It only produced structured thinking artifacts for a later software development workflow.`;
}