# Engineering Baseline

## Status And Version

This baseline corresponds to the `0.26.0-alpha.1` engineering-hardening release. `package.json` is the authoritative version source; the CLI reads it at runtime. The project remains an alpha research prototype and is not production ready.

## Toolchain

- Node.js: 20 or newer
- Package manager: pnpm
- TypeScript source execution: `tsx`
- Production build: `tsc`
- Compiler mode: strict, `skipLibCheck=false`, `noEmitOnError=true`

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm check
```

`pnpm build` emits JavaScript and source maps into `dist/`. Tests and runtime artifacts are not compiled into that directory. The package is private and currently does not publish declarations.

## Runtime Directories

- `.runs/`: deliberation, LLM, handoff, coding, and feedback artifacts.
- `.handoff/`: optional exported handoff bundles.
- `.eval-runs/`: native coding E2E runs and disposable target repositories.
- `.conversation/`: conversation state and logs.
- `.conversation-eval-runs/`: conversation E2E output.
- `coverage/`: optional test coverage output.
- `dist/`: build output.

All are ignored by Git. Do not store a long-lived business repository inside an eval directory.

## Secret Management

Copy `.env.example` to `.env.local` and place local credentials only there. `.env.local` and other local env variants are ignored; `.env.example` and `.env.local.example` remain versioned.

The secret redactor covers Bearer tokens, common provider/API key assignments, Authorization/Cookie headers, common prefixed tokens, and sensitive object keys. It is applied to LLM raw output and metadata, planning artifacts, command output summaries, native coding results, coding feedback, coding handoffs, and conversation state. Secret values are rendered as `[REDACTED]`.

Target-repository commands do not inherit the full parent environment. By default they receive only `PATH`, `HOME`, and `TMPDIR`. Additional keys require an explicit `CommandSpec.allowedEnvKeys` entry.

## Command Execution Policy

Commands are represented as:

```ts
interface CommandSpec {
  executable: string;
  args: string[];
  cwd: string;
  purpose: string;
  timeoutMs: number;
  allowedEnvKeys: string[];
}
```

`SafeCommandRunner` evaluates the spec, then uses `spawn(executable, args, { shell: false, cwd, env })`. It records the policy decision, exit code, signal, elapsed time, bounded/redacted stdout and stderr summaries, truncation state, timeout state, and environment key names.

Default policy behavior:

- Allows recognized project tools such as pnpm, npm, yarn, node, Python/pytest, Go, Cargo, and read-only git.
- Denies shells, privilege tools, destructive utilities, direct network tools, package installs, and unapproved absolute binaries.
- Allows only `git status`, `git diff`, `git rev-parse`, and `git ls-files` unless a narrowly scoped caller explicitly opts into git writes for an isolated fixture.
- Rejects shell operators outside quoted argument text: `&&`, `||`, `;`, pipes, redirects, command substitution, backticks, and newlines.
- Rejects environment variable prefixes such as `FOO=bar command`.
- Restricts cwd to configured roots, timeout to the policy maximum, and captured output to the policy byte limit.

The toy E2E generator has one explicit exception: it allows `git init` only inside the newly created disposable fixture repository. It does not commit or push.

## Known Limitations

- This policy is not a kernel or container sandbox. An allowlisted interpreter or package script runs repository-controlled code.
- Filesystem restrictions for patch operations are application-level path guards.
- Network denial prevents known direct/network-sensitive commands but cannot prove that arbitrary allowed project code never opens a socket.
- Process termination targets the spawned process; it is not yet a cross-platform process-tree containment system.
- LLM and heuristic artifacts can still be wrong even when schema-valid. Coding approval and human review remain meaningful gates.

Use disposable repositories, operating-system sandboxing, and separate low-privilege credentials for higher-risk evaluation.

## Stable Git Baseline

No command in this release automatically commits or pushes. To create a recoverable baseline after validation:

1. Review `git status --short` and the complete diff.
2. Confirm `.env.local`, runtime outputs, generated targets, and secret-bearing logs are absent from the index.
3. Run `pnpm check` from a clean dependency installation.
4. Inspect `dist/` locally; it remains ignored and should not be staged unless the release policy changes.
5. Create a human-reviewed commit and tag only after the intended source/test/docs set is confirmed.

Keep the baseline commit separate from future feature work such as a conversation clarification loop.