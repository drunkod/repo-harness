# Runbook: New Repository -> Planner -> Luna-Low

Status: Active operations runbook  
Applies to: repo-harness 0.19.x  
Purpose: adopt a new Git repository, freeze a small work package, execute it with GPT-5.6 Luna at low effort, and close it with Repo Harness evidence.

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

Claim one contract row without executing it and keep the exact returned artifact identity:

~~~bash
SPRINT_FILE="$(cat .ai/harness/sprint/active-sprint)"
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

- If the worker's canonical preparation succeeded and no tracked file changed afterward, reuse that evidence. Do not rerun expensive criteria merely because the operator reached this step.
- If preparation is missing or failed, or any tracked file changed after it, record that reason and run the canonical preparation once:

~~~bash
repo-harness run verify-sprint --prepare-acceptance
~~~

That preparation freezes the exact final subject, verification evidence, reviewed paths, target revision, and Change Assessment. Any later tracked edit makes it stale and requires a new preparation round.

## 9. Run the contract-frozen semantic reviewer

Inspect the policy:

~~~bash
repo-harness run acceptance-receipt policy --contract "$CONTRACT"
~~~

Run exactly the reviewer/source named there.

- source=codex-review: use the direct read-only Codex review path.
- source=codex-plugin: use the official Codex plugin path documented by repo-harness-cross-review.
- Do not substitute a different provider or write external_pass without an actual passing review.

Record the real disposition:

~~~bash
repo-harness run acceptance-receipt record \
  --contract "$CONTRACT" \
  --verification .ai/harness/checks/latest.json \
  --disposition external_pass \
  --reviewer Codex \
  --source <source-from-policy> \
  --summary "<actual reviewer summary>" \
  --findings-json '[]'
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
