import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { OpenAICompatibleProvider } from "../src/llm/openai-compatible-provider.js";
import { createThinkingRuntime } from "../src/llm/provider.js";
import { productIntentPrompt } from "../src/prompts/product-intent.prompt.js";

function tempRunDir() {
  return mkdtempSync(path.join(os.tmpdir(), "dtac-llm-"));
}

function removeRunDir(runDir) {
  rmSync(runDir, JSON.parse('{"recursive":true,"force":true}'));
}

function runCli(args, env = {}) {
  const result = spawnSync("pnpm", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  assert.equal(result.status, 0, `command failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return result.stdout;
}

function extractRunDir(stdout) {
  const match = stdout.match(/Run directory:\s*(.+)/);
  assert.ok(match, "Run directory was not printed.");
  return match[1].trim();
}

test("v1.0 provider defaults timeout to 180000 and forwards max_tokens", async () => {
  const runDir = tempRunDir();
  const originalFetch = globalThis.fetch;
  let capturedBody;
  globalThis.fetch = async (_url, options) => {
    capturedBody = JSON.parse(String(options.body));
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        choices: [{ message: { content: '{"ok":true}' } }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      }),
    };
  };

  try {
    const provider = new OpenAICompatibleProvider({
      baseUrl: "https://example.test/",
      apiKey: "sk-test-secret",
      model: "gpt-test",
    });
    assert.equal(provider.timeoutMs, 180000);
    await provider.completeJson({
      agentName: "GoalReconstructor",
      goal: "goal",
      systemPrompt: "system",
      userPrompt: "user",
      schemaName: "schema",
      schemaDescription: "desc",
      examples: [],
      qualityChecklist: [],
      temperature: 0.2,
      maxTokens: 1234,
      maxRetries: 1,
      runDir,
      expectedShape: { type: "object", required: ["ok"] },
    });
    assert.equal(capturedBody.max_tokens, 1234);
  } finally {
    globalThis.fetch = originalFetch;
    removeRunDir(runDir);
  }
});

test("v1.0 ProductIntent prompt contains short-output constraints", () => {
  assert.ok(productIntentPrompt.systemPrompt.includes("Output only JSON"));
  assert.ok(productIntentPrompt.systemPrompt.includes("Each array may contain at most 6 items"));
  assert.ok(productIntentPrompt.systemPrompt.includes("No architecture plan"));
  assert.ok(productIntentPrompt.systemPrompt.includes("No final report"));
});

test("v1.0 llm-smoke defaults to minimal agents and --all runs every AI agent", () => {
  const defaultStdout = runCli(["think:llm-smoke", "--goal", "做一个医院实习轮转管理系统"], {
    "THINK_LLM_PROVIDER": "mock",
    "THINK_MOCK_LLM_BEHAVIOR": "valid",
  });
  const defaultRunDir = extractRunDir(defaultStdout);
  const defaultMetadata = JSON.parse(readFileSync(path.join(defaultRunDir, "llm-run-metadata.json"), "utf8"));
  assert.deepEqual([...defaultMetadata.agentsUsingLLM].sort(), ["GoalReconstructor", "ProductIntentBuilder"].sort());
  assert.ok(defaultStdout.includes("[llm] start GoalReconstructor"));
  assert.ok(defaultStdout.includes("[llm] start ProductIntentBuilder"));
  assert.ok(!defaultStdout.includes("[llm] start CriticCouncil"));

  const allStdout = runCli(["think:llm-smoke", "--goal", "做一个医院实习轮转管理系统", "--all"], {
    "THINK_LLM_PROVIDER": "mock",
    "THINK_MOCK_LLM_BEHAVIOR": "valid",
  });
  const allRunDir = extractRunDir(allStdout);
  const allMetadata = JSON.parse(readFileSync(path.join(allRunDir, "llm-run-metadata.json"), "utf8"));
  assert.ok(allMetadata.agentsUsingLLM.length >= 5);
  assert.ok(allStdout.includes("[llm] start CriticCouncil"));
});

test("v1.0 metadata records token usage latency rawTextLength and length warning", async () => {
  const runDir = tempRunDir();
  const previousEnv = {
    THINK_LLM_PROVIDER: process.env.THINK_LLM_PROVIDER,
    THINK_MOCK_LLM_BEHAVIOR: process.env.THINK_MOCK_LLM_BEHAVIOR,
    THINK_LLM_MODEL: process.env.THINK_LLM_MODEL,
  };
  process.env.THINK_LLM_PROVIDER = "mock";
  process.env.THINK_MOCK_LLM_BEHAVIOR = "valid";
  process.env.THINK_LLM_MODEL = "mock-json-model";

  try {
    const runtime = createThinkingRuntime({
      mode: "hybrid",
      runDir,
      goal: "做一个医院实习轮转管理系统",
    });
    const result = await runtime.runJsonAgent(
      {
        agentName: "ProductIntentBuilder",
        systemPrompt: "system",
        buildUserPrompt() {
          return "user";
        },
        outputSchemaName: "product-intent",
        outputSchemaDescription: "desc",
        examples: [],
        qualityChecklist: [],
        temperature: 0.2,
        maxRetries: 1,
        expectedShape: { type: "object", required: ["ok"] },
      },
      {},
      { ok: true, payload: "x".repeat(5000) },
    );
    await runtime.writeMetadata();
    assert.equal(result.ok, true);
    const metadata = JSON.parse(readFileSync(path.join(runDir, "llm-run-metadata.json"), "utf8"));
    const metric = metadata.agentMetrics.find((item) => item.agentName === "ProductIntentBuilder");
    assert.ok(metric);
    assert.equal(typeof metric.promptTokens, "number");
    assert.equal(typeof metric.completionTokens, "number");
    assert.equal(typeof metric.totalTokens, "number");
    assert.equal(typeof metric.latencyMs, "number");
    assert.ok(metric.rawTextLength > 4000);
    assert.ok((metadata.warnings ?? []).some((warning) => warning.code === "LLM_OUTPUT_TOO_LONG"));
  } finally {
    if (previousEnv.THINK_LLM_PROVIDER == null) delete process.env.THINK_LLM_PROVIDER;
    else process.env.THINK_LLM_PROVIDER = previousEnv.THINK_LLM_PROVIDER;
    if (previousEnv.THINK_MOCK_LLM_BEHAVIOR == null) delete process.env.THINK_MOCK_LLM_BEHAVIOR;
    else process.env.THINK_MOCK_LLM_BEHAVIOR = previousEnv.THINK_MOCK_LLM_BEHAVIOR;
    if (previousEnv.THINK_LLM_MODEL == null) delete process.env.THINK_LLM_MODEL;
    else process.env.THINK_LLM_MODEL = previousEnv.THINK_LLM_MODEL;
    removeRunDir(runDir);
  }
});

test("v1.0 still does not add UI surfaces", () => {
  const forbiddenPaths = ["web", "app", "pages", "components", "src/App.tsx", "vite.config.ts"];
  for (const forbiddenPath of forbiddenPaths) {
    assert.equal(existsSync(path.join(process.cwd(), forbiddenPath)), false, `Forbidden UI path exists: ${forbiddenPath}`);
  }
});