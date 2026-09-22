# Runbook: New Repository -> Planner -> Luna-Low

Status: Active operations runbook
Runtime requirement: repo-harness 0.19.0 at fixed revision `823f1f8fce000142ba7b69438ac67f7344bc9b95` or a descendant containing that fix for multi-minute `contract-run run`
Purpose: adopt a new Git repository, freeze a small work package, execute it with GPT-5.6 Luna at low effort, and close it with Repo Harness evidence.

The fixed revision is published on `origin/docs/new-project-fast-luna-019` but is not yet the active Nix runtime. The current Nix pin `3d0ada93d2d370627b12907a84b2b567ba3c8751` predates the fix, so a `0.19.0` version string alone is not sufficient.

This is the short human procedure. For rationale and examples, read docs/repo-harness-new-project-fast-luna-tutorial.md.

## 0. Keep host setup and project setup separate

Host tooling is installed once. A project receives only repo-local workflow state.

On a normal host, verify:

~~~bash
repo-harness --version
codex --version
git --version
codegraph --version
~~~

If Nix/Home Manager owns Repo Harness, Codex, CodeGraph, hooks, or skills, do not run the upstream global installer over that configuration. Use the host repository's upgrade procedure.

## 1. Start from a real Git commit

~~~bash
export REPO=/absolute/path/to/project
cd "$REPO"
git status --short --branch
git rev-parse --show-toplevel
git rev-parse HEAD
~~~

A brand-new project needs an initial reviewed commit before contract worktrees can exist. Review .gitignore and .ignore before registering the repository. Never reset, stash, or delete unrelated dirty work merely to satisfy onboarding.

## 2. Preview standard adoption

Use standard adoption for the Planner -> contract -> local worker workflow.

~~~bash
repo-harness init --repo "$PWD" --mode standard --no-codegraph --dry-run
~~~

Review every proposed operation. Then apply:

~~~bash
repo-harness init --repo "$PWD" --mode standard --no-codegraph
repo-harness status --json
repo-harness run check-task-workflow --strict
~~~

Require repo.optIn=true and the workflow-contract marker to be present.

Inspect and commit only reviewed adoption files:

~~~bash
git status --short
git diff --check
git diff --stat
git diff
# stage only the reviewed adoption paths
git commit -m "chore: adopt repo-harness workflow"
~~~

Do not use minimal plus --no-verify as the default fast path. That mode is for an intentionally reduced MCP-only surface, not the full local execution workflow.

## 3. Initialize CodeGraph

If the host provides CodeGraph:

~~~bash
if [ -d .codegraph ]; then
  codegraph sync .
else
  codegraph init .
fi
codegraph status .
~~~

CodeGraph is navigation/index state. It does not grant repository access and does not replace .ignore.

## 4. Plan above the worker

ChatGPT Pro, a human, Waza think, or existing research owns architecture and product decisions. Luna should receive a decision-complete slice.

For a multi-task feature, create a small Sprint:

~~~bash
repo-harness run new-sprint --slug first-slice --title "First implementation slice"
~~~

Keep the first Sprint to one to three ordered tasks. Each row needs an observable acceptance condition.

`new-sprint` creates a Draft. Before claiming anything, complete the PRD/source section and backlog rows, obtain explicit human approval, change the Sprint status to `Approved`, and commit that approved planning authority on the configured canonical target branch. `start-task` refuses Draft sprints and resolves the claim from the canonical target commit, not from an uncommitted working copy.

~~~bash
SPRINT_FILE="$(cat .ai/harness/sprint/active-sprint)"
TARGET_REF="$(jq -r '.worktree_strategy.merge_back.target // "main"' .ai/harness/policy.json)"

test "$(git branch --show-current)" = "$TARGET_REF"
# Edit "$SPRINT_FILE" and every referenced PRD/source artifact.
# After explicit human approval, set the Sprint status to Approved.

repo-harness run check-task-workflow --strict
git status --short
test -z "$(git diff --cached --name-only)"  # fail closed on pre-existing staged work
git add "$SPRINT_FILE"
# If the Sprint references separate PRD/source files, stage those exact reviewed files too.
# Example: git add plans/prd/<reviewed-prd>.md
test -n "$(git diff --cached --name-only)"
git diff --cached --check
git commit -m "plan: approve first implementation sprint"

test "$(git rev-parse HEAD)" = "$(git rev-parse "$TARGET_REF")"
~~~

Only after that committed approval checkpoint, claim one contract row without executing it and keep the exact returned artifact identity:

~~~bash
CLAIM_OUTPUT="$(repo-harness run sprint-backlog start-task --task 1)"
printf '%s\n' "$CLAIM_OUTPUT"

SPRINT_TASK="$(printf '%s\n' "$CLAIM_OUTPUT" | sed -nE "s/^Claimed backlog task '(.+)' \(row [0-9]+\).*/\1/p" | head -1)"
CLAIM_ID="$(printf '%s\n' "$CLAIM_OUTPUT" | sed -nE 's/^Claimed backlog task .* as claim ([0-9a-f-]+)$/\1/p' | head -1)"
SEED_PLAN="$(printf '%s\n' "$CLAIM_OUTPUT" | sed -nE 's/^Captured plan: (.+)$/\1/p' | head -1)"

test -n "$SPRINT_TASK"
test -n "$CLAIM_ID"
test -f "$SEED_PLAN"
~~~

The row claim prevents duplicate ownership. The returned plan is a thin seed; do not choose a different plan by modification time.

## 5. Freeze the plan before the worktree

The final work-package plan must decide:

- exact outcome;
- in-scope and out-of-scope behavior;
- allowed files/directories;
- failure semantics;
- verification commands;
- rollback boundary;
- architecture decisions that the worker must not reinvent.

Run the parent/Waza planning pass against the claimed row, then capture the finished planning output. Capture the command output and use its exact `Captured plan:` path:

~~~bash
CAPTURE_OUTPUT="$(repo-harness run capture-plan \
  --slug <task-slug> \
  --title "<task title>" \
  --status Approved \
  --artifact-level work-package \
  --promotion-reason worktree_boundary \
  --source waza-think \
  --orchestration-kind sprint-task \
  --source-ref "sprint:${SPRINT_FILE}#${SPRINT_TASK}" \
  --body-file /tmp/decision-complete-plan.md)"

printf '%s\n' "$CAPTURE_OUTPUT"
PLAN="$(printf '%s\n' "$CAPTURE_OUTPUT" | sed -nE 's/^Captured plan: (.+)$/\1/p' | head -1)"
test -f "$PLAN"
~~~

Verify the plan's `Source Ref` is exactly `sprint:${SPRINT_FILE}#${SPRINT_TASK}` before committing the planning checkpoint. Never replace this with `ls -t` or another newest-file heuristic.

## 6. Start the isolated contract worktree

Use JSON output so the worktree and plan identities come from the start operation itself:

~~~bash
START_JSON="$(repo-harness run contract-worktree start --plan "$PLAN" --json)"
printf '%s\n' "$START_JSON"

WORKTREE="$(printf '%s' "$START_JSON" | bun -e 'process.stdout.write(JSON.parse(await Bun.stdin.text()).worktree_path)')"
BRANCH="$(printf '%s' "$START_JSON" | bun -e 'process.stdout.write(JSON.parse(await Bun.stdin.text()).branch)')"
START_PLAN="$(printf '%s' "$START_JSON" | bun -e 'process.stdout.write(JSON.parse(await Bun.stdin.text()).plan_path)')"

case "$START_PLAN" in
  "$WORKTREE"/*) START_PLAN_REL="${START_PLAN#"$WORKTREE"/}" ;;
  *) echo "contract-worktree returned a plan outside its worktree" >&2; exit 1 ;;
esac
test "$START_PLAN_REL" = "$PLAN"

TARGET_REF="$(jq -r '.worktree_strategy.merge_back.target // "main"' .ai/harness/policy.json)"
TASK_JSON="$(repo-harness sprint identify \
  --task "$SPRINT_TASK" \
  --target-ref "$TARGET_REF" \
  --sprint-path "$SPRINT_FILE")"
TASK_ID="$(printf '%s' "$TASK_JSON" | bun -e 'process.stdout.write(JSON.parse(await Bun.stdin.text()).task_id)')"

repo-harness sprint bind \
  --claim-id "$CLAIM_ID" \
  --worktree "$WORKTREE" \
  --branch "$BRANCH" \
  --unit-ref "$START_PLAN_REL"

repo-harness sprint write-claim-token \
  --task-id "$TASK_ID" \
  --claim-id "$CLAIM_ID" \
  --worktree "$WORKTREE" \
  --sprint-path "$SPRINT_FILE" \
  --task "$SPRINT_TASK" \
  --unit-ref "$START_PLAN_REL"

cd "$WORKTREE"

CONTRACT="$(sed -nE 's/^> \*\*Task Contract\*\*: `([^`]+)`.*/\1/p' "$START_PLAN" | head -1)"
test -f "$CONTRACT"
printf 'plan=%s\ncontract=%s\nworktree=%s\nclaim=%s\n' \
  "$START_PLAN_REL" "$CONTRACT" "$WORKTREE" "$CLAIM_ID"
~~~

The contract path is read from the exact plan that started the worktree; it is not selected by filesystem recency. Because `start-task` was intentionally run without `--execute`, its lease starts in `reserving`; the explicit bind/token steps above transfer that exact fencing token to the final decision-complete plan worktree before any execution or closeout.

Fill every contract placeholder before delegation. At minimum the contract must own Goal, Scope, Allowed Paths, Change Assessment, Evidence Requirements, Delegation Contract, Exit Criteria, Verification Plan, and Acceptance Policy.

Preflight:

~~~bash
repo-harness run contract-run preflight --contract "$CONTRACT"
repo-harness run check-task-workflow --strict
~~~

Do not delegate until both pass.

## 7. Execute with Luna-low through contract-run

Use Repo Harness contract-run for the bounded process and invocation accounting. The runner and verifier command still enforce the actual model/effort explicitly.

A worker command should invoke Codex with:

~~~text
--model gpt-5.6-luna
model_reasoning_effort="low"
model_verbosity="low"
web_search="disabled"
workspace-write / automatic approval for the worker
~~~

The verifier command should use the same bounded prompt but a read-only sandbox.

Important: contract-run --effort records the declared effort; it does not select the model by itself. The Codex command must set Luna and low effort explicitly. In this 0.19 line, the `repo-harness run` dispatcher derives the outer `contract-run run` timeout from the contract's declared `wall_time_minutes` and adds setup/finalization headroom, so the ordinary 120-second helper timeout does not cut off a valid multi-minute contract.

After the worker returns:

~~~bash
git status --short
git diff --check
git diff --stat
git diff
~~~

Any path outside Allowed Paths is a stop condition. Do not widen the contract merely to excuse an accidental edit.

If source changed and CodeGraph is used:

~~~bash
codegraph sync .
~~~

## 8. Reuse or prepare deterministic evidence exactly once

Do not treat the worker's self-report as acceptance. The generated contract-run worker brief already requires one canonical `verify-sprint --prepare-acceptance` after implementation is frozen.

After contract-run returns, inspect its run manifest, worker output, and `.ai/harness/checks/latest.json`.

Reuse is allowed only when the prepared evidence is still bound to the **current normalized subject and the same acceptance authority**. Do not use "no tracked file changed" as the freshness test: the normalized subject also covers non-ignored untracked file contents, and acceptance binds the contract and Change Assessment.

A cheap freshness check does not rerun deterministic criteria:

~~~bash
CHECKS=.ai/harness/checks/latest.json
ASSESSMENT=.ai/harness/checks/change-assessment.latest.json
test -s "$CHECKS"
test -s "$ASSESSMENT"

PREPARED_SUBJECT="$(jq -r '.review_subject_sha256 // empty' "$CHECKS")"
PREPARED_TARGET_REF="$(jq -r '.change_assessment.selection_packet.target_ref // empty' "$CHECKS")"
PREPARED_TARGET_REV="$(jq -r '.change_assessment.selection_packet.target_revision // empty' "$CHECKS")"
PREPARED_PATHS="$(jq -c '.change_assessment.selection_packet.subject_paths // [] | sort' "$CHECKS")"

jq -e --arg contract "$CONTRACT" '
  .source == "verify-sprint" and
  .status == "pass" and
  .exit_code == 0 and
  .contract.file == $contract and
  .change_assessment.status == "pass" and
  .change_assessment.selection_packet.status == "ready"
' "$CHECKS" >/dev/null

jq -e --slurpfile assessment "$ASSESSMENT" \
  '.change_assessment == $assessment[0]' "$CHECKS" >/dev/null

CURRENT_SUBJECT="$(repo-harness review-subject --target "$PREPARED_TARGET_REF" --format json)"
jq -e \
  --arg subject "$PREPARED_SUBJECT" \
  --arg target_ref "$PREPARED_TARGET_REF" \
  --arg target_rev "$PREPARED_TARGET_REV" \
  --argjson paths "$PREPARED_PATHS" '
    .status == "ok" and
    .review_subject_sha256 == $subject and
    .target_ref == $target_ref and
    .target_rev == $target_rev and
    (.paths | sort) == $paths
  ' <<<"$CURRENT_SUBJECT" >/dev/null

repo-harness run change-assessment validate \
  --contract "$CONTRACT" \
  --packet "$ASSESSMENT"
~~~

If any check fails, or if the goal/plan or frozen review policy changed after preparation, record the stale reason and run one replacement preparation:

~~~bash
repo-harness run verify-sprint --prepare-acceptance
~~~

That preparation freezes the exact final subject, including non-ignored untracked content, plus verification evidence, subject paths, target revision, and Change Assessment. Preserve those bindings until semantic review and receipt recording finish.

## 9. Run the contract-frozen semantic reviewer

Inspect and capture the frozen policy:

~~~bash
POLICY_JSON="$(repo-harness run acceptance-receipt policy --contract "$CONTRACT")"
printf '%s\n' "$POLICY_JSON"
REVIEWER="$(jq -r '.reviewer // empty' <<<"$POLICY_JSON")"
REVIEW_SOURCE="$(jq -r '.source // empty' <<<"$POLICY_JSON")"
case "$REVIEW_SOURCE" in
  codex-review) REVIEW_PROVIDER=codex ;;
  codex-plugin) REVIEW_PROVIDER=codex-plugin ;;
  *) echo "unsupported frozen review source: $REVIEW_SOURCE" >&2; exit 1 ;;
esac
test -n "$REVIEWER"
~~~

Run exactly that reviewer/source and pin the review to the target revision frozen by preparation. Do not substitute a different provider.

~~~bash
REVIEW_JSON="$(repo-harness cross-review \
  --provider "$REVIEW_PROVIDER" \
  --base "$PREPARED_TARGET_REV" \
  --json)"
printf '%s\n' "$REVIEW_JSON"

jq -e \
  --arg provider "$REVIEW_PROVIDER" \
  --arg base "$PREPARED_TARGET_REV" \
  --arg subject "$PREPARED_SUBJECT" \
  --argjson paths "$PREPARED_PATHS" '
    .status == "ok" and
    .provider == $provider and
    .scope.baseRev == $base and
    .scope.reviewSubjectSha256 == $subject and
    (.scope.paths | sort) == $paths and
    ([.findings[]? | select(.severity == "P1")] | length) == 0
  ' <<<"$REVIEW_JSON" >/dev/null
~~~

Do not record `external_pass` unless that binding check succeeds and the actual reviewer result is a pass. Preserve the review's real findings rather than replacing them with an empty array:

~~~bash
REVIEW_SUMMARY="$(jq -r '.recommendation' <<<"$REVIEW_JSON")"
REVIEW_FINDINGS="$(jq -c '.findings' <<<"$REVIEW_JSON")"

repo-harness run acceptance-receipt record \
  --contract "$CONTRACT" \
  --verification .ai/harness/checks/latest.json \
  --disposition external_pass \
  --reviewer "$REVIEWER" \
  --source "$REVIEW_SOURCE" \
  --summary "$REVIEW_SUMMARY" \
  --findings-json "$REVIEW_FINDINGS"
~~~

For a reject, record reject plus the actual findings instead. Never convert a rejection into a pass by prose.

Then consume the receipt:

~~~bash
repo-harness run verify-sprint
~~~

## 10. Close out exactly once

Before local merge, ensure the target branch has not advanced past the recorded base. If it has, rebase/rebind and repeat acceptance for the new exact subject.

For local single-publication closeout:

~~~bash
repo-harness run contract-worktree finish --merge
~~~

For the draft-PR path, use the repo's normal ship workflow rather than manually mixing finish, push, and PR creation.

After closeout:

~~~bash
repo-harness state next --json
~~~

Continue only from the returned continuation envelope. Do not infer the next task from chat history.

## 11. Stop conditions

Stop and return to the human when:

- a required architecture/product decision is absent;
- implementation requires a path outside Allowed Paths;
- an external side effect has an uncertain outcome;
- the target branch moved and exact publication authority is no longer valid;
- verification or acceptance evidence is stale or cannot be bound to the final subject.

Ordinary deterministic test failures stay with the bounded worker loop when they remain inside scope.

## 12. Recovery rules

If a terminal or transport times out, first check whether the original Codex process is still running. Never start a second worker against the same worktree until the first process state is known.

Do not repeat a source mutation merely because CodeGraph refresh failed. Repair indexing separately.

Do not hand-edit AcceptanceReceipt, authorization revisions, registered repository state, or closeout journals. Use Repo Harness commands so state changes remain typed and auditable.
