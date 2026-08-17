# Zed Eval MVP 2 — Detailed Tasks and Subtasks

**Applies to:** future implementation of `repo-harness zed-eval`  
**Planning branch:** `feat/zed-eval-mvp2-plan-v2`  
**Current branch behavior:** documentation only  
**Source pin:** Zed `24e25552b1259d56a6fdd7956a419ed9e8a1a25e`

This file converts the audit into an implementation-ready work breakdown. Each task has explicit inputs, subtasks, tests, exit criteria, and stop conditions.

## Global invariants

Every task must preserve these invariants:

- no `src/core/fleet/`;
- no `src/effects/fleet/`;
- no `repo-harness fleet`;
- no generic runtime registry;
- no direct child-process use in Zed-specific files;
- no live handle, background job, poll loop, or synthetic cancel API;
- no automatic Zed download/build/install;
- no change to workflow host compatibility;
- no Agent Fleet semantic changes;
- no raw prompt/API key/transcript dumping;
- no live paid/model dependency in default tests.

## T0 — Open the implementation work package

### Objective

Move from documentation planning into the repository's normal plan/contract worktree workflow without contaminating unrelated work.

### Subtasks

- [ ] T0.1 Confirm the MVP2 audit and continuation review are approved.
- [ ] T0.2 Record the exact base commit.
- [ ] T0.3 Capture `git status --porcelain=v1 --untracked-files=all`.
- [ ] T0.4 Record all pre-existing changed/untracked paths.
- [ ] T0.5 Create/promote the implementation plan under `plans/` using repository workflow.
- [ ] T0.6 Create the matching contract/worktree.
- [ ] T0.7 Copy the explicit non-goals into the contract.
- [ ] T0.8 Record the approved Zed source pin.
- [ ] T0.9 Record the approved file surface.
- [ ] T0.10 Record the prompt-redaction decision as a precondition.

### Exit criteria

- Implementation happens in an approved contract worktree.
- Pre-existing changes are distinguishable from implementation changes.
- The contract explicitly forbids generic fleet/runtime work.

### Stop conditions

- Active work conflicts with the same files and cannot be isolated.
- Reviewers have not approved the narrow boundary.
- The source pin is intentionally changing.

## T1 — Re-verify the pinned external contract

### Objective

Make all upstream assumptions explicit before source work.

### Subtasks

- [ ] T1.1 Verify selected Zed checkout HEAD equals the approved SHA.
- [ ] T1.2 Re-read `crates/eval_cli/src/main.rs`.
- [ ] T1.3 Confirm public flags:
  - `--workdir`
  - `--instruction`
  - `--instruction-suffix-file`
  - `--model`
  - `--timeout`
  - `--output-dir`
  - `--no-staff`
  - `--reasoning-effort`
  - `--thinking`.
- [ ] T1.4 Confirm `result.json` fields.
- [ ] T1.5 Confirm `thread.md` and `thread.json` behavior.
- [ ] T1.6 Confirm exit constants 0–3.
- [ ] T1.7 Confirm status/exit mapping.
- [ ] T1.8 Confirm current built-in write-tool list.
- [ ] T1.9 Confirm `ZED_EVAL_DISABLE_TOOLS` parsing.
- [ ] T1.10 Confirm `create_thread` and `spawn_agent` remain disable-able.
- [ ] T1.11 Confirm no native sandbox/pre-tool callback was added at the pin.
- [ ] T1.12 Confirm license/build boundary remains acceptable.
- [ ] T1.13 Capture citations/line references in the implementation plan if source layout changed.

### Tests/evidence

No production test is required. Record source evidence in the work package.

### Exit criteria

The pinned contract exactly matches the implementation assumptions.

### Stop conditions

Any material upstream difference requires plan revision before coding.

## T2 — Resolve architecture ownership before adding files

### Objective

Ensure every future changed path has one unambiguous ArchContext owner.

### Candidate ownership

Likely verification/evals-checks:

```text
src/core/zed-eval/**
src/effects/zed-eval/**
src/cli/commands/zed-eval.ts
tests/zed-eval-*.test.ts
tests/cli/zed-eval.test.ts
```

Likely global-runtime-reconciliation:

```text
src/cli/index.ts
```

Potential shared runner paths keep their existing owner:

```text
src/effects/process-runner.ts
tests/process-runner.test.ts
```

### Subtasks

- [ ] T2.1 Run the capability resolver for every candidate path.
- [ ] T2.2 Confirm no exact path is owned by two capability nodes.
- [ ] T2.3 Confirm `src/cli/index.ts` is not moved into the Zed capability merely for convenience.
- [ ] T2.4 Add only the minimum new include patterns required by the actual source files.
- [ ] T2.5 Do not claim docs/reference-configs paths unless implementation truly changes them.
- [ ] T2.6 Run `archctx docs plan --json` or the repository's current provider-native planning command.
- [ ] T2.7 Review generated targets before applying.
- [ ] T2.8 Record the ownership result in the contract.

### Exit criteria

Every planned source/test path resolves to exactly one owner.

### Stop conditions

Ownership requires broad unrelated capability restructuring.

## T3 — Fix the prompt-redaction composition gap

### Objective

Prevent prompt text from appearing in command/error diagnostics while preserving the shared default secret redactions.

### Background

Current `runProcess` treats `opts.redactions` as a replacement list. Passing a Zed prompt-specific rule would remove shared default redactions.

### Preferred implementation

- [ ] T3.1 Add a shared additive option, e.g. `additionalRedactions`.
- [ ] T3.2 Compose default + additional redactions in `process-runner.ts`.
- [ ] T3.3 Preserve existing behavior for callers using `redactions` if compatibility requires it.
- [ ] T3.4 Add tests proving Bearer/API-key redaction still works.
- [ ] T3.5 Add a test proving an exact prompt/sentinel is redacted from `command`.
- [ ] T3.6 Add a test proving prompt redaction applies to stderr/stdout/error as appropriate.
- [ ] T3.7 Add a test proving an added rule cannot disable default rules.
- [ ] T3.8 Keep composition logic out of Zed-specific files.
- [ ] T3.9 Document the shared behavior in code comments only where needed.

### Alternative

If repository maintainers choose a different shared additive mechanism, it must satisfy the same security properties.

### Exit criteria

The Zed runner can add prompt-specific redaction without copying or replacing shared defaults.

### Stop conditions

If no shared-safe composition is approved, stop MVP2 implementation. Do not create a local duplicate default-redaction list.

## T4 — Define narrow Zed types

### Files

```text
src/core/zed-eval/types.ts
```

### Objective

Define only the request, admission, external result, normalized receipt, and error classifications needed by one terminal run.

### Subtasks

- [ ] T4.1 Define `ZedEvalMode = "read-only" | "writable"`.
- [ ] T4.2 Define requested model, timeout, staff/reasoning/thinking fields.
- [ ] T4.3 Define explicit absolute binary path field.
- [ ] T4.4 Define canonical workdir field.
- [ ] T4.5 Define optional suffix file.
- [ ] T4.6 Define disposable-worktree acknowledgement.
- [ ] T4.7 Define validated upstream statuses.
- [ ] T4.8 Define upstream result metrics as optional, never default-zero.
- [ ] T4.9 Define artifact paths.
- [ ] T4.10 Define wrapper outcome classes:
  - accepted upstream terminal result;
  - admission failure;
  - spawn failure;
  - supervisor timeout;
  - artifact failure;
  - schema failure;
  - coherence failure.
- [ ] T4.11 Define provenance as expected pin + actual verification state.
- [ ] T4.12 Do not add generic adapter ids, capabilities, handles, events, or polling state.

### Exit criteria

No type implies asynchronous lifecycle or multiple runtimes.

## T5 — Implement strict `result.json` validation

### Files

```text
src/core/zed-eval/result-schema.ts
tests/zed-eval-result-schema.test.ts
```

### Objective

Validate untrusted external JSON without a type assertion boundary.

### Subtasks

- [ ] T5.1 Implement plain-object guard.
- [ ] T5.2 Validate status enum.
- [ ] T5.3 Validate non-empty model.
- [ ] T5.4 Validate `duration_secs` finite and non-negative.
- [ ] T5.5 Validate optional `timeout_secs`.
- [ ] T5.6 Validate optional token counters as non-negative safe integers.
- [ ] T5.7 Validate optional step/tool counts as non-negative safe integers.
- [ ] T5.8 Validate `tool_calls` map.
- [ ] T5.9 Validate each tool name and count.
- [ ] T5.10 Check per-tool sum vs `tool_call_count` when both exist.
- [ ] T5.11 Enforce error-field semantics.
- [ ] T5.12 Enforce requested-model equality.
- [ ] T5.13 Implement exact exit/status coherence helper.
- [ ] T5.14 Reject unknown exit code.
- [ ] T5.15 Preserve absent optional fields as absent.
- [ ] T5.16 Decide closed-schema vs forward-compatible unknown fields and document it.
- [ ] T5.17 Add fixtures for each valid status.
- [ ] T5.18 Add malformed root, status, number, model, error, and tool map tests.
- [ ] T5.19 Add all mismatch pairs.
- [ ] T5.20 Add very large/unsafe-number cases.

### Exit criteria

Validation can be fully tested without launching a child process.

## T6 — Implement admission and run-path allocation

### Files

```text
src/core/zed-eval/admission.ts
tests/zed-eval-admission.test.ts
```

### Objective

Fail before model/process launch whenever path, mode, or disposable-state invariants are not proven.

### Common subtasks

- [ ] T6.1 Require absolute binary path.
- [ ] T6.2 Canonicalize binary path.
- [ ] T6.3 Require regular executable file.
- [ ] T6.4 Canonicalize workdir.
- [ ] T6.5 Require Git worktree.
- [ ] T6.6 Validate non-empty instruction.
- [ ] T6.7 Validate `provider/model` form.
- [ ] T6.8 Validate positive safe-integer timeout.
- [ ] T6.9 Validate reasoning effort enum.
- [ ] T6.10 Preserve thinking omitted/true/false.
- [ ] T6.11 Canonicalize optional suffix file.
- [ ] T6.12 Require suffix file regular/readable/non-empty if that remains approved.
- [ ] T6.13 Resolve canonical `.ai/harness/runs/zed-eval`.
- [ ] T6.14 Generate sortable collision-resistant run ID.
- [ ] T6.15 Create run root exclusively.
- [ ] T6.16 Prove run root remains beneath canonical runs root.
- [ ] T6.17 Require `artifacts/` absent pre-launch.
- [ ] T6.18 Reject symlink/path escape.
- [ ] T6.19 Reject arbitrary output-dir selection.

### Read-only subtasks

- [ ] T6.20 Default omitted mode to `read-only`.
- [ ] T6.21 Reject `--disposable-worktree` in read-only mode.
- [ ] T6.22 Return the exact pinned disable list.
- [ ] T6.23 Override ambient `ZED_EVAL_DISABLE_TOOLS`.
- [ ] T6.24 Record wording that the wrapper writes ignored evidence even in read-only mode.
- [ ] T6.25 Never return `sandboxed: true`.

### Writable subtasks

- [ ] T6.26 Require `--mode writable`.
- [ ] T6.27 Require `--disposable-worktree`.
- [ ] T6.28 Prove linked worktree using Git metadata.
- [ ] T6.29 Prove it is not the primary worktree.
- [ ] T6.30 Prove clean tracked + untracked state.
- [ ] T6.31 Create fresh `<runId>/home`.
- [ ] T6.32 Prove HOME under run root.
- [ ] T6.33 Prove HOME differs from operator HOME.
- [ ] T6.34 Deny `create_thread,spawn_agent`.
- [ ] T6.35 Optionally isolate XDG dirs only if platform behavior is validated.
- [ ] T6.36 Never create/remove the linked worktree.
- [ ] T6.37 Never fall back to primary worktree or operator HOME.

### Tests

Cover primary worktree, ordinary clone, linked worktree, dirty/untracked state, symlinks, collision, containment, executable path failures, and environment override attempts.

### Exit criteria

A failed admission cannot produce a launchable request.

## T7 — Implement the one synchronous effect

### Files

```text
src/effects/zed-eval/run-zed-eval.ts
tests/zed-eval-runner.test.ts
```

### Objective

Translate an admitted request into one supervised local `eval-cli` run and one validated terminal receipt.

### Subtasks

- [ ] T7.1 Build argument array; never shell string.
- [ ] T7.2 Pass canonical `--workdir`.
- [ ] T7.3 Pass redacted `--instruction`.
- [ ] T7.4 Pass `--model`.
- [ ] T7.5 Pass inner `--timeout`.
- [ ] T7.6 Pass exact absent `--output-dir`.
- [ ] T7.7 Conditionally pass suffix/staff/reasoning/thinking.
- [ ] T7.8 Reject unknown/passthrough args at earlier boundary.
- [ ] T7.9 Build deterministic environment overrides.
- [ ] T7.10 Read-only: exact pinned disable list.
- [ ] T7.11 Writable: at least `create_thread,spawn_agent`.
- [ ] T7.12 Writable: pass fresh HOME.
- [ ] T7.13 Preserve inherited provider secrets without serializing them.
- [ ] T7.14 Add prompt-specific shared additive redaction.
- [ ] T7.15 Call `runProcess` with `processGroup: true`.
- [ ] T7.16 Set bounded diagnostic output.
- [ ] T7.17 Set outer timeout = inner timeout + named artifact-flush grace.
- [ ] T7.18 Never auto-retry.
- [ ] T7.19 If supervisor times out, classify as wrapper failure.
- [ ] T7.20 Accept only exit 0–3 for upstream terminal validation.
- [ ] T7.21 Read bounded `result.json` only from current run.
- [ ] T7.22 Validate JSON.
- [ ] T7.23 Enforce exit/status coherence.
- [ ] T7.24 Validate artifact paths/types/containment.
- [ ] T7.25 Treat transcripts as opaque.
- [ ] T7.26 Post-check reported tools against mandatory disabled list where metrics permit.
- [ ] T7.27 Return one terminal receipt.
- [ ] T7.28 Retain current ignored run directory on failure for diagnosis.

### Exit criteria

One function call creates at most one child run and returns only after terminal validation.

## T8 — Implement the CLI

### Files

```text
src/cli/commands/zed-eval.ts
src/cli/index.ts
tests/cli/zed-eval.test.ts
```

### Objective

Expose the narrow operation with explicit validation and stable output.

### Subtasks

- [ ] T8.1 Add top-level `zed-eval` builder.
- [ ] T8.2 Require `--binary`.
- [ ] T8.3 Require `--workdir` or define current-dir behavior explicitly; prefer explicit.
- [ ] T8.4 Support `--instruction`.
- [ ] T8.5 Support stdin when instruction option absent.
- [ ] T8.6 Reject conflicting instruction sources.
- [ ] T8.7 Reject empty stdin.
- [ ] T8.8 Support suffix/model/timeout/no-staff/reasoning/thinking/mode/disposable/json.
- [ ] T8.9 Parse `--thinking` as real boolean, not truthy string.
- [ ] T8.10 Default mode to read-only.
- [ ] T8.11 Do not expose `--output-dir`.
- [ ] T8.12 Do not expose `--printenv`.
- [ ] T8.13 Do not support raw extra args.
- [ ] T8.14 Print concise text receipt.
- [ ] T8.15 Print stable JSON receipt.
- [ ] T8.16 Omit prompt, API keys, transcript bodies.
- [ ] T8.17 Print artifact sensitivity warning.
- [ ] T8.18 Preserve validated upstream exits 0–3.
- [ ] T8.19 Use documented adapter error code outside 0–3 for wrapper failures.
- [ ] T8.20 Import builder in `src/cli/index.ts`.
- [ ] T8.21 Add `'zed-eval'` to `SUBCOMMANDS`.
- [ ] T8.22 Add `program.addCommand(buildZedEvalCommand())`.
- [ ] T8.23 Ensure no `fleet` alias.
- [ ] T8.24 Ensure no cancel/status subcommands.

### Exit criteria

Root help discovers `zed-eval`; the command is one-shot and terminal.

## T9 — Build deterministic fake `eval-cli`

### Objective

Test the full runner without credentials, network, or a real Zed binary.

### Fixture modes

- [ ] T9.1 `completed`
- [ ] T9.2 `error-pre-thread`
- [ ] T9.3 `error-with-thread`
- [ ] T9.4 `timeout`
- [ ] T9.5 `interrupted`
- [ ] T9.6 `status-mismatch`
- [ ] T9.7 `unknown-exit`
- [ ] T9.8 `malformed-result`
- [ ] T9.9 `missing-result`
- [ ] T9.10 `bad-model`
- [ ] T9.11 `bad-counts`
- [ ] T9.12 `forbidden-tool`
- [ ] T9.13 `symlink-thread`
- [ ] T9.14 `oversized-result`
- [ ] T9.15 `sleep`
- [ ] T9.16 `secret-output`

### Fixture requirements

- parse only pinned flags;
- reject duplicate singleton flags;
- record sanitized argv and selected env;
- never write provider key values;
- write deterministic artifacts;
- allow test-only behavior only through test harness injection, not production CLI.

### Exit criteria

All runner behavior can be exercised offline.

## T10 — Focused automated verification

### Commands

```bash
bun test tests/zed-eval-result-schema.test.ts
bun test tests/zed-eval-admission.test.ts
bun test tests/zed-eval-runner.test.ts
bun test tests/cli/zed-eval.test.ts
bun test tests/process-runner.test.ts
bun run check:type
```

### Required assertions

- [ ] T10.1 Prompt absent from diagnostic command/error.
- [ ] T10.2 Default secret redactions still work.
- [ ] T10.3 Read-only disable list exact.
- [ ] T10.4 Ambient disable-list override cannot weaken it.
- [ ] T10.5 Writable admission rejects primary worktree.
- [ ] T10.6 Writable admission rejects dirty linked worktree.
- [ ] T10.7 Fresh HOME is used only after writable admission.
- [ ] T10.8 Output path unique and absent before child launch.
- [ ] T10.9 Supervisor timeout differs from upstream timeout.
- [ ] T10.10 All four valid status pairs accepted.
- [ ] T10.11 All mismatches rejected.
- [ ] T10.12 Missing/malformed result rejected.
- [ ] T10.13 Artifact symlink/escape rejected.
- [ ] T10.14 Optional metrics remain absent when absent.
- [ ] T10.15 Disabled-tool report rejected.
- [ ] T10.16 No automatic retry.
- [ ] T10.17 No fleet/cancel/status command appears.

## T11 — Architecture projection and repository gates

### Subtasks

- [ ] T11.1 Re-run capability resolution with actual changed paths.
- [ ] T11.2 Review `archctx docs plan --json`.
- [ ] T11.3 Apply only reviewed generated changes.
- [ ] T11.4 Process required refresh signals.
- [ ] T11.5 Confirm no duplicate ownership.
- [ ] T11.6 Run architecture sync.
- [ ] T11.7 Run task sync.
- [ ] T11.8 Run reference-config/helper checks if touched.
- [ ] T11.9 Run full tests.
- [ ] T11.10 Run typecheck.
- [ ] T11.11 Run `git diff --check`.
- [ ] T11.12 Inspect changed path set against contract.

### Repository checks

Use the current root contract. At minimum, reconcile with the checks documented in the MVP2 tutorial:

```bash
bun test
bash scripts/check-deploy-sql-order.sh
bash scripts/check-architecture-sync.sh
bash scripts/check-task-sync.sh
repo-harness run check-task-workflow --strict
bun scripts/inspect-project-state.ts --repo . --format text
bun src/cli/index.ts init --repo . --dry-run
bun run check:type
```

Do not claim a check passed unless it ran successfully.

## T12 — Manual read-only canary

### Objective

Prove the wrapper against a harmless repository before any writable model run.

### Subtasks

- [ ] T12.1 Use a tiny non-sensitive committed fixture repo.
- [ ] T12.2 Build `eval-cli` from the pinned Zed checkout.
- [ ] T12.3 Verify binary path/checkout SHA.
- [ ] T12.4 Load provider key from secret manager/environment.
- [ ] T12.5 Run read-only command with a harmless read task.
- [ ] T12.6 Confirm valid status/exit pair.
- [ ] T12.7 Confirm fixture tracked state unchanged.
- [ ] T12.8 Confirm mandatory disabled tools were not reported.
- [ ] T12.9 Confirm artifact path unique.
- [ ] T12.10 Confirm no key/prompt/transcript body leaked to terminal output.
- [ ] T12.11 Record cost/data-handling observations without secrets.
- [ ] T12.12 Do not auto-resubmit on uncertainty.

### Exit criteria

Read-only canary succeeds and evidence is retained safely.

## T13 — Optional writable canary

### Preconditions

All T0–T12 gates pass and writable external-model execution is explicitly authorized.

### Subtasks

- [ ] T13.1 Create caller-owned linked worktree from harmless fixture.
- [ ] T13.2 Confirm it starts clean.
- [ ] T13.3 Run with `--mode writable --disposable-worktree`.
- [ ] T13.4 Ask for one harmless file change.
- [ ] T13.5 Confirm primary worktree unchanged.
- [ ] T13.6 Confirm change only in linked worktree.
- [ ] T13.7 Confirm receipt HOME is fresh and under run root.
- [ ] T13.8 Confirm subagent tools disabled.
- [ ] T13.9 Review artifacts.
- [ ] T13.10 Remove/prune linked worktree manually after review.

## T14 — Final closeout review

### Objective

Confirm the implementation did not expand beyond the approved MVP.

### Subtasks

- [ ] T14.1 Review every changed path.
- [ ] T14.2 Confirm no generic fleet directories/interfaces.
- [ ] T14.3 Confirm no remote benchmark lifecycle was copied into MVP2.
- [ ] T14.4 Confirm no binary/install packaging changes.
- [ ] T14.5 Confirm no workflow compatibility changes.
- [ ] T14.6 Confirm no hook/review/AcceptanceReceipt changes.
- [ ] T14.7 Confirm no tracked raw run evidence.
- [ ] T14.8 Confirm architecture ownership is unique.
- [ ] T14.9 Confirm source claims still match the pin.
- [ ] T14.10 Archive/promote only durable conclusions.
- [ ] T14.11 Complete normal contract closeout.

## Completion definition

MVP2 is complete only when:

- one synchronous `repo-harness zed-eval` command exists;
- it uses the existing shared process authority;
- prompt redaction preserves default secret redaction;
- default mode restricts pinned built-in mutation/network/shell/subagent tools;
- writable mode is fail-closed behind linked-worktree + clean-state + fresh-HOME proof;
- unique run evidence is used;
- external results are strictly runtime-validated;
- upstream and supervisor timeouts remain distinct;
- offline tests cover failure envelopes;
- architecture ownership is unambiguous;
- no generic fleet/runtime subsystem was introduced.
