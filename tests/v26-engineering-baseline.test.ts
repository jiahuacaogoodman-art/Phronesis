import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { PROJECT_BANNER, projectMetadata } from "../src/project-metadata.js";

const root = process.cwd();

function runPnpm(script: "typecheck" | "build") {
  return spawnSync("pnpm", [script], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const fullPath = path.join(directory, name);
    if (statSync(fullPath).isDirectory()) return sourceFiles(fullPath);
    return fullPath.endsWith(".ts") ? [fullPath] : [];
  });
}

test("v0.26 package scripts use tsx/tsc and no custom regex loader", () => {
  const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  const scriptsText = JSON.stringify(packageJson.scripts);
  const legacyLoader = ["ts", "loader.mjs"].join("-");
  assert.equal(scriptsText.includes(legacyLoader), false);
  const legacyLoaderPath = path.join(root, "scripts", legacyLoader);
  if (existsSync(legacyLoaderPath)) {
    const legacyLoaderSource = readFileSync(legacyLoaderPath, "utf8");
    assert.match(legacyLoaderSource, /@deprecated/);
    assert.equal(legacyLoaderSource.includes("stripTypes"), false);
    assert.equal(legacyLoaderSource.includes("readFile"), false);
    assert.equal(legacyLoaderSource.includes("shortCircuit"), false);
  }
  assert.match(packageJson.scripts.test, /tsx/);
  assert.match(packageJson.scripts.typecheck, /tsc --noEmit/);
  assert.match(packageJson.scripts.build, /tsc -p tsconfig\.build\.json/);
  assert.equal(packageJson.scripts.check, "pnpm typecheck && pnpm test && pnpm build");
});

test("v0.26 formal typecheck succeeds", () => {
  const result = runPnpm("typecheck");
  assert.equal(result.status, 0, `typecheck failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
});

test("v0.26 formal build succeeds and emits dist", () => {
  const result = runPnpm("build");
  assert.equal(result.status, 0, `build failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  assert.ok(existsSync(path.join(root, "dist/cli.js")), "dist/cli.js should be emitted");
});

test("v0.26 package.json is the CLI version source of truth", () => {
  const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  assert.equal(packageJson.version, "0.26.0-alpha.1");
  assert.equal(projectMetadata.version, packageJson.version);
  assert.equal(PROJECT_BANNER, `Deliberative Thinking Agent Core v${packageJson.version}`);
  const cliSource = readFileSync(path.join(root, "src/cli.ts"), "utf8");
  assert.equal(/Deliberative Thinking Agent Core v0\./.test(cliSource), false);
});

test("v0.26 formal source contains no shell:true or unsafe exec APIs", () => {
  const source = sourceFiles(path.join(root, "src")).map((file) => readFileSync(file, "utf8")).join("\n");
  assert.equal(/shell\s*:\s*true/.test(source), false);
  assert.equal(/\bexecSync\s*\(/.test(source), false);
  assert.equal(/\bexec\s*\(/.test(source), false);
});

test("v0.26 engineering baseline documentation and ignore rules exist", () => {
  assert.ok(existsSync(path.join(root, "docs/engineering-baseline.md")));
  const ignore = readFileSync(path.join(root, ".gitignore"), "utf8");
  for (const entry of ["dist/", "node_modules/", ".runs/", ".handoff/", ".eval-runs/", ".conversation/", ".conversation-eval-runs/", "coverage/"]) {
    assert.ok(ignore.includes(entry), `missing .gitignore entry: ${entry}`);
  }
  const readme = readFileSync(path.join(root, "README.md"), "utf8");
  assert.match(readme, /alpha research prototype/i);
  assert.match(readme, /not production ready/i);
});