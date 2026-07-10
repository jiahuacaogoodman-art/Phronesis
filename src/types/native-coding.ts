import type { CommandPolicyViolation, SafeCommandResult } from "./command-execution.js";
import type { AcceptanceCriterionResult, CodingCommandRun, CodingTestResult } from "./coding-result.js";

export type AutocodeMode = "dry-run" | "plan-only" | "execute";

export interface RepoAnalysis {
  repoPath: string;
  detectedLanguages: string[];
  packageManagers: string[];
  frameworkSignals: string[];
  testCommands: string[];
  buildCommands: string[];
  lintCommands: string[];
  typecheckCommands: string[];
  sourceRoots: string[];
  testRoots: string[];
  migrationRoots: string[];
  configFiles: string[];
  projectMarkers: string[];
  gitStatus: string[];
  isClean: boolean;
  risks: string[];
}

export interface CodebaseIndex {
  repoPath: string;
  fileTree: string[];
  indexedFiles: Array<{
    path: string;
    kind: string;
    sizeBytes: number;
    summary: string;
  }>;
  keyManifests: string[];
  testFiles: string[];
  schemaOrMigrationFiles: string[];
  apiServiceModelFiles: string[];
  excludedPatterns: string[];
  limits: {
    maxFiles: number;
    maxChars: number;
    filesIndexed: number;
    charsIndexed: number;
  };
}

export interface RepoContextPack {
  repoPath: string;
  summary: string;
  manifests: string[];
  sourceAreas: string[];
  testAreas: string[];
  relevantFiles: Array<{
    path: string;
    kind: string;
    summary: string;
  }>;
  compressionPolicy: string[];
}

export interface ImplementationBatch {
  batchId: string;
  title: string;
  tasks: string[];
  dependencies: string[];
  plannedFileAreas: string[];
  expectedOutputs: string[];
  acceptanceCriteria: string[];
  testsToRun: string[];
  riskLevel: string;
  stopConditions: string[];
}

export interface ImplementationBatchPlan {
  runId: string;
  targetRepo: string;
  batches: ImplementationBatch[];
  executionPolicy: string[];
  selectedByDefault: string;
}

export type NativePatchOperationType = "createFile" | "replaceFile" | "patchFile" | "deleteFile" | "appendFile" | "mkdir";

interface NativePatchOperationBase {
  path: string;
  rationale: string;
  safetyCheck: string;
}

export interface CreateFileOperation extends NativePatchOperationBase {
  type: "createFile";
  content: string;
}

export interface ReplaceFileOperation extends NativePatchOperationBase {
  type: "replaceFile";
  content: string;
}

export interface AppendFileOperation extends NativePatchOperationBase {
  type: "appendFile";
  content: string;
}

export interface PatchFileOperation extends NativePatchOperationBase {
  type: "patchFile";
  find: string;
  replace: string;
}

export interface DeleteFileOperation extends NativePatchOperationBase {
  type: "deleteFile";
}

export interface MakeDirectoryOperation extends NativePatchOperationBase {
  type: "mkdir";
}

export type NativePatchOperation =
  | CreateFileOperation
  | ReplaceFileOperation
  | AppendFileOperation
  | PatchFileOperation
  | DeleteFileOperation
  | MakeDirectoryOperation;

export interface NativePatchPlan {
  batchId: string;
  summary: string;
  operations: NativePatchOperation[];
  expectedFilesChanged: string[];
  expectedTests: string[];
  riskNotes: string[];
  rollbackPlan: string[];
  confidence: number;
}

export interface AppliedPatches {
  batchId: string;
  dryRun: boolean;
  operations: Array<{
    path: string;
    type: NativePatchOperationType;
    status: "applied" | "rejected" | "rolled-back" | "dry-run";
    reason?: string;
  }>;
  filesChanged: string[];
  rolledBack: boolean;
  errors: string[];
}

export interface TestRunReport {
  commands: string[];
  exitCodes: number[];
  stdoutSummary: string[];
  stderrSummary: string[];
  failedTests: string[];
  durationMs: number;
  success: boolean;
  commandExecutions: SafeCommandResult[];
  policyViolations: CommandPolicyViolation[];
  outputTruncated: boolean;
}

export interface FailureContext {
  failureType: string;
  failedCommand: string;
  relevantErrorLines: string[];
  likelyCauses: string[];
  filesLikelyInvolved: string[];
  repairHints: string[];
  shouldAttemptRepair: boolean;
}

export interface RepairLoopReport {
  iterations: Array<{
    iteration: number;
    repairPlan: NativePatchPlan;
    applied: AppliedPatches;
    testReport: TestRunReport;
    success: boolean;
  }>;
  patchesApplied: number;
  testsRun: number;
  failures: FailureContext[];
  repairsAttempted: number;
  finalStatus: string;
  stoppedReason: string;
}

export interface CodeReviewReport {
  allowedChangeAreaViolations: string[];
  forbiddenActionViolations: string[];
  acceptanceCriteriaFindings: string[];
  hardcodeWarnings: string[];
  testCoverageWarnings: string[];
  needsPlannerRevision: boolean;
  summary: string;
}

export interface AutonomousCodingResult {
  status: "completed" | "partial" | "failed" | "blocked" | "rejected";
  runId: string;
  targetRepo: string;
  batchesAttempted: string[];
  filesChanged: string[];
  testsRun: string[];
  testResults: unknown[];
  acceptanceCriteriaResults: unknown[];
  commandExecutions: SafeCommandResult[];
  policyViolations: CommandPolicyViolation[];
  forbiddenActionViolations: string[];
  allowedChangeAreaViolations: string[];
  implementationSummary: string;
  failureSummary: string;
  needsPlannerRevision: boolean;
}

export interface NativeAutonomousCodingResult extends AutonomousCodingResult {
  handoffRunId: string;
  codingAgentName: "NativeAutonomousCodingRuntime";
  codingTaskId: string;
  filesCreated: string[];
  filesDeleted: string[];
  commandsRun: CodingCommandRun[];
  testResults: CodingTestResult[];
  acceptanceCriteriaResults: AcceptanceCriterionResult[];
  unresolvedQuestions: string[];
  reason?: string;
}

export interface NativeAutocodeOptions {
  runDir: string;
  targetRepo: string;
  mode?: AutocodeMode;
  batch?: "first" | "all" | string;
  maxFiles?: number;
  maxChars?: number;
  maxIterations?: number;
  allowDirty?: boolean;
  skipTests?: boolean;
  testCommand?: string;
}

export interface NativeAutocodeRunResult {
  status: NativeAutonomousCodingResult["status"];
  runDir: string;
  repoAnalysis: RepoAnalysis;
  codebaseIndex?: CodebaseIndex;
  repoContextPack?: RepoContextPack;
  batchPlan?: ImplementationBatchPlan;
  patchPlan?: NativePatchPlan;
  applied?: AppliedPatches;
  testReport?: TestRunReport;
  failureContext?: FailureContext;
  repairLoopReport?: RepairLoopReport;
  codeReviewReport?: CodeReviewReport;
  autonomousCodingResult: NativeAutonomousCodingResult;
}