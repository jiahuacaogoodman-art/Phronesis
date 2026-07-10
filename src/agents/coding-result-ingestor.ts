import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseCodingHandoffArtifact, parseCodingTaskPackageArtifact } from "../coding/runtime-artifact-loader.js";
import { redactSecretText, redactSecrets } from "../security/secret-redactor.js";
import type { CodingHandoff, CodingTaskPackage } from "../types/coding-handoff.js";
import type {
  AcceptanceCriterionResult,
  CodingCommandRun,
  CodingFailureAnalysis,
  CodingFeedbackReport,
  CodingResult,
  CodingResultStatus,
  CodingResultValidation,
  CodingTestResult,
} from "../types/coding-result.js";
import type { CommandPolicyViolation, CommandPolicyViolationCode, CommandSpec, SafeCommandResult } from "../types/command-execution.js";
import { analyzeCodingFeedback } from "./coding-feedback-analyzer.js";

export interface IngestCodingResultOptions {
  handoffPath: string;
  resultPath: string;
}

export interface IngestCodingResultResult {
  runDir: string;
  handoff: CodingHandoff;
  codingResult: CodingResult;
  taskPackage?: CodingTaskPackage;
  validation: CodingResultValidation;
  failureAnalysis: CodingFailureAnalysis;
  feedbackReport: CodingFeedbackReport;
}

const policyViolationCodes = new Set<CommandPolicyViolationCode>([
  "EXECUTABLE_NOT_ALLOWED", "EXECUTABLE_DENIED", "ABSOLUTE_EXECUTABLE_DENIED", "ARGUMENT_PATTERN_DENIED",
  "WORKING_DIRECTORY_DENIED", "TIMEOUT_EXCEEDS_LIMIT", "SHELL_DENIED", "NETWORK_DENIED", "GIT_WRITE_DENIED",
  "PACKAGE_INSTALL_DENIED", "COMMAND_PARSE_FAILED", "ENV_PREFIX_DENIED",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readJsonUnknown(filePath: string): unknown {
  const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8"));
  return parsed;
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(redactSecrets(value), null, 2)}\n`, "utf8");
}

function uniq(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)));
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parsePolicyViolation(value: unknown): CommandPolicyViolation | undefined {
  if (!isRecord(value) || typeof value.code !== "string" || !policyViolationCodes.has(value.code as CommandPolicyViolationCode)) return undefined;
  return { code: value.code as CommandPolicyViolationCode, message: stringValue(value.message, value.code) };
}

function policyViolations(value: unknown): CommandPolicyViolation[] {
  return Array.isArray(value)
    ? value.map(parsePolicyViolation).filter((item): item is CommandPolicyViolation => item !== undefined)
    : [];
}

function parseCommandSpec(value: unknown): CommandSpec | undefined {
  if (!isRecord(value) || typeof value.executable !== "string" || typeof value.cwd !== "string") return undefined;
  return {
    executable: value.executable,
    args: stringArray(value.args),
    cwd: value.cwd,
    purpose: stringValue(value.purpose),
    timeoutMs: numberValue(value.timeoutMs) ?? 0,
    allowedEnvKeys: stringArray(value.allowedEnvKeys),
  };
}

function parseSafeCommandResult(value: unknown): SafeCommandResult | undefined {
  if (!isRecord(value)) return undefined;
  const commandSpec = parseCommandSpec(value.commandSpec);
  const decisionRecord = isRecord(value.policyDecision) ? value.policyDecision : undefined;
  if (!commandSpec || !decisionRecord) return undefined;
  const violations = policyViolations(value.policyViolations);
  const decisionViolations = policyViolations(decisionRecord.violations);
  return {
    commandSpec,
    policyDecision: { allowed: decisionRecord.allowed === true, violations: decisionViolations },
    policyViolations: violations,
    exitCode: value.exitCode === null ? null : numberValue(value.exitCode) ?? null,
    signal: typeof value.signal === "string" ? value.signal as NodeJS.Signals : null,
    durationMs: numberValue(value.durationMs) ?? 0,
    stdoutSummary: stringArray(value.stdoutSummary),
    stderrSummary: stringArray(value.stderrSummary),
    outputTruncated: value.outputTruncated === true,
    timedOut: value.timedOut === true,
    envKeysPassed: stringArray(value.envKeysPassed),
  };
}

function parseCommandRun(value: unknown): CodingCommandRun | undefined {
  if (!isRecord(value) || typeof value.command !== "string") return undefined;
  const commandSpec = parseCommandSpec(value.commandSpec);
  const decisionRecord = isRecord(value.policyDecision) ? value.policyDecision : undefined;
  return {
    command: value.command,
    commandSpec,
    policyDecision: decisionRecord ? { allowed: decisionRecord.allowed === true, violations: policyViolations(decisionRecord.violations) } : undefined,
    policyViolations: policyViolations(value.policyViolations),
    exitCode: numberValue(value.exitCode),
    durationMs: numberValue(value.durationMs),
    stdoutPreview: typeof value.stdoutPreview === "string" ? value.stdoutPreview : undefined,
    stderrPreview: typeof value.stderrPreview === "string" ? value.stderrPreview : undefined,
  };
}

function parseTestResult(value: unknown): CodingTestResult | undefined {
  if (!isRecord(value) || typeof value.name !== "string") return undefined;
  const status = value.status === "passed" || value.status === "failed" || value.status === "skipped" ? value.status : undefined;
  return {
    name: value.name,
    command: typeof value.command === "string" ? value.command : undefined,
    status,
    passed: typeof value.passed === "boolean" ? value.passed : undefined,
    exitCode: numberValue(value.exitCode),
    details: typeof value.details === "string" ? value.details : undefined,
  };
}

function parseAcceptanceResult(value: unknown): AcceptanceCriterionResult | undefined {
  if (!isRecord(value) || typeof value.criterion !== "string") return undefined;
  const status = value.status === "passed" || value.status === "failed" || value.status === "missing" || value.status === "not-run" ? value.status : undefined;
  return {
    criterion: value.criterion,
    status,
    passed: typeof value.passed === "boolean" ? value.passed : undefined,
    evidence: typeof value.evidence === "string" ? value.evidence : undefined,
    notes: typeof value.notes === "string" ? value.notes : undefined,
  };
}

function codingStatus(value: unknown): CodingResultStatus {
  return value === "completed" || value === "partial" || value === "failed" || value === "blocked" || value === "rejected" ? value : "rejected";
}

function parseCodingResult(value: unknown): CodingResult {
  const record = isRecord(value) ? value : {};
  return {
    handoffRunId: stringValue(record.handoffRunId),
    codingAgentName: stringValue(record.codingAgentName, "unknown-coding-agent"),
    codingTaskId: stringValue(record.codingTaskId, "unknown-task"),
    status: codingStatus(record.status),
    filesChanged: stringArray(record.filesChanged),
    filesCreated: stringArray(record.filesCreated),
    filesDeleted: stringArray(record.filesDeleted),
    commandsRun: Array.isArray(record.commandsRun) ? record.commandsRun.map(parseCommandRun).filter((item): item is CodingCommandRun => item !== undefined) : [],
    testsRun: stringArray(record.testsRun),
    testResults: Array.isArray(record.testResults) ? record.testResults.map(parseTestResult).filter((item): item is CodingTestResult => item !== undefined) : [],
    acceptanceCriteriaResults: Array.isArray(record.acceptanceCriteriaResults) ? record.acceptanceCriteriaResults.map(parseAcceptanceResult).filter((item): item is AcceptanceCriterionResult => item !== undefined) : [],
    commandExecutions: Array.isArray(record.commandExecutions) ? record.commandExecutions.map(parseSafeCommandResult).filter((item): item is SafeCommandResult => item !== undefined) : [],
    policyViolations: policyViolations(record.policyViolations),
    forbiddenActionViolations: stringArray(record.forbiddenActionViolations),
    allowedChangeAreaViolations: stringArray(record.allowedChangeAreaViolations),
    unresolvedQuestions: stringArray(record.unresolvedQuestions),
    implementationSummary: stringValue(record.implementationSummary),
    failureSummary: stringValue(record.failureSummary),
    needsPlannerRevision: record.needsPlannerRevision === true,
  };
}

function normalizePathLike(value: string): string {
  return value.trim().replace(/\\/g, "/").replace(/^\.\//, "");
}

function pathTokensFromText(text: string): string[] {
  const matches = text.match(/(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.*/-]*|[A-Za-z0-9_.-]+\.[A-Za-z0-9]+/g) ?? [];
  return matches.map((item) => normalizePathLike(item.replace(/\*.*$/, ""))).filter((item) => item.length > 0 && !["json", "md"].includes(item));
}

function concreteAreas(areas: string[]): string[] {
  return uniq(areas.flatMap(pathTokensFromText));
}

function areaMatchesFile(area: string, filePath: string): boolean {
  const areaPath = normalizePathLike(area);
  const file = normalizePathLike(filePath);
  if (!areaPath || !file) return false;
  return areaPath.endsWith("/") ? file.startsWith(areaPath) : file === areaPath || file.startsWith(`${areaPath}/`) || file.includes(areaPath);
}

function allTouchedFiles(codingResult: CodingResult): string[] {
  return uniq([...codingResult.filesChanged, ...codingResult.filesCreated, ...codingResult.filesDeleted]).map(normalizePathLike);
}

function isImplementationResult(codingResult: CodingResult): boolean {
  return ["completed", "partial", "failed"].includes(codingResult.status) || allTouchedFiles(codingResult).length > 0 || Boolean(codingResult.implementationSummary);
}

function taskIdsFor(handoff: CodingHandoff): string[] {
  return uniq([...handoff.approvedCodingTasks, ...handoff.conditionalCodingTasks]);
}

function findTaskPackage(runDir: string, taskId: string): CodingTaskPackage | undefined {
  const packageDir = path.join(runDir, "coding-task-packages");
  if (!existsSync(packageDir)) return undefined;
  for (const fileName of readdirSync(packageDir)) {
    if (!fileName.endsWith(".json")) continue;
    const taskPackage = parseCodingTaskPackageArtifact(readJsonUnknown(path.join(packageDir, fileName)));
    if (taskPackage?.taskId === taskId) return taskPackage;
  }
  return undefined;
}

function validateAllowedChangeAreas(codingResult: CodingResult, taskPackage: CodingTaskPackage | undefined): string[] {
  const files = allTouchedFiles(codingResult);
  const allowedAreas = concreteAreas(taskPackage?.allowedChangeAreas ?? []);
  if (files.length === 0 || allowedAreas.length === 0) return uniq(codingResult.allowedChangeAreaViolations);
  const detected = files.filter((file) => !allowedAreas.some((area) => areaMatchesFile(area, file))).map((file) => `${file} is outside allowedChangeAreas: ${allowedAreas.join(", ")}`);
  return uniq([...codingResult.allowedChangeAreaViolations, ...detected]);
}

function validateForbiddenChangeAreas(codingResult: CodingResult, handoff: CodingHandoff, taskPackage: CodingTaskPackage | undefined): string[] {
  const forbiddenAreas = uniq([...concreteAreas(taskPackage?.forbiddenChangeAreas ?? []), ...concreteAreas(handoff.forbiddenActions)]);
  const detected = allTouchedFiles(codingResult).filter((file) => forbiddenAreas.some((area) => areaMatchesFile(area, file))).map((file) => `${file} hits forbiddenChangeAreas: ${forbiddenAreas.join(", ")}`);
  const policy = codingResult.policyViolations?.map((item) => `Command policy violation: ${item.code} - ${item.message}`) ?? [];
  return uniq([...codingResult.forbiddenActionViolations, ...detected, ...policy]);
}

function testResultFailed(result: CodingTestResult): boolean {
  return result.status === "failed" || result.passed === false || (typeof result.exitCode === "number" && result.exitCode !== 0);
}

function requirementCovered(requirement: string, codingResult: CodingResult): boolean {
  const needle = requirement.toLowerCase().trim();
  if (!needle) return true;
  const runText = [...codingResult.testsRun, ...codingResult.testResults.map((result) => `${result.name} ${result.command ?? ""}`), ...codingResult.commandsRun.map((command) => command.command)].join("\n").toLowerCase();
  return runText.includes(needle) || (runText.trim().length > 0 && needle.includes(runText.trim()));
}

function validateTests(codingResult: CodingResult, taskPackage: CodingTaskPackage | undefined): Pick<CodingResultValidation, "missingRequiredTests" | "failedTests"> {
  return {
    missingRequiredTests: (taskPackage?.testRequirements ?? []).filter((requirement) => !requirementCovered(requirement, codingResult)),
    failedTests: codingResult.testResults.filter(testResultFailed).map((result) => result.name || result.command || "unnamed test"),
  };
}

function acceptanceResultFailed(result: AcceptanceCriterionResult): boolean {
  return result.status === "failed" || result.status === "missing" || result.status === "not-run" || result.passed === false;
}

function findAcceptanceResult(criterion: string, codingResult: CodingResult): AcceptanceCriterionResult | undefined {
  const needle = criterion.toLowerCase().trim();
  return codingResult.acceptanceCriteriaResults.find((result) => {
    const candidate = result.criterion.toLowerCase().trim();
    return candidate === needle || candidate.includes(needle) || needle.includes(candidate);
  });
}

function validateAcceptanceCriteria(codingResult: CodingResult, taskPackage: CodingTaskPackage | undefined): Pick<CodingResultValidation, "incompleteAcceptanceCheck" | "failedAcceptanceCriteria"> {
  const incompleteAcceptanceCheck: string[] = [];
  const failedAcceptanceCriteria: string[] = [];
  for (const criterion of taskPackage?.acceptanceCriteria ?? []) {
    const result = findAcceptanceResult(criterion, codingResult);
    if (!result) incompleteAcceptanceCheck.push(criterion);
    else if (acceptanceResultFailed(result)) failedAcceptanceCriteria.push(criterion);
  }
  return { incompleteAcceptanceCheck, failedAcceptanceCriteria };
}

function validationFor(handoff: CodingHandoff, codingResult: CodingResult, taskPackage: CodingTaskPackage | undefined): CodingResultValidation {
  const testValidation = validateTests(codingResult, taskPackage);
  const acceptanceValidation = validateAcceptanceCriteria(codingResult, taskPackage);
  return {
    matchedHandoffRunId: codingResult.handoffRunId === handoff.runId,
    validTask: taskIdsFor(handoff).includes(codingResult.codingTaskId),
    forbiddenExecutionDetected: (handoff.handoffStatus === "blocked" || handoff.canProceedToCoding === false) && isImplementationResult(codingResult),
    allowedChangeAreaViolations: validateAllowedChangeAreas(codingResult, taskPackage),
    forbiddenActionViolations: validateForbiddenChangeAreas(codingResult, handoff, taskPackage),
    ...testValidation,
    ...acceptanceValidation,
  };
}

function feedbackReportFor(handoff: CodingHandoff, codingResult: CodingResult, validation: CodingResultValidation, failureAnalysis: CodingFailureAnalysis): CodingFeedbackReport {
  const needsPlannerRevision = codingResult.needsPlannerRevision || failureAnalysis.shouldRegenerateHandoff || failureAnalysis.shouldReopenRouteSelection || failureAnalysis.shouldUpdateProblemResolutionPlan;
  const valid = validation.matchedHandoffRunId && validation.validTask && !validation.forbiddenExecutionDetected &&
    validation.allowedChangeAreaViolations.length === 0 && validation.forbiddenActionViolations.length === 0 &&
    validation.missingRequiredTests.length === 0 && validation.incompleteAcceptanceCheck.length === 0 &&
    validation.failedTests.length === 0 && validation.failedAcceptanceCriteria.length === 0 &&
    codingResult.status === "completed" && !needsPlannerRevision;
  return {
    handoffRunId: handoff.runId,
    codingTaskId: codingResult.codingTaskId,
    codingAgentName: codingResult.codingAgentName,
    resultStatus: codingResult.status,
    handoffStatus: handoff.handoffStatus,
    canProceedToCoding: handoff.canProceedToCoding,
    valid,
    matchedHandoffRunId: validation.matchedHandoffRunId,
    validTask: validation.validTask,
    forbiddenExecutionDetected: validation.forbiddenExecutionDetected,
    allowedChangeAreaViolations: validation.allowedChangeAreaViolations,
    forbiddenActionViolations: validation.forbiddenActionViolations,
    missingRequiredTests: validation.missingRequiredTests,
    incompleteAcceptanceCheck: validation.incompleteAcceptanceCheck,
    failedTests: validation.failedTests,
    failedAcceptanceCriteria: validation.failedAcceptanceCriteria,
    unresolvedQuestions: codingResult.unresolvedQuestions,
    needsPlannerRevision,
    recommendedNextPlannerAction: failureAnalysis.recommendedNextPlannerAction,
    shouldStopCoding: failureAnalysis.shouldStopCoding,
    generatedArtifacts: ["coding-result.json", "coding-diff-summary.md", "coding-test-report.json", "coding-failure-analysis.json", "coding-feedback-report.json"],
  };
}

function buildDiffSummary(codingResult: CodingResult, feedbackReport: CodingFeedbackReport): string {
  return [
    "# Coding Diff Summary", "", `Coding agent: ${codingResult.codingAgentName}`, `Task: ${codingResult.codingTaskId}`, `Status: ${codingResult.status}`,
    "", "## Files Changed", ...codingResult.filesChanged.map((file) => `- ${file}`),
    "", "## Files Created", ...codingResult.filesCreated.map((file) => `- ${file}`),
    "", "## Files Deleted", ...codingResult.filesDeleted.map((file) => `- ${file}`),
    "", "## Implementation Summary", codingResult.implementationSummary || "No implementation summary provided.",
    "", "## Feedback", `Valid for handoff: ${feedbackReport.valid}`, `Recommended planner action: ${feedbackReport.recommendedNextPlannerAction}`,
  ].join("\n");
}

export async function ingestCodingResult(options: IngestCodingResultOptions): Promise<IngestCodingResultResult> {
  const handoffPath = path.resolve(process.cwd(), options.handoffPath);
  const resultPath = path.resolve(process.cwd(), options.resultPath);
  const runDir = path.dirname(handoffPath);
  const handoff = parseCodingHandoffArtifact(readJsonUnknown(handoffPath));
  const codingResult = parseCodingResult(readJsonUnknown(resultPath));
  const taskPackage = findTaskPackage(runDir, codingResult.codingTaskId);
  const validation = validationFor(handoff, codingResult, taskPackage);
  const failureAnalysis = analyzeCodingFeedback({ handoff, codingResult, taskPackage, validation });
  const feedbackReport = feedbackReportFor(handoff, codingResult, validation, failureAnalysis);
  await mkdir(runDir, { recursive: true });
  await writeJsonFile(path.join(runDir, "coding-result.json"), codingResult);
  await writeFile(path.join(runDir, "coding-diff-summary.md"), `${redactSecretText(buildDiffSummary(codingResult, feedbackReport)).trim()}\n`, "utf8");
  await writeJsonFile(path.join(runDir, "coding-test-report.json"), {
    testsRun: codingResult.testsRun,
    testResults: codingResult.testResults,
    missingRequiredTests: validation.missingRequiredTests,
    failedTests: validation.failedTests,
    commandsRun: codingResult.commandsRun,
    commandExecutions: codingResult.commandExecutions,
    policyViolations: codingResult.policyViolations,
  });
  await writeJsonFile(path.join(runDir, "coding-failure-analysis.json"), failureAnalysis);
  await writeJsonFile(path.join(runDir, "coding-feedback-report.json"), feedbackReport);
  return { runDir, handoff, codingResult, taskPackage, validation, failureAnalysis, feedbackReport };
}