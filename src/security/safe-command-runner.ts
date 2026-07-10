import { spawn } from "node:child_process";
import type { CommandPolicy, CommandSpec, SafeCommandResult, SafeCommandRunnerOptions } from "../types/command-execution.js";
import { evaluateCommandPolicy } from "./command-policy.js";
import { redactSecretText } from "./secret-redactor.js";

const defaultEnvKeys = ["PATH", "HOME", "TMPDIR"];

function restrictedEnvironment(spec: CommandSpec, baseEnv: NodeJS.ProcessEnv): { env: NodeJS.ProcessEnv; keys: string[] } {
  const keys = Array.from(new Set([...defaultEnvKeys, ...spec.allowedEnvKeys]));
  const env: NodeJS.ProcessEnv = {};
  for (const key of keys) {
    if (baseEnv[key] !== undefined) env[key] = baseEnv[key];
  }
  return { env, keys: Object.keys(env).sort() };
}

function summarizeOutput(value: string): string[] {
  return redactSecretText(value)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-40);
}

function rejectedResult(spec: CommandSpec, policy: CommandPolicy): SafeCommandResult {
  const decision = evaluateCommandPolicy(spec, policy);
  return {
    commandSpec: spec,
    policyDecision: decision,
    policyViolations: decision.violations,
    exitCode: null,
    signal: null,
    durationMs: 0,
    stdoutSummary: [],
    stderrSummary: decision.violations.map((item) => item.message),
    outputTruncated: false,
    timedOut: false,
    envKeysPassed: [],
  };
}

export async function runSafeCommand(spec: CommandSpec, options: SafeCommandRunnerOptions): Promise<SafeCommandResult> {
  const decision = evaluateCommandPolicy(spec, options.policy);
  if (!decision.allowed) return rejectedResult(spec, options.policy);

  const started = Date.now();
  const restricted = restrictedEnvironment(spec, options.baseEnv ?? process.env);
  let stdout = "";
  let stderr = "";
  let capturedBytes = 0;
  let outputTruncated = false;
  let timedOut = false;

  return new Promise<SafeCommandResult>((resolve) => {
    const child = spawn(spec.executable, spec.args, {
      cwd: spec.cwd,
      env: restricted.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let settled = false;
    const finish = (result: SafeCommandResult): void => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const append = (current: string, chunk: Buffer): string => {
      if (capturedBytes >= options.policy.maxOutputBytes) {
        outputTruncated = true;
        return current;
      }
      const remaining = options.policy.maxOutputBytes - capturedBytes;
      if (chunk.byteLength > remaining) outputTruncated = true;
      const captured = chunk.subarray(0, Math.max(0, remaining));
      capturedBytes += captured.byteLength;
      return current + captured.toString("utf8");
    };

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = append(stdout, chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = append(stderr, chunk);
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      const forceKill = setTimeout(() => child.kill("SIGKILL"), 1_000);
      forceKill.unref();
    }, spec.timeoutMs);

    child.on("error", (error: Error) => {
      clearTimeout(timeout);
      finish({
        commandSpec: spec,
        policyDecision: decision,
        policyViolations: [],
        exitCode: null,
        signal: null,
        durationMs: Date.now() - started,
        stdoutSummary: summarizeOutput(stdout),
        stderrSummary: summarizeOutput(`${stderr}\n${error.message}`),
        outputTruncated,
        timedOut,
        envKeysPassed: restricted.keys,
      });
    });

    child.on("close", (exitCode: number | null, signal: NodeJS.Signals | null) => {
      clearTimeout(timeout);
      finish({
        commandSpec: spec,
        policyDecision: decision,
        policyViolations: [],
        exitCode,
        signal,
        durationMs: Date.now() - started,
        stdoutSummary: summarizeOutput(stdout),
        stderrSummary: summarizeOutput(stderr),
        outputTruncated,
        timedOut,
        envKeysPassed: restricted.keys,
      });
    });
  });
}