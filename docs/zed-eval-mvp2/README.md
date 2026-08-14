# Zed Eval MVP 2

**Verdict: REVISE BEFORE APPROVAL**

This package documents a proposed, future repo-harness integration with Zed's
headless `eval-cli`. This documentation branch performs **no implementation**:
it adds no command, runner, registry entry, installer behavior, or test fixture.

## Package index

1. [`audit-and-revised-plan.md`](./audit-and-revised-plan.md) — audit findings,
   corrected scope, and approval conditions. This is the decision authority and
   must be present and approved before implementation.
2. [`proposed-code-snippets.md`](./proposed-code-snippets.md) — illustrative
   implementation sketches. Treat snippets as non-authoritative until reconciled
   with the audit, current repository code, and the upstream source pin.
3. [`implementation-and-testing-tutorial.md`](./implementation-and-testing-tutorial.md)
   — exhaustive future implementation, safety, testing, canary, projection,
   rollback, and forbidden-file procedure.

## Proposed MVP scope

The revised MVP is one direct, synchronous `repo-harness zed-eval` command that:

- invokes a caller-built Zed `eval-cli` binary through
  `src/effects/process-runner.ts`;
- defaults to read-only agent tools through `ZED_EVAL_DISABLE_TOOLS`;
- permits workspace writes only after explicit writable/disposable opt-in, an
  independently proven non-primary clean linked Git worktree, and a fresh
  runner-created run-scoped `HOME`;
- allocates a fresh `.ai/harness/runs/zed-eval/<runId>/` root whose exact
  `artifacts/` output directory is absent before launch;
- validates the upstream exit code, `result.json`, `thread.md`, and
  `thread.json` before reporting an accepted result; and
- returns only after the child exits. It exposes no live handle, cancel API,
  background job, remote orchestrator, or generic fleet registry.

Out of scope: installing or redistributing `eval-cli`, wrapping Zed's Python
remote `zed-eval` package, Modal/Harbor/Pier orchestration, benchmark fleets,
persistent run registries, asynchronous lifecycle APIs, and synthetic
cancellation.

## Source pin

All upstream CLI claims are pinned to Zed commit
[`24e25552b1259d56a6fdd7956a419ed9e8a1a25e`](https://github.com/zed-industries/zed/tree/24e25552b1259d56a6fdd7956a419ed9e8a1a25e),
especially:

- [`crates/eval_cli/src/main.rs`](https://github.com/zed-industries/zed/blob/24e25552b1259d56a6fdd7956a419ed9e8a1a25e/crates/eval_cli/src/main.rs)
- [`crates/eval_cli/src/headless.rs`](https://github.com/zed-industries/zed/blob/24e25552b1259d56a6fdd7956a419ed9e8a1a25e/crates/eval_cli/src/headless.rs)
- [`crates/eval_cli/README.md`](https://github.com/zed-industries/zed/blob/24e25552b1259d56a6fdd7956a419ed9e8a1a25e/crates/eval_cli/README.md)
- [`crates/eval_cli/Cargo.toml`](https://github.com/zed-industries/zed/blob/24e25552b1259d56a6fdd7956a419ed9e8a1a25e/crates/eval_cli/Cargo.toml)

At that pin, `eval-cli` is GPL-3.0-or-later, is built explicitly from a Zed
checkout, and is not part of the normal repo-harness installation.
