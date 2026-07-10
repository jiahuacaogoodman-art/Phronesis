import { createLLMProviderFromEnv } from "../llm/provider.js";
import type { LLMJsonRequest, LLMJsonResult } from "../llm/types.js";
import type { CodingHandoff } from "../types/coding-handoff.js";
import type { ImplementationBatch, NativePatchOperation, NativePatchPlan, RepoAnalysis, RepoContextPack } from "../types/native-coding.js";
import { parseNativePatchPlan } from "./native-patch-schema.js";

interface NativePatchPlannerInput {
  runDir: string;
  goal?: string;
  handoff?: Pick<CodingHandoff, "goal">;
  batch: ImplementationBatch;
  repoAnalysis: RepoAnalysis;
  repoContextPack: RepoContextPack;
  sourceArtifacts?: Record<string, unknown>;
}

interface NativePatchPlannerResult {
  patchPlan: NativePatchPlan;
  providerUsed: string;
  llmResult?: LLMJsonResult<unknown>;
}

function firstConcreteArea(batch: ImplementationBatch): string {
  const areas = batch.plannedFileAreas ?? [];
  const concrete = areas.find((area) => /[A-Za-z0-9_-]+\//.test(String(area)));
  if (!concrete) return "src/autocode/";
  const match = String(concrete).match(/(?:[A-Za-z0-9_.-]+\/)+/);
  return match ? match[0] : "src/autocode/";
}

function addFunctionImplementation(operator: "+" | "-"): string {
  const keyword = "function";
  const colon = ":";
  const signature = "export " + keyword + " add(a" + colon + " number, b" + colon + " number)" + colon + " number {";
  return [signature, `  return a ${operator} b;`, "}", ""].join("\n");
}

function defaultPatchPlan(batch: ImplementationBatch): NativePatchPlan {
  const text = JSON.stringify(batch);
  if (text.includes("implement-add-function")) {
    const isRepair = text.includes("repair");
    const operator = isRepair || process.env.THINK_AUTOCODE_EVAL_PATCH_VARIANT !== "broken-subtract" ? "+" : "-";
    const implementation = addFunctionImplementation(operator);
    let sourceOperation: NativePatchOperation;
    if (isRepair) {
      sourceOperation = {
        type: "patchFile",
        path: "src/index.ts",
        rationale: "Repair the broken add implementation after failing tests.",
        find: "return a - b;",
        replace: "return a + b;",
        safetyCheck: "Path is inside src and allowed by handoff.",
      };
    } else {
      sourceOperation = {
        type: "appendFile",
        path: "src/index.ts",
        rationale: "Implement the approved add function in the library entrypoint.",
        content: `\n${implementation}`,
        safetyCheck: "Path is inside src and allowed by handoff.",
      };
    }
    const testOperation: NativePatchOperation = {
      type: "appendFile",
      path: "tests/index.test.ts",
      rationale: "Add executable test coverage for add(1, 2).",
      content: "\nassert.equal(add(1, 2), 3);\n",
      safetyCheck: "Path is inside tests and allowed by handoff.",
    };
    return {
      batchId: batch.batchId,
      summary: "Add add(a, b) export and coverage to toy TypeScript library.",
      operations: [sourceOperation, testOperation],
      expectedFilesChanged: ["src/index.ts", "tests/index.test.ts"],
      expectedTests: batch.testsToRun,
      riskNotes: batch.stopConditions,
      rollbackPlan: ["Restore src/index.ts and tests/index.test.ts from batch snapshots."],
      confidence: 0.88,
    };
  }
  if (text.includes("attempt-forbidden-package-json")) {
    const operation: NativePatchOperation = {
      type: "patchFile",
      path: "package.json",
      rationale: "Eval fixture attempts forbidden manifest change.",
      find: "\"name\"",
      replace: "\"name\"",
      safetyCheck: "This should be rejected by forbiddenChangeAreas.",
    };
    return {
      batchId: batch.batchId,
      summary: "Intentionally forbidden package.json edit for guard evaluation.",
      operations: [operation],
      expectedFilesChanged: ["package.json"],
      expectedTests: batch.testsToRun,
      riskNotes: ["Forbidden-file eval should fail."],
      rollbackPlan: ["No manifest changes should be applied."],
      confidence: 0.5,
    };
  }
  const area = firstConcreteArea(batch);
  const safePath = `${area.replace(/\/?$/, "/")}native-autocode-${batch.batchId}.md`;
  const operation: NativePatchOperation = {
    type: "createFile",
    path: safePath,
    rationale: "Create a small marker artifact for dry-run or mock native patch planning.",
    content: `# ${batch.title}\n\nNative patch planner placeholder for ${batch.batchId}.\n`,
    safetyCheck: "Path must remain inside target repo and allowed change areas.",
  };
  return {
    batchId: batch.batchId,
    summary: `Plan structured implementation operations for ${batch.title}.`,
    operations: [operation],
    expectedFilesChanged: [safePath],
    expectedTests: batch.testsToRun,
    riskNotes: batch.stopConditions,
    rollbackPlan: ["Remove files created by this batch.", "Restore original content for modified files."],
    confidence: 0.62,
  };
}

function fallbackPatchPlan(batch: ImplementationBatch, reason: string): NativePatchPlan {
  return {
    batchId: batch.batchId,
    summary: `No native patch operations generated: ${reason}`,
    operations: [],
    expectedFilesChanged: [],
    expectedTests: batch.testsToRun ?? [],
    riskNotes: [`Patch planning fallback: ${reason}`],
    rollbackPlan: ["No patch to roll back."],
    confidence: 0.2,
  };
}

function buildPrompt(input: NativePatchPlannerInput): string {
  return [
    "Return only JSON for a native patch plan.",
    "Do not call Codex, Claude Code, shell agents, or external coding tools.",
    "Use structured operations only: createFile, replaceFile, patchFile, appendFile, mkdir.",
    "Do not use deleteFile unless the task explicitly allows deletion.",
    "Keep paths relative to target repo.",
    "",
    `Batch: ${JSON.stringify(input.batch)}`,
    `Repo analysis: ${JSON.stringify(input.repoAnalysis)}`,
    `Repo context pack: ${JSON.stringify(input.repoContextPack)}`,
    `Source artifacts summary: ${JSON.stringify(input.sourceArtifacts ?? {})}`,
  ].join("\n");
}

export async function planNativePatch(input: NativePatchPlannerInput): Promise<NativePatchPlannerResult> {
  const providerResult = createLLMProviderFromEnv();
  if (!providerResult.provider) {
    return {
      patchPlan: fallbackPatchPlan(input.batch, providerResult.unavailableReason ?? "No LLM provider configured."),
      providerUsed: "none",
      llmResult: undefined,
    };
  }
  const mockData = defaultPatchPlan(input.batch);
  const request: LLMJsonRequest<NativePatchPlan> = {
    agentName: "NativePatchPlanner",
    goal: input.goal ?? input.handoff?.goal ?? "",
    systemPrompt: "You are a native autonomous coding patch planner. Produce only structured JSON patch operations.",
    userPrompt: buildPrompt(input),
    schemaName: "native-patch-plan",
    schemaDescription: "Structured native patch plan with operations.",
    examples: [],
    qualityChecklist: [],
    temperature: 0.1,
    maxTokens: Number(process.env.THINK_LLM_MAX_TOKENS_NATIVE_PATCH_PLANNER ?? process.env.THINK_LLM_MAX_TOKENS ?? 1800),
    maxRetries: 2,
    runDir: input.runDir,
    expectedShape: {
      type: "object",
      required: ["batchId", "summary", "operations", "expectedFilesChanged", "expectedTests", "riskNotes", "rollbackPlan", "confidence"],
      arrays: [
        { path: "operations", itemRequired: ["type", "path", "rationale", "safetyCheck"] },
        { path: "expectedFilesChanged" },
        { path: "expectedTests" },
        { path: "riskNotes" },
        { path: "rollbackPlan" },
      ],
    },
    input,
    mockData,
  };
  const result = await providerResult.provider.completeJson(request);
  if (!result.ok) {
    return {
      patchPlan: fallbackPatchPlan(input.batch, [...(result.validationErrors ?? []), ...(result.qualityChecklistFailures ?? [])].join(" | ") || "LLM patch plan failed schema guard."),
      providerUsed: providerResult.provider.providerId,
      llmResult: result,
    };
  }
  const parsed = parseNativePatchPlan(result.data);
  if (!parsed.ok) {
    return {
      patchPlan: fallbackPatchPlan(input.batch, `Native patch plan validation failed: ${parsed.errors.join(" | ")}`),
      providerUsed: providerResult.provider.providerId,
      llmResult: { ...result, ok: false, validationErrors: [...result.validationErrors, ...parsed.errors] },
    };
  }
  return { patchPlan: parsed.data, providerUsed: providerResult.provider.providerId, llmResult: result };
}