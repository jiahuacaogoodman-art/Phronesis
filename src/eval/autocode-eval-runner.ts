import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runNativeAutocode } from "../coding/native-coding-runtime.js";
import { ingestCodingResult } from "../agents/coding-result-ingestor.js";
import { generateToyTargetRepo } from "./toy-target-repo-generator.js";
import { generateApprovedHandoffFixture } from "./approved-handoff-fixture-generator.js";
import type { AutocodeEvalOptions, AutocodeEvalPlan, AutocodeEvalRun, ToyTargetRepo } from "../types/autocode-eval.js";
import type { NativeAutocodeRunResult } from "../types/native-coding.js";

function mkdirp(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function evalId(): string {
  return new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14) + "-" + Math.random().toString(36).slice(2, 8);
}

function setEnvForFixture(fixture: AutocodeEvalOptions["fixture"], toyRepo: ToyTargetRepo): NodeJS.ProcessEnv {
  const previous: NodeJS.ProcessEnv = {
    THINK_LLM_PROVIDER: process.env.THINK_LLM_PROVIDER,
    THINK_LLM_MODEL: process.env.THINK_LLM_MODEL,
    THINK_AUTOCODE_EVAL_PATCH_VARIANT: process.env.THINK_AUTOCODE_EVAL_PATCH_VARIANT,
    PATH: process.env.PATH,
  };
  process.env.THINK_LLM_PROVIDER = "mock";
  process.env.THINK_LLM_MODEL = "mock-json-model";
  process.env.PATH = `${toyRepo.binPath}${path.delimiter}${process.env.PATH ?? ""}`;
  if (fixture === "repair-loop") {
    process.env.THINK_AUTOCODE_EVAL_PATCH_VARIANT = "broken-subtract";
  } else {
    delete process.env.THINK_AUTOCODE_EVAL_PATCH_VARIANT;
  }
  return previous;
}

function restoreEnv(previous: NodeJS.ProcessEnv): void {
  for (const key of Object.keys(previous)) {
    if (previous[key] == null) delete process.env[key];
    else process.env[key] = previous[key];
  }
}

export async function runAutocodeEval(input: AutocodeEvalOptions = {}): Promise<AutocodeEvalRun> {
  const fixture = input.fixture ?? "typescript-basic";
  const mode = input.mode ?? "execute";
  const id = input.evalId ?? evalId();
  const outputRoot = path.resolve(process.cwd(), input.outputDir ?? path.join(".eval-runs", id));
  mkdirp(outputRoot);
  const fixturesDir = path.join(outputRoot, "autocode-eval-fixtures");
  mkdirp(fixturesDir);
  const toyRepo = await generateToyTargetRepo(fixturesDir);
  const packageJsonBefore = readFileSync(path.join(toyRepo.repoPath, "package.json"), "utf8");
  const handoffFixture = generateApprovedHandoffFixture(fixturesDir, fixture);
  const plan: AutocodeEvalPlan = {
    evalId: id,
    fixture,
    mode,
    outputDir: outputRoot,
    toyRepoPath: toyRepo.repoPath,
    fixtureRunDir: handoffFixture.runDir,
    expectedFilesChanged: fixture === "blocked" ? [] : ["src/index.ts", "tests/index.test.ts"],
    expectedCommands: ["pnpm test", "pnpm typecheck"],
  };
  writeJson(path.join(outputRoot, "autocode-eval-plan.json"), plan);

  const previous = setEnvForFixture(fixture, toyRepo);
  let autocodeResult: NativeAutocodeRunResult | undefined;
  let ingestResult: AutocodeEvalRun["ingestResult"];
  try {
    autocodeResult = await runNativeAutocode({
      runDir: handoffFixture.runDir,
      targetRepo: toyRepo.repoPath,
      mode,
      batch: "first",
      allowDirty: true,
      maxIterations: fixture === "repair-loop" ? 2 : 1,
    });
    if (autocodeResult.autonomousCodingResult?.status !== "blocked") {
      ingestResult = await ingestCodingResult({
        handoffPath: path.join(handoffFixture.runDir, "coding-handoff.json"),
        resultPath: path.join(handoffFixture.runDir, "autonomous-coding-result.json"),
      });
    }
  } finally {
    restoreEnv(previous);
  }
  if (!autocodeResult) throw new Error("Autocode evaluation did not produce a runtime result.");
  return {
    evalId: id,
    outputDir: outputRoot,
    fixturesDir,
    toyRepo,
    handoffFixture,
    plan,
    packageJsonBefore,
    autocodeResult,
    ingestResult,
  };
}