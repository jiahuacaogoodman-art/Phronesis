import type { AppliedPatches, FailureContext, TestRunReport } from "../types/native-coding.js";

interface BuildFailureInput {
  testRunReport: Partial<TestRunReport>;
  appliedPatches?: Partial<AppliedPatches>;
}

function relevantLines(report: Partial<TestRunReport>): string[] {
  return [
    ...(report.stdoutSummary ?? []),
    ...(report.stderrSummary ?? []),
    ...(report.failedTests ?? []),
  ]
    .map((line) => String(line).trim())
    .filter((line) => /error|fail|failed|assertion|traceback|TS\d+|exception/i.test(line))
    .slice(0, 40);
}

function failureType(lines: string[], commands: string[]): string {
  const text = `${commands.join("\n")}\n${lines.join("\n")}`;
  if (/TS\d+|tsc|typescript/i.test(text)) return "typescript";
  if (/pytest|AssertionError|FAILED|Traceback/i.test(text)) return "pytest";
  if (/lint|eslint/i.test(text)) return "lint";
  if (/build/i.test(text)) return "build";
  return "test";
}

function filesFromLines(lines: string[]): string[] {
  const files: string[] = [];
  for (const line of lines) {
    const matches = line.match(/(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\.[A-Za-z0-9]+|[A-Za-z0-9_.-]+\.[tj]sx?|[A-Za-z0-9_.-]+\.py/g) ?? [];
    files.push(...matches);
  }
  return Array.from(new Set(files)).slice(0, 20);
}

function likelyCausesFor(type: string): string[] {
  if (type === "typescript") return ["Type mismatch or missing export/import in changed TypeScript files.", "Patch may not match existing project types."];
  if (type === "pytest") return ["Python behavior or fixture expectation failed.", "Patch may not satisfy domain logic or test setup."];
  if (type === "lint") return ["Formatting, unused code, or style rule violation."];
  if (type === "build") return ["Build pipeline failed after patch application."];
  return ["Test command failed after native patch application."];
}

export function analyzeBuildFailure(input: BuildFailureInput): FailureContext {
  const report = input.testRunReport;
  const lines = relevantLines(report);
  const type = failureType(lines, report.commands ?? []);
  return {
    failureType: type,
    failedCommand: (report.commands ?? []).find((_, index) => (report.exitCodes ?? [])[index] !== 0) ?? (report.commands ?? [])[0] ?? "",
    relevantErrorLines: lines,
    likelyCauses: likelyCausesFor(type),
    filesLikelyInvolved: filesFromLines(lines),
    repairHints: [
      "Inspect only files touched by the current batch and files named in error lines.",
      "Generate the smallest repair operation that addresses the failing command.",
      "Do not widen scope beyond allowed change areas.",
    ],
    shouldAttemptRepair: lines.length > 0,
  };
}