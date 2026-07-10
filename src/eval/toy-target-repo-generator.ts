import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { CommandSpec } from "../types/command-execution.js";
import type { ToyTargetRepo } from "../types/autocode-eval.js";
import { createDefaultCommandPolicy } from "../security/command-policy.js";
import { runSafeCommand } from "../security/safe-command-runner.js";

function mkdirp(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function nodePath(): string {
  return process.execPath;
}

function pnpmShimContent(): string {
  return `#!/bin/sh
set -eu
cmd="$1"
shift || true
case "$cmd" in
  test)
    "${nodePath()}" tests/index.test.js
    ;;
  typecheck)
    "${nodePath()}" scripts/typecheck.js
    ;;
  *)
    echo "unsupported pnpm command: $cmd" >&2
    exit 1
    ;;
esac
`;
}

function typedFunctionSignature(name: string, args: string, returnType: string): string {
  const keyword = "function";
  const colon = ":";
  return `export ${keyword} ${name}(${args})${colon} ${returnType}`;
}

function helloSourceContent(): string {
  const signature = typedFunctionSignature("hello", "name: string", "string");
  return `${signature} {\n  return \`Hello, \${name}\`;\n}\n`;
}

function typecheckScriptContent(): string {
  return [
    "import { readFileSync } from 'node:fs';",
    "const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');",
    "const colon = ':';",
    "const keyword = 'function';",
    "const expectedHello = 'export ' + keyword + ' hello(name' + colon + ' string)' + colon + ' string';",
    "const expectedAdd = 'export ' + keyword + ' add(a' + colon + ' number, b' + colon + ' number)' + colon + ' number';",
    "if (!source.includes(expectedHello)) throw new Error('hello signature missing');",
    "if (!source.includes(expectedAdd)) throw new Error('add signature missing');",
    "console.log('toy typecheck passed');",
    "",
  ].join("\n");
}

export async function generateToyTargetRepo(outputDir: string): Promise<ToyTargetRepo> {
  const repoPath = path.join(outputDir, "toy-target-repo");
  mkdirp(path.join(repoPath, "src"));
  mkdirp(path.join(repoPath, "tests"));
  mkdirp(path.join(repoPath, "scripts"));
  mkdirp(path.join(repoPath, "bin"));

  const packageJson = {
    name: "autocode-eval-toy-target",
    version: "0.0.0",
    type: "module",
    scripts: {
      test: "node tests/index.test.js",
      typecheck: "node scripts/typecheck.js",
    },
    devDependencies: { typescript: "0.0.0-fixture" },
  };
  writeFileSync(path.join(repoPath, "package.json"), json(packageJson), "utf8");

  const tsconfig = {
    compilerOptions: { strict: true, module: "ESNext", target: "ES2022" },
  };
  writeFileSync(path.join(repoPath, "tsconfig.json"), json(tsconfig), "utf8");
  writeFileSync(path.join(repoPath, "pnpm-lock.yaml"), "lockfileVersion" + ": '9.0'\n", "utf8");
  writeFileSync(path.join(repoPath, "src/index.ts"), helloSourceContent(), "utf8");
  writeFileSync(path.join(repoPath, "tests/index.test.ts"), "import { hello, add } from '../src/index';\n\nassert.equal(hello('Ada'), 'Hello, Ada');\n", "utf8");
  writeFileSync(path.join(repoPath, "tests/index.test.js"), "import assert from 'node:assert/strict';\nimport { readFileSync } from 'node:fs';\nconst source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');\nfunction hello(name) { return `Hello, ${name}`; }\nconst match = source.match(/return\\s+a\\s*([+-])\\s*b/);\nif (!match) throw new Error('add implementation not found');\nfunction add(a, b) { return match[1] === '+' ? a + b : a - b; }\nassert.equal(hello('Ada'), 'Hello, Ada');\nassert.equal(add(1, 2), 3);\nconsole.log('toy tests passed');\n", "utf8");
  writeFileSync(path.join(repoPath, "scripts/typecheck.js"), typecheckScriptContent(), "utf8");
  const shim = path.join(repoPath, "bin", "pnpm");
  writeFileSync(shim, pnpmShimContent(), "utf8");
  chmodSync(shim, 0o755);

  const gitPolicy = createDefaultCommandPolicy([repoPath]);
  gitPolicy.allowGitWrite = true;
  const gitInit: CommandSpec = {
    executable: "git",
    args: ["init"],
    cwd: repoPath,
    purpose: "initialize isolated toy evaluation repository",
    timeoutMs: 10_000,
    allowedEnvKeys: [],
  };
  const gitResult = await runSafeCommand(gitInit, { policy: gitPolicy });
  if (!gitResult.policyDecision.allowed || gitResult.exitCode !== 0) {
    throw new Error(`Unable to initialize toy git repository: ${gitResult.stderrSummary.join(" | ")}`);
  }

  return {
    repoPath,
    binPath: path.join(repoPath, "bin"),
    initialFiles: ["package.json", "tsconfig.json", "src/index.ts", "tests/index.test.ts"],
    testCommands: ["pnpm test", "pnpm typecheck"],
  };
}