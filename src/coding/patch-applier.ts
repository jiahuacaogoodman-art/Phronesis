import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { AppliedPatches, NativePatchOperation, NativePatchPlan } from "../types/native-coding.js";

interface PatchApplierInput {
  targetRepo: string;
  patchPlan: NativePatchPlan;
  allowedChangeAreas: string[];
  forbiddenChangeAreas: string[];
  dryRun?: boolean;
  allowDelete?: boolean;
  allowLargeReplace?: boolean;
  largeReplaceThreshold?: number;
}

interface FileSnapshot {
  existed: boolean;
  content: string;
}

interface ResolvedRepoPath {
  fullPath: string;
  relativePath: string;
}

interface SnapshotEntry {
  filePath: string;
  snapshot: FileSnapshot;
  relativePath: string;
  operation: NativePatchOperation;
}

type AppliedOperation = AppliedPatches["operations"][number];

function uniq(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)));
}

function normalize(value: string): string {
  return String(value ?? "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function pathTokens(text: string): string[] {
  const matches = String(text ?? "").match(/(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.*/-]*|[A-Za-z0-9_.-]+\.[A-Za-z0-9]+/g) ?? [];
  return matches.map((item) => normalize(item.replace(/\*.*$/, ""))).filter(Boolean);
}

function concreteAreas(areas: string[]): string[] {
  return uniq(areas.flatMap((area) => pathTokens(area)));
}

function areaMatches(area: string, relativePath: string): boolean {
  const normalizedArea = normalize(area);
  const normalizedPath = normalize(relativePath);
  if (!normalizedArea || !normalizedPath) return false;
  if (normalizedArea.endsWith("/")) return normalizedPath.startsWith(normalizedArea);
  return normalizedPath === normalizedArea || normalizedPath.startsWith(`${normalizedArea}/`) || normalizedPath.includes(normalizedArea);
}

function resolveInside(repoPath: string, relativePath: string): ResolvedRepoPath {
  const normalizedRelative = normalize(relativePath);
  if (path.isAbsolute(normalizedRelative)) throw new Error(`Absolute operation path is forbidden: ${relativePath}`);
  const fullPath = path.resolve(repoPath, normalizedRelative);
  const repoRoot = path.resolve(repoPath);
  if (fullPath !== repoRoot && !fullPath.startsWith(`${repoRoot}${path.sep}`)) {
    throw new Error(`Operation path escapes target repo: ${relativePath}`);
  }
  return { fullPath, relativePath: normalizedRelative };
}

function assertAllowed(relativePath: string, allowedAreas: string[]): void {
  const concrete = concreteAreas(allowedAreas);
  if (concrete.length === 0) throw new Error(`No concrete allowedChangeAreas available for ${relativePath}`);
  if (!concrete.some((area) => areaMatches(area, relativePath))) {
    throw new Error(`${relativePath} is outside allowedChangeAreas: ${concrete.join(", ")}`);
  }
}

function assertNotForbidden(relativePath: string, forbiddenAreas: string[]): void {
  const concrete = concreteAreas(forbiddenAreas);
  const hit = concrete.find((area) => areaMatches(area, relativePath));
  if (hit) throw new Error(`${relativePath} hits forbiddenChangeAreas: ${hit}`);
}

function snapshotFor(filePath: string): FileSnapshot {
  if (!existsSync(filePath)) {
    return { existed: false, content: "" };
  }
  return { existed: true, content: readFileSync(filePath, "utf8") };
}

function restore(filePath: string, snapshot: FileSnapshot): void {
  if (snapshot.existed) {
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, snapshot.content, "utf8");
    return;
  }
  if (existsSync(filePath)) {
    rmSync(filePath, { recursive: true, force: true });
  }
}

function applyOperation(fullPath: string, operation: NativePatchOperation, options: PatchApplierInput): void {
  if (operation.type === "deleteFile" && !options.allowDelete) {
    throw new Error(`deleteFile is disabled by default: ${operation.path}`);
  }
  if (operation.type === "deleteFile") {
    rmSync(fullPath, { recursive: true, force: true });
    return;
  }
  if (operation.type === "mkdir") {
    mkdirSync(fullPath, { recursive: true });
    return;
  }
  if (operation.type === "createFile") {
    if (existsSync(fullPath)) throw new Error(`createFile target already exists: ${operation.path}`);
    mkdirSync(path.dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, operation.content, "utf8");
    return;
  }
  if (operation.type === "replaceFile") {
    if (existsSync(fullPath) && !options.allowLargeReplace) {
      const size = readFileSync(fullPath, "utf8").length;
      if (size > (options.largeReplaceThreshold ?? 20_000)) {
        throw new Error(`replaceFile refused for large file without confirmation: ${operation.path}`);
      }
    }
    mkdirSync(path.dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, operation.content, "utf8");
    return;
  }
  if (operation.type === "appendFile") {
    mkdirSync(path.dirname(fullPath), { recursive: true });
    const previous = existsSync(fullPath) ? readFileSync(fullPath, "utf8") : "";
    writeFileSync(fullPath, `${previous}${operation.content}`, "utf8");
    return;
  }
  if (operation.type === "patchFile") {
    if (!existsSync(fullPath)) throw new Error(`patchFile target does not exist: ${operation.path}`);
    const previous = readFileSync(fullPath, "utf8");
    if (!previous.includes(operation.find)) {
      throw new Error(`patchFile find text not found: ${operation.path}`);
    }
    writeFileSync(fullPath, previous.replace(operation.find, operation.replace), "utf8");
    return;
  }
  const exhaustive: never = operation;
  throw new Error(`Unsupported patch operation: ${JSON.stringify(exhaustive)}`);
}

export function applyNativePatchPlan(input: PatchApplierInput): AppliedPatches {
  const repoPath = path.resolve(process.cwd(), input.targetRepo);
  const patchPlan = input.patchPlan;
  const dryRun = input.dryRun === true;
  const allowedAreas = input.allowedChangeAreas ?? [];
  const forbiddenAreas = input.forbiddenChangeAreas ?? [];
  const operations: AppliedOperation[] = [];
  const snapshots: SnapshotEntry[] = [];
  const filesChanged: string[] = [];
  const errors: string[] = [];
  let rolledBack = false;

  try {
    for (const operation of patchPlan.operations ?? []) {
      const resolved = resolveInside(repoPath, operation.path);
      assertAllowed(resolved.relativePath, allowedAreas);
      assertNotForbidden(resolved.relativePath, forbiddenAreas);
      if (dryRun) {
        operations.push({ path: resolved.relativePath, type: operation.type, status: "dry-run" });
        filesChanged.push(resolved.relativePath);
        continue;
      }
      const snapshot = snapshotFor(resolved.fullPath);
      snapshots.push({ filePath: resolved.fullPath, snapshot, relativePath: resolved.relativePath, operation });
      applyOperation(resolved.fullPath, operation, input);
      operations.push({ path: resolved.relativePath, type: operation.type, status: "applied" });
      filesChanged.push(resolved.relativePath);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(message);
    operations.push({ path: "unknown", type: "patchFile", status: "rejected", reason: message });
    for (const item of snapshots.reverse()) {
      restore(item.filePath, item.snapshot);
      operations.push({ path: item.relativePath, type: item.operation.type, status: "rolled-back", reason: message });
    }
    rolledBack = snapshots.length > 0;
  }

  return {
    batchId: patchPlan.batchId,
    dryRun,
    operations,
    filesChanged: uniq(filesChanged),
    rolledBack,
    errors,
  };
}