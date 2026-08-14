# Zed Eval MVP 3 — Human Manual PC Test Runbook

This runbook is for a human operator validating the `repo-harness zed-benchmark`
MVP 3 implementation on a local machine.

It separates three different things that must not be confused:

1. **T13 local/static validation** — no paid benchmark launch is required.
2. **T14 paid remote canary** — launches exactly one remote task and can incur
   Modal/model-provider cost and expose benchmark/run artifacts to configured
   remote services.
3. **T15 human closeout** — records a real human review and runs the final
   machine-enforced closeout gate.

Passing GitHub CI or T13 does **not** mean T14/T15 are complete.

## 0. Safety rules

Read these before running anything remote.

- Do not run the paid canary unless you personally approve the cost/data use.
- Do not automatically retry a submit after `submission-uncertain`.
- There is no MVP 3 cancellation command.
- Do not use `zed-eval deploy` as cancellation.
- Do not deploy while benchmark runs are active; upstream warns that deployment
  can cancel in-flight runs.
- Do not delete remote runs or shared-volume artifacts during MVP 3 closeout.
- Do not mark a T15 review field `true` unless you actually performed that check.
- Keep both the repo-harness checkout and pinned Zed orchestrator checkout clean
  before launching the canary.

The pinned Zed orchestrator commit is:

```text
24e25552b1259d56a6fdd7956a419ed9e8a1a25e
```

## 1. Supported local environment

The manual wrappers are Bash scripts and require Unix-style absolute paths.

Recommended environments:

- macOS Terminal/iTerm;
- Linux shell; or
- Windows through WSL2.

For native Windows PowerShell, use WSL2 for this runbook instead of translating
commands ad hoc.

Required local tools:

```bash
git --version
bash --version
bun --version
node --version
```

The repo currently expects Bun `>=1.1.35` and Node `>=24 <26`.

The paid upstream Zed flow additionally requires the tooling and credentials
needed by the pinned `zed-eval` checkout, including Modal access and configured
model-provider secrets.

## 2. Prepare a clean checkout of PR #4

Use the PR source branch:

```text
kodyka/repo-harness:feat/zed-bench-mvp3-v3
```

For a fresh checkout:

```bash
git clone https://github.com/kodyka/repo-harness.git repo-harness-mvp3-test
cd repo-harness-mvp3-test
git switch feat/zed-bench-mvp3-v3
git pull --ff-only
```

If you already have a checkout, fetch and switch to the PR source branch without
mixing in local edits.

Confirm the repository is clean:

```bash
git rev-parse HEAD
git status --porcelain=v1 --untracked-files=all
```

The second command must print nothing before T14.

Install dependencies exactly from the lockfile:

```bash
bun install --frozen-lockfile
```

Optional convenience variable:

```bash
export REPO_HARNESS="$(pwd)"
```

## 3. Run T13 local validation first

These checks should not launch a paid Zed benchmark.

### 3.1 Focused benchmark tests

```bash
bun test tests/zed-benchmark-admission.test.ts
bun test tests/zed-benchmark-state-schema.test.ts
bun test tests/zed-benchmark-receipt-store.test.ts
bun test tests/zed-benchmark-runner.test.ts
bun test tests/cli/zed-benchmark.test.ts
```

All focused tests must pass.

### 3.2 Static and synchronization checks

```bash
bun run check:type
bun run check:reference-configs
bun run check:helpers
```

### 3.3 Full test suite

```bash
bun test
```

The paid/live canary may be skipped in the normal suite. A skipped paid test is
not a T14 pass.

### 3.4 Repository gates

```bash
bash scripts/check-deploy-sql-order.sh
bash scripts/check-architecture-sync.sh
bash scripts/check-task-sync.sh
bash scripts/check-task-workflow.sh --strict
bun scripts/inspect-project-state.ts --repo . --format text
bun src/cli/index.ts init --repo . --dry-run
git diff --check
```

Then verify the test run did not dirty the tracked repository:

```bash
git status --porcelain=v1 --untracked-files=all
```

If T13 fails, stop here and fix the local/static failure before considering the
paid canary.

## 4. Prepare the pinned Zed checkout

Use a separate directory from repo-harness.

Example:

```bash
export ZED_PIN="24e25552b1259d56a6fdd7956a419ed9e8a1a25e"
export ZED_CHECKOUT="$HOME/src/zed-mvp3-canary"

git clone https://github.com/zed-industries/zed.git "$ZED_CHECKOUT"
git -C "$ZED_CHECKOUT" checkout --detach "$ZED_PIN"
```

For an existing Zed checkout:

```bash
git -C "$ZED_CHECKOUT" fetch origin "$ZED_PIN"
git -C "$ZED_CHECKOUT" checkout --detach "$ZED_PIN"
```

Verify the exact orchestrator pin and clean state:

```bash
test "$(git -C "$ZED_CHECKOUT" rev-parse HEAD)" = "$ZED_PIN"
test -z "$(git -C "$ZED_CHECKOUT" status --porcelain=v1 --untracked-files=all)"
test -f "$ZED_CHECKOUT/crates/eval_cli/script/zed-eval"
```

For the first MVP 3 canary, the lowest-variance choice is to use the same pinned
commit as the Zed source SHA:

```bash
export SOURCE_SHA="$ZED_PIN"
```

`--source-sha` is the Zed source commit used to build `eval-cli`; it is not the
repo-harness commit and not an arbitrary target repository. A different clean
40-character lowercase Zed SHA can be used when intentionally testing another
source commit, while the orchestrator checkout itself must remain at `ZED_PIN`.

## 5. Run upstream doctor manually

Run doctor from the pinned checkout without asking repo-harness to repair or
deploy anything:

```bash
cd "$ZED_CHECKOUT"
crates/eval_cli/script/zed-eval doctor
```

Do not pass `--doctor-ok` to the repo-harness canary unless you actually ran the
manual doctor and reviewed its result.

The pinned upstream README documents `doctor --create-volume`, but creating a
remote volume is a mutation. If doctor says a required volume is missing, stop
and make that infrastructure change separately and deliberately before the
canary. Do not hide it inside the benchmark test.

## 6. Confirm deployment, credentials, budget, and data boundary

Before T14, confirm all of the following manually:

- an existing compatible Modal deployment is available;
- no active run will be disrupted by deployment work;
- the Modal controller token/secret is configured;
- the selected model provider secret is configured;
- you know the remaining budget/quota;
- you accept that manifests, benchmark/source data, logs, model/tool output,
  patches, and archives can be visible to users/services with access to the
  configured Modal workspace, volume, and model provider;
- you will run exactly one task with concurrency one.

Do **not** run this as part of T14:

```bash
zed-eval deploy
```

If no deployment exists, stop. Deployment is a separately authorized operator
operation, not a canary step.

## 7. Choose the canary inputs

Return to repo-harness:

```bash
cd "$REPO_HARNESS"
```

Choose exactly one supported benchmark:

```text
qna
rf
tw
terminal-bench-2.1
deepswe
```

Set operator values. Example placeholders:

```bash
export BENCHMARK="rf"
export MODEL="<model-id-configured-in-your-provider>"
export NAMESPACE="repo-harness-mvp3-$(date +%Y%m%d)"
```

Namespace requirements:

- lowercase only;
- letters, digits, and `-`;
- starts and ends with a letter or digit;
- maximum 63 characters.

Model IDs may contain letters, digits, `.`, `_`, `:`, `/`, and `-`, but the
chosen model must actually be usable with your configured provider secrets.

Before paying for anything, inspect the command help:

```bash
bun src/cli/index.ts zed-benchmark --help
bash scripts/run-zed-benchmark-mvp3-canary.sh --help
```

Check the repo is still clean:

```bash
test -z "$(git status --porcelain=v1 --untracked-files=all)"
```

## 8. Run the one paid T14 canary

This is the point where remote cost/data exposure begins.

Run:

```bash
bash scripts/run-zed-benchmark-mvp3-canary.sh \
  --zed-checkout "$ZED_CHECKOUT" \
  --source-sha "$SOURCE_SHA" \
  --namespace "$NAMESPACE" \
  --benchmark "$BENCHMARK" \
  --model "$MODEL" \
  --doctor-ok \
  --deployment-ok \
  --show-logs \
  --approve-paid-canary
```

The script prints the reviewed commit, integration pin, source SHA, namespace,
benchmark, model, task count, and concurrency before launch.

Immediately before submit it requires this exact interactive phrase:

```text
RUN PAID ZED CANARY
```

Only type that phrase after reviewing the displayed values.

The wrapper then attempts submit exactly once with:

```text
nTasks = 1
nConcurrent = 1
```

If the local submit result is `submission-uncertain`, the script must reconcile
that same run ID through `status`. It must not submit another run.

## 9. Observe the run

Expected validated remote states are:

```text
pending -> running -> completed
```

or a terminal failure:

```text
failed
```

The script defaults to one status check every 60 seconds, up to 240 checks.
These can be changed for an intentional operator test with:

```text
--poll-seconds N
--max-polls N
```

Do not shorten them in a way that encourages resubmission after a normal slow
remote start.

On completion the wrapper explicitly:

1. prints bounded/redacted logs for human review;
2. fetches artifacts into the canonical ignored run directory;
3. validates and saves report JSON;
4. asks you to record actual cost/quota observations;
5. asks you to record resource/runtime observations;
6. asks you to record remote retention/access observations; and
7. verifies the repo-harness worktree did not change.

Enter real observations, not placeholder words.

## 10. If submission is uncertain or the script exits early

**Do not rerun submit blindly.**

Find the existing local run evidence:

```bash
find .ai/harness/runs/zed-benchmark -maxdepth 3 -type f -name submit.json -print
```

Read the relevant submit evidence and run ID. Then reconcile the same run:

```bash
bun src/cli/index.ts zed-benchmark --repo "$(pwd)" \
  status --run-id <existing-run-id> --json
```

Logs are explicit-only:

```bash
bun src/cli/index.ts zed-benchmark --repo "$(pwd)" \
  logs --run-id <existing-run-id>
```

If you cannot identify one remote run uniquely, stop. That is a T14 stop
condition, not a reason to submit another run.

## 11. Inspect T14 evidence

For a successful canary the wrapper prints the run ID and evidence path.

The canonical directory is:

```text
.ai/harness/runs/zed-benchmark/<run-id>/acceptance/
```

Expected files include:

```text
submit.json
submit.stderr
status.json
status.stderr
fetch.txt
report.json
canary-evidence.json
```

The final machine-readable T14 record is:

```text
.ai/harness/runs/zed-benchmark/<run-id>/acceptance/canary-evidence.json
```

Inspect it:

```bash
cat .ai/harness/runs/zed-benchmark/<run-id>/acceptance/canary-evidence.json
```

Confirm at minimum:

- `reviewedCommit` equals the exact repo-harness commit you executed;
- `integrationPin` equals `24e25552b1259d56a6fdd7956a419ed9e8a1a25e`;
- `nTasks` is `1`;
- `nConcurrent` is `1`;
- `submitAttempts` is `1`;
- `finalPhase` is `completed`;
- logs/fetch/report validation fields are `true`;
- `trackedWorktreeUnchanged` is `true`;
- the three operator observations are real and non-empty;
- automatic resubmission/cancellation/deploy-as-cancellation/writer-authority
  assertions are all `false`.

Also confirm the evidence stays ignored:

```bash
git check-ignore -v .ai/harness/runs/zed-benchmark/<run-id>/acceptance/canary-evidence.json
git status --porcelain=v1 --untracked-files=all
```

The status command should still print nothing.

## 12. Perform the human T15 review

Do not create an approved closeout record first and review later.

For the exact commit that produced T14 evidence, perform the T15 checks:

1. complete a Waza `/check`-style review, or the repository's equivalent real
   review process;
2. confirm no generic fleet/writer/provider/cancellation subsystem was added;
3. confirm source claims still match the final pinned Zed commit;
4. promote any durable conclusions that need to live in architecture/research/
   reference documentation;
5. confirm raw canary evidence remains ignored;
6. complete the contract-worktree finish flow;
7. archive fulfilled plan/contract/review/notes artifacts according to project
   policy; and
8. preserve remote runs/shared-volume artifacts during code closeout.

If any item is not actually complete, T15 is not complete.

## 13. Create the ignored T15 closeout review

Set the run ID from the successful canary:

```bash
export RUN_ID="<rh-zb-uuid-from-canary>"
export ACCEPTANCE_DIR="$REPO_HARNESS/.ai/harness/runs/zed-benchmark/$RUN_ID/acceptance"
```

Create the review initially as **pending/false**:

```bash
cat > "$ACCEPTANCE_DIR/closeout-review.json" <<EOF
{
  "schemaVersion": "repo-harness.zed-benchmark-closeout-review/v1",
  "reviewedCommit": "$(git rev-parse HEAD)",
  "reviewer": "<your-name-or-reviewer-id>",
  "decision": "pending",
  "wazaStyleReviewCompleted": false,
  "noExtraSubsystemAdded": false,
  "sourceClaimsCheckedAgainstFinalPin": false,
  "durableConclusionsPromoted": false,
  "rawCanaryEvidenceRemainsIgnored": false,
  "contractWorktreeFinishCompleted": false,
  "planContractReviewNotesArchived": false,
  "remoteArtifactsPreserved": false,
  "notes": []
}
EOF
```

Edit that ignored file only after performing the corresponding checks. A valid
final approval has:

```json
"decision": "approve"
```

and every required boolean set to `true` because the action actually happened.

Do not commit this evidence file. The closeout gate requires it to remain in the
canonical ignored run directory.

## 14. Run the T15 closeout gate

The repo-harness worktree must be clean.

```bash
cd "$REPO_HARNESS"
test -z "$(git status --porcelain=v1 --untracked-files=all)"
```

Then run:

```bash
bash scripts/check-zed-benchmark-mvp3-closeout.sh \
  "$ACCEPTANCE_DIR/canary-evidence.json" \
  "$ACCEPTANCE_DIR/closeout-review.json"
```

The gate validates the T14/T15 evidence and reruns the required focused/static/
full/repository checks.

A successful closeout ends with output equivalent to:

```text
Zed Eval MVP3 closeout gate: PASS
Reviewed commit: <40-hex-sha>
The supplied T14/T15 evidence and repository gates agree.
```

## 15. Stop conditions

Stop the test and preserve evidence if any of these occur:

- unexpected benchmark, source SHA, model, namespace, or secret routing;
- evidence appears outside `.ai/harness/runs/zed-benchmark/<run-id>/`;
- any unexpected tracked source mutation;
- unrecognized status or report schema;
- quota or cost anomaly;
- inability to identify the remote run uniquely;
- a requirement to deploy in order to continue an active canary;
- failed remote run;
- fetch/report validation failure; or
- a submit result that cannot be reconciled safely by the existing run ID.

A stop condition does not authorize another submit.

## 16. Troubleshooting without weakening the gate

### Repo-harness says the worktree is dirty

Run:

```bash
git status --short
```

Use a fresh clean checkout/worktree for acceptance testing. Do not bypass the
clean-worktree requirement.

### Zed checkout pin mismatch

Run:

```bash
git -C "$ZED_CHECKOUT" rev-parse HEAD
git -C "$ZED_CHECKOUT" status --short
```

Return the orchestrator checkout to the exact pin and clean state before T14.

### Doctor fails

Do not set `--doctor-ok`. Fix credentials/infrastructure separately, rerun doctor,
and proceed only after you actually reviewed a successful result.

### Deployment is missing

Do not let the canary deploy automatically; it never should. Arrange and approve
that infrastructure operation separately, confirm no in-flight runs are at risk,
then restart the human preflight from the deployment check.

### Canary status checks time out

Do not submit again. Preserve the existing run ID/evidence and inspect the same
run with `zed-benchmark status`.

### Closeout fails

Treat the first failing assertion/check as real. Fix or complete that missing
item, preserve the same T14 evidence, and rerun the closeout gate only when the
review record truthfully represents completed work.

## 17. Definition of done

MVP 3 manual acceptance is complete only when all of the following are true:

- T13 local/static validation passes on the reviewed commit;
- one explicitly approved paid T14 canary completes with exactly one submit and
  canonical ignored evidence;
- the human T15 review is genuinely performed and recorded for that same commit;
- the final closeout gate passes; and
- no generic fleet/writer/cancellation/provider capability is claimed or added.

Ordinary CI by itself is not sufficient evidence for T14 or T15.

## Upstream/reference material

- Pinned upstream Zed `zed-eval` README:
  `https://github.com/zed-industries/zed/blob/24e25552b1259d56a6fdd7956a419ed9e8a1a25e/crates/eval_cli/zed_eval/README.md`
- Repo research basis:
  `docs/researches/20260814-zed-eval-mvp3-remote-benchmark-audit.md`
- MVP 3 task plan:
  `docs/zed-eval-mvp3/tasks-and-subtasks.md`
- Paid canary wrapper:
  `scripts/run-zed-benchmark-mvp3-canary.sh`
- Closeout gate:
  `scripts/check-zed-benchmark-mvp3-closeout.sh`
