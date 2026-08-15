# Zed Eval MVP 2

**Planning status:** continued review complete; the narrow revised boundary was explicitly approved for implementation on 2026-08-14.  
**Implementation status:** implementation has started on `feat/zed-eval-mvp2-plan-v2`; focused tests are present but are not claimed as executed/passing by the GitHub-only continuation.  
**Original audit verdict:** **REVISE BEFORE APPROVAL** — implementation follows the revised boundary, not the rejected generic Fleet Runtime Adapter proposal.

This package is the design authority for repo-harness integration with Zed's headless `eval-cli`. The branch began as documentation-only planning and was later explicitly advanced into implementation; historical documents that describe the branch as documentation-only should be read as pre-implementation records.

## Read order and authority

Read the package in this order:

1. [`audit-and-revised-plan.md`](./audit-and-revised-plan.md) — original audit findings, corrected MVP2 scope, safety boundary, and approval conditions.
2. [`continued-review-and-final-plan.md`](./continued-review-and-final-plan.md) — continuation against the newer `feat/zed-bench-mvp3-v3` base, including lessons from the concrete `zed-benchmark` sibling domain, split ArchContext ownership, prompt-redaction correction, and final planning boundary.
3. [`tasks-and-subtasks.md`](./tasks-and-subtasks.md) — implementation-ready T0–T14 work breakdown with tests, exit criteria, and stop conditions.
4. [`proposed-code-snippets.md`](./proposed-code-snippets.md) — expanded illustrative TypeScript, CLI, validator, admission, runner, fake-binary, test, canary, and architecture examples. These are non-authoritative sketches.
5. [`implementation-and-testing-tutorial.md`](./implementation-and-testing-tutorial.md) — detailed implementation, testing, canary, projection, rollback, and forbidden-file procedure.
6. [`../researches/20260814-zed-eval-mvp2-implementation-continuation.md`](../researches/20260814-zed-eval-mvp2-implementation-continuation.md) — durable record of the first implementation continuation, decisions applied, and verification limits.

Conflict precedence for implementation:

1. approved audit + continued review;
2. current repository contracts and actual source;
3. pinned upstream Zed source;
4. approved implementation boundary from the current task;
5. implementation tutorial;
6. illustrative snippets.

Do not paste snippets mechanically.

## What this continuation adds

The base branch has evolved since the first MVP2 audit. In particular, MVP3 now has a concrete `zed-benchmark` domain for remote orchestration. This continuation keeps it as a **sibling**, not evidence for a generic runtime/fleet superclass: the remote submit/status/log/fetch/report lifecycle does not match a local synchronous `eval-cli` process lifecycle.

The implementation applies the two key planning corrections:

- **Architecture ownership:** Zed-specific core/effect/command/test paths resolve to verification/evals-checks, while `src/cli/index.ts` keeps its existing global-runtime owner. The shared process runner remains with its existing owner.
- **Prompt redaction:** `runProcess` now supports additive redactions that compose with shared defaults. `zed-eval` uses that additive path for instruction text, so prompt masking does not weaken API-key/token/password/Bearer redaction and no Zed-local copy of shared secret regexes is introduced.

## Implemented MVP scope

The revised MVP is one direct, synchronous `repo-harness zed-eval` command that:

- invokes a caller-built Zed `eval-cli` binary through `src/effects/process-runner.ts`;
- defaults to `read-only`, meaning the pinned built-in mutation/shell/network/subagent tools are disabled through `ZED_EVAL_DISABLE_TOOLS`;
- explicitly **does not** claim that read-only mode is an OS sandbox, read-only mount, network namespace, or pre-tool authorization boundary;
- permits workspace writes only after explicit writable/disposable opt-in, independent proof of a non-primary clean linked Git worktree, and a fresh runner-created run-scoped `HOME`;
- allocates a fresh `.ai/harness/runs/zed-eval/<runId>/` root whose exact `artifacts/` output directory is absent before launch;
- validates the upstream exit code, `result.json`, and artifact envelope before reporting an accepted result;
- treats `thread.md` and `thread.json` as opaque run evidence rather than control-flow input;
- distinguishes upstream timeout (`2/timeout`) from the outer process supervisor timeout; and
- returns only after the child exits. It exposes no live handle, cancel API, background job, remote orchestrator, or generic fleet registry.

Focused offline coverage is present for shared redaction composition, result validation, admission, fake-executable runner behavior, CLI wiring, instruction/stdin rules, writable worktree/HOME gating, and timeout classification.

## Explicit non-goals

Out of scope:

- `src/core/fleet/` or `src/effects/fleet/`;
- `repo-harness fleet` for Zed execution;
- generic runtime adapters or one-entry registries;
- wrapping Zed's remote Python `zed-eval` benchmark package in MVP2;
- Modal/Harbor/Pier orchestration;
- persistent remote run state;
- structured event streaming from human stderr;
- installer/downloader/updater behavior for `eval-cli`;
- workflow host compatibility changes;
- hook/review/AcceptanceReceipt changes;
- Agent Fleet changes.

## Source pin

All upstream CLI claims remain pinned to Zed commit
[`24e25552b1259d56a6fdd7956a419ed9e8a1a25e`](https://github.com/zed-industries/zed/tree/24e25552b1259d56a6fdd7956a419ed9e8a1a25e), especially:

- [`crates/eval_cli/src/main.rs`](https://github.com/zed-industries/zed/blob/24e25552b1259d56a6fdd7956a419ed9e8a1a25e/crates/eval_cli/src/main.rs)
- [`crates/eval_cli/src/headless.rs`](https://github.com/zed-industries/zed/blob/24e25552b1259d56a6fdd7956a419ed9e8a1a25e/crates/eval_cli/src/headless.rs)
- [`crates/eval_cli/README.md`](https://github.com/zed-industries/zed/blob/24e25552b1259d56a6fdd7956a419ed9e8a1a25e/crates/eval_cli/README.md)
- [`crates/eval_cli/Cargo.toml`](https://github.com/zed-industries/zed/blob/24e25552b1259d56a6fdd7956a419ed9e8a1a25e/crates/eval_cli/Cargo.toml)

At that pin, `eval-cli` remains an externally built executable, not part of normal repo-harness installation or redistribution. The implementation rechecked `main.rs` and confirmed that optional `EvalResult` fields use `skip_serializing_if = "Option::is_none"`, matching the validator's absent-field semantics.

## Branch transition and allowed implementation surface

The original documentation-only guard was satisfied by the first four planning commits. The current task then explicitly authorized implementation on this branch. The implementation surface is intentionally constrained to:

```text
src/core/zed-eval/**
src/effects/zed-eval/**
src/cli/commands/zed-eval.ts
src/cli/index.ts
src/effects/process-runner.ts
tests/zed-eval-*.test.ts
tests/cli/zed-eval.test.ts
tests/process-runner.test.ts
.archcontext/model/nodes/capability.verification.evals-checks.yaml
docs/zed-eval-mvp2/**
docs/researches/20260814-zed-eval-mvp2-implementation-continuation.md
```

`src/cli/index.ts` is limited to the three required registration changes. No workflow-host compatibility, installer, hook/review routing, AcceptanceReceipt, Agent Fleet, or generic fleet/runtime surface is part of this implementation.

Executable verification still must run in an environment with the repository dependencies and Bun available before the implementation is treated as accepted.

## Manual validation

- [Human MVP2 manual test runbook](./human-mvp2-manual-test-runbook.md)
