import path from "node:path";
import { ArtifactWriter } from "./lib/artifact-writer.js";
import type { CriticCouncilReport, CriticReview, GoalArtifact, StrategyCandidate, ThinkingRunArtifacts } from "./types/artifacts.js";
import type { ThinkingMode } from "./llm/types.js";
import { analyzeGoalDomain, refineDomainAnalysisFromProductIntent } from "./lib/goal-domain.js";
import { buildProductIntent } from "./lib/product-intent.js";
import { synthesizeCapabilities } from "./lib/capability-synthesizer.js";
import { addDecisionEvidenceCoverage, addRouteEvidenceCoverage, buildEvidenceLedger } from "./lib/evidence-ledger.js";
import { buildDecisionLedger } from "./lib/decision-ledger.js";
import { buildClaimGraph } from "./lib/claim-graph.js";
import { reconstructGoal } from "./agents/goal-reconstructor.js";
import { expandProductGradeRequirements } from "./agents/product-grade-expander.js";
import { planResearch } from "./agents/research-planner.js";
import { buildEvidenceMap } from "./agents/evidence-map-builder.js";
import { generateStrategies } from "./agents/strategy-generator.js";
import { buildRouteDeepDive } from "./agents/route-deep-dive.js";
import { reviseStrategies, validateStrategyRevisionReport } from "./agents/strategy-revision-agent.js";
import { critiqueSimplification } from "./agents/anti-simplification-critic.js";
import { buildCriticCouncilReport, buildRuleCriticReviewsForRole, criticRoles, runCriticCouncil } from "./agents/critic-council.js";
import { selectRoute } from "./agents/route-selector.js";
import { planArchitecture } from "./agents/architecture-planner.js";
import { buildExecutionTaskGraph } from "./agents/execution-task-graph-builder.js";
import { buildTechnicalProductizationInput, planTechnicalProductization } from "./agents/technical-productization-planner.js";
import { buildProblemSolutionResearchInput, buildProblemSolutionResearchResult, searchTechnicalSolutions } from "./agents/problem-solution-research-agent.js";
import { planTechnicalSolutionResearch } from "./lib/technical-search-query-planner.js";
import { writeCodingHandoffArtifacts } from "./agents/coding-handoff-builder.js";
import { buildFinalThinkingReport } from "./agents/final-thinking-report-builder.js";
import { createThinkingRuntime } from "./llm/provider.js";
import { goalReconstructorPrompt } from "./prompts/goal-reconstructor.prompt.js";
import { productIntentPrompt } from "./prompts/product-intent.prompt.js";
import { productGradeExpanderPrompt } from "./prompts/product-grade-expander.prompt.js";
import { strategyGeneratorPrompt } from "./prompts/strategy-generator.prompt.js";
import { criticCouncilPrompt, criticRolePrompt, criticRoutePrompt } from "./prompts/critic-council.prompt.js";
import { strategyRevisionPrompt } from "./prompts/strategy-revision.prompt.js";
import { technicalProductizationPlannerPrompt } from "./prompts/technical-productization-planner.prompt.js";
import { problemSolutionResearchPrompt } from "./prompts/problem-solution-research.prompt.js";

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

function revisionMaxRounds() {
  const value = Number(process.env.THINK_ROUTE_REVISION_MAX_ROUNDS ?? 1);
  if (!Number.isFinite(value) || value < 0) return 1;
  return Math.min(2, Math.floor(value));
}

export interface ThinkingRunOptions {
  mode?: ThinkingMode;
  enabledAgents?: Set<string>;
  online?: boolean;
}

function technicalSearchRequested(options: ThinkingRunOptions): boolean {
  return Boolean(
    options.online ||
    process.env.THINK_TECHNICAL_SEARCH_REQUESTED === "1" ||
    process.env.THINK_TECHNICAL_SEARCH_PROVIDER === "mock",
  );
}

export class RunManager {
  async run(goalText: string, options: ThinkingRunOptions = {}): Promise<ThinkingRunResult> {
    const cleanGoal = goalText.trim();
    if (!cleanGoal) {
      throw new Error("Missing goal. Use --goal \"...\".");
    }

    const runId = createRunId();
    const runDir = path.resolve(process.cwd(), ".runs", runId);
    const writer = new ArtifactWriter(runDir);
    await writer.ensureRunDir();
    const enabledAgents = options.enabledAgents;
    const partialAgentRun = Boolean(enabledAgents && enabledAgents.size > 0);
    const runtime = createThinkingRuntime({
      mode: options.mode ?? "hybrid",
      runDir,
      goal: cleanGoal,
      enabledAgents,
    });

    const goal: GoalArtifact = {
      runId,
      createdAt: new Date().toISOString(),
      rawGoal: cleanGoal,
      phase: "v0.26-engineering-baseline",
      guardrails: [
        "Do not implement the requested business system.",
        "Do not create UI, dashboard, React pages, login pages, file trees, terminals, or diff viewers.",
        "Do not scan existing repositories.",
        "Do not write patches.",
        "Produce structured deliberation artifacts only.",
      ],
    };
    await writer.writeJson("goal.json", goal);

    let domainAnalysis = analyzeGoalDomain(cleanGoal);
    await writer.writeJson("domain-analysis.json", domainAnalysis);

    const productIntentRule = buildProductIntent(cleanGoal, domainAnalysis);
    const productIntent = await runtime.runJsonAgent(
      productIntentPrompt,
      { rawGoal: cleanGoal, domainAnalysis },
      productIntentRule,
    );
    await writer.writeJson("product-intent.json", productIntent);
    domainAnalysis = refineDomainAnalysisFromProductIntent(domainAnalysis, productIntent);
    await writer.writeJson("domain-analysis.json", domainAnalysis);

    const initialCapabilities = synthesizeCapabilities(productIntent);
    let evidenceLedger = buildEvidenceLedger({
      rawGoal: cleanGoal,
      domainAnalysis,
      productIntent,
      synthesizedCapabilities: initialCapabilities,
    });

    const synthesizedCapabilities = synthesizeCapabilities(productIntent, evidenceLedger);

    const reconstructedIntentRule = reconstructGoal(cleanGoal, domainAnalysis);
    const reconstructedIntent = await runtime.runJsonAgent(
      goalReconstructorPrompt,
      { rawGoal: cleanGoal, domainAnalysis, productIntent },
      reconstructedIntentRule,
    );
    await writer.writeJson("reconstructed-intent.json", reconstructedIntent);

    const productExpansionRule = expandProductGradeRequirements(
      reconstructedIntent,
      domainAnalysis,
      productIntent,
      synthesizedCapabilities,
    );
    const productExpansion = await runtime.runJsonAgent(
      productGradeExpanderPrompt,
      { reconstructedIntent, domainAnalysis, productIntent, synthesizedCapabilities, evidenceLedger },
      productExpansionRule,
    );
    await writer.writeJson("product-expansion.json", productExpansion);

    const researchPlan = planResearch(reconstructedIntent, productExpansion);
    await writer.writeJson("research-plan.json", researchPlan);

    const evidenceMap = buildEvidenceMap(reconstructedIntent, productExpansion, researchPlan);
    await writer.writeJson("evidence-map.json", evidenceMap);

    const strategyCandidatesRule = generateStrategies(
      reconstructedIntent,
      productExpansion,
      domainAnalysis,
      productIntent,
      synthesizedCapabilities,
      evidenceLedger,
    );
    const strategyCandidates = await runtime.runJsonAgent(
      strategyGeneratorPrompt,
      { reconstructedIntent, productExpansion, domainAnalysis, productIntent, synthesizedCapabilities, evidenceLedger },
      strategyCandidatesRule,
    );
    await writer.writeJson("strategy-candidates.json", strategyCandidates);
    const routeDeepDive = await buildRouteDeepDive({
      goal: cleanGoal,
      strategies: strategyCandidates,
      productIntent,
      productExpansion,
      evidenceLedger,
      online: Boolean(options.online),
    });
    await writer.writeJson("route-deep-dive.json", routeDeepDive);
    evidenceLedger = addRouteEvidenceCoverage(evidenceLedger, strategyCandidates);

    const antiSimplificationReport = critiqueSimplification(
      productExpansion,
      strategyCandidates,
      domainAnalysis,
      productIntent,
      synthesizedCapabilities,
      evidenceLedger,
    );
    await writer.writeJson("anti-simplification-report.json", antiSimplificationReport);

    const runCriticCouncilArtifact = async (
      strategiesForCouncil: StrategyCandidate[],
    ): Promise<CriticCouncilReport> => {
      const criticCouncilReportRule = runCriticCouncil(
        productExpansion,
        strategiesForCouncil,
        antiSimplificationReport,
        domainAnalysis,
        productIntent,
        synthesizedCapabilities,
        evidenceLedger,
      );
      const criticMode = process.env.THINK_LLM_CRITIC_MODE ?? "per-role";
      if (criticMode === "single-call") {
        return runtime.runJsonAgent(
          criticCouncilPrompt,
          { productExpansion, strategyCandidates: strategiesForCouncil, antiSimplificationReport, domainAnalysis, productIntent, synthesizedCapabilities, evidenceLedger },
          criticCouncilReportRule,
        );
      }
      if (criticMode === "per-route") {
        const reviews: CriticReview[] = [];
        for (const strategy of strategiesForCouncil) {
          const ruleReviews = criticCouncilReportRule.reviews.filter((review) => review.strategyId === strategy.id);
          const routeReviews = await runtime.runJsonAgent(
            criticRoutePrompt(strategy.id),
            { strategy, productExpansion, antiSimplificationReport, domainAnalysis, productIntent, synthesizedCapabilities, evidenceLedger },
            ruleReviews,
          );
          reviews.push(...routeReviews.map((review) => ({ ...review, strategyId: review.strategyId ?? strategy.id })));
        }
        return buildCriticCouncilReport(strategiesForCouncil, reviews);
      }
      const reviews: CriticReview[] = [];
      for (const critic of criticRoles) {
        const ruleReviews = buildRuleCriticReviewsForRole(
          critic,
          productExpansion,
          strategiesForCouncil,
          antiSimplificationReport,
          domainAnalysis,
          productIntent,
          synthesizedCapabilities,
          evidenceLedger,
        );
        const roleReviews = await runtime.runJsonAgent(
          criticRolePrompt(critic),
          { critic, productExpansion, strategyCandidates: strategiesForCouncil, antiSimplificationReport, domainAnalysis, productIntent, synthesizedCapabilities, evidenceLedger },
          ruleReviews,
        );
        reviews.push(...roleReviews.map((review) => ({ ...review, critic: review.critic ?? critic })));
      }
      return buildCriticCouncilReport(strategiesForCouncil, reviews);
    };

    let criticCouncilReport = await runCriticCouncilArtifact(strategyCandidates);
    await writer.writeJson("critic-council-report.json", criticCouncilReport);

    let selectedRoute = selectRoute(
      strategyCandidates,
      antiSimplificationReport,
      criticCouncilReport,
      evidenceLedger,
    );
    await writer.writeJson("selected-route.json", selectedRoute);

    let finalStrategies = strategyCandidates;
    let finalRouteDeepDive = routeDeepDive;
    let finalCriticCouncilReport = criticCouncilReport;
    const revisionHistory = [];
    const maxRevisionRounds = revisionMaxRounds();
    for (let revisionRound = 1; selectedRoute.canProceedToCoding === false && revisionRound <= maxRevisionRounds; revisionRound += 1) {
      runtime.recorder.recordRevisionRound(revisionRound);
      const provisionalTaskGraph = buildExecutionTaskGraph(
        selectedRoute,
        domainAnalysis,
        productIntent,
        synthesizedCapabilities,
        evidenceLedger,
      );
      const provisionalDecisionLedger = buildDecisionLedger({
        productIntent,
        productExpansion,
        strategies: finalStrategies,
        antiSimplificationReport,
        criticCouncilReport: finalCriticCouncilReport,
        selectedRoute,
        executionTaskGraph: provisionalTaskGraph,
        evidenceLedger,
      });
      const provisionalClaimGraph = buildClaimGraph({
        productIntent,
        productExpansion,
        strategies: finalStrategies,
        criticCouncilReport: finalCriticCouncilReport,
        selectedRoute,
        decisionLedger: provisionalDecisionLedger,
        executionTaskGraph: provisionalTaskGraph,
        evidenceLedger,
      });
      const revisionInput = {
        goal: cleanGoal,
        productIntent,
        currentStrategies: finalStrategies,
        routeDeepDive: finalRouteDeepDive,
        criticCouncilReport: finalCriticCouncilReport,
        selectedRoute,
        evidenceLedger,
        claimGraph: provisionalClaimGraph,
        revisionRound,
        maxRevisionRound: maxRevisionRounds,
      };
      const revisionRule = reviseStrategies(revisionInput);
      const fallbackCountBeforeRevision = runtime.recorder.fallbackReasons.length;
      const validationCountBeforeRevision = runtime.recorder.validationFailures.length;
      const qualityCountBeforeRevision = runtime.recorder.qualityChecklistFailures.length;
      let revisionReport = await runtime.runJsonAgent(
        strategyRevisionPrompt,
        revisionInput,
        revisionRule,
      );
      const revisionFallbacks = runtime.recorder.fallbackReasons
        .slice(fallbackCountBeforeRevision)
        .filter((item) => item.agentName === "StrategyRevisionAgent");
      for (const fallback of revisionFallbacks) {
        runtime.recorder.recordRevisionFallback(revisionRound, fallback.reason);
      }
      const revisionValidationItems = [
        ...runtime.recorder.validationFailures.slice(validationCountBeforeRevision),
        ...runtime.recorder.qualityChecklistFailures.slice(qualityCountBeforeRevision),
      ].filter((item) => item.agentName === "StrategyRevisionAgent");
      for (const item of revisionValidationItems) {
        runtime.recorder.recordRevisionValidationFailure(revisionRound, item.message);
      }
      if (revisionFallbacks.length > 0 && revisionValidationItems.length > 0) {
        const rejectedRevisionReasons = revisionValidationItems.map((item) => `Rejected LLM revision: ${item.message}`);
        revisionReport = {
          ...revisionReport,
          unresolvedBlockingIssues: Array.from(new Set([
            ...(revisionReport.unresolvedBlockingIssues ?? []),
            ...rejectedRevisionReasons,
          ])),
          stopReason: [
            revisionReport.stopReason,
            `LLM revision rejected before rule fallback: ${revisionValidationItems.map((item) => item.message).join(" | ")}`,
          ].filter(Boolean).join(" "),
        };
      }
      const revisionErrors = validateStrategyRevisionReport(revisionReport, finalStrategies);
      if (revisionErrors.length > 0) {
        for (const error of revisionErrors) {
          runtime.recorder.recordRevisionValidationFailure(revisionRound, error);
        }
        runtime.recorder.recordRevisionFallback(revisionRound, revisionErrors.join(" | "));
        revisionReport = {
          ...revisionRule,
          unresolvedBlockingIssues: [...revisionRule.unresolvedBlockingIssues, ...revisionErrors],
          shouldStopRevision: true,
          stopReason: revisionErrors.join(" | "),
        };
      }
      revisionHistory.push(revisionReport);
      await writer.writeJson("strategy-revision-report.json", revisionReport);
      await writer.writeJson(`strategy-revision-report-r${revisionRound}.json`, revisionReport);
      finalStrategies = revisionReport.revisedStrategies;
      await writer.writeJson(`strategy-candidates-revised-r${revisionRound}.json`, finalStrategies);
      finalRouteDeepDive = await buildRouteDeepDive({
        goal: cleanGoal,
        strategies: finalStrategies,
        productIntent,
        productExpansion,
        evidenceLedger,
        online: Boolean(options.online),
      });
      await writer.writeJson(`route-deep-dive-revised-r${revisionRound}.json`, finalRouteDeepDive);
      finalCriticCouncilReport = await runCriticCouncilArtifact(finalStrategies);
      await writer.writeJson(`critic-council-report-revised-r${revisionRound}.json`, finalCriticCouncilReport);
      selectedRoute = selectRoute(
        finalStrategies,
        antiSimplificationReport,
        finalCriticCouncilReport,
        evidenceLedger,
      );
      selectedRoute.revisionHistory = revisionHistory.map((revision) => ({
        revisionRound: revision.revisionRound,
        blockingIssuesAddressed: revision.blockingIssuesAddressed,
        unresolvedBlockingIssues: revision.unresolvedBlockingIssues,
        shouldStopRevision: revision.shouldStopRevision,
        stopReason: revision.stopReason,
      }));
      await writer.writeJson(`selected-route-revised-r${revisionRound}.json`, selectedRoute);
      if (revisionReport.shouldStopRevision) break;
    }
    if (revisionHistory.length > 0) {
      await writer.writeJson("selected-route.json", selectedRoute);
      await writer.writeJson("strategy-candidates.json", finalStrategies);
      await writer.writeJson("route-deep-dive.json", finalRouteDeepDive);
      await writer.writeJson("critic-council-report.json", finalCriticCouncilReport);
      criticCouncilReport = finalCriticCouncilReport;
    }
    evidenceLedger = addDecisionEvidenceCoverage(evidenceLedger, selectedRoute);

    const executionTaskGraph = buildExecutionTaskGraph(
      selectedRoute,
      domainAnalysis,
      productIntent,
      synthesizedCapabilities,
      evidenceLedger,
    );
    await writer.writeJson("execution-task-graph.json", executionTaskGraph);

    const technicalProductizationInput = buildTechnicalProductizationInput({
      goal: cleanGoal,
      reconstructedIntent,
      productIntent,
      productExpansion,
      strategyCandidates: finalStrategies,
      routeDeepDive: finalRouteDeepDive,
      criticCouncilReport,
      selectedRoute,
      evidenceLedger,
      executionTaskGraph,
    });
    const technicalProductizationRule = planTechnicalProductization(technicalProductizationInput);
    const technicalProductization = await runtime.runJsonAgent(
      technicalProductizationPlannerPrompt,
      technicalProductizationInput,
      technicalProductizationRule,
    );
    await writer.writeJson("technical-route-plan.json", technicalProductization.technicalRoutePlan);
    await writer.writeJson("productization-forecast.json", technicalProductization.productizationForecast);
    await writer.writeJson("problem-resolution-plan.json", technicalProductization.problemResolutionPlan);
    await writer.writeJson("technical-route-scorecard.json", technicalProductization.technicalRouteScorecard);

    const problemSolutionInputBase = buildProblemSolutionResearchInput({
      goal: cleanGoal,
      productIntent,
      selectedRoute,
      routeDeepDive: finalRouteDeepDive,
      technicalRoutePlan: technicalProductization.technicalRoutePlan,
      productizationForecast: technicalProductization.productizationForecast,
      problemResolutionPlan: technicalProductization.problemResolutionPlan,
      technicalRouteScorecard: technicalProductization.technicalRouteScorecard,
      executionTaskGraph,
    });
    const technicalSolutionResearchPlan = planTechnicalSolutionResearch({
      goal: cleanGoal,
      problemResolutionPlan: technicalProductization.problemResolutionPlan,
    });
    await writer.writeJson("technical-solution-research-plan.json", technicalSolutionResearchPlan);
    const technicalSolutionSearchResults = await searchTechnicalSolutions(technicalSolutionResearchPlan, {
      online: technicalSearchRequested(options),
    });
    await writer.writeJson("technical-solution-search-results.json", technicalSolutionSearchResults);
    const problemSolutionAgentInput = {
      ...problemSolutionInputBase,
      researchPlan: technicalSolutionResearchPlan,
      searchResults: technicalSolutionSearchResults,
    };
    const problemSolutionRule = buildProblemSolutionResearchResult({
      ...problemSolutionAgentInput,
      problemResolutionPlan: technicalProductization.problemResolutionPlan,
    });
    const problemSolutionResearch = await runtime.runJsonAgent(
      problemSolutionResearchPrompt,
      problemSolutionAgentInput,
      problemSolutionRule,
    );
    await writer.writeJson("technical-solution-candidates.json", problemSolutionResearch.technicalSolutionCandidates);
    await writer.writeJson("technical-solution-decision-matrix.json", problemSolutionResearch.technicalSolutionDecisionMatrix);
    await writer.writeJson("technical-solution-integration-plan.json", problemSolutionResearch.technicalSolutionIntegrationPlan);

    const decisionLedger = buildDecisionLedger({
      productIntent,
      productExpansion,
      strategies: finalStrategies,
      antiSimplificationReport,
      criticCouncilReport,
      selectedRoute,
      executionTaskGraph,
      evidenceLedger,
    });
    await writer.writeJson("decision-ledger.json", decisionLedger);
    await writer.writeJson("evidence-ledger.json", evidenceLedger);

    const claimGraph = buildClaimGraph({
      productIntent,
      productExpansion,
      strategies: finalStrategies,
      criticCouncilReport,
      selectedRoute,
      decisionLedger,
      executionTaskGraph,
      evidenceLedger,
    });
    await writer.writeJson("claim-graph.json", claimGraph);

    const architecturePlan = {
      markdown: planArchitecture(
        reconstructedIntent,
        domainAnalysis,
        productExpansion,
        finalStrategies,
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
        strategies: finalStrategies,
        routeDeepDive: finalRouteDeepDive,
        revisionHistory,
        technicalRoutePlan: technicalProductization.technicalRoutePlan,
        productizationForecast: technicalProductization.productizationForecast,
        problemResolutionPlan: technicalProductization.problemResolutionPlan,
        technicalRouteScorecard: technicalProductization.technicalRouteScorecard,
        technicalSolutionResearchPlan,
        technicalSolutionSearchResults,
        technicalSolutionCandidates: problemSolutionResearch.technicalSolutionCandidates,
        technicalSolutionDecisionMatrix: problemSolutionResearch.technicalSolutionDecisionMatrix,
        technicalSolutionIntegrationPlan: problemSolutionResearch.technicalSolutionIntegrationPlan,
        antiSimplificationReport,
        councilReport: criticCouncilReport,
        selectedRoute,
        claimGraph,
        taskGraph: executionTaskGraph,
        partialAgentRun,
        enabledAgents: enabledAgents ? Array.from(enabledAgents) : [],
      }),
    };
    await writer.writeMarkdown("final-thinking-report.md", finalThinkingReport.markdown);
    const codingHandoffArtifacts = await writeCodingHandoffArtifacts(runDir, {
      goal,
      reconstructedIntent,
      productIntent,
      selectedRoute,
      executionTaskGraph,
      technicalRoutePlan: technicalProductization.technicalRoutePlan,
      productizationForecast: technicalProductization.productizationForecast,
      problemResolutionPlan: technicalProductization.problemResolutionPlan,
      technicalRouteScorecard: technicalProductization.technicalRouteScorecard,
      technicalSolutionCandidates: problemSolutionResearch.technicalSolutionCandidates,
      technicalSolutionDecisionMatrix: problemSolutionResearch.technicalSolutionDecisionMatrix,
      technicalSolutionIntegrationPlan: problemSolutionResearch.technicalSolutionIntegrationPlan,
      finalThinkingReport,
    });
    await runtime.writeMetadata();
    const llmRunMetadata = runtime.recorder.metadata();

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
        strategyCandidates: finalStrategies,
        strategyRevisionReport: revisionHistory.at(-1),
        revisionHistory,
        routeDeepDive: finalRouteDeepDive,
        technicalRoutePlan: technicalProductization.technicalRoutePlan,
        productizationForecast: technicalProductization.productizationForecast,
        problemResolutionPlan: technicalProductization.problemResolutionPlan,
        technicalRouteScorecard: technicalProductization.technicalRouteScorecard,
        technicalSolutionResearchPlan,
        technicalSolutionSearchResults,
        technicalSolutionCandidates: problemSolutionResearch.technicalSolutionCandidates,
        technicalSolutionDecisionMatrix: problemSolutionResearch.technicalSolutionDecisionMatrix,
        technicalSolutionIntegrationPlan: problemSolutionResearch.technicalSolutionIntegrationPlan,
        antiSimplificationReport,
        criticCouncilReport,
        selectedRoute,
        decisionLedger,
        claimGraph,
        architecturePlan,
        executionTaskGraph,
        finalThinkingReport,
        codingHandoff: codingHandoffArtifacts.handoff,
        preCodingResolutionPack: codingHandoffArtifacts.preCodingPack,
        llmRunMetadata,
      },
    };
  }
}