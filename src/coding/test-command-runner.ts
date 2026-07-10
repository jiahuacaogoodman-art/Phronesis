import path from "node:path";
import type { ImplementationBatch, RepoAnalysis, TestRunReport } from "../types/native-coding.js";
import type { CommandPolicy, CommandPolicyViolation, CommandSpec, SafeCommandResult } from "../types/command-execution.js";
import { parseCommand } from "../security/command-parser.js";
import { createDefaultCommandPolicy } from "../security/command-policy.js";
import { runSafeCommand } from "../security/safe-command-runner.js";

export interface TestCommandRunnerInput {
  targetRepo: string;
  testCommand?: string;
  batch?: Pick<ImplementationBatch, "testsToRun">;
  repoAnalysis?: Pick<RepoAnalysis, "testCommands">;
  skipTests?: boolean;
  timeoutMs?: number;
  allowedEnvKeys?: string[];
  commandPolicy?: CommandPolicy;
}

export function selectTestCommands(input: TestCommandRunnerInput): string[] {
  if (input.skipTests) return [];
  if (input.testCommand) return [input.testCommand];
  if ((input.batch?.testsToRun ?? []).length > 0) return input.batch?.testsToRun ?? [];
  if ((input.repoAnalysis?.testCommands ?? []).length > 0) return input.repoAnalysis?.testCommands ?? [];
  return [];
}

function rejectedExecution(command: string, cwd: string, violations: CommandPolicyViolation[]): SafeCommandResult {
  const parsed = parseCommand(command);
  const commandSpec: CommandSpec = {
    executable: parsed.ok ? parsed.command.executable : "[unparsed]",
    args: parsed.ok ? parsed.command.args : [],
    cwd,
    purpose: "project verification",
    timeoutMs: 0,
    allowedEnvKeys: [],
  };
  return {
    commandSpec,
    policyDecision: { allowed: false, violations },
    policyViolations: violations,
    exitCode: null,
    signal: null,
    durationMs: 0,
    stdoutSummary: [],
    stderrSummary: violations.map((item) => item.message),
    outputTruncated: false,
    timedOut: false,
    envKeysPassed: [],
  };
}

export async function runTestCommands(input: TestCommandRunnerInput): Promise<TestRunReport> {
  const repoPath = path.resolve(process.cwd(), input.targetRepo);
  const commands = selectTestCommands(input);
  const policy = input.commandPolicy ?? createDefaultCommandPolicy([repoPath]);
  const executions: SafeCommandResult[] = [];
  const started = Date.now();

  for (const command of commands) {
    const parsed = parseCommand(command);
    if (!parsed.ok) {
      executions.push(rejectedExecution(command, repoPath, parsed.violations));
      continue;
    }
    const commandSpec: CommandSpec = {
      executable: parsed.command.executable,
      args: parsed.command.args,
      cwd: repoPath,
      purpose: "run required project verification",
      timeoutMs: Math.min(input.timeoutMs ?? policy.maxTimeoutMs, policy.maxTimeoutMs),
      allowedEnvKeys: input.allowedEnvKeys ?? [],
    };
    executions.push(await runSafeCommand(commandSpec, { policy }));
  }

  const exitCodes = executions.map((execution) => execution.exitCode ?? 1);
  const stdoutSummary = executions.flatMap((execution) => execution.stdoutSummary).slice(-40);
  const stderrSummary = executions.flatMap((execution) => execution.stderrSummary).slice(-40);
  const policyViolations = executions.flatMap((execution) => execution.policyViolations);
  const failedTests = [...stdoutSummary, ...stderrSummary]
    .filter((line) => /fail|failed|error|assertion|traceback|TS\d+/i.test(line))
    .slice(0, 40);

  return {
    commands,
    exitCodes,
    stdoutSummary,
    stderrSummary,
    failedTests,
    durationMs: Date.now() - started,
    success: commands.length === 0 ? true : executions.every((execution) => execution.policyDecision.allowed && execution.exitCode === 0 && !execution.timedOut),
    commandExecutions: executions,
    policyViolations,
    outputTruncated: executions.some((execution) => execution.outputTruncated),
  };
}