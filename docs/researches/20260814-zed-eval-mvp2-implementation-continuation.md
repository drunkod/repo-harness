# Zed Eval MVP2 implementation continuation — 2026-08-14

## Status

Implementation began on `feat/zed-eval-mvp2-plan-v2` after explicit approval to continue the reviewed MVP2 plan. The planning package under `docs/zed-eval-mvp2/` remains the design authority; this note records implementation-specific decisions and verification limits from the continuation.

## Frozen boundary

- Public command: `repo-harness zed-eval`.
- One local synchronous `eval-cli` process per invocation.
- Pinned Zed source contract: `24e25552b1259d56a6fdd7956a419ed9e8a1a25e`.
- `src/effects/process-runner.ts#runProcess` remains the only child-process authority used by Zed-specific code.
- No `src/core/fleet/`, `src/effects/fleet/`, runtime registry, live handle, polling lifecycle, or `fleet` alias.
- `zed-benchmark` remains a sibling remote orchestration domain rather than a superclass for the local `zed-eval` lifecycle.

## Implemented slices

### Shared redaction composition

`RunProcessOptions` now supports `additionalRedactions`. When the legacy replacement field `redactions` is absent, additional rules are composed after the shared default secret rules. This allows `zed-eval` to hide exact instruction text without copying or weakening API-key/token/password/Bearer redaction.

### Zed-specific core contract

`src/core/zed-eval/` now defines:

- request, mode, result, artifact, worktree-fact, receipt, and failure types;
- exact pinned read-only and writable built-in-tool denial lists;
- request admission rules;
- strict runtime validation of the pinned `result.json` schema; and
- exact upstream exit/status coherence for `0/completed`, `1/error`, `2/timeout`, and `3/interrupted`.

The validator preserves absent optional metrics as absent and rejects unsafe integers, malformed tool-count maps, model mismatches, contradictory error fields, unknown statuses, and exit/status mismatches.

### Synchronous runner

`src/effects/zed-eval/run-zed-eval.ts`:

- canonicalizes and checks the caller-supplied executable;
- probes Git state through `runProcess` rather than a new direct child-process authority;
- defaults to read-only built-in-tool restrictions;
- admits writable mode only for a clean linked non-primary worktree with explicit disposable acknowledgement;
- creates a fresh run-scoped HOME for admitted writable runs;
- allocates `.ai/harness/runs/zed-eval/<runId>/` exclusively and leaves the exact `artifacts/` path absent before launch;
- invokes `eval-cli` with `processGroup: true` and an outer timeout greater than the upstream timeout by a fixed artifact-flush grace;
- distinguishes outer supervisor timeout from upstream `status: timeout`;
- validates `result.json` and contained regular transcript artifacts after exit;
- treats `thread.md` and `thread.json` as opaque evidence; and
- redacts instruction text and shared secret patterns from returned error/command metadata.

`read-only` remains deliberately narrower than host containment: it restricts the pinned built-in mutation/shell/network/subagent tools but is not an OS sandbox, filesystem mount policy, network namespace, or pre-tool authorization callback.

### CLI and tests

`src/cli/commands/zed-eval.ts` exposes only the reviewed flags. `src/cli/index.ts` is changed at the three required registration points only: builder import, `SUBCOMMANDS`, and `addCommand`.

Focused offline tests were added for:

- shared additive redaction composition;
- result-schema and exit/status validation;
- admission rules;
- fake-executable runner behavior, including writable linked-worktree/HOME gating and supervisor timeout; and
- CLI help, instruction/stdin behavior, JSON output, upstream exit propagation, and adapter exit `4`.

The fake executable is injected through the same absolute binary path as production and does not add a production test bypass.

## Pinned-source recheck

The implementation re-read `crates/eval_cli/src/main.rs` at Zed commit `24e25552b1259d56a6fdd7956a419ed9e8a1a25e` before closeout. The `EvalResult` optional fields are annotated with `#[serde(skip_serializing_if = "Option::is_none")]`, confirming that the strict TypeScript boundary should treat missing optional fields as absent rather than requiring `null` support.

The source also still confirms the reviewed public flags, exit codes, headless one-shot process model, and caller-selected `--output-dir` behavior that the wrapper narrows into a unique repo-harness-owned run directory.

## Architecture ownership

The ArchContext source model keeps the split established by the preceding MVP3 work:

- `capability.verification.evals-checks` owns `src/core/zed-eval/**`, `src/effects/zed-eval/**`, `src/cli/commands/zed-eval.ts`, and the already-covered `tests/**` paths.
- `capability.runtime-harness.global-runtime-reconciliation` retains `src/cli/index.ts`.
- the shared process runner remains with its existing owner; it is not moved into the Zed capability.

No generic fleet capability was introduced.

## Verification state

The branch was edited through the GitHub connector. This execution environment could not perform a local repository checkout because outbound GitHub DNS resolution was unavailable, and Bun was not available in the local container. GitHub did not report a pull-request-triggered workflow run for the implementation commits at the time of this continuation.

Therefore the focused tests and root required checks are **implemented but not claimed as executed/passing here**. The next executable verification gate remains:

```bash
bun test tests/process-runner.test.ts
bun test tests/zed-eval-result-schema.test.ts
bun test tests/zed-eval-admission.test.ts
bun test tests/zed-eval-runner.test.ts
bun test tests/cli/zed-eval.test.ts
bun run check:type
bun test
bash scripts/check-deploy-sql-order.sh
bash scripts/check-architecture-sync.sh
bash scripts/check-task-sync.sh
repo-harness run check-task-workflow --strict
bun scripts/inspect-project-state.ts --repo . --format text
bun src/cli/index.ts init --repo . --dry-run
```

A live Zed/model canary remains optional and must not substitute for deterministic acceptance tests.
