import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { CodebaseIndex, RepoContextPack } from "../types/native-coding.js";

const hardExcludes = ["node_modules", "dist", "build", ".git", "coverage", ".venv", "__pycache__"];
const textExtensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".py", ".sql", ".md", ".toml", ".yaml", ".yml", ".prisma"];

interface IndexOptions {
  maxFiles?: number;
  maxChars?: number;
  maxCharsPerFile?: number;
}

interface ResolvedIndexOptions {
  maxFiles: number;
  maxChars: number;
  maxCharsPerFile: number;
}

type IndexedFile = CodebaseIndex["indexedFiles"][number];

interface WalkResult {
  fileTree: string[];
  files: IndexedFile[];
  gitignorePatterns: string[];
  charsIndexed: number;
}

function normalize(relativePath: string): string {
  return relativePath.replace(/\\/g, "/");
}

function readGitignore(repoPath: string): string[] {
  const filePath = path.join(repoPath, ".gitignore");
  if (!existsSync(filePath)) return [];
  return readFileSync(filePath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("!"))
    .map((line) => line.replace(/^\//, "").replace(/\/$/, ""));
}

function isIgnored(relativePath: string, gitignorePatterns: string[]): boolean {
  const parts = relativePath.split("/");
  if (parts.some((part) => hardExcludes.includes(part))) return true;
  return gitignorePatterns.some((pattern) => {
    if (!pattern) return false;
    if (pattern.includes("*")) {
      const regex = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}`);
      return regex.test(relativePath);
    }
    return relativePath === pattern || relativePath.startsWith(`${pattern}/`) || parts.includes(pattern);
  });
}

function fileKind(relativePath: string): string {
  if (relativePath === "package.json" || relativePath.endsWith("pyproject.toml") || relativePath.endsWith("requirements.txt")) return "manifest";
  if (/(\.test\.|\.spec\.|^tests\/|^test\/|__tests__)/.test(relativePath)) return "test";
  if (/migration|migrations|prisma|drizzle|alembic|schema/i.test(relativePath)) return "schema-or-migration";
  if (/api|route|service|model|repository|controller|handler|domain/i.test(relativePath)) return "api-service-model";
  if (/config|tsconfig|vite|next|eslint|prettier/i.test(relativePath)) return "config";
  return "source";
}

function summarizeFile(repoPath: string, relativePath: string, maxCharsPerFile: number): IndexedFile {
  const filePath = path.join(repoPath, relativePath);
  const ext = path.extname(relativePath);
  const sizeBytes = statSync(filePath).size;
  const kind = fileKind(relativePath);
  if (!textExtensions.includes(ext) || sizeBytes > 200_000) {
    return { path: relativePath, kind, sizeBytes, summary: "Skipped binary or very large file." };
  }
  const text = readFileSync(filePath, "utf8").slice(0, maxCharsPerFile);
  const declarations = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => {
      return line.startsWith("export class ") ||
        line.startsWith("class ") ||
        line.startsWith("export const ") ||
        line.startsWith("const ") ||
        line.startsWith("export interface ") ||
        line.startsWith("interface ") ||
        line.startsWith("export type ") ||
        line.startsWith("type ") ||
        line.startsWith("def ");
    })
    .slice(0, 8);
  const summary = declarations.length > 0
    ? declarations.join(" | ")
    : text.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 4).join(" | ");
  const clippedSummary = summary.slice(0, 800);
  return { path: relativePath, kind, sizeBytes, summary: clippedSummary };
}

function walk(repoPath: string, options: ResolvedIndexOptions): WalkResult {
  const gitignorePatterns = readGitignore(repoPath);
  const fileTree: string[] = [];
  const files: IndexedFile[] = [];
  let charsIndexed = 0;
  function visit(dir: string): void {
    if (files.length >= options.maxFiles) return;
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (files.length >= options.maxFiles) return;
      const fullPath = path.join(dir, entry.name);
      const relativePath = normalize(path.relative(repoPath, fullPath));
      if (isIgnored(relativePath, gitignorePatterns)) continue;
      fileTree.push(relativePath + (entry.isDirectory() ? "/" : ""));
      if (entry.isDirectory()) {
        visit(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const summary = summarizeFile(repoPath, relativePath, options.maxCharsPerFile);
      charsIndexed += Math.min(summary.summary.length, options.maxCharsPerFile);
      if (charsIndexed > options.maxChars) break;
      files.push(summary);
    }
  }
  visit(repoPath);
  return { fileTree, files, gitignorePatterns, charsIndexed };
}

export function indexCodebase(targetRepo: string, options: IndexOptions = {}): { codebaseIndex: CodebaseIndex; repoContextPack: RepoContextPack } {
  const repoPath = path.resolve(process.cwd(), targetRepo);
  const maxFiles = options.maxFiles ?? 120;
  const maxChars = options.maxChars ?? 40_000;
  const maxCharsPerFile = options.maxCharsPerFile ?? 1_200;
  const walked = walk(repoPath, { maxFiles, maxChars, maxCharsPerFile });
  const indexedFiles = walked.files;
  const keyManifests = indexedFiles.filter((file) => file.kind === "manifest" || file.kind === "config").map((file) => file.path);
  const testFiles = indexedFiles.filter((file) => file.kind === "test").map((file) => file.path);
  const schemaOrMigrationFiles = indexedFiles.filter((file) => file.kind === "schema-or-migration").map((file) => file.path);
  const apiServiceModelFiles = indexedFiles.filter((file) => file.kind === "api-service-model").map((file) => file.path);
  const codebaseIndex: CodebaseIndex = {
    repoPath,
    fileTree: walked.fileTree.slice(0, maxFiles * 2),
    indexedFiles,
    keyManifests,
    testFiles,
    schemaOrMigrationFiles,
    apiServiceModelFiles,
    excludedPatterns: [...hardExcludes, ...walked.gitignorePatterns],
    limits: {
      maxFiles,
      maxChars,
      filesIndexed: indexedFiles.length,
      charsIndexed: walked.charsIndexed,
    },
  };
  const repoContextPack: RepoContextPack = {
    repoPath,
    summary: `Indexed ${indexedFiles.length} files with compressed summaries only.`,
    manifests: keyManifests.slice(0, 12),
    sourceAreas: Array.from(new Set(indexedFiles.map((file) => file.path.split("/")[0]))).slice(0, 12),
    testAreas: testFiles.slice(0, 12),
    relevantFiles: indexedFiles
      .filter((file) => ["manifest", "test", "schema-or-migration", "api-service-model"].includes(file.kind))
      .slice(0, 40)
      .map((file) => ({ path: file.path, kind: file.kind, summary: file.summary })),
    compressionPolicy: [
      "No full repository dump.",
      "Only file tree, manifest names, and short code summaries are included.",
      "Large and ignored directories are excluded.",
    ],
  };
  return { codebaseIndex, repoContextPack };
}