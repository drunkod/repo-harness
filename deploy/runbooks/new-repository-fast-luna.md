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
SPRINT_FILE="$(cat .ai/harness/sprint/active-sprint)" || exit $?
TARGET_REF="$(jq -er '.worktree_strategy.merge_back.target // "main" | select(type == "string" and length > 0)' .ai/harness/policy.json)" || exit $?

# Edit "$SPRINT_FILE" and every referenced PRD/source artifact.
# After explicit human approval, set the Sprint status to Approved.
PLANNING_AUTHORITY_FILES=("$SPRINT_FILE")
# Add each exact reviewed PRD/source path when the Sprint references one:
# PLANNING_AUTHORITY_FILES+=("plans/prd/<reviewed-prd>.md")

approve_sprint_checkpoint() {
  local current_branch staged_paths

  current_branch="$(git branch --show-current)" || return 1
  if [ "$current_branch" != "$TARGET_REF" ]; then
    echo "approval checkpoint requires target branch $TARGET_REF; current branch is $current_branch" >&2
    return 1
  fi

  repo-harness run check-task-workflow --strict || return 1
  git status --short || return 1

  staged_paths="$(git diff --cached --name-only)" || return 1
  if [ -n "$staged_paths" ]; then
    echo "refusing approval commit: the index already contains staged work" >&2
    return 1
  fi

  git add -- "${PLANNING_AUTHORITY_FILES[@]}" || return 1
  staged_paths="$(git diff --cached --name-only)" || return 1
  if [ -z "$staged_paths" ]; then
    echo "refusing approval commit: no reviewed planning authority is staged" >&2
    return 1
  fi

  git diff --cached --check || return 1
  git commit -m "plan: approve first implementation sprint" || return 1

  if [ "$(git rev-parse HEAD)" != "$(git rev-parse "$TARGET_REF")" ]; then
    echo "approval commit is not the configured canonical target revision" >&2
    return 1
  fi
}

approve_sprint_checkpoint || exit $?
unset -f approve_sprint_checkpoint
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

load_prepared_bindings() {
  test -s "$CHECKS" || return 1
  test -s "$ASSESSMENT" || return 1

  PREPARED_SUBJECT="$(jq -er '.review_subject_sha256 | select(type == "string" and length > 0)' "$CHECKS")" || return 1
  PREPARED_TARGET_REF="$(jq -er '.change_assessment.selection_packet.target_ref | select(type == "string" and length > 0)' "$CHECKS")" || return 1
  PREPARED_TARGET_REV="$(jq -er '.change_assessment.selection_packet.target_revision | select(type == "string" and length > 0)' "$CHECKS")" || return 1
  PREPARED_PATHS="$(jq -ec '.change_assessment.selection_packet.subject_paths | if type == "array" then sort else error("subject_paths missing") end' "$CHECKS")" || return 1
}

assert_prepared_bindings() {
  local current_subject

  load_prepared_bindings || return 1

  jq -e --arg contract "$CONTRACT" '
    .source == "verify-sprint" and
    .status == "pass" and
    .exit_code == 0 and
    .contract.file == $contract and
    .change_assessment.status == "pass" and
    .change_assessment.selection_packet.status == "ready"
  ' "$CHECKS" >/dev/null || return 1

  jq -e --slurpfile assessment "$ASSESSMENT" \
    '.change_assessment == $assessment[0]' "$CHECKS" >/dev/null || return 1

  current_subject="$(repo-harness review-subject --target "$PREPARED_TARGET_REF" --format json)" || return 1
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
    ' <<<"$current_subject" >/dev/null || return 1

  repo-harness run change-assessment validate \
    --contract "$CONTRACT" \
    --packet "$ASSESSMENT" || return 1
}

if ! assert_prepared_bindings; then
  echo "prepared acceptance evidence is stale or incomplete; replacing it" >&2
  repo-harness run verify-sprint --prepare-acceptance || exit $?
  assert_prepared_bindings || {
    echo "replacement acceptance evidence is still stale or incomplete" >&2
    exit 1
  }
fi

# assert_prepared_bindings reloads PREPARED_* on every call, including after
# replacement preparation, so the semantic reviewer always uses fresh bindings.
unset -f load_prepared_bindings assert_prepared_bindings
~~~

The prepared evidence, whether reused or replaced, now has freshly loaded bindings for the exact final subject, including non-ignored untracked content, plus verification evidence, subject paths, target revision, and Change Assessment. Preserve those bindings until semantic review and receipt recording finish.

## 9. Run the contract-frozen semantic reviewer

Run the frozen semantic review and receipt recording as one checked operation. A policy parse failure, provider failure, subject mismatch, or finding-schema mismatch must return before any pass receipt can be written:

~~~bash
run_bound_semantic_review() {
  local policy_json reviewer review_source review_provider
  local review_json review_exit review_summary review_findings disposition

  policy_json="$(repo-harness run acceptance-receipt policy --contract "$CONTRACT")" || return 1
  printf '%s\n' "$policy_json"

  reviewer="$(jq -er '.reviewer | select(type == "string" and length > 0)' <<<"$policy_json")" || return 1
  review_source="$(jq -er '.source | select(type == "string" and length > 0)' <<<"$policy_json")" || return 1
  case "$review_source" in
    codex-review) review_provider=codex ;;
    codex-plugin) review_provider=codex-plugin ;;
    *) echo "unsupported frozen review source: $review_source" >&2; return 1 ;;
  esac

  review_json="$(repo-harness cross-review \
    --provider "$review_provider" \
    --base "$PREPARED_TARGET_REV" \
    --json)"
  review_exit=$?
  printf '%s\n' "$review_json"

  jq -e \
    --arg provider "$review_provider" \
    --arg base "$PREPARED_TARGET_REV" \
    --arg subject "$PREPARED_SUBJECT" \
    --argjson paths "$PREPARED_PATHS" '
      .status == "ok" and
      .provider == $provider and
      .scope.baseRev == $base and
      .scope.reviewSubjectSha256 == $subject and
      (.scope.paths | sort) == $paths
    ' <<<"$review_json" >/dev/null || return 1

  review_summary="$(jq -er '.recommendation | select(type == "string" and length > 0)' <<<"$review_json")" || return 1
  review_findings="$(jq -ec '
    .findings
    | if type == "array" then
        map(
          if ((.severity == "P1" or .severity == "P2")
              and (.text | type == "string")
              and (.text | length > 0))
          then {severity, message: .text}
          else error("invalid cross-review finding")
          end
        )
      else error("findings must be an array")
      end
  ' <<<"$review_json")" || return 1

  if [ "$review_exit" -eq 0 ]; then
    jq -e '([.findings[]? | select(.severity == "P1")] | length) == 0' \
      <<<"$review_json" >/dev/null || return 1
    disposition=external_pass
  else
    jq -e '([.findings[]? | select(.severity == "P1")] | length) > 0' \
      <<<"$review_json" >/dev/null || {
        echo "cross-review failed without a bound semantic rejection; no receipt recorded" >&2
        return 1
      }
    disposition=reject
  fi

  repo-harness run acceptance-receipt record \
    --contract "$CONTRACT" \
    --verification "$CHECKS" \
    --disposition "$disposition" \
    --reviewer "$reviewer" \
    --source "$review_source" \
    --summary "$review_summary" \
    --findings-json "$review_findings" || return 1

  if [ "$disposition" = "reject" ]; then
    echo "semantic review rejected the prepared subject; rejection receipt recorded" >&2
    return 1
  fi

  repo-harness run verify-sprint || return 1
}

run_bound_semantic_review || exit $?
unset -f run_bound_semantic_review
~~~

The same `{severity, message}` conversion is used for both passing P2 advisories and rejection findings. A rejection is recorded as `reject` and then stops the workflow; it is never relabeled as `external_pass`.

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
