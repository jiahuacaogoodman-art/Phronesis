# Deliberative Thinking Agent Core

Deliberative Thinking Agent Core is a conversation-native planning-to-coding governance runtime. It turns a software goal into structured product intent, competing technical routes, critic feedback, evidence-aware decisions, controlled coding handoffs, native coding results, and evaluation feedback.

The project is an **alpha research prototype**. It is not production ready and its native coding runtime must only be used against disposable or recoverable repositories.

The package version in `package.json` is the only version source used by the CLI.

## Requirements

- Node.js 20 or newer
- pnpm

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm check
```

TypeScript source runs through `tsx`. Release output is emitted by `tsc` into `dist/`. No custom TypeScript source-rewriting loader is used.

## Architecture

The runtime currently contains five cooperating layers:

1. **Deliberative planning**: goal reconstruction, product intent, capability expansion, route generation, deep dive, critic council, revision, route selection, technical productization, and problem-solution research.
2. **Governed handoff**: coding gates, task packages, pre-coding resolution packs, and explicit allowed/forbidden change areas.
3. **Native coding**: target-repository analysis, bounded context indexing, structured patch operations, verification, repair, and coding result production.
4. **Feedback and evaluation**: coding-result ingestion, quality comparison, native coding E2E fixtures, and conversation E2E scenarios.
5. **Execution safety**: structured commands, allow/deny policy, `shell:false`, restricted environment, cwd boundaries, timeout/output limits, and secret redaction.

The repository deliberately has no UI, dashboard, or web application.

## Planning Commands

```bash
pnpm think:run --goal "做一个医院实习轮转管理系统" --mode rule
pnpm think:run --goal "做一个医院实习轮转管理系统" --mode hybrid
pnpm think:evaluate --run .runs/<run-id>
pnpm think:compare --goal "做一个医院实习轮转管理系统"
pnpm think:handoff --run .runs/<run-id> --target codex
```

Modes:

- `rule`: deterministic baseline with no LLM calls.
- `hybrid`: uses a configured LLM and falls back to validated rule artifacts on failure.
- `llm`: requires successful schema-valid LLM output and does not silently fall back.

`think:run` does not scan a target repository or apply code. It produces planning artifacts under `.runs/<run-id>/`.

## Native Coding

Native coding is a separate, gated layer. `execute` can modify the explicitly supplied target repository, so use a disposable fixture or a repository with a recovery path.

```bash
pnpm think:autocode --run .runs/<run-id> --target-repo <path> --mode plan-only
pnpm think:autocode --run .runs/<run-id> --target-repo <path> --mode dry-run
pnpm think:autocode --run .runs/<run-id> --target-repo <path> --mode execute
pnpm think:ingest-coding-result --handoff .runs/<run-id>/coding-handoff.json --result coding-result.json
```

`plan-only` and `dry-run` do not execute target-repository commands. `execute` honors the planning gate and routes every verification command through `SafeCommandRunner`. The runtime does not commit, push, or invoke Codex/Claude Code.

E2E fixtures:

```bash
pnpm think:autocode-eval --fixture typescript-basic --mode execute
pnpm think:conversation-eval --scenario all
```

## Conversation Runtime

```bash
pnpm think:chat --message "总结最新 run"
pnpm think:chat --message "运行 toy autocode eval"
pnpm think:chat --confirm <confirmation-id>
```

Side-effecting conversation actions require confirmation. Blocked handoffs remain blocked when invoked through conversation commands.

## LLM Configuration

Create a local configuration file and keep it untracked:

```bash
cp .env.example .env.local
```

Fill `THINK_LLM_API_KEY` inside `.env.local`. Never place a real key in source, tests, documentation, or committed artifacts.

```bash
chmod +x scripts/real-llm-smoke.sh scripts/real-llm-run.sh scripts/real-llm-compare.sh
./scripts/real-llm-smoke.sh "做一个医院实习轮转管理系统"
./scripts/real-llm-run.sh "做一个医院实习轮转管理系统"
./scripts/real-llm-compare.sh "做一个医院实习轮转管理系统"
```

Slow models may need `THINK_LLM_TIMEOUT_MS=180000` or `240000`. A reasonable initial output cap is `THINK_LLM_MAX_TOKENS=1800`. `think:llm-smoke` runs `GoalReconstructor` and `ProductIntentBuilder` by default; add `--all` for all enabled AI agents. Real calls may incur cost.

LLM raw output and metadata are redacted before disk writes. A hybrid fallback does not prove AI quality improvement.

## Command Safety

Target commands are parsed as a simple executable plus argument vector and then checked against `CommandPolicy`. Shell composition, environment-prefix injection, denied executables, network-sensitive commands, package installation, git writes, out-of-root cwd values, excessive timeouts, and unapproved absolute binaries are rejected.

Child processes receive only `PATH`, `HOME`, `TMPDIR`, and explicitly approved environment keys. Captured output is bounded and redacted. This is an application-level safety boundary, not an OS sandbox: an allowed project script or interpreter can still execute repository code.

See [Engineering Baseline](docs/engineering-baseline.md) for the exact policy, runtime directories, known limitations, and stable-baseline procedure.

## Runtime Directories

- `.runs/`: planning, LLM, handoff, native coding, and feedback artifacts.
- `.eval-runs/`: native coding E2E runs and disposable target repositories.
- `.conversation/`: conversation state, action log, and response cache.
- `.conversation-eval-runs/`: conversation reliability runs.
- `dist/`: compiled JavaScript output.

These directories are ignored by Git. Static fixtures under `tests/` remain versioned.