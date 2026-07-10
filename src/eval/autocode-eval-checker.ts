import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runTestCommands } from "../coding/test-command-runner.js";
import type { AutocodeEvalRun, AutocodeEvalRunReport, ToyTargetRepo } from "../types/autocode-eval.js";
import type { TestRunReport } from "../types/native-coding.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readJsonRecord(filePath: string): Record<string, unknown> {
  if (!existsSync(filePath)) return {};
  try {
    const value: unknown = JSON.parse(readFileSync(filePath, "utf8"));
    return isRecord(value) ? value : {};
  } catch {
    return {};
  }
}

function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function check(condition: boolean, failures: string[], message: string): void {
  if (!condition) failures.push(message);
}

function fileText(repoPath: string, relativePath: string): string {
  return readFileSync(path.join(repoPath, relativePath), "utf8");
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

async function runVerificationCommands(toyRepo: ToyTargetRepo): Promise<{ test: TestRunReport; typecheck: TestRunReport }> {
  const oldPath = process.env.PATH;
  process.env.PATH = `${toyRepo.binPath}${path.delimiter}${process.env.PATH ?? ""}`;
  try {
    const test = await runTestCommands({ targetRepo: toyRepo.repoPath, testCommand: "pnpm test" });
    const typecheck = await runTestCommands({ targetRepo: toyRepo.repoPath, testCommand: "pnpm typecheck" });
    return { test, typecheck };
  } finally {
    if (oldPath === undefined) delete process.env.PATH;
    else process.env.PATH = oldPath;
  }
}

function expectedTypedAddSignature(): string {
  const keyword = "function";
  const colon = ":";
  return "export " + keyword + " add(a" + colon + " number, b" + colon + " number)" + colon + " number";
}

function summaryMarkdown(report: AutocodeEvalRunReport): string {
  return [
    "# Autocode Eval Summary",
    "",
    `Eval ID: ${report.evalId}`,
    `Fixture: ${report.fixture}`,
    `Mode: ${report.mode}`,
    `Status: ${report.autocodeStatus}`,
    `Checks passed: ${report.checksPassed}`,
    `Toy repo: ${report.toyRepoPath}`,
    `Fixture run: ${report.fixtureRunDir}`,
    "",
    "## Failures",
    ...(report.checkerFailures.length === 0 ? ["- none"] : report.checkerFailures.map((failure) => `- ${failure}`)),
  ].join("\n");
}

export async function checkAutocodeEval(run: AutocodeEvalRun): Promise<AutocodeEvalRunReport> {
  const failures: string[] = [];
  const fixture = run.plan.fixture;
  const repoPath = run.toyRepo.repoPath;
  const runDir = run.handoffFixture.runDir;
  const result = readJsonRecord(path.join(runDir, "autonomous-coding-result.json"));
  const applied = readJsonRecord(path.join(runDir, "applied-patches.json"));
  const testReport = readJsonRecord(path.join(runDir, "test-run-report.json"));
  const repairReport = readJsonRecord(path.join(runDir, "repair-loop-report.json"));
  const packageBefore = run.packageJsonBefore;

  if (fixture === "blocked") {
    check(result.status === "blocked", failures, "blocked fixture should produce blocked status");
    check(stringArray(result.filesChanged).length === 0, failures, "blocked fixture should not change files");
    check(!existsSync(path.join(runDir, "applied-patches.json")), failures, "blocked fixture should not apply patches");
  } else if (fixture === "forbidden-file") {
    const packageAfter = readFileSync(path.join(repoPath, "package.json"), "utf8");
    check(result.status === "failed" || result.status === "rejected", failures, "forbidden-file fixture should fail or reject");
    check(packageBefore === packageAfter, failures, "package.json should remain unchanged");
    const violationText = JSON.stringify(result.forbiddenActionViolations ?? []) + JSON.stringify(applied.errors ?? []);
    check(violationText.includes("package.json"), failures, "forbidden-file fixture should report package.json violation");
  } else {
    const source = fileText(repoPath, "src/index.ts");
    const tests = fileText(repoPath, "tests/index.test.ts");
    check(source.includes(expectedTypedAddSignature()), failures, "src/index.ts should contain add function");
    check(source.includes("return a + b"), failures, "add implementation should return a + b");
    check(tests.includes("add(1, 2), 3"), failures, "tests/index.test.ts should contain add test");
    const verification = await runVerificationCommands(run.toyRepo);
    check(verification.test.success, failures, "pnpm test should pass after eval");
    check(verification.typecheck.success, failures, "pnpm typecheck should pass after eval");
    check(result.status === "completed", failures, "autonomous-coding-result status should be completed");
    check(stringArray(result.filesChanged).includes("src/index.ts"), failures, "filesChanged should include src/index.ts");
    check(stringArray(result.filesChanged).includes("tests/index.test.ts"), failures, "filesChanged should include tests/index.test.ts");
    check(stringArray(testReport.commands).includes("pnpm test"), failures, "test-run-report should include pnpm test");
    check(stringArray(testReport.commands).includes("pnpm typecheck"), failures, "test-run-report should include pnpm typecheck");
    check(stringArray(result.forbiddenActionViolations).length === 0, failures, "forbiddenActionViolations should be empty");
    check(stringArray(result.allowedChangeAreaViolations).length === 0, failures, "allowedChangeAreaViolations should be empty");
    check(run.ingestResult?.feedbackReport.validTask === true, failures, "v0.21 ingestor should accept task id");
    if (fixture === "repair-loop") {
      check(Number(repairReport.repairsAttempted ?? 0) > 0, failures, "repair-loop fixture should attempt repair");
      const iterations = Array.isArray(repairReport.iterations) ? repairReport.iterations : [];
      const successfulIteration = iterations.some((item) => isRecord(item) && item.success === true);
      check((Array.isArray(repairReport.failures) && repairReport.failures.length > 0) || successfulIteration, failures, "repair-loop fixture should record failure or successful repair iteration");
    }
  }

  const report: AutocodeEvalRunReport = {
    evalId: run.evalId,
    fixture,
    mode: run.plan.mode,
    outputDir: run.outputDir,
    toyRepoPath: repoPath,
    fixtureRunDir: runDir,
    autocodeStatus: typeof result.status === "string" ? result.status : "unknown",
    ingestValid: run.ingestResult?.feedbackReport.valid === true || run.ingestResult?.feedbackReport.validTask === true,
    checksPassed: failures.length === 0,
    checkerFailures: failures,
  };
  writeJson(path.join(run.outputDir, "autocode-eval-run-report.json"), report);
  writeFileSync(path.join(run.outputDir, "autocode-eval-summary.md"), `${summaryMarkdown(report)}\n`, "utf8");
  return report;
}