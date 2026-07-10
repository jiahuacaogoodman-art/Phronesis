import path from "node:path";
import type { CommandPolicy, CommandPolicyDecision, CommandPolicyViolation, CommandSpec } from "../types/command-execution.js";

const defaultDeniedArguments = [
  /^(?:&&|\|\||;|\||>|<)$/,
  /\$\(|`|[\r\n]/,
];

const networkSubcommands: Readonly<Record<string, ReadonlySet<string>>> = {
  npm: new Set(["audit", "login", "logout", "ping", "publish", "search", "star", "stars", "unpublish", "view", "whoami"]),
  pnpm: new Set(["audit", "deploy", "dlx", "fetch", "publish", "search", "server", "store"]),
  yarn: new Set(["add", "audit", "dlx", "info", "npm", "publish", "search", "set", "upgrade"]),
  cargo: new Set(["install", "login", "owner", "publish", "search", "yank"]),
  go: new Set(["get", "install"]),
};

export function createDefaultCommandPolicy(allowedWorkingRoots: string[]): CommandPolicy {
  return {
    allowedExecutables: ["pnpm", "npm", "yarn", "node", "npx", "python", "python3", "pytest", "go", "cargo", "git"],
    deniedExecutables: ["sudo", "su", "ssh", "scp", "curl", "wget", "bash", "sh", "zsh", "powershell", "cmd", "rm", "mkfs", "dd", "chmod", "chown", "kill", "pkill"],
    deniedArgumentPatterns: defaultDeniedArguments,
    maxTimeoutMs: 120_000,
    maxOutputBytes: 256_000,
    allowNetwork: false,
    allowGitWrite: false,
    allowPackageInstall: false,
    allowShell: false,
    allowedWorkingRoots: allowedWorkingRoots.map((root) => path.resolve(root)),
    allowedBinaryRoots: [],
  };
}

function isInsideRoot(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function push(violations: CommandPolicyViolation[], code: CommandPolicyViolation["code"], message: string): void {
  violations.push({ code, message });
}

function isPackageInstall(spec: CommandSpec): boolean {
  const executable = path.basename(spec.executable).toLowerCase();
  const first = spec.args[0]?.toLowerCase();
  if (executable === "npx") return true;
  if (executable === "pnpm" || executable === "npm" || executable === "yarn") {
    return first === "install" || first === "i" || first === "add" || first === "dlx";
  }
  if (executable === "cargo") return first === "install";
  if (executable === "go") return first === "get" || first === "install";
  return false;
}

function isGitWrite(spec: CommandSpec): boolean {
  if (path.basename(spec.executable).toLowerCase() !== "git") return false;
  const readOnly = new Set(["status", "diff", "rev-parse", "ls-files"]);
  return !readOnly.has(spec.args[0] ?? "");
}

function requiresNetwork(spec: CommandSpec): boolean {
  const executable = path.basename(spec.executable).toLowerCase();
  if (["curl", "wget", "ssh", "scp"].includes(executable)) return true;
  if (executable === "npx") return true;
  return networkSubcommands[executable]?.has(spec.args[0]?.toLowerCase() ?? "") ?? false;
}

export function evaluateCommandPolicy(spec: CommandSpec, policy: CommandPolicy): CommandPolicyDecision {
  const violations: CommandPolicyViolation[] = [];
  const executableName = path.basename(spec.executable).toLowerCase();
  if (policy.deniedExecutables.includes(executableName)) {
    push(violations, "EXECUTABLE_DENIED", `Executable is denied: ${executableName}.`);
  }
  if (!policy.allowedExecutables.includes(executableName)) {
    push(violations, "EXECUTABLE_NOT_ALLOWED", `Executable is not allowlisted: ${executableName}.`);
  }
  if (path.isAbsolute(spec.executable) && !policy.allowedBinaryRoots.some((root) => isInsideRoot(spec.executable, path.resolve(root)))) {
    push(violations, "ABSOLUTE_EXECUTABLE_DENIED", "Absolute executable paths require an allowlisted binary root.");
  }
  for (const argument of spec.args) {
    if (policy.deniedArgumentPatterns.some((pattern) => pattern.test(argument))) {
      push(violations, "ARGUMENT_PATTERN_DENIED", `Argument contains denied shell syntax: ${argument}.`);
    }
  }
  const cwd = path.resolve(spec.cwd);
  if (!policy.allowedWorkingRoots.some((root) => isInsideRoot(cwd, path.resolve(root)))) {
    push(violations, "WORKING_DIRECTORY_DENIED", `Working directory is outside allowed roots: ${cwd}.`);
  }
  if (spec.timeoutMs <= 0 || spec.timeoutMs > policy.maxTimeoutMs) {
    push(violations, "TIMEOUT_EXCEEDS_LIMIT", `Timeout ${spec.timeoutMs}ms exceeds policy maximum ${policy.maxTimeoutMs}ms.`);
  }
  if (requiresNetwork(spec) && !policy.allowNetwork) {
    push(violations, "NETWORK_DENIED", "Command requires network access, which is disabled by policy.");
  }
  if (isGitWrite(spec) && !policy.allowGitWrite) {
    push(violations, "GIT_WRITE_DENIED", `Git subcommand is not read-only: ${spec.args[0] ?? "missing"}.`);
  }
  if (isPackageInstall(spec) && !policy.allowPackageInstall) {
    push(violations, "PACKAGE_INSTALL_DENIED", "Package installation and package-on-demand execution are disabled.");
  }
  return { allowed: violations.length === 0, violations };
}