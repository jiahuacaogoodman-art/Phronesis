import path from "node:path";
import { ArtifactWriter } from "./lib/artifact-writer.ts";
import type { GoalArtifact, ThinkingRunArtifacts } from "./types/artifacts.ts";
import { analyzeGoalDomain } from "./lib/goal-domain.ts";
import { buildProductIntent } from "./lib/product-intent.ts";
import { synthesizeCapabilities } from "./lib/capability-synthesizer.ts";
import { buildEvidenceLedger } from "./lib/evidence-ledger.ts";
import { buildDecisionLedger } from "./lib/decision-ledger.ts";
import { reconstructGoal } from "./agents/goal-reconstructor.ts";
import { expandProductGradeRequirements } from "./agents/product-grade-expander.ts";
import { planResearch } from "./agents/research-planner.ts";
import { buildEvidenceMap } from "./agents/evidence-map-builder.ts";
import { generateStrategies } from "./agents/strategy-generator.ts";
import { critiqueSimplification } from "./agents/anti-simplification-critic.ts";
import { runCriticCouncil } from "./agents/critic-council.ts";
import { selectRoute } from "./agents/route-selector.ts";
import { planArchitecture } from "./agents/architecture-planner.ts";
import { buildExecutionTaskGraph } from "./agents/execution-task-graph-builder.ts";
import { buildFinalThinkingReport } from "./agents/final-thinking-report-builder.ts";

export interface ThinkingRunResult {
  runId: string;
  runDir: string;
  artifacts: ThinkingRunArtifacts;
}

function createRunId(now = new Date()): string {
  const timestamp = now.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${timestamp}-${suffix}`;
}

export class RunManager {
  async run(goalText: string): Promise<ThinkingRunResult> {
    const cleanGoal = goalText.trim();
    if (!cleanGoal) {
      throw new Error("Missing goal. Use --goal \"...\".");
    }

    const runId = createRunId();
    const runDir = path.resolve(process.cwd(), ".runs", runId);
    const writer = new ArtifactWriter(runDir);
    await writer.ensureRunDir();

    const goal: GoalArtifact = {
      runId,
      createdAt: new Date().toISOString(),
      rawGoal: cleanGoal,
      phase: "v0.4-evidence-driven-thinking-only",
      guardrails: [
        "Do not implement the requested business system.",
        "Do not create UI, dashboard, React pages, login pages, file trees, terminals, or diff viewers.",
        "Do not scan existing repositories.",
        "Do not write patches.",
        "Produce structured deliberation artifacts only.",
      ],
    };
    await writer.writeJson("goal.json", goal);

    const domainAnalysis = analyzeGoalDomain(cleanGoal);
    await writer.writeJson("domain-analysis.json", domainAnalysis);

    const productIntent = buildProductIntent(cleanGoal, domainAnalysis);
    await writer.writeJson("product-intent.json", productIntent);

    const initialCapabilities = synthesizeCapabilities(productIntent);
    const evidenceLedger = buildEvidenceLedger({
      rawGoal: cleanGoal,
      domainAnalysis,
      productIntent,
      synthesizedCapabilities: initialCapabilities,
    });
    await writer.writeJson("evidence-ledger.json", evidenceLedger);

    const synthesizedCapabilities = synthesizeCapabilities(productIntent, evidenceLedger);

    const reconstructedIntent = reconstructGoal(cleanGoal, domainAnalysis);
    await writer.writeJson("reconstructed-intent.json", reconstructedIntent);

    const productExpansion = expandProductGradeRequirements(
      reconstructedIntent,
      domainAnalysis,
      productIntent,
      synthesizedCapabilities,
      evidenceLedger,
    );
    await writer.writeJson("product-expansion.json", productExpansion);

    const researchPlan = planResearch(reconstructedIntent, productExpansion);
    await writer.writeJson("research-plan.json", researchPlan);

    const evidenceMap = buildEvidenceMap(reconstructedIntent, productExpansion, researchPlan);
    await writer.writeJson("evidence-map.json", evidenceMap);

    const strategyCandidates = generateStrategies(
      reconstructedIntent,
      productExpansion,
      domainAnalysis,
      productIntent,
      synthesizedCapabilities,
      evidenceLedger,
    );
    await writer.writeJson("strategy-candidates.json", strategyCandidates);

    const antiSimplificationReport = critiqueSimplification(
      productExpansion,
      strategyCandidates,
      domainAnalysis,
      productIntent,
      synthesizedCapabilities,
      evidenceLedger,
    );
    await writer.writeJson("anti-simplification-report.json", antiSimplificationReport);

    const criticCouncilReport = runCriticCouncil(
      productExpansion,
      strategyCandidates,
      antiSimplificationReport,
      domainAnalysis,
      productIntent,
      synthesizedCapabilities,
      evidenceLedger,
    );
    await writer.writeJson("critic-council-report.json", criticCouncilReport);

    const selectedRoute = selectRoute(
      strategyCandidates,
      antiSimplificationReport,
      criticCouncilReport,
      evidenceLedger,
    );
    await writer.writeJson("selected-route.json", selectedRoute);

    const executionTaskGraph = buildExecutionTaskGraph(
      selectedRoute,
      domainAnalysis,
      productIntent,
      synthesizedCapabilities,
      evidenceLedger,
    );
    await writer.writeJson("execution-task-graph.json", executionTaskGraph);

    const decisionLedger = buildDecisionLedger({
      productIntent,
      productExpansion,
      strategies: strategyCandidates,
      antiSimplificationReport,
      criticCouncilReport,
      selectedRoute,
      executionTaskGraph,
      evidenceLedger,
    });
    await writer.writeJson("decision-ledger.json", decisionLedger);

    const architecturePlan = {
      markdown: planArchitecture(
        reconstructedIntent,
        domainAnalysis,
        productExpansion,
        strategyCandidates,
        selectedRoute,
        evidenceLedger,
        decisionLedger,
      ),
    };
    await writer.writeMarkdown("architecture-plan.md", architecturePlan.markdown);

    const finalThinkingReport = {
      markdown: buildFinalThinkingReport({
        domainAnalysis,
        productIntent,
        synthesizedCapabilities,
        evidenceLedger,
        decisionLedger,
        intent: reconstructedIntent,
        expansion: productExpansion,
        researchPlan,
        evidenceMap,
        strategies: strategyCandidates,
        antiSimplificationReport,
        councilReport: criticCouncilReport,
        selectedRoute,
        taskGraph: executionTaskGraph,
      }),
    };
    await writer.writeMarkdown("final-thinking-report.md", finalThinkingReport.markdown);

    return {
      runId,
      runDir,
      artifacts: {
        goal,
        domainAnalysis,
        productIntent,
        evidenceLedger,
        reconstructedIntent,
        productExpansion,
        researchPlan,
        evidenceMap,
        strategyCandidates,
        antiSimplificationReport,
        criticCouncilReport,
        selectedRoute,
        decisionLedger,
        architecturePlan,
        executionTaskGraph,
        finalThinkingReport,
      },
    };
  }
}