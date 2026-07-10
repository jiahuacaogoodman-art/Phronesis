import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { CodeReviewReport, ImplementationBatch, TestRunReport } from "../types/native-coding.js";

interface ReviewInput {
  targetRepo: string;
  filesChanged: string[];
  allowedChangeAreas: string[];
  forbiddenChangeAreas: string[];
  batch?: Pick<ImplementationBatch, "acceptanceCriteria">;
  testRunReport?: Partial<TestRunReport>;
}

function normalize(value: string): string {
  return String(value ?? "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function areaTokens(areas: string[]): string[] {
  return (areas ?? [])
    .flatMap((area) => String(area).match(/(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.*/-]*|[A-Za-z0-9_.-]+\.[A-Za-z0-9]+/g) ?? [])
    .map((item) => normalize(item.replace(/\*.*$/, "")))
    .filter(Boolean);
}

function matchesArea(file: string, area: string): boolean {
  const normalizedFile = normalize(file);
  const normalizedArea = normalize(area);
  if (normalizedArea.endsWith("/")) return normalizedFile.startsWith(normalizedArea);
  return normalizedFile === normalizedArea || normalizedFile.startsWith(`${normalizedArea}/`) || normalizedFile.includes(normalizedArea);
}

function hardcodeWarnings(repoPath: string, filesChanged: string[]): string[] {
  const warnings: string[] = [];
  for (const file of filesChanged ?? []) {
    const fullPath = path.join(repoPath, file);
    if (!existsSync(fullPath)) continue;
    const text = readFileSync(fullPath, "utf8").slice(0, 50_000);
    if (/api[_-]?key|secret|password\s*=\s*["'][^"']+["']/i.test(text)) {
      warnings.push(`${file} may contain hardcoded secret-like text.`);
    }
    if (/localhost:\d+|127\.0\.0\.1:\d+/.test(text)) {
      warnings.push(`${file} contains local endpoint hardcode.`);
    }
  }
  return warnings;
}

export function reviewNativeCodingResult(input: ReviewInput): CodeReviewReport {
  const repoPath = path.resolve(process.cwd(), input.targetRepo);
  const filesChanged = input.filesChanged ?? [];
  const allowedAreas = areaTokens(input.allowedChangeAreas ?? []);
  const forbiddenAreas = areaTokens(input.forbiddenChangeAreas ?? []);
  const allowedChangeAreaViolations = allowedAreas.length === 0
    ? filesChanged.map((file) => `${file} cannot be verified because no concrete allowedChangeAreas were available.`)
    : filesChanged.filter((file) => !allowedAreas.some((area) => matchesArea(file, area)));
  const forbiddenActionViolations = filesChanged.filter((file) => forbiddenAreas.some((area) => matchesArea(file, area)));
  const acceptanceCriteriaFindings = (input.batch?.acceptanceCriteria ?? []).map((criterion) =>
    `${criterion}: ${input.testRunReport?.success ? "needs-human-review" : "not-verified-due-to-test-failure"}`,
  );
  const testCoverageWarnings: string[] = [];
  if ((input.testRunReport?.commands ?? []).length === 0) {
    testCoverageWarnings.push("No tests were run for this batch.");
  }
  if (input.testRunReport && !input.testRunReport.success) {
    testCoverageWarnings.push("Tests failed, so acceptance cannot be marked complete.");
  }
  const hardcodes = hardcodeWarnings(repoPath, filesChanged);
  const needsPlannerRevision = allowedChangeAreaViolations.length > 0 ||
    forbiddenActionViolations.length > 0 ||
    testCoverageWarnings.length > 0 ||
    hardcodes.length > 0;
  return {
    allowedChangeAreaViolations,
    forbiddenActionViolations,
    acceptanceCriteriaFindings,
    hardcodeWarnings: hardcodes,
    testCoverageWarnings,
    needsPlannerRevision,
    summary: needsPlannerRevision
      ? "Native code review found issues that should be resolved before accepting the coding result."
      : "Native code review found no local policy violations.",
  };
}