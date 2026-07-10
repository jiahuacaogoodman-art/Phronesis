export interface CommandSpec {
  executable: string;
  args: string[];
  cwd: string;
  purpose: string;
  timeoutMs: number;
  allowedEnvKeys: string[];
}

export interface CommandPolicy {
  allowedExecutables: string[];
  deniedExecutables: string[];
  deniedArgumentPatterns: RegExp[];
  maxTimeoutMs: number;
  maxOutputBytes: number;
  allowNetwork: boolean;
  allowGitWrite: boolean;
  allowPackageInstall: boolean;
  allowShell: boolean;
  allowedWorkingRoots: string[];
  allowedBinaryRoots: string[];
}

export type CommandPolicyViolationCode =
  | "EXECUTABLE_NOT_ALLOWED"
  | "EXECUTABLE_DENIED"
  | "ABSOLUTE_EXECUTABLE_DENIED"
  | "ARGUMENT_PATTERN_DENIED"
  | "WORKING_DIRECTORY_DENIED"
  | "TIMEOUT_EXCEEDS_LIMIT"
  | "SHELL_DENIED"
  | "NETWORK_DENIED"
  | "GIT_WRITE_DENIED"
  | "PACKAGE_INSTALL_DENIED"
  | "COMMAND_PARSE_FAILED"
  | "ENV_PREFIX_DENIED";

export interface CommandPolicyViolation {
  code: CommandPolicyViolationCode;
  message: string;
}

export interface CommandPolicyDecision {
  allowed: boolean;
  violations: CommandPolicyViolation[];
}

export type CommandParseResult =
  | { ok: true; command: Pick<CommandSpec, "executable" | "args"> }
  | { ok: false; violations: CommandPolicyViolation[] };

export interface SafeCommandResult {
  commandSpec: CommandSpec;
  policyDecision: CommandPolicyDecision;
  policyViolations: CommandPolicyViolation[];
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  durationMs: number;
  stdoutSummary: string[];
  stderrSummary: string[];
  outputTruncated: boolean;
  timedOut: boolean;
  envKeysPassed: string[];
}

export interface SafeCommandRunnerOptions {
  policy: CommandPolicy;
  baseEnv?: NodeJS.ProcessEnv;
}