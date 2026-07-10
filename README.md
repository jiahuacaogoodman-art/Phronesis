# Deliberative Thinking Agent Core

`Deliberative Thinking Agent Core` is a UI-free pre-coding thinking runtime.

It accepts a vague software goal and produces structured deliberation artifacts before any implementation work happens. Version `0.4` is deliberately rule-based: it does not call an LLM, does not use network research, does not scan an existing repository, and does not generate patches.

## Run

```bash
pnpm think:run --goal "做一个签到系统"
```

Each run writes artifacts to:

```text
.runs/<run-id>/
```

## v0.1 Scope

- Goal reconstruction
- Product-grade requirement expansion
- Research planning and evidence mapping
- Multi-route strategy generation
- Anti-simplification review
- Multi-role critic council review
- Route selection
- Architecture plan generation
- Execution task graph generation
- Final thinking report generation

## v0.2 Scope

- Domain analysis with `domain-analysis.json`
- Domain-aware product expansion
- Domain-aware strategy candidates
- Domain-aware anti-simplification critique
- Domain-aware critic council review
- Domain-aware execution task graphs
- Node.js >=20 runtime support without external TypeScript runner dependencies

## v0.3 Scope

- Product Intent Model with `product-intent.json`
- Capability synthesis from actors, resources, workflows, risks, reporting, and operations
- Route synthesis using composable route archetypes
- Compositional anti-simplification rules
- Critic council reviews that reference intent evidence
- Execution task graphs assembled from product intent instead of only domain templates

## v0.4 Scope

- Evidence Ledger with `evidence-ledger.json`
- Decision Ledger with `decision-ledger.json`
- Evidence-backed capabilities, strategy candidates, critic reviews, route selection, and task graph nodes
- Confidence, assumptions, missing evidence, dissent, and revisit conditions attached to key choices
- Final report sections for evidence summary, decision summary, assumptions, missing evidence, dissent, and decision revisit triggers

## Non-Goals

- No web UI
- No dashboard
- No business implementation for the sample goal
- No external research or LLM calls
- No repository scanning
- No patches or diffs
- No Codex-like workspace clone