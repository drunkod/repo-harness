# Zed Eval MVP 2 — Continued Review and Final Planning Boundary

**Branch:** `feat/zed-eval-mvp2-plan-v2`  
**Base:** `feat/zed-bench-mvp3-v3`  
**Scope:** documentation-only continuation of the MVP2 audit  
**Implementation status:** not started by this branch  
**Decision:** keep MVP2 narrow; do not revive the generic Fleet Runtime Adapter design

## 1. Why this continuation exists

The original MVP2 audit correctly rejected a speculative generic `fleet` runtime layer and narrowed the integration to one local, synchronous `repo-harness zed-eval` operation around Zed's headless `eval-cli`.

Since that audit was written, the base branch gained a separate MVP3 implementation for **remote benchmark orchestration** under the `zed-benchmark` domain. The latest base-branch work also tightened ArchContext ownership and added guarded canary/closeout gates.

Those facts require one additional review pass before MVP2 implementation:

1. determine whether `zed-benchmark` now justifies a shared runtime abstraction;
2. reconcile MVP2 architecture ownership with the ownership split proven by MVP3;
3. resolve the prompt-redaction gap in the current `runProcess` API;
4. make “read-only” semantics precise;
5. add the missing detailed task plan and full code examples that the MVP2 README already references.

This continuation does **not** implement any source file.

## 2. Current base-branch facts

### 2.1 MVP2 documentation package is incomplete

On the base branch, `docs/zed-eval-mvp2/` contains:

- `README.md`;
- `audit-and-revised-plan.md`;
- `implementation-and-testing-tutorial.md`.

The README references `proposed-code-snippets.md`, but that file is absent. There is also no dedicated `tasks-and-subtasks.md`.

This branch fills those documentation gaps.

### 2.2 MVP3 created a concrete `zed-benchmark` domain

The base branch now contains:

```text
src/core/zed-benchmark/
  admission.ts
  state-schema.ts
  types.ts

src/effects/zed-benchmark/
  receipt-store.ts
  run-zed-benchmark.ts
```

This is useful evidence for naming, validation, receipt, and admission conventions. It is **not** evidence for a common runtime lifecycle.

`zed-benchmark` is remote orchestration with submit/status/log/fetch/report concerns. MVP2 `zed-eval` is a local foreground process with a terminal `result.json`. Their control models are different enough that extracting a generic runtime interface now would still be premature.

### 2.3 Latest MVP3 logs strengthen split architecture ownership

The latest base-branch work explicitly separates ownership:

- verification/evals-checks owns the Zed benchmark core/effect/command/test paths;
- global-runtime-reconciliation owns `src/cli/index.ts` and synchronized external-tooling docs.

MVP2 should follow the same principle:

```text
capability.verification.evals-checks
  src/core/zed-eval/**
  src/effects/zed-eval/**
  src/cli/commands/zed-eval.ts
  tests/zed-eval-*.test.ts
  tests/cli/zed-eval.test.ts

capability.runtime-harness.global-runtime-reconciliation
  src/cli/index.ts
```

Exact ownership must still be resolved with the repository's capability resolver at implementation time. No path may be claimed by two capability nodes.

### 2.4 The shared process runner remains the execution authority

`src/effects/process-runner.ts` already provides:

- synchronous process execution;
- bounded timeout;
- bounded stdout/stderr;
- default secret redactions;
- optional environment inheritance;
- process-group supervision.

MVP2 must reuse it. No Zed-specific direct `spawn`, `spawnSync`, `exec`, shell invocation, PID supervisor, or second redaction engine should be introduced.

## 3. Final architecture decision

### 3.1 Keep separate Zed domains

Use:

```text
zed-eval       local, synchronous, one-process eval-cli wrapper
zed-benchmark  remote benchmark orchestration
```

Do **not** introduce:

```text
src/core/fleet/
src/effects/fleet/
FleetRuntimeAdapter
runtime registry
generic runtime capability matrix
repo-harness fleet
```

A shared abstraction may be reconsidered only after duplicated behavior exists in concrete implementations. Similar nouns such as “admission”, “receipt”, or “run” are not enough; the lifecycle semantics must actually match.

### 3.2 One public MVP2 operation

The intended command remains:

```text
repo-harness zed-eval [options]
```

It performs:

```text
parse + validate request
  -> Zed-specific admission
  -> allocate unique run evidence
  -> runProcess(eval-cli, ...)
  -> wait for child exit
  -> validate result.json + artifact envelope
  -> emit one terminal receipt
  -> exit
```

There is no public start/status/cancel/collect lifecycle.

### 3.3 Preserve the pinned upstream contract

MVP2 remains pinned to Zed commit:

```text
24e25552b1259d56a6fdd7956a419ed9e8a1a25e
```

Implementation must stop and re-audit if the selected executable is intentionally built from a different source contract.

## 4. Important correction: prompt redaction must preserve shared defaults

The current `runProcess` API accepts:

```ts
redactions?: readonly ProcessOutputRedaction[];
```

and uses that list **instead of** the shared defaults.

That means a Zed caller cannot safely pass a prompt-specific redaction without also replacing the default API-key/token/password redactions. Copying those defaults into the Zed module would create a second redaction authority.

Therefore the implementation plan must choose one of these safe paths:

### Preferred path — small shared additive-redaction extension

Extend `RunProcessOptions` with an additive field such as:

```ts
additionalRedactions?: readonly ProcessOutputRedaction[];
```

and compose:

```ts
const redactions = [
  ...DEFAULT_REDACTIONS,
  ...(opts.additionalRedactions ?? []),
];
```

Keep existing `redactions` behavior only if backward compatibility requires it, or migrate deliberately with tests. The shared process runner remains the sole owner of redaction composition.

Add focused tests proving:

- default redactions still apply;
- additional prompt redaction applies;
- additional redaction cannot weaken defaults;
- command, stderr, stdout, and error all use the composed set.

### Stop condition

If changing the shared process runner is not approved for the implementation slice, do **not** solve prompt privacy with a Zed-local replacement redaction list. Return to planning.

## 5. Important clarification: “read-only” means built-in Zed tools restricted

MVP2's default mode is still named `read-only`, but the exact contract must be documented:

- it restricts the known built-in Zed mutation/shell/network/subagent tools through `ZED_EVAL_DISABLE_TOOLS`;
- it is **not** an OS-level read-only mount;
- it is **not** an operating-system sandbox;
- it is **not** a network namespace;
- it is **not** a pre-tool authorization callback;
- the wrapper itself still creates ignored run evidence under `.ai/harness/runs/zed-eval/`.

Therefore user-facing text should say:

> `read-only` restricts the pinned built-in eval tools. It does not make the host filesystem or network read-only.

The fixed pinned disable list remains:

```text
copy_path,create_directory,create_thread,delete_path,apply_code_action,edit_file,write_file,fetch,move_path,rename_symbol,spawn_agent,terminal,search_web
```

Ambient `ZED_EVAL_DISABLE_TOOLS` must never be allowed to weaken this list.

## 6. Writable-mode boundary

Writable mode remains an explicit exceptional path.

Required pre-launch proof:

1. `--mode writable`;
2. `--disposable-worktree`;
3. canonical absolute Git worktree;
4. linked worktree, not the primary worktree;
5. clean worktree including untracked state according to the approved check;
6. unique run root;
7. fresh run-scoped `HOME`;
8. `create_thread` and `spawn_agent` disabled;
9. exact admitted workdir passed to `eval-cli`.

Defense in depth may also place XDG cache/config/data directories under the run root when platform behavior is verified, but this must not be advertised as containment.

The runner does not create or remove the caller's linked worktree.

## 7. Run evidence contract

Use:

```text
<repo>/.ai/harness/runs/zed-eval/<runId>/
  home/              # writable mode only
  artifacts/         # exact upstream --output-dir; absent before launch
    result.json
    thread.md
    thread.json
```

Rules:

- generate a collision-resistant run ID;
- create the run root exclusively;
- require `artifacts/` to be absent immediately before launch;
- never allow arbitrary `--output-dir`;
- reject symlink/path escapes;
- read only from the current run;
- retain raw artifacts as ignored evidence;
- do not auto-copy transcript contents into tracked docs.

## 8. Result-validation contract

`result.json` is untrusted external data.

Validate at least:

- plain-object root;
- status exactly `completed|error|timeout|interrupted`;
- `duration_secs` finite and non-negative;
- `model` non-empty and equal to requested model;
- optional numeric counters are non-negative safe integers;
- `tool_calls` is a plain object when present;
- each per-tool count is a non-negative safe integer;
- per-tool sum equals `tool_call_count` when both are present;
- `error` is present and non-empty for `error`;
- non-error statuses do not carry a contradictory non-empty error;
- exit/status mapping is exact:
  - `0/completed`
  - `1/error`
  - `2/timeout`
  - `3/interrupted`.

A supervisor timeout is not upstream `timeout`. It is an adapter-level failure.

`thread.md` and `thread.json` remain opaque evidence and are never status authorities.

## 9. CLI contract

Proposed public surface:

```text
repo-harness zed-eval \
  --binary /absolute/path/to/eval-cli \
  --workdir /absolute/path/to/repo-or-linked-worktree \
  [--instruction <text> | stdin] \
  [--instruction-suffix-file <path>] \
  [--model <provider/model>] \
  [--timeout <seconds>] \
  [--no-staff] \
  [--reasoning-effort low|medium|high] \
  [--thinking true|false] \
  [--mode read-only|writable] \
  [--disposable-worktree] \
  [--json]
```

No generic passthrough arguments.

No `--output-dir`.

No hidden Zed `--printenv`.

No `fleet` alias.

No `cancel`.

## 10. Future implementation file surface

Expected minimal production files:

```text
src/core/zed-eval/types.ts
src/core/zed-eval/result-schema.ts
src/core/zed-eval/admission.ts
src/effects/zed-eval/run-zed-eval.ts
src/cli/commands/zed-eval.ts
src/cli/index.ts
```

Expected focused tests:

```text
tests/zed-eval-result-schema.test.ts
tests/zed-eval-admission.test.ts
tests/zed-eval-runner.test.ts
tests/cli/zed-eval.test.ts
```

Potential shared change, only if approved by the prompt-redaction gate:

```text
src/effects/process-runner.ts
tests/process-runner.test.ts
```

Architecture/workflow projections are generated or updated only according to repository policy and exact capability ownership.

## 11. Ordered implementation phases

The detailed checklist lives in `tasks-and-subtasks.md`. The required order is:

1. freeze source pin and request/result contracts;
2. resolve capability ownership;
3. decide and test additive prompt redaction;
4. implement pure result validation;
5. implement pure admission;
6. implement run-path allocation and executable validation;
7. implement one synchronous effect;
8. implement CLI parsing/formatting/exit projection;
9. add deterministic fake executable;
10. add focused tests;
11. run architecture projection and repository checks;
12. run optional read-only canary;
13. only then consider writable canary.

## 12. Explicit non-goals

MVP2 does not add:

- remote benchmarks;
- Modal/Harbor/Pier orchestration;
- persistent remote state;
- a receipt store shared with `zed-benchmark`;
- generic provider selection;
- runtime discovery;
- scheduler/queue/leases;
- async event streams;
- daemon/background process support;
- automatic Zed build/download/install;
- a new compatibility host;
- hook routing changes;
- review routing changes;
- AcceptanceReceipt changes;
- Agent Fleet changes.

## 13. Relationship to MVP3

MVP3 should be treated as a **sibling domain and source of lessons**, not a superclass.

Safe reuse by observation:

- naming conventions;
- fail-closed external-state validation style;
- explicit admission functions;
- stable JSON receipts;
- capability ownership discipline;
- guarded manual canary;
- closeout checks.

Do not copy remote lifecycle concepts into MVP2:

- submit attempts;
- persistent remote run IDs;
- polling;
- logs/fetch/report commands;
- remote receipt store;
- remote cleanup semantics.

The fact that both integrations are “Zed eval-related” does not make their execution contracts interchangeable.

## 14. Approval gate for implementation

MVP2 is ready to move from planning into an implementation work package only when reviewers accept all of these statements:

- the command is `zed-eval`, not `fleet`;
- the operation is synchronous and terminal;
- the existing `runProcess` remains process authority;
- prompt redaction will not replace or duplicate shared default redactions;
- `read-only` is documented as built-in-tool restriction, not host containment;
- writable mode is gated by clean non-primary linked-worktree proof and fresh HOME;
- unique run evidence cannot be reused;
- result validation is runtime validation, not TypeScript assertion;
- exit/status coherence is exact;
- `zed-benchmark` stays a separate sibling domain;
- `src/cli/index.ts` architecture ownership is resolved independently from the Zed-specific command/core/effect paths;
- no generic runtime registry or Fleet Runtime Adapter is introduced.

Until those conditions are approved, this remains a documentation-only plan.
