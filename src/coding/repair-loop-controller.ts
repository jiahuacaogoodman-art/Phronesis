import type { AppliedPatches, FailureContext, NativePatchPlan, RepairLoopReport, TestRunReport } from "../types/native-coding.js";

export interface RepairIteration {
  iteration: number;
  repairPlan: NativePatchPlan;
  applied: AppliedPatches;
  testReport: TestRunReport;
  success: boolean;
}

interface RepairLoopInput {
  maxIterations?: number;
  initialTestReport?: Partial<TestRunReport>;
  initialFailureContext?: Partial<FailureContext>;
  planRepair(input: { iteration: number; failureContext: Partial<FailureContext> }): Promise<NativePatchPlan>;
  applyRepair(input: { iteration: number; repairPlan: NativePatchPlan }): Promise<AppliedPatches>;
  runTests(input: { iteration: number; repairPlan: NativePatchPlan; applied: AppliedPatches }): Promise<TestRunReport>;
  analyzeFailure(input: { iteration: number; testReport: TestRunReport; applied: AppliedPatches }): Promise<FailureContext>;
}

export async function runRepairLoop(input: RepairLoopInput): Promise<RepairLoopReport> {
  const maxIterations = Math.max(0, Number(input.maxIterations ?? 5));
  const iterations: RepairIteration[] = [];
  const failures: FailureContext[] = [];
  let patchesApplied = 0;
  let testsRun = 0;
  let repairsAttempted = 0;
  let finalStatus = input.initialTestReport?.success ? "completed" : "failed";
  let stoppedReason = input.initialTestReport?.success ? "initial tests passed" : "max iterations reached";
  let currentFailureContext = input.initialFailureContext;

  if (input.initialTestReport && !input.initialTestReport.success) testsRun += 1;

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    if (!currentFailureContext?.shouldAttemptRepair) {
      stoppedReason = "failure analyzer advised no repair attempt";
      break;
    }
    repairsAttempted += 1;
    const repairPlan = await input.planRepair({ iteration, failureContext: currentFailureContext });
    const applied = await input.applyRepair({ iteration, repairPlan });
    patchesApplied += applied?.filesChanged?.length ?? 0;
    const testReport = await input.runTests({ iteration, repairPlan, applied });
    testsRun += 1;
    const success = testReport?.success === true && (applied?.errors ?? []).length === 0;
    iterations.push({
      iteration,
      repairPlan,
      applied,
      testReport,
      success,
    });
    if (success) {
      finalStatus = "completed";
      stoppedReason = "repair tests passed";
      break;
    }
    const failureContext = await input.analyzeFailure({ iteration, testReport, applied });
    failures.push(failureContext);
    currentFailureContext = failureContext;
  }

  if (iterations.length >= maxIterations && finalStatus !== "completed") {
    stoppedReason = "max iterations reached";
  }

  return {
    iterations,
    patchesApplied,
    testsRun,
    failures,
    repairsAttempted,
    finalStatus,
    stoppedReason,
  };
}