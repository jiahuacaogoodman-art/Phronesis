import type {
  DomainAnalysis,
  DecisionLedger,
  EvidenceLedger,
  ProductExpansion,
  ReconstructedIntent,
  SelectedRoute,
  StrategyCandidate,
} from "../types/artifacts.js";

export function planArchitecture(
  intent: ReconstructedIntent,
  domainAnalysis: DomainAnalysis,
  expansion: ProductExpansion,
  strategies: StrategyCandidate[],
  selectedRoute: SelectedRoute,
  evidenceLedger?: EvidenceLedger,
  decisionLedger?: DecisionLedger,
): string {
  const selected = strategies.find((strategy) => strategy.id === selectedRoute.selectedStrategyId);
  if (!selected) {
    throw new Error(`Selected strategy ${selectedRoute.selectedStrategyId} was not found.`);
  }

  return `# Architecture Plan

## Positioning

This is a product-grade architecture plan for the goal: **${intent.normalizedGoal}**.

Detected domain: **${domainAnalysis.domainId}** (${domainAnalysis.domainName}, confidence ${domainAnalysis.confidence}).

This document is not implementation code. It is a handoff artifact for later architecture and coding agents.

## Selected Route

**${selected.title}**

${selected.thesis}

## System Boundaries

The system should be designed as a mature product boundary, not a single demo screen. The first implementation should include:

${selected.architectureShape.map((part) => `- ${part}`).join("\n")}

## Product Capabilities To Preserve

${expansion.coreCapabilities.map((capability) => `- **${capability.name}** (${capability.priority}): ${capability.whyItMatters}`).join("\n")}

## Operational Capabilities

${expansion.operationalCapabilities.map((capability) => `- **${capability.name}** (${capability.priority}): ${capability.acceptanceSignal}`).join("\n")}

## Security And Abuse-Resistance Model

${selected.securityAndAbuseResistance.map((control) => `- ${control}`).join("\n")}

## Data And Audit Planning

- Define primary records, ownership, lifecycle, retention, and export shape before coding.
- Treat audit events as first-class records for sensitive actions.
- Separate normal records from exception/review states.
- Make privacy and minimization decisions explicit in the product spec before implementation.

## Testing Strategy

- Product flow tests for the main happy path.
- Permission tests for each role/action boundary.
- Abuse-case tests for shortcut, replay, impersonation, or invalid-state attempts.
- Export and audit tests for operational trust.
- Deployment smoke tests for the selected runtime model.

## Evidence-backed Architecture Decisions

${(decisionLedger?.decisions ?? [
  { id: "D-ROUTE-SELECT", decisionType: "route-selection", selectedOption: selectedRoute.selectedTitle, evidenceRefs: selectedRoute.evidenceRefs ?? [], confidence: selectedRoute.confidence ?? 0.7 },
]).map((decision) => `- **${decision.id}** (${decision.decisionType}): ${decision.selectedOption}; evidence ${decision.evidenceRefs.join(", ") || "n/a"}; confidence ${decision.confidence}.`).join("\n")}

## Key Assumptions

${(evidenceLedger?.assumptions ?? []).map((assumption) => `- **${assumption.id}**: ${assumption.claim} (risk if wrong: ${assumption.riskIfWrong})`).join("\n") || "- No assumption ledger was supplied."}

## Missing Evidence

${(evidenceLedger?.missingEvidence ?? []).map((missing) => `- **${missing.id}**: ${missing.question} Impact: ${missing.impact}`).join("\n") || "- No missing evidence ledger was supplied."}

## Decisions to Revisit

${(selectedRoute.conditionsToRevisit ?? selectedRoute.conditionsToReconsider).map((condition) => `- ${condition}`).join("\n")}

## Deployment And Operations

${selected.operationalModel.map((item) => `- ${item}`).join("\n")}

## Routes Not Selected

${selectedRoute.rejectedRoutes.map((route) => `- **${route.title}**: ${route.rejectionReason}`).join("\n")}

## Residual Risks

${selectedRoute.residualRisks.map((risk) => `- ${risk}`).join("\n")}

## Explicit Non-Implementation Boundary

This planning run deliberately stops before source code, UI, dashboard, repository scanning, or patch generation.`;
}