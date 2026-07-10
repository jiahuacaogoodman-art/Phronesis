import { readFileSync } from "node:fs";

interface ProjectMetadata {
  name: string;
  displayName: string;
  version: string;
  description: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`package.json must contain a non-empty ${key}.`);
  }
  return value;
}

function loadProjectMetadata(): ProjectMetadata {
  const packageUrl = new URL("../package.json", import.meta.url);
  const parsed: unknown = JSON.parse(readFileSync(packageUrl, "utf8"));
  if (!isRecord(parsed)) throw new Error("package.json root must be an object.");
  return {
    name: requiredString(parsed, "name"),
    displayName: "Deliberative Thinking Agent Core",
    version: requiredString(parsed, "version"),
    description: requiredString(parsed, "description"),
  };
}

export const projectMetadata = Object.freeze(loadProjectMetadata());
export const PROJECT_BANNER = `${projectMetadata.displayName} v${projectMetadata.version}`;