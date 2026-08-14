# Implementation and Testing Tutorial: Zed Eval MVP 3

> The benchmark-only implementation now exists. This document describes
> validation and acceptance of that implementation. It does not authorize a
> paid canary, deployment, cancellation, or generic fleet/writer capability.
>
> Production source and tests are authoritative for executable behavior. The
> audit and plan documents remain authoritative for scope and stop conditions.

## 1. Understand the product before touching files

The future command is a remote benchmark controller:

```bash
repo-harness zed-benchmark submit \
  --zed-checkout /absolute/path/to/pinned/zed \
  --source-sha 0123456789abcdef0123456789abcdef01234567 \
  --namespace repo-harness-evals \
  --benchmark rf \
  --model sonnet-4.6 \
  --n-tasks 2 \
  --n-concurrent 1 \
  --acknowledge-remote-cost-and-data
```

It is not:

- a way to run a prompt against the current repo-harness checkout;
- an arbitrary-repository remote worker;
- a mergeable-patch producer;
- a generic `fleet` runtime;
- a sandbox attestation;
- a repo-harness writer lease;
- a Zed editor host integration;
- a Claude/Codex-compatible provider/reviewer;
- a deployment manager; or
- a cancellable job API.

The source passed to `--source-sha` is **Zed source used to build `eval-cli`**.
The benchmark harness supplies its own benchmark task repository/data.

If the actual requirement is “run this repo-harness task remotely and return a
patch,” stop. `zed-eval` is the wrong upstream API for that product.

## 2. Freeze the upstream contract

### 2.1 Choose one immutable Zed commit

The planning audit used:

```text
24e25552b1259d56a6fdd7956a419ed9e8a1a25e
```

Before implementation, choose the supported commit and record it in the active
plan and task notes. Do not use `main`, an unpinned editable install, or “latest.”

### 2.2 Verify the exact files

Read at the selected commit:

```text
crates/eval_cli/zed_eval/README.md
crates/eval_cli/zed_eval/cli.py
crates/eval_cli/zed_eval/launch.py
crates/eval_cli/zed_eval/run_index.py
crates/eval_cli/zed_eval/volume.py
crates/eval_cli/zed_eval/report.py
crates/eval_cli/zed_eval/tests/
```

Record evidence for:

1. supported benchmark selectors;
2. `run --run-id` behavior;
3. one-benchmark ID behavior;
4. source SHA/clean-source behavior;
5. state JSON shape and values;
6. namespace/experiment lookup options;
7. fetch `--jobs-dir` behavior;
8. report `--job-dir --json` behavior;
9. local run-index semantics;
10. deployment side effects; and
11. absence or presence of a real per-run cancel API.

Any drift changes the contract. Update the plan before code.

### 2.3 Understand the two pins

The revised design uses two distinct commits:

| Pin | Meaning |
|---|---|
| integration pin | checkout commit containing the reviewed Python orchestrator |
| source SHA | clean Zed source commit built into `eval-cli` for the benchmark |

The wrapper executes the one-off script from the integration-pin checkout and
passes the source SHA to `--from`.

## 3. Complete repository workflow preflight

From the repository root:

```bash
git status --short --branch
git branch --show-current
```

Capture an approved work-package plan and promote it through
`repo-harness run plan-to-todo --plan <approved-plan>`. Use the policy-required
contract worktree. Do not implement directly on the documentation branch.

The active contract must include an `EXECUTION_BOUNDARY` that forbids:

```text
src/core/fleet/**
src/effects/fleet/**
src/cli/commands/fleet.ts
src/cli/installer/**
src/cli/hook/route-registry.ts
src/core/review/**
src/effects/review/**
assets/templates/helpers/install-agent-fleet.sh
assets/workflow-contract.v1.json
.ai/harness/workflow-contract.json
```

It must also forbid cancellation, deploy automation, multi-benchmark suites,
rejudge, baseline, cleanup, arbitrary pass-through args, moving source refs, and
custom secret/repository overrides.

## 4. Bind architecture ownership first

The current ArchContext model claims:

- `tests/**` under `capability.verification.evals-checks`; and
- `src/cli/index.ts` under
  `capability.runtime-harness.global-runtime-reconciliation`.

The new core/effect/command paths need explicit ownership.

Edit the appropriate capability source of truth, likely:

```text
.archcontext/model/nodes/capability.verification.evals-checks.yaml
```

Add responsibility and exact includes for:

```text
src/core/zed-benchmark/**
src/effects/zed-benchmark/**
src/cli/commands/zed-benchmark.ts
docs/reference-configs/external-tooling.md
assets/reference-configs/external-tooling.md
```

Preserve existing fields. If the corresponding component node needs changes,
include them in the contract.

Plan the projection:

```bash
archctx docs plan --json
```

Record every generated path reported by the plan. Apply through the configured
projection provider; do not hand-edit generated architecture modules.

## 5. Add the core contracts

Create:

```text
src/core/zed-benchmark/types.ts
src/core/zed-benchmark/admission.ts
src/core/zed-benchmark/state-schema.ts
```

### 5.1 Types

Use the proposed types as the starting point. Keep remote and local phases
separate:

```text
remote: pending | running | completed | failed
local:  submitting | submission-uncertain | remote phases
```

Why this matters: a local process timeout is not a remote phase. The run may
already exist remotely.

Do not add:

```text
writable
nativeSandbox
cancelled
adapterId
RemoteOrchestrationAdapter
FleetRuntimeAdapter
```

### 5.2 Admission

Admission must reject before effects:

- relative checkout paths;
- integration pin mismatch;
- non-full/mixed-case/short source hashes;
- `local`, `main`, tags, branches, and patch paths;
- unsupported or multiple benchmark selectors;
- task count outside the approved range;
- concurrency outside the approved range or greater than tasks;
- malformed namespace/model values; and
- missing cost/data acknowledgement.

The CLI must expose no raw argument passthrough that bypasses these checks.

### 5.3 JSON validators

Do not parse lifecycle from prose:

```ts
const state = parseZedBenchmarkState(stdout);
```

The parser should reject:

- empty/truncated/prose-prefixed output;
- null/array/scalar JSON;
- missing/non-string status;
- unknown status; and
- wrong optional field types.

A new upstream status is contract drift, not an `unknown` value to continue
through.

Report parsing is separate. Report metrics do not determine remote lifecycle.

## 6. Implement safe local receipts

Create:

```text
src/effects/zed-benchmark/receipt-store.ts
```

The canonical layout is:

```text
.ai/harness/runs/zed-benchmark/<run-id>/
├── receipt.json
└── artifacts/
    └── <run-id>/
```

`.ai/harness/runs/` is already ignored raw evidence.

### Receipt purpose

The receipt records:

- the exact policy-approved invocation;
- the generated upstream run ID;
- explicit namespace/experiment;
- integration/source pins;
- resource limits;
- local phase and timestamps; and
- canonical relative evidence paths.

It does not replace upstream state or the upstream run index.

### Safety properties

- validate generated run ID before constructing a path;
- prove containment under the canonical repository root;
- reject symlinked receipt components;
- create one run directory once;
- use restrictive directory/file permissions where supported;
- write atomically through same-directory temporary files;
- validate the entire receipt on read;
- distinguish missing, corrupt, conflict, path, and transition errors;
- preserve immutable request fields; and
- enforce legal transitions.

### Why persist before submit

The correct order is:

```text
generate exact upstream run id
  -> persist phase=submitting
  -> invoke zed-eval run --run-id <same id>
  -> clean exit: phase=pending
  -> ambiguous failure: phase=submission-uncertain
```

Never allocate an ID after the remote call and never parse it from output.

## 7. Implement external effects

Create:

```text
src/effects/zed-benchmark/run-zed-benchmark.ts
```

Reuse:

```ts
runProcess(command, args, {
  processGroup: true,
  stdio: 'pipe',
  timeoutMs,
  maxOutputBytes,
});
```

Do not call `spawn`, `spawnSync`, `exec`, or `execFile` directly.

### 7.1 Verify the orchestrator checkout

Resolve:

```text
<zedCheckout>/crates/eval_cli/script/zed-eval
```

Before state-changing submission, run:

```bash
git -C <zedCheckout> rev-parse HEAD
```

Require exact equality to the integration pin. Do not fetch, checkout, reset,
install, or mutate the Zed checkout.

The final helper should repeat pin verification for later operations or prove an
equivalent immutable binary identity. A stored path/pin is evidence, not current
verification.

### 7.2 Build deterministic submit argv

For one benchmark:

```text
<one-off-zed-eval-script>
  --namespace <stored-namespace>
  --volume agent-evals
  run <benchmark>
  --run-id <generated-run-id>
  --from <full-source-sha>
  --require-clean
  --model <model>
  --n-tasks <bounded-count>
  --n-concurrent <bounded-count>
  --override-cpus <approved>
  --override-memory-mb <approved>
  --sandbox-timeout-secs <approved>
  --sandbox-idle-timeout-secs <approved>
```

Assert forbidden options are absent in tests.

### 7.3 Classify submission

A clean exit means the submit command returned successfully; store `pending`.

Timeout, signal, nonzero exit, or an inconsistent wrapper failure after the
receipt exists means:

```text
submission-uncertain
```

The user-facing instruction is:

```text
do not retry submit; run status with this run ID
```

Do not say “failed to submit” unless the implementation can prove failure
occurred before remote record creation. MVP need not make that narrower proof.

### 7.4 Status

Call with exact stored locator values:

```bash
zed-eval \
  --namespace <namespace> \
  --volume agent-evals \
  status <run-id> \
  --experiment-name <benchmark>
```

Parse stdout as exact JSON. Check run ID/namespace/experiment fields when
present. Apply only legal receipt transitions.

Do not downgrade `completed` to `running` if stale remote data appears; surface a
transition error and investigate.

### 7.5 Logs

Logs are explicit and potentially sensitive:

```bash
repo-harness zed-benchmark logs --run-id <id>
```

Use bounded/redacted `runProcess` output. Do not automatically persist or promote
logs. Warn that remote and fetched logs are not globally sanitized.

### 7.6 Fetch

Never use the upstream default home-cache destination. Pass:

```bash
--jobs-dir <repo>/.ai/harness/runs/zed-benchmark/<id>/artifacts
```

After success, require this exact directory:

```text
<jobs-dir>/<run-id>/
```

The upstream implementation uses safe archive extraction at the reviewed pin,
but the integration must repin and retest it.

### 7.7 Report

Do not run `report --fetch --json` and parse all stdout: fetch prints progress.
Use two phases:

```text
fetch --jobs-dir <exact>
report <id> --job-dir <exact-jobs-dir>/<id> --json
```

Parse the report as JSON and validate its top-level metrics. Report failure does
not rewrite a completed remote lifecycle into failed.

### 7.8 Operations that must not exist

Search the final code and tests to confirm there is no invocation of:

```text
zed-eval deploy
zed-eval cancel
zed-eval cleanup
zed-eval rejudge
zed-eval baseline
zed-eval suite
```

## 8. Add the command module

Create:

```text
src/cli/commands/zed-benchmark.ts
```

The builder exposes:

```text
zed-benchmark submit
zed-benchmark status
zed-benchmark logs
zed-benchmark fetch
zed-benchmark report
```

### Submit UX

Required options should make cost/source intent visible. There must be no hidden
environment-only path around the acknowledgement.

Text success output should include only:

- outcome (`submitted` or `submission-uncertain`);
- generated run ID;
- safe next action; and
- repository-relative receipt location if useful.

Do not print:

- secrets or environment;
- source patch;
- raw external command;
- full absolute checkout/artifact paths by default; or
- unbounded logs.

### JSON mode

Keep stdout valid JSON. Diagnostics belong on stderr. At minimum include:

```json
{
  "outcome": "submitted",
  "runId": "rh-zb-...",
  "phase": "pending",
  "receipt": ".ai/harness/runs/zed-benchmark/rh-zb-..."
}
```

For uncertainty, preserve the run ID and use a nonzero exit. Do not emit a second
prose line to stdout.

### Help text

Top-level help must say:

- benchmark-only;
- remote Modal/model cost and data sharing;
- no arbitrary current-repo task;
- no writer/fleet/provider claim;
- no cancellation; and
- never use deploy as cancellation.

## 9. Register the public command

Edit `src/cli/index.ts` in exactly three places:

1. import `buildZedBenchmarkCommand`;
2. add `zed-benchmark` to `SUBCOMMANDS`;
3. add `program.addCommand(buildZedBenchmarkCommand())`.

Leave unchanged:

```ts
const TARGET_HELP = 'codex|claude|both';
```

Confirm:

```bash
bun src/cli/index.ts --help
bun src/cli/index.ts zed-benchmark --help
```

The command should appear once and install help should remain Claude/Codex only.

## 10. Build tests without network or cost

### 10.1 Admission tests

Create:

```text
tests/zed-benchmark-admission.test.ts
```

Use table tests for all valid/invalid source, benchmark, task, concurrency,
namespace, model, checkout, pin, and acknowledgement cases.

Boundary cases:

```text
nTasks:      0, 1, max, max+1, NaN, Infinity, fractional
nConcurrent: 0, 1, max, max+1, >nTasks
source:      full sha, short sha, uppercase, local, main, tag, path
```

### 10.2 Schema tests

Create:

```text
tests/zed-benchmark-state-schema.test.ts
```

Copy minimal fixtures from the final upstream pin. Test all pinned phases and
malformed/prose/unknown cases. Keep report fixtures separate.

### 10.3 Receipt tests

Create:

```text
tests/zed-benchmark-receipt-store.test.ts
```

Test:

- create/load;
- duplicate create;
- atomic update;
- missing versus corrupt;
- truncated JSON;
- schema mismatch;
- run-ID mismatch/path traversal;
- symlinked path component;
- legal and illegal transitions;
- immutable fields unchanged; and
- `0700`/`0600` permissions where portable.

### 10.4 Runner tests

Create:

```text
tests/zed-benchmark-runner.test.ts
```

Inject a fake `runProcess`. Capture command, args, cwd, timeout, process-group,
and output cap.

Use a deterministic run ID and clock. Assert receipt exists with `submitting`
before the fake submit returns.

Failure matrix:

| Fake result | Required receipt | Retry? |
|---|---|---|
| clean exit | `pending` | no |
| timeout | `submission-uncertain` | never |
| signal | `submission-uncertain` | never |
| nonzero | `submission-uncertain` | never |
| thrown wrapper error after receipt | preserve/recover uncertain | never |

Then test status reconciliation using the same ID.

### 10.5 CLI integration tests

Create:

```text
tests/cli/zed-benchmark.test.ts
```

Use a temporary fake checkout containing:

```text
crates/eval_cli/script/zed-eval
```

Use fake executables/scripts to capture argv and synthesize state, logs, fetch
output, extracted directories, and report JSON. Run the real CLI entrypoint with
`spawnSync('bun', [CLI, ...])` only inside tests; production execution still uses
`runProcess`.

Assert:

- help and command registration;
- missing acknowledgement fails before fake `zed-eval` call;
- exact submit argv;
- exact generated run ID in argv/receipt/output;
- uncertain no-retry message;
- status JSON/text behavior;
- explicit logs only;
- exact jobs/job-dir paths;
- report JSON integrity; and
- no tracked files changed.

### 10.6 Forbidden-surface test

Add focused assertions or a boundary test that the implementation does not:

- create fleet paths;
- modify install target identifiers;
- add Zed compatibility metadata;
- register cancel/deploy; or
- import review/hook/installer modules.

## 11. Update synchronized external-tooling docs

Edit both:

```text
assets/reference-configs/external-tooling.md
docs/reference-configs/external-tooling.md
```

Document:

- exact upstream pin and repin procedure;
- separately managed Zed checkout;
- Modal/Harbor/provider prerequisites;
- benchmark-only scope;
- source SHA meaning;
- explicit task/concurrency/resource caps;
- cost/data acknowledgement;
- remote volume visibility and retention;
- ignored local artifact path;
- uncertain submission recovery;
- no cancellation; and
- separate manual deployment risk.

Run:

```bash
bun run check:reference-configs
```

Use the repository synchronization command if edits are generated from one
canonical side; do not let the mirrors drift.

## 12. Run focused validation

Start with:

```bash
bun test tests/zed-benchmark-admission.test.ts
bun test tests/zed-benchmark-state-schema.test.ts
bun test tests/zed-benchmark-receipt-store.test.ts
bun test tests/zed-benchmark-runner.test.ts
bun test tests/cli/zed-benchmark.test.ts
bun run check:type
bun run check:reference-configs
```

Then run architecture and root gates:

```bash
bash scripts/check-architecture-sync.sh
bash scripts/check-deploy-sql-order.sh
bash scripts/check-task-sync.sh
repo-harness run check-task-workflow --strict
bun scripts/inspect-project-state.ts --repo . --format text
bun src/cli/index.ts init --repo . --dry-run
bun test
```

Review:

```bash
git diff --check
git status --short
git diff --name-only
```

Every changed path must appear in the approved contract. No forbidden path may
appear.

## 13. Prepare the opt-in live canary

Ordinary tests must never invoke Modal, Harbor, model providers, or real Zed
tooling. Put the canary behind an explicit environment gate and keep it out of
normal CI.

### 13.1 Operator prerequisites

On the operator machine, separately:

```bash
<zed-checkout>/crates/eval_cli/script/zed-eval doctor
```

Do not pass `--create-volume` automatically. Do not deploy automatically.
Deployment can cancel in-flight work and must be a separate operator action.

Confirm:

- dedicated Modal service-user token;
- least-privilege provider secrets;
- expected workspace/volume/namespace;
- known quota and spending budget;
- no sensitive local Zed patch;
- clean full source SHA; and
- no active run that deployment could disrupt.

### 13.2 Use the smallest canary

Use:

```text
one benchmark
one task
one concurrent sandbox
approved model
approved resource caps
```

Immediately record the generated run ID and receipt.

### 13.3 Observe lifecycle

Run:

```bash
repo-harness zed-benchmark status --run-id <id>
```

Expected values are only the pinned phases. If status output drifts, stop and
repin; do not add a permissive parser during the canary.

### 13.4 Handle uncertain submission

If submit returns uncertainty:

```text
DO NOT submit again.
```

Use status with the same ID. If remote lookup cannot find it, inspect upstream
operator tooling and logs. A manual replacement run requires an explicit new
operator decision and new ID.

### 13.5 Fetch and report

After terminal completion:

```bash
repo-harness zed-benchmark fetch --run-id <id>
repo-harness zed-benchmark report --run-id <id> --json
```

Inspect:

```text
.ai/harness/runs/zed-benchmark/<id>/
```

Confirm all downloaded content stays under the run directory and remains
ignored.

### 13.6 Record observations, not raw secrets

Record durable conclusions in the plan's notes/review/research surface:

- supported upstream pin;
- observed state schema;
- approximate cost/resource usage;
- remote retention/access behavior;
- fetch/report path behavior;
- any schema/CLI drift; and
- rollback decision.

Do not copy raw credentials, complete logs, source patches, or benchmark archives
into tracked docs.

## 14. Security and privacy checklist

Before acceptance:

- [ ] No secret values appear in args generated by repo-harness.
- [ ] No full environment is logged.
- [ ] No custom secret names are accepted by the MVP CLI.
- [ ] No source patch/local source path is accepted.
- [ ] Remote volume access is documented as shared, not access control.
- [ ] Provider/model data sharing is documented.
- [ ] Local files are ignored and permission-restricted.
- [ ] Logs are explicit, bounded, and described as potentially sensitive.
- [ ] Archive extraction behavior is pinned and tested.
- [ ] Submit timeout cannot cause automatic duplicate cost.
- [ ] Deployment is never invoked by wrapper code.
- [ ] Cancellation is never claimed.

## 15. Rollback tutorial

Rollback of the code integration is local and does not control remote jobs.

### 15.1 Remove the product surface

Revert/delete the new future implementation files:

```text
src/core/zed-benchmark/
src/effects/zed-benchmark/
src/cli/commands/zed-benchmark.ts
focused tests
```

Remove only the three `src/cli/index.ts` registration edits.

Revert the ArchContext source change and apply the generated reverse projection.
Revert synchronized external-tooling documentation.

### 15.2 Validate rollback

Run the root required checks and confirm:

```bash
bun src/cli/index.ts --help
```

no longer lists `zed-benchmark`.

### 15.3 Do not perform destructive remote cleanup implicitly

Code rollback must not:

- run `zed-eval deploy`;
- claim in-flight runs are cancelled;
- delete Modal volume data;
- delete shared baselines/builds/runs;
- delete ignored local evidence without operator approval; or
- rotate/delete credentials as a hidden side effect.

Remote operational cleanup, if desired, is a separate audited operator task.

## 16. Final review questions

A reviewer should answer “yes” to all:

1. Is this visibly a benchmark wrapper rather than a generic agent runtime?
2. Is the orchestrator checkout pinned and verified?
3. Is benchmark source a full clean Zed SHA?
4. Is one explicit run ID generated and passed upstream?
5. Is the receipt written before submit?
6. Can an ambiguous submit be reconciled without retry?
7. Is state parsed from JSON with pinned phases?
8. Are fetch/report paths real and confined?
9. Are cost/data/security implications explicit?
10. Are generic fleet/writer/sandbox/cancel/provider claims absent?
11. Are architecture/reference/workflow projections synchronized?
12. Did every focused and root check actually pass?

Only then should the work package be accepted.
