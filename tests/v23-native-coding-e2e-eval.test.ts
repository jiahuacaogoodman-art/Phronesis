import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { generateToyTargetRepo } from "../src/eval/toy-target-repo-generator.js";
import { generateApprovedHandoffFixture } from "../src/eval/approved-handoff-fixture-generator.js";
import { runAutocodeEvalHarness } from "../src/eval/autocode-eval-harness.js";

test("v2.3 generates TypeScript toy repo", async () => {
  const outputDir = mkdtempSync(path.join(os.tmpdir(), "autocode-eval-toy-"));
  const toy = await generateToyTargetRepo(outputDir);
  assert.ok(existsSync(path.join(toy.repoPath, "package.json")));
  assert.ok(existsSync(path.join(toy.repoPath, "tsconfig.json")));
  assert.ok(existsSync(path.join(toy.repoPath, "src/index.ts")));
  assert.ok(existsSync(path.join(toy.repoPath, "tests/index.test.ts")));
  assert.ok(existsSync(path.join(toy.repoPath, ".git")));
});

test("v2.3 generates approved handoff fixture", () => {
  const outputDir = mkdtempSync(path.join(os.tmpdir(), "autocode-eval-handoff-"));
  const fixture = generateApprovedHandoffFixture(outputDir, "typescript-basic");
  const handoff = JSON.parse(readFileSync(path.join(fixture.runDir, "coding-handoff.json"), "utf8"));
  assert.equal(handoff.handoffStatus, "approved");
  assert.ok(handoff.approvedCodingTasks.includes("implement-add-function"));
  assert.ok(existsSync(path.join(fixture.runDir, "coding-task-packages", "implement-add-function.json")));
});

test("v2.3 typescript-basic execute changes files, runs tests, completes, and ingests", async () => {
  const outputDir = mkdtempSync(path.join(os.tmpdir(), "autocode-eval-basic-"));
  const options = {};
  options.fixture = "typescript-basic";
  options.mode = "execute";
  options.keepTemp = true;
  options.outputDir = outputDir;
  const result = await runAutocodeEvalHarness(options);
  assert.equal(result.report.checksPassed, true, result.report.checkerFailures.join(" | "));
  const source = readFileSync(path.join(result.toyRepo.repoPath, "src/index.ts"), "utf8");
  const tests = readFileSync(path.join(result.toyRepo.repoPath, "tests/index.test.ts"), "utf8");
  assert.ok(source.includes("export function add"));
  assert.ok(tests.includes("add(1, 2), 3"));
  const codingResult = JSON.parse(readFileSync(path.join(result.handoffFixture.runDir, "autonomous-coding-result.json"), "utf8"));
  assert.equal(codingResult.status, "completed");
  assert.ok(codingResult.filesChanged.includes("src/index.ts"));
  assert.ok(codingResult.filesChanged.includes("tests/index.test.ts"));
  assert.equal(result.ingestResult.feedbackReport.validTask, true);
});

test("v2.3 blocked fixture does not modify repo", async () => {
  const outputDir = mkdtempSync(path.join(os.tmpdir(), "autocode-eval-blocked-"));
  const options = {};
  options.fixture = "blocked";
  options.mode = "execute";
  options.keepTemp = true;
  options.outputDir = outputDir;
  const result = await runAutocodeEvalHarness(options);
  assert.equal(result.report.checksPassed, true, result.report.checkerFailures.join(" | "));
  const source = readFileSync(path.join(result.toyRepo.repoPath, "src/index.ts"), "utf8");
  assert.ok(!source.includes("export function add"));
  const codingResult = JSON.parse(readFileSync(path.join(result.handoffFixture.runDir, "autonomous-coding-result.json"), "utf8"));
  assert.equal(codingResult.status, "blocked");
  assert.deepEqual(codingResult.filesChanged, []);
});

test("v2.3 forbidden-file fixture protects package.json", async () => {
  const outputDir = mkdtempSync(path.join(os.tmpdir(), "autocode-eval-forbidden-"));
  const options = {};
  options.fixture = "forbidden-file";
  options.mode = "execute";
  options.keepTemp = true;
  options.outputDir = outputDir;
  const result = await runAutocodeEvalHarness(options);
  assert.equal(result.report.checksPassed, true, result.report.checkerFailures.join(" | "));
  const applied = JSON.parse(readFileSync(path.join(result.handoffFixture.runDir, "applied-patches.json"), "utf8"));
  assert.ok(JSON.stringify(applied.errors).includes("package.json"));
  const codingResult = JSON.parse(readFileSync(path.join(result.handoffFixture.runDir, "autonomous-coding-result.json"), "utf8"));
  assert.ok(codingResult.status === "failed" || codingResult.status === "rejected");
});

test("v2.3 repair-loop fixture records failed first test and repairs to completed", async () => {
  const outputDir = mkdtempSync(path.join(os.tmpdir(), "autocode-eval-repair-"));
  const options = {};
  options.fixture = "repair-loop";
  options.mode = "execute";
  options.keepTemp = true;
  options.outputDir = outputDir;
  const result = await runAutocodeEvalHarness(options);
  assert.equal(result.report.checksPassed, true, result.report.checkerFailures.join(" | "));
  const repair = JSON.parse(readFileSync(path.join(result.handoffFixture.runDir, "repair-loop-report.json"), "utf8"));
  assert.ok(repair.repairsAttempted > 0);
  const codingResult = JSON.parse(readFileSync(path.join(result.handoffFixture.runDir, "autonomous-coding-result.json"), "utf8"));
  assert.equal(codingResult.status, "completed");
  const source = readFileSync(path.join(result.toyRepo.repoPath, "src/index.ts"), "utf8");
  assert.ok(source.includes("return a + b"));
});

test("v2.3 think:autocode-eval CLI runs typescript-basic execute", () => {
  const outputDir = mkdtempSync(path.join(os.tmpdir(), "autocode-eval-cli-"));
  const spawnOptions = {};
  spawnOptions.cwd = process.cwd();
  spawnOptions.encoding = "utf8";
  const result = spawnSync("pnpm", ["think:autocode-eval", "--fixture", "typescript-basic", "--mode", "execute", "--keep-temp", "--output", outputDir], spawnOptions);
  assert.equal(result.status, 0, `autocode-eval failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  assert.ok(result.stdout.includes("Checks passed: true"));
  assert.ok(existsSync(path.join(outputDir, "autocode-eval-plan.json")));
  assert.ok(existsSync(path.join(outputDir, "autocode-eval-run-report.json")));
  assert.ok(existsSync(path.join(outputDir, "autocode-eval-summary.md")));
  assert.ok(existsSync(path.join(outputDir, "autocode-eval-fixtures")));
});