import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { RepoAnalysis } from "../types/native-coding.js";
import type { CommandSpec } from "../types/command-execution.js";
import { createDefaultCommandPolicy } from "../security/command-policy.js";
import { runSafeCommand } from "../security/safe-command-runner.js";

const defaultExcludedDirs = new Set(["node_modules", "dist", "build", ".git", "coverage", ".venv", "__pycache__"]);

interface PackageJsonShape {
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

interface RepoAnalyzerOptions {
  runGitStatus?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

function safeReadJson(filePath: string): PackageJsonShape | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8"));
    if (!isRecord(parsed)) return undefined;
    return {
      scripts: stringRecord(parsed.scripts),
      dependencies: stringRecord(parsed.dependencies),
      devDependencies: stringRecord(parsed.devDependencies),
    };
  } catch {
    return undefined;
  }
}

function listFiles(root: string, limit = 500): string[] {
  const files: string[] = [];
  function visit(dir: string): void {
    if (files.length >= limit) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (files.length >= limit) return;
      if (defaultExcludedDirs.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      const relative = path.relative(root, fullPath).replace(/\\/g, "/");
      if (entry.isDirectory()) {
        visit(fullPath);
      } else if (entry.isFile()) {
        files.push(relative);
      }
    }
  }
  visit(root);
  return files;
}

function scriptsMatching(packageJson: PackageJsonShape | undefined, matcher: (name: string, command: string) => boolean): string[] {
  const scripts = packageJson?.scripts ?? {};
  return Object.entries(scripts)
    .filter(([name, command]) => matcher(name, String(command)))
    .map(([name]) => `pnpm ${name}`);
}

function detectPackageManagers(repoPath: string): string[] {
  const managers: string[] = [];
  if (existsSync(path.join(repoPath, "pnpm-lock.yaml"))) managers.push("pnpm");
  if (existsSync(path.join(repoPath, "package-lock.json"))) managers.push("npm");
  if (existsSync(path.join(repoPath, "yarn.lock"))) managers.push("yarn");
  if (existsSync(path.join(repoPath, "pyproject.toml"))) managers.push("python/pyproject");
  if (existsSync(path.join(repoPath, "requirements.txt"))) managers.push("python/requirements");
  return managers;
}

function detectLanguages(files: string[]): string[] {
  const languages = new Set<string>();
  if (files.some((file) => /\.(ts|tsx)$/.test(file))) languages.add("TypeScript");
  if (files.some((file) => /\.(js|jsx|mjs|cjs)$/.test(file))) languages.add("JavaScript");
  if (files.some((file) => /\.py$/.test(file))) languages.add("Python");
  if (files.some((file) => /\.sql$/.test(file))) languages.add("SQL");
  if (files.some((file) => /\.json$/.test(file))) languages.add("JSON");
  return Array.from(languages);
}

function detectFrameworkSignals(repoPath: string, packageJson: PackageJsonShape | undefined, files: string[]): string[] {
  const text = JSON.stringify({ dependencies: packageJson?.dependencies ?? {}, devDependencies: packageJson?.devDependencies ?? {} });
  const signals = new Set<string>();
  if (text.includes("react")) signals.add("React");
  if (text.includes("vite")) signals.add("Vite");
  if (text.includes("next")) signals.add("Next.js");
  if (text.includes("prisma") || existsSync(path.join(repoPath, "prisma"))) signals.add("Prisma");
  if (text.includes("drizzle") || files.some((file) => file.includes("drizzle"))) signals.add("Drizzle");
  if (files.some((file) => file.includes("alembic"))) signals.add("Alembic");
  if (files.some((file) => file.endsWith("main.py")) && files.some((file) => file.includes("api"))) signals.add("FastAPI");
  const pyproject = existsSync(path.join(repoPath, "pyproject.toml")) ? readFileSync(path.join(repoPath, "pyproject.toml"), "utf8") : "";
  const requirements = existsSync(path.join(repoPath, "requirements.txt")) ? readFileSync(path.join(repoPath, "requirements.txt"), "utf8") : "";
  if (`${pyproject}\n${requirements}`.toLowerCase().includes("fastapi")) signals.add("FastAPI");
  if (`${pyproject}\n${requirements}`.toLowerCase().includes("pytest") || files.some((file) => file.startsWith("tests/") && file.endsWith(".py"))) signals.add("pytest");
  return Array.from(signals);
}

function detectRoots(repoPath: string, candidates: string[]): string[] {
  return candidates
    .filter((candidate) => existsSync(path.join(repoPath, candidate)) && statSync(path.join(repoPath, candidate)).isDirectory())
    .map((candidate) => candidate.replace(/\\/g, "/"));
}

function detectConfigFiles(repoPath: string, files: string[]): string[] {
  const configNames = [
    "package.json",
    "tsconfig.json",
    "vite.config.ts",
    "next.config.js",
    "pyproject.toml",
    "requirements.txt",
    "prisma/schema.prisma",
    "drizzle.config.ts",
    "alembic.ini",
    ".env.example",
  ];
  return configNames.filter((file) => files.includes(file) || existsSync(path.join(repoPath, file)));
}

async function detectGitStatus(repoPath: string): Promise<{ gitStatus: string[]; isClean: boolean }> {
  const policy = createDefaultCommandPolicy([repoPath]);
  const spec: CommandSpec = {
    executable: "git",
    args: ["status", "--porcelain"],
    cwd: repoPath,
    purpose: "inspect target repository cleanliness",
    timeoutMs: 10_000,
    allowedEnvKeys: [],
  };
  const result = await runSafeCommand(spec, { policy });
  if (!result.policyDecision.allowed || result.exitCode !== 0) {
    return { gitStatus: ["not-a-git-repository-or-git-unavailable"], isClean: true };
  }
  const lines = result.stdoutSummary.map((line) => line.trim()).filter(Boolean);
  return { gitStatus: lines, isClean: lines.length === 0 };
}

function commandFallbacks(packageManagers: string[], frameworkSignals: string[]): string[] {
  const testCommands: string[] = [];
  if (packageManagers.includes("pnpm")) testCommands.push("pnpm test");
  else if (packageManagers.includes("npm")) testCommands.push("npm test");
  else if (packageManagers.includes("yarn")) testCommands.push("yarn test");
  if (frameworkSignals.includes("pytest")) testCommands.push("pytest");
  return testCommands;
}

export async function analyzeRepo(
  targetRepo: string,
  options: RepoAnalyzerOptions = {},
): Promise<RepoAnalysis> {
  const repoPath = path.resolve(process.cwd(), targetRepo);
  if (!existsSync(repoPath) || !statSync(repoPath).isDirectory()) {
    throw new Error(`target-repo does not exist or is not a directory: ${repoPath}`);
  }
  const files = listFiles(repoPath);
  const packageJson = safeReadJson(path.join(repoPath, "package.json"));
  const packageManagers = detectPackageManagers(repoPath);
  const detectedLanguages = detectLanguages(files);
  const frameworkSignals = detectFrameworkSignals(repoPath, packageJson, files);
  const scriptTests = scriptsMatching(packageJson, (name, command) => name.includes("test") || command.includes("vitest") || command.includes("jest"));
  const testCommands = scriptTests.length > 0 ? scriptTests : commandFallbacks(packageManagers, frameworkSignals);
  const buildCommands = scriptsMatching(packageJson, (name) => name.includes("build"));
  const lintCommands = scriptsMatching(packageJson, (name) => name.includes("lint"));
  const typecheckCommands = scriptsMatching(packageJson, (name) => name.includes("typecheck") || name.includes("type-check"));
  const sourceRoots = detectRoots(repoPath, ["src", "lib", "app", "pages", "server"]);
  const testRoots = detectRoots(repoPath, ["tests", "test", "__tests__", "spec"]);
  const migrationRoots = detectRoots(repoPath, ["migrations", "prisma", "drizzle", "alembic"]);
  const configFiles = detectConfigFiles(repoPath, files);
  const projectMarkers = [
    ...configFiles,
    ...packageManagers.map((manager) => `package-manager:${manager}`),
    ...frameworkSignals.map((signal) => `framework:${signal}`),
  ];
  const git = options.runGitStatus === false
    ? { gitStatus: ["not-checked-command-execution-disabled"], isClean: true }
    : await detectGitStatus(repoPath);
  const risks: string[] = [];
  if (testCommands.length === 0) risks.push("No test command detected.");
  if (sourceRoots.length === 0) risks.push("No conventional source root detected.");
  if (!git.isClean) risks.push("Target repo has uncommitted changes and allow-dirty may be required.");
  return {
    repoPath,
    detectedLanguages,
    packageManagers,
    frameworkSignals,
    testCommands,
    buildCommands,
    lintCommands,
    typecheckCommands,
    sourceRoots,
    testRoots,
    migrationRoots,
    configFiles,
    projectMarkers,
    gitStatus: git.gitStatus,
    isClean: git.isClean,
    risks,
  };
}