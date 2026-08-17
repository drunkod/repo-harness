# Zed Eval MVP2 — Human Manual Test Runbook

## Scope

This runbook validates the **local/headless MVP2 adapter around Zed's Rust/native-agent `eval-cli`**.

It does **not** validate:

- the editor UI/manual-send flow driven by `zed://agent?prompt=...`;
- the Python `zed-eval` remote benchmark/orchestration system;
- installers, compatibility hooks, review hooks, fleet/runtime registries, or remote benchmark infrastructure.

The MVP2 command is intentionally a synchronous, single-process local adapter.

## Safety and environment assumptions

Use a disposable repository/worktree and test credentials only.

Read-only mode is implemented by disabling mutation/network-capable agent tools. It is **not** an operating-system sandbox, container sandbox, or network namespace.

Writable mode is more restrictive at admission time: it must run from a clean, linked, non-primary disposable worktree and requires the writable/disposable-worktree opt-in.

## Known read-only disabled tools

The read-only contract disables exactly these tools:

```text
copy_path
create_directory
create_thread
delete_path
apply_code_action
edit_file
write_file
fetch
move_path
rename_symbol
spawn_agent
terminal
search_web
```

## Prerequisites

1. Check out the PR branch you intend to validate.
2. Install repository dependencies using the repository's normal Bun workflow.
3. Build or locate the operator-managed `eval-cli` intended to match the pinned Zed source contract. Record its canonical absolute executable path and pass that path explicitly with `--binary`. MVP2 does not resolve `eval-cli` from `PATH`; binary provenance remains recorded as unverified.
4. Confirm Git is installed.
5. For writable tests, create a **linked, non-primary, clean disposable worktree**.
6. Do not place real API keys, access tokens, or private prompts in the test case.

Record the following before testing:

```bash
git rev-parse HEAD
git status --short
uname -a
EVAL_CLI=/absolute/path/to/eval-cli
test -x "$EVAL_CLI"
"$EVAL_CLI" --help
```

## Baseline repository gates

Run the repository's normal dependency install first, then run the project gates exposed by `package.json`.

At minimum, verify the scripts relevant to this change:

```bash
bun run check:type
bun test
bash scripts/check-architecture-sync.sh
```

If the repository exposes a combined CI/check script, run that as well.

The intended baseline is:

- TypeScript typecheck passes.
- Unit/integration tests pass.
- Architecture sync passes without disabling or weakening the checker.

## Inspect the CLI contract

Before manual execution, use the checked-out branch's own help text as the source of truth for current flag spelling:

```bash
bun run src/cli/index.ts zed-eval --help
```

If your branch exposes the CLI through a package script/binary instead, use that wrapper and capture its `zed-eval --help` output in the evidence bundle.

Do not infer undocumented flags from this runbook if the branch help differs.

## Read-only happy path

Run one small local evaluation in read-only mode using a harmless prompt and the exact required arguments shown by `zed-eval --help`.

Expected behavior:

1. Admission succeeds.
2. Exactly one native `eval-cli` process is launched.
3. The process is launched with process-group handling enabled by the shared process runner.
4. Mutation/network-capable agent tools listed above are disabled.
5. The adapter allocates a run directory under:

```text
.ai/harness/runs/zed-eval/<runId>/
```

6. The adapter does **not** pre-create the `artifacts/` directory before the child process runs.
7. On successful completion, the allowed child artifacts are present beneath the run root. The wrapper receipt is emitted by the CLI; use `--json` and capture stdout when durable receipt evidence is required.
8. `thread.md` / `thread.json`, when produced, are treated as opaque artifacts rather than parsed as trusted structured control data.
9. Exit status, result status, and receipt status are coherent.

Capture:

```bash
find .ai/harness/runs/zed-eval -maxdepth 4 -type f -print | sort
```

Capture the wrapper receipt from `zed-eval --json` stdout and preserve it as evidence alongside the child-produced `result.json` copied from the run directory.

## Writable admission tests

Writable mode must be tested separately from read-only mode.

### Case A — primary checkout rejection

From the primary checkout, attempt writable mode with the required writable/disposable-worktree opt-in.

Expected result:

- admission is rejected before child-process launch;
- no normal run allocation/receipt is synthesized for the rejected attempt;
- CLI maps the admission failure to exit code **4**.

### Case B — dirty linked worktree rejection

Create or enter a linked non-primary worktree, make it dirty, then attempt writable mode.

Expected result:

- admission is rejected before process launch;
- no synthetic receipt is created;
- exit code is **4**.

### Case C — clean linked disposable worktree acceptance

Create a linked non-primary worktree on a disposable branch, confirm it is clean, then run writable mode with the explicit disposable-worktree opt-in.

Example setup:

```bash
git worktree add ../repo-harness-zed-eval-disposable -b test/zed-eval-mvp2-disposable
cd ../repo-harness-zed-eval-disposable
git status --short
```

Expected result:

- writable admission succeeds;
- the child process receives a fresh per-run `HOME`;
- subagents remain disabled;
- artifacts stay confined to the run's expected locations plus whatever repository changes the explicitly writable test is designed to exercise.

Remove the disposable worktree after evidence is collected.

## Failure-mode matrix

Exercise the cases below with the branch's existing tests/fake `eval-cli` harness where possible. For manual native-binary testing, only trigger failures that are safe and deterministic.

| Case | Expected contract |
|---|---|
| `eval-cli` missing / spawn failure | operational failure; CLI exit code 4 |
| timeout | child/process group is terminated; failure receipt/result remains coherent |
| interruption | child/process group is terminated; result/receipt coherence enforced |
| missing `result.json` | rejected as invalid run result |
| malformed `result.json` | rejected |
| oversized `result.json` | rejected; implementation limit is 256 KiB |
| result status vs process exit mismatch | rejected |
| unknown/unmapped exit status | rejected |
| invalid model/count fields | rejected |
| forbidden tool reported in read-only run | rejected |
| transcript artifact escaping via symlink | rejected |
| secret-bearing child stdout/stderr | diagnostics are redacted using additive redaction rules |

The test harness implemented for this MVP includes deterministic modes corresponding to these classes, including:

```text
completed
error
error-pre-thread
error-with-thread
timeout
interrupted
status-mismatch
unknown-exit
malformed-result
missing-result
bad-model
bad-counts
forbidden-tool
symlink-thread
oversized-result
sleep
secret-output
```

## Result/receipt coherence checks

For each completed or failed allocated run:

1. Identify the run root:
   `.ai/harness/runs/zed-eval/<runId>/`.
2. Capture the wrapper receipt from `zed-eval --json` stdout and inspect the child-produced `result.json`.
3. Confirm status and process exit semantics agree.
4. Confirm artifact paths do not escape the expected run root.
5. Confirm any transcript artifacts are regular in-scope artifacts and not symlink escapes.
6. Confirm diagnostics do not contain intentionally supplied secret test values.

Admission failures are different: they occur **before run allocation**, so the expected behavior is no synthetic normal receipt for that rejected invocation.

## Privacy and redaction test

Use an unmistakable fake secret, for example:

```text
ZED_EVAL_TEST_SECRET_DO_NOT_USE_12345
```

Never use a real credential.

Cause the fake `eval-cli` test double to emit that value in stdout/stderr.

Expected result:

- user-facing diagnostics and persisted diagnostic surfaces apply the repository's existing redaction defaults plus the MVP2 additive redactions;
- the fake secret is not exposed in CLI diagnostics.

Search only the disposable test output/run directory:

```bash
grep -R --line-number --fixed-strings \
  'ZED_EVAL_TEST_SECRET_DO_NOT_USE_12345' \
  .ai/harness/runs/zed-eval 2>/dev/null || true
```

Interpret results according to the exact artifact contract in the branch; do not broaden this into a claim of OS-level secret isolation.

## Evidence bundle

For each manual validation run, save:

- Git commit SHA;
- operating system and architecture;
- exact command line;
- exact `zed-eval --help` output used to derive flags;
- `eval-cli` path and version;
- CLI exit code;
- run ID;
- JSON receipt captured from `zed-eval --json` stdout;
- `result.json`;
- sorted artifact tree;
- relevant stdout/stderr with secrets already redacted;
- a short observation stating whether expected behavior matched actual behavior.

Suggested evidence layout:

```text
manual-evidence/
  environment.txt
  command.txt
  help.txt
  exit-code.txt
  run-tree.txt
  receipt.json      # captured CLI --json stdout
  result.json       # child artifact copied from the run directory
  stdout.txt
  stderr.txt
  observations.md
```

## Acceptance checklist

- [ ] Typecheck passes.
- [ ] Tests pass.
- [ ] `bash scripts/check-architecture-sync.sh` passes.
- [ ] `zed-eval --help` exposes the expected MVP2 local adapter.
- [ ] Read-only happy path succeeds.
- [ ] Exact read-only disabled-tool contract is enforced.
- [ ] Primary-checkout writable attempt is rejected before allocation.
- [ ] Dirty linked-worktree writable attempt is rejected before allocation.
- [ ] Clean linked disposable worktree writable attempt is admitted.
- [ ] Writable run receives a fresh per-run `HOME`.
- [ ] Missing/malformed/oversized result cases fail closed.
- [ ] Process/result/status coherence is enforced.
- [ ] Forbidden-tool evidence fails closed.
- [ ] Symlink transcript escape fails closed.
- [ ] Secret test output is redacted from diagnostics.
- [ ] Run evidence is captured without real credentials.
- [ ] No remote Python benchmark orchestration was introduced or exercised as part of MVP2.
