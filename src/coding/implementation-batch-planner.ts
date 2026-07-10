import type { CodingHandoff, CodingTaskPackage } from "../types/coding-handoff.js";
import type { CodebaseIndex, ImplementationBatch, ImplementationBatchPlan, RepoAnalysis } from "../types/native-coding.js";

interface BatchPlannerInput {
  handoff: CodingHandoff;
  taskPackages: CodingTaskPackage[];
  repoAnalysis: RepoAnalysis;
  codebaseIndex: Pick<CodebaseIndex, "indexedFiles">;
  technicalRoutePlan?: unknown;
  technicalSolutionIntegrationPlan?: unknown;
  executionTaskGraph?: unknown;
}

interface BatchPlanWithSignals extends ImplementationBatchPlan {
  sourceSignals: {
    detectedLanguages: string[];
    frameworkSignals: string[];
    indexedFiles: number;
  };
}

function uniq(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)));
}

function riskLevelFor(taskPackage: CodingTaskPackage): string {
  const text = JSON.stringify(taskPackage).toLowerCase();
  if (text.includes("migration") || text.includes("permission") || text.includes("audit") || text.includes("database")) return "high";
  if ((taskPackage.stopConditions ?? []).length > 0 || (taskPackage.riskNotes ?? []).length > 0) return "medium";
  return "low";
}

function batchForTask(taskPackage: CodingTaskPackage, index: number): ImplementationBatch {
  return {
    batchId: `batch-${String(index + 1).padStart(2, "0")}-${taskPackage.taskId}`,
    title: taskPackage.title ?? taskPackage.taskId,
    tasks: [taskPackage.taskId],
    dependencies: taskPackage.dependencies ?? [],
    plannedFileAreas: taskPackage.allowedChangeAreas ?? [],
    expectedOutputs: taskPackage.expectedOutputs ?? [],
    acceptanceCriteria: taskPackage.acceptanceCriteria ?? [],
    testsToRun: taskPackage.testRequirements ?? [],
    riskLevel: riskLevelFor(taskPackage),
    stopConditions: taskPackage.stopConditions ?? [],
  };
}

function mergedFoundationBatch(taskPackages: CodingTaskPackage[]): ImplementationBatch | undefined {
  if (taskPackages.length < 2) return undefined;
  const firstTwo = taskPackages.slice(0, 2);
  return {
    batchId: "batch-00-foundation",
    title: "Foundation batch for shared model and contracts",
    tasks: firstTwo.map((task) => task.taskId),
    dependencies: uniq(firstTwo.flatMap((task) => task.dependencies ?? [])),
    plannedFileAreas: uniq(firstTwo.flatMap((task) => task.allowedChangeAreas ?? [])),
    expectedOutputs: uniq(firstTwo.flatMap((task) => task.expectedOutputs ?? [])).slice(0, 12),
    acceptanceCriteria: uniq(firstTwo.flatMap((task) => task.acceptanceCriteria ?? [])).slice(0, 12),
    testsToRun: uniq(firstTwo.flatMap((task) => task.testRequirements ?? [])).slice(0, 12),
    riskLevel: firstTwo.some((task) => riskLevelFor(task) === "high") ? "high" : "medium",
    stopConditions: uniq(firstTwo.flatMap((task) => task.stopConditions ?? [])).slice(0, 12),
  };
}

export function buildImplementationBatchPlan(input: BatchPlannerInput): BatchPlanWithSignals {
  const handoff = input.handoff;
  const taskPackages = input.taskPackages ?? [];
  const taskOrder = uniq([...(handoff.approvedCodingTasks ?? []), ...(handoff.conditionalCodingTasks ?? [])]);
  const orderedTaskPackages: CodingTaskPackage[] = taskOrder
    .map((taskId) => taskPackages.find((taskPackage) => taskPackage.taskId === taskId))
    .filter((taskPackage): taskPackage is CodingTaskPackage => taskPackage !== undefined);
  const foundation = mergedFoundationBatch(orderedTaskPackages);
  const taskBatches = orderedTaskPackages.map(batchForTask);
  const batches = foundation ? [foundation, ...taskBatches] : taskBatches;
  return {
    runId: handoff.runId,
    targetRepo: input.repoAnalysis.repoPath,
    batches,
    executionPolicy: [
      "Batches are derived from approved or conditional coding task packages.",
      "Default CLI execution may choose first batch, but the plan covers the approved task graph.",
      "Stop if a batch requires files outside allowed change areas.",
    ],
    selectedByDefault: batches[0]?.batchId ?? "none",
    sourceSignals: {
      detectedLanguages: input.repoAnalysis.detectedLanguages ?? [],
      frameworkSignals: input.repoAnalysis.frameworkSignals ?? [],
      indexedFiles: input.codebaseIndex.indexedFiles?.length ?? 0,
    },
  };
}