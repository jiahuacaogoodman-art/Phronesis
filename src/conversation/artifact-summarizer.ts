import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ArtifactConversationSummary } from "../types/conversation-runtime.js";

interface SummarizeArtifactsInput {
  runDir?: string;
  evalDir?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readJsonRecord(filePath: string): Record<string, unknown> | undefined {
  if (!existsSync(filePath)) return undefined;
  try {
    const value: unknown = JSON.parse(readFileSync(filePath, "utf8"));
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function readText(filePath: string): string {
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
}

function uniq(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)));
}

function asList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (value === undefined || value === null || value === "") return [];
  return [String(value)];
}

function stringField(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" ? value : undefined;
}

export function summarizeArtifacts(input: SummarizeArtifactsInput = {}): ArtifactConversationSummary {
  const { runDir, evalDir } = input;
  const artifactPaths: string[] = [];
  const importantFindings: string[] = [];
  const blockers: string[] = [];
  const recommendedNextActions: string[] = [];
  let currentStatus = "No run has been selected yet.";
  let whatHappened = "I inspected the available conversation runtime artifacts.";

  if (runDir && existsSync(runDir)) {
    const selectedRoutePath = path.join(runDir, "selected-route.json");
    const taskGraphPath = path.join(runDir, "execution-task-graph.json");
    const handoffPath = path.join(runDir, "coding-handoff.json");
    const productIntentPath = path.join(runDir, "product-intent.json");
    const finalReportPath = path.join(runDir, "final-thinking-report.md");
    const technicalRoutePath = path.join(runDir, "technical-route-plan.json");
    const candidatesPath = path.join(runDir, "technical-solution-candidates.json");
    const codingResultPath = path.join(runDir, "autonomous-coding-result.json");
    const feedbackPath = path.join(runDir, "coding-feedback-report.json");

    const selectedRoute = readJsonRecord(selectedRoutePath);
    const taskGraph = readJsonRecord(taskGraphPath);
    const handoff = readJsonRecord(handoffPath);
    const productIntent = readJsonRecord(productIntentPath);
    const technicalRoute = readJsonRecord(technicalRoutePath);
    const candidates = readJsonRecord(candidatesPath);
    const codingResult = readJsonRecord(codingResultPath);
    const feedback = readJsonRecord(feedbackPath);
    const finalReport = readText(finalReportPath);

    for (const filePath of [selectedRoutePath, taskGraphPath, handoffPath, productIntentPath, finalReportPath, technicalRoutePath, candidatesPath, codingResultPath, feedbackPath]) {
      if (existsSync(filePath)) artifactPaths.push(filePath);
    }

    whatHappened = `I inspected the latest planning run at ${runDir}.`;
    const canProceed = selectedRoute?.canProceedToCoding !== false && taskGraph?.canProceedToCoding !== false && handoff?.canProceedToCoding !== false;
    const statusParts: string[] = [];
    if (selectedRoute?.selectionStatus) statusParts.push(`route ${String(selectedRoute.selectionStatus)}`);
    if (handoff?.handoffStatus) statusParts.push(`handoff ${String(handoff.handoffStatus)}`);
    if (codingResult?.status) statusParts.push(`coding ${String(codingResult.status)}`);
    currentStatus = canProceed
      ? `Planning is coding-ready or conditional (${statusParts.join(", ") || "no blocking gate found"}).`
      : `Planning is blocked for coding (${statusParts.join(", ") || "coding gate is false"}).`;

    const domainId = stringField(productIntent, "domainId");
    if (domainId) importantFindings.push(`Product intent domain: ${domainId}.`);
    const selectedTitle = stringField(selectedRoute, "selectedTitle");
    if (selectedTitle) importantFindings.push(`Selected route: ${String(selectedRoute?.selectedStrategyId ?? "unknown")} - ${selectedTitle}.`);
    const routeTitle = stringField(technicalRoute, "routeTitle");
    if (routeTitle) importantFindings.push(`Technical route plan: ${routeTitle}.`);
    const candidateItems = Array.isArray(candidates?.candidates) ? candidates.candidates : [];
    if (candidateItems.length > 0) importantFindings.push(`Technical solution candidates: ${candidateItems.length}.`);
    if (finalReport.includes("Do not hand off to Coding Agent yet.")) importantFindings.push("Final report explicitly says not to hand off to a Coding Agent yet.");

    blockers.push(...asList(selectedRoute?.blockingReasons));
    blockers.push(...asList(taskGraph?.globalBlockingReasons));
    blockers.push(...asList(handoff?.requiredBeforeCoding));
    blockers.push(...asList(handoff?.requiredClarifications));
    if (feedback?.forbiddenExecutionDetected === true) blockers.push("A coding result attempted execution while handoff was blocked.");
    if (codingResult?.needsPlannerRevision === true) blockers.push("Coding result says planner revision is needed.");

    if (canProceed) {
      recommendedNextActions.push("Generate or inspect coding handoff before any native coding run.");
      recommendedNextActions.push("Use dry-run first on a target repo, then ask for confirmation before execute.");
    } else {
      recommendedNextActions.push("Resolve blocking reasons before coding.");
      recommendedNextActions.push("Regenerate handoff after clarifications are answered.");
    }
    if (codingResult?.status === "failed") recommendedNextActions.push("Ingest coding result and rerun planner revision before another execute.");
  }

  if (evalDir && existsSync(evalDir)) {
    const evalReportPath = path.join(evalDir, "autocode-eval-run-report.json");
    const evalReport = readJsonRecord(evalReportPath);
    if (evalReport) {
      artifactPaths.push(evalReportPath);
      whatHappened = `${whatHappened} I also inspected the latest autocode eval.`;
      importantFindings.push(`Latest eval fixture ${String(evalReport.fixture ?? "unknown")} status: ${String(evalReport.autocodeStatus ?? "unknown")}.`);
      if (evalReport.checksPassed === true) importantFindings.push("Latest eval checks passed.");
      else blockers.push(...asList(evalReport.checkerFailures));
    }
  }

  return {
    whatHappened,
    currentStatus,
    importantFindings: uniq(importantFindings),
    blockers: uniq(blockers).slice(0, 12),
    recommendedNextActions: uniq(recommendedNextActions).slice(0, 8),
    artifactPaths: uniq(artifactPaths),
  };
}