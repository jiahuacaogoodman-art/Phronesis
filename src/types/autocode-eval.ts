import type { CodingFeedbackReport } from "./coding-result.js";
import type { NativeAutocodeRunResult } from "./native-coding.js";

export type AutocodeEvalFixture = "typescript-basic" | "blocked" | "forbidden-file" | "repair-loop";

export interface ToyTargetRepo {
  repoPath: string;
  binPath: string;
  initialFiles: string[];
  testCommands: string[];
}

export interface ApprovedHandoffFixture {
  runDir: string;
  taskId: string;
}

export interface AutocodeEvalOptions {
  fixture?: AutocodeEvalFixture;
  mode?: "execute" | "dry-run";
  evalId?: string;
  outputDir?: string;
  keepTemp?: boolean;
}

export interface AutocodeEvalPlan {
  evalId: string;
  fixture: AutocodeEvalFixture;
  mode: "execute" | "dry-run";
  outputDir: string;
  toyRepoPath: string;
  fixtureRunDir: string;
  expectedFilesChanged: string[];
  expectedCommands: string[];
}

export interface AutocodeEvalRunReport {
  evalId: string;
  fixture: AutocodeEvalFixture;
  mode: string;
  outputDir: string;
  toyRepoPath: string;
  fixtureRunDir: string;
  autocodeStatus: string;
  ingestValid: boolean;
  checksPassed: boolean;
  checkerFailures: string[];
}

export interface AutocodeEvalRun {
  evalId: string;
  outputDir: string;
  fixturesDir: string;
  toyRepo: ToyTargetRepo;
  handoffFixture: ApprovedHandoffFixture;
  plan: AutocodeEvalPlan;
  packageJsonBefore: string;
  autocodeResult: NativeAutocodeRunResult;
  ingestResult?: { feedbackReport: CodingFeedbackReport };
}

export interface AutocodeEvalHarnessResult extends AutocodeEvalRun {
  report: AutocodeEvalRunReport;
}