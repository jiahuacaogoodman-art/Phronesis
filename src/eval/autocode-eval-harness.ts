import { rmSync } from "node:fs";
import { runAutocodeEval } from "./autocode-eval-runner.js";
import { checkAutocodeEval } from "./autocode-eval-checker.js";
import type { AutocodeEvalHarnessResult, AutocodeEvalOptions } from "../types/autocode-eval.js";

export async function runAutocodeEvalHarness(options: AutocodeEvalOptions = {}): Promise<AutocodeEvalHarnessResult> {
  const run = await runAutocodeEval(options);
  const report = await checkAutocodeEval(run);
  if (!options.keepTemp && report.checksPassed) {
    rmSync(run.outputDir, { recursive: true, force: true });
  }
  return {
    ...run,
    report,
  };
}