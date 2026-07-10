import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { OpenAICompatibleProvider } from "../src/llm/openai-compatible-provider.js";
import { createThinkingRuntime } from "../src/llm/provider.js";

function tempRunDir() {
  return mkdtempSync(path.join(os.tmpdir(), "dtac-llm-"));
}

function removeRunDir(runDir) {
  rmSync(runDir, JSON.parse('{"recursive":true,"force":true}'));
}

function request(runDir) {
  return {
    agentName: "TestAgent",
    goal: "做一个医院实习轮转管理系统",
    systemPrompt: "system",
    userPrompt: "user",
    schemaName: "test-schema",
    schemaDescription: "test",
    examples: [],
    qualityChecklist: [],
    temperature: 0.2,
    maxRetries: 1,
    runDir,
    expectedShape: {
      type: "object",
      required: ["ok"],
    },
  };
}

test("v0.9 provider returns LLM_REQUEST_TIMEOUT without leaking API key", async () => {
  const runDir = tempRunDir();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (_url, options) =>
    new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    });

  try {
    const provider = new OpenAICompatibleProvider({
      baseUrl: "https://example.test/",
      apiKey: "sk-test-secret",
      model: "gpt-test",
      chatCompletionsPath: "/v1/chat/completions",
      timeoutMs: 5,
    });
    const result = await provider.completeJson(request(runDir));
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "LLM_REQUEST_TIMEOUT");
    assert.ok(!result.rawText.includes("sk-test-secret"));
  } finally {
    globalThis.fetch = originalFetch;
    removeRunDir(runDir);
  }
});

test("v0.9 provider returns LLM_HTTP_ERROR with status and body preview", async () => {
  const runDir = tempRunDir();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 502,
    text: async () => "bad gateway from upstream",
  });

  try {
    const provider = new OpenAICompatibleProvider({
      baseUrl: "https://example.test/",
      apiKey: "sk-test-secret",
      model: "gpt-test",
    });
    const result = await provider.completeJson(request(runDir));
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "LLM_HTTP_ERROR");
    assert.equal(result.httpStatus, 502);
    assert.ok(String(result.responseBodyPreview).includes("bad gateway"));
    assert.ok(!result.rawText.includes("sk-test-secret"));
  } finally {
    globalThis.fetch = originalFetch;
    removeRunDir(runDir);
  }
});

test("v0.9 provider returns LLM_RESPONSE_PARSE_FAILED on invalid JSON", async () => {
  const runDir = tempRunDir();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => "not valid json",
  });

  try {
    const provider = new OpenAICompatibleProvider({
      baseUrl: "https://example.test/",
      apiKey: "sk-test-secret",
      model: "gpt-test",
    });
    const result = await provider.completeJson(request(runDir));
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "LLM_RESPONSE_PARSE_FAILED");
  } finally {
    globalThis.fetch = originalFetch;
    removeRunDir(runDir);
  }
});

test("v0.9 provider returns LLM_EMPTY_RESPONSE on empty content", async () => {
  const runDir = tempRunDir();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      choices: [{ message: { content: "" } }],
      usage: { total_tokens: 12 },
    }),
  });

  try {
    const provider = new OpenAICompatibleProvider({
      baseUrl: "https://example.test/",
      apiKey: "sk-test-secret",
      model: "gpt-test",
    });
    const result = await provider.completeJson(request(runDir));
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "LLM_EMPTY_RESPONSE");
  } finally {
    globalThis.fetch = originalFetch;
    removeRunDir(runDir);
  }
});

test("v0.9 hybrid fallback metadata records failed LLM calls and fallback reasons", async () => {
  const runDir = tempRunDir();
  const previousEnv = {
    THINK_LLM_PROVIDER: process.env.THINK_LLM_PROVIDER,
    THINK_MOCK_LLM_BEHAVIOR: process.env.THINK_MOCK_LLM_BEHAVIOR,
    THINK_LLM_MODEL: process.env.THINK_LLM_MODEL,
  };
  process.env.THINK_LLM_PROVIDER = "mock";
  process.env.THINK_MOCK_LLM_BEHAVIOR = "invalid";
  process.env.THINK_LLM_MODEL = "mock-json-model";

  try {
    const runtime = createThinkingRuntime({
      mode: "hybrid",
      runDir,
      goal: "做一个医院实习轮转管理系统",
    });
    const output = await runtime.runJsonAgent(
      {
        agentName: "TestAgent",
        systemPrompt: "system",
        buildUserPrompt() {
          return "user";
        },
        outputSchemaName: "test-schema",
        outputSchemaDescription: "test",
        examples: [],
        qualityChecklist: [],
        temperature: 0.2,
        maxRetries: 2,
        expectedShape: {
          type: "object",
          required: ["ok"],
        },
      },
      {},
      { ok: true, from: "rule-fallback" },
    );
    await runtime.writeMetadata();
    const metadata = JSON.parse(readFileSync(path.join(runDir, "llm-run-metadata.json"), "utf8"));
    assert.equal(output.from, "rule-fallback");
    assert.ok(metadata.failedLLMCalls.length >= 1);
    assert.ok(metadata.fallbackReasons.length >= 1);
    assert.ok(metadata.agentsUsingRuleFallback.includes("TestAgent"));
    assert.ok(metadata.validationFailures.length >= 1);
    assert.ok(existsSync(path.join(runDir, "llm-raw")));
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

test("v0.9 still does not add UI surfaces", () => {
  const forbiddenPaths = ["web", "app", "pages", "components", "src/App.tsx", "vite.config.ts"];
  for (const forbiddenPath of forbiddenPaths) {
    assert.equal(existsSync(path.join(process.cwd(), forbiddenPath)), false, `Forbidden UI path exists: ${forbiddenPath}`);
  }
});