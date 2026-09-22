# New Project Fast Path: Repo Harness -> Planner -> Luna-Low

> **Start now:** read [the setup/resume guide and copy-paste prompts](new-repository-start-here.md).
> This source tutorial requires the runtime fix first published at
> `823f1f8fce000142ba7b69438ac67f7344bc9b95`. The current Nix pin `3d0ada93d2d370627b12907a84b2b567ba3c8751` does not contain it.
> Verify the exact installed revision before multi-minute execution. A `0.19.0`
> version string alone is not a compatibility guarantee; repinning, activation,
> and hands-off automation remain deferred in `tasks/todos.md`.

This tutorial is the detailed companion to deploy/runbooks/new-repository-fast-luna.md. It targets repo-harness 0.19.0 at fixed revision `823f1f8fce000142ba7b69438ac67f7344bc9b95` or a descendant containing that fix, on a host where Git, Codex, and Repo Harness are already installed.

The intended split is:

~~~text
Human / ChatGPT Pro / existing research
  decides product and architecture

Repo Harness
  freezes plan, scope, evidence, and closeout authority

GPT-5.6 Luna low
  implements the frozen brief in an isolated worktree

Contract verifier + frozen semantic reviewer
  prove the exact final subject before closeout
~~~

The speed rule is simple: do not make Luna rediscover decisions that are already settled.

## 1. Host prerequisites are one-time

Check the host:

~~~bash
repo-harness --version
codex --version
git --version
codegraph --version
~~~

This guide assumes repo-harness 0.19.0 at fixed revision `823f1f8fce000142ba7b69438ac67f7344bc9b95` or a descendant containing that fix. The revision is published on the documentation branch but is not yet the active Nix runtime.

If a configuration manager such as Nix/Home Manager owns Repo Harness, Codex hooks, CodeGraph, Waza, or Herdr, keep that authority in the host repository. A new application repository should not reinstall or rewrite host configuration.

For a reproducible Luna lane, the worker command later sets:

~~~text
model = gpt-5.6-luna
model_reasoning_effort = low
model_verbosity = low
web_search = disabled
~~~

That explicit command-line configuration is more important than whichever model happens to be the user's current Codex default.

## 2. Create or select the repository

For a new folder:

~~~bash
export REPO="$HOME/Documents/work/my-project"
mkdir -p "$REPO"
cd "$REPO"
git init -b main
printf '# my-project\n' > README.md
printf '.env\n.env.*\nsecrets/\n_ops/\n' > .ignore
git add README.md .ignore
git commit -m "chore: initial project baseline"
~~~

Contract worktrees need a real commit. Do not start from an unborn branch.

For an existing repository:

~~~bash
export REPO=/absolute/path/to/project
cd "$REPO"
git status --short --branch
git log -5 --oneline
~~~

Dirty paths are user work. Do not reset or stash them automatically.

If you need a temporary safety copy before adoption, include tracked unstaged, tracked staged, and untracked state separately:

~~~bash
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="/tmp/$(basename "$REPO")-$STAMP"
mkdir -p "$BACKUP"

git diff --binary > "$BACKUP/unstaged.patch"
git diff --cached --binary > "$BACKUP/staged.patch"
git ls-files --others --exclude-standard -z > "$BACKUP/untracked.zlist"
if [ -s "$BACKUP/untracked.zlist" ]; then
  tar --null -T "$BACKUP/untracked.zlist" -cf "$BACKUP/untracked.tar"
fi

printf 'backup=%s\n' "$BACKUP"
~~~

This backup is not a replacement for understanding the repository state.

Run the project's own baseline checks before adoption so pre-existing failures are known.

## 3. Review the read boundary

Repo Harness repository readers use .ignore as a content boundary. .gitignore, hidden-file status, CodeGraph, and Graphify are not authorization controls.

At minimum, review exclusions for:

~~~text
.env
.env.*
*.pem
*.key
secrets/
_ops/
.repo-harness/
~~~

Do this before repo-harness init, because adoption can register the repository as readable.

## 4. Preview and apply standard adoption

For this workflow, use standard adoption.

~~~bash
repo-harness init \
  --repo "$PWD" \
  --mode standard \
  --no-codegraph \
  --dry-run
~~~

Review the operation list. Then:

~~~bash
repo-harness init \
  --repo "$PWD" \
  --mode standard \
  --no-codegraph
~~~

Verify:

~~~bash
repo-harness status --json
repo-harness run check-task-workflow --strict
repo-harness state next --json
~~~

Before planning exists, state next normally reports idle with no active plan or sprint.

Review the generated diff:

~~~bash
git status --short
git diff --check
git diff --stat
git diff
~~~

Stage only the reviewed adoption paths and commit them as their own checkpoint.

Do not use minimal plus --no-verify as the default shortcut for this flow. Minimal adoption is useful for an intentionally smaller MCP-only contract, but it omits workflow surfaces that the plan/contract/acceptance loop relies on.

## 5. Initialize CodeGraph explicitly

If .codegraph already exists:

~~~bash
codegraph sync .
~~~

Otherwise:

~~~bash
codegraph init .
~~~

Then:

~~~bash
codegraph status .
~~~

In later linked worktrees, initialize or sync that worktree's own CodeGraph state. Do not assume the source checkout index is copied.

## 6. Put planning above Luna

Use ChatGPT Pro, a human, Waza think, Devin, or existing design/research material to decide:

- what outcome is required;
- what must not change;
- architecture and API decisions;
- exact failure semantics;
- allowed paths;
- tests and runtime readbacks;
- rollback boundary.

Luna should execute those decisions, not invent them.

For a multi-step feature, create a small Sprint:

~~~bash
export SPRINT_SLUG=first-luna-slice
repo-harness run new-sprint \
  --slug "$SPRINT_SLUG" \
  --title "First Luna implementation slice"
~~~

Keep the first Sprint to one to three ordered rows.

A PRD should contain only the product decisions needed for that Sprint. Use the repo's PRD template when one exists.

`new-sprint` creates a Draft. Fill the PRD/source section and every intended backlog row first. Then obtain explicit human approval, change the Sprint status to `Approved`, and commit the approved Sprint plus its referenced planning authority on the configured canonical target branch. This is a required authority checkpoint: `start-task` rejects Draft status and resolves the task from the canonical target commit.

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
git commit -m "plan: approve first Luna implementation sprint"

test "$(git rev-parse HEAD)" = "$(git rev-parse "$TARGET_REF")"
~~~

## 7. Claim one Sprint row without executing it

For a contract row, capture the command output instead of later guessing which plan belongs to the claim:

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

The row claim prevents duplicate ownership. The exact `Captured plan:` path is the thin seed associated with this claim; it is not yet a self-sufficient worker brief.

The reliable order is:

~~~text
claim row and retain exact task/seed identity
-> finish decision-complete work-package plan for that same Source Ref
-> start isolated worktree from that exact plan
-> resolve the exact contract from the plan
-> preflight
-> execute bounded worker/verifier
~~~

Do not use `ls -t`, glob ordering, or modification time to decide which plan belongs to the row. Do not use start-task --execute merely to save one command when the plan still needs decisions.

## 8. Freeze a decision-complete plan

If planning already exists, capture it instead of asking Luna to rediscover it.

A work-package plan should name concrete files, commands, failure behavior, and rollback boundaries.

Example capture shape:

~~~bash
PLAN_BODY=/tmp/first-luna-plan.md

CAPTURE_OUTPUT="$(repo-harness run capture-plan \
  --slug first-luna-task \
  --title "First Luna task" \
  --status Approved \
  --artifact-level work-package \
  --promotion-reason worktree_boundary \
  --verification-boundary "focused tests plus project checks" \
  --rollback-surface "revert the task publication" \
  --source waza-think \
  --orchestration-kind sprint-task \
  --source-ref "sprint:${SPRINT_FILE}#${SPRINT_TASK}" \
  --body-file "$PLAN_BODY")"

printf '%s\n' "$CAPTURE_OUTPUT"
PLAN="$(printf '%s\n' "$CAPTURE_OUTPUT" | sed -nE 's/^Captured plan: (.+)$/\1/p' | head -1)"
test -f "$PLAN"
~~~

If the row needs engineering planning, run the parent/Waza planning route first, then capture that finished output. The final plan must preserve the exact Sprint row identity:

~~~bash
grep -Fqx "> **Source Ref**: sprint:${SPRINT_FILE}#${SPRINT_TASK}" "$PLAN"
~~~

This check prevents a valid but unrelated plan from becoming execution authority. Commit the planning checkpoint before worktree execution when that is the repository's workflow policy.

## 9. Start the isolated contract worktree

Ask the start helper for its machine-readable identity and use only those returned paths:

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
test -f "$START_PLAN"

CONTRACT="$(sed -nE 's/^> \*\*Task Contract\*\*: `([^`]+)`.*/\1/p' "$START_PLAN" | head -1)"
REVIEW="$(sed -nE 's/^> \*\*Task Review\*\*: `([^`]+)`.*/\1/p' "$START_PLAN" | head -1)"
NOTES="$(sed -nE 's/^> \*\*Implementation Notes\*\*: `([^`]+)`.*/\1/p' "$START_PLAN" | head -1)"

test -f "$CONTRACT"
test -f "$REVIEW"
test -f "$NOTES"

printf 'plan=%s\ncontract=%s\nreview=%s\nnotes=%s\nworktree=%s\nclaim=%s\n' \
  "$START_PLAN_REL" "$CONTRACT" "$REVIEW" "$NOTES" "$WORKTREE" "$CLAIM_ID"
~~~

The plan, contract, review, and notes are now related by explicit metadata rather than file modification time. Because `start-task` was intentionally run without `--execute`, its claim remains `reserving` until the exact final worktree is known; the explicit bind and claim-token steps above are mandatory before execution or closeout. The worktree is the implementation workspace; keep the primary checkout as the publication target.

## 10. Make the Task Contract self-sufficient

Do not delegate while template text remains.

At minimum review:

1. Why
2. Goal
3. Scope
4. Allowed Paths
5. Change Assessment
6. Evidence Requirements
7. Delegation Contract
8. Exit Criteria
9. Verification Plan
10. Acceptance Policy

A useful first worker budget is one worker plus one verifier invocation and a short wall-time limit. Current contract-run can enforce wall time and runner invocation count. It rejects safety dimensions it cannot enforce instead of silently ignoring them.

A compact Verification Plan should contain the real commands the project owns. Do not paste pnpm examples into a Bun/npm project.

Preflight:

~~~bash
repo-harness run contract-run preflight --contract "$CONTRACT"
repo-harness run check-task-workflow --strict
~~~

## 11. Run Luna through contract-run

contract-run is the correct bounded wrapper. Its --runner and --effort fields record what was used; they do not themselves select a model or reasoning tier. The Codex command must set Luna/low explicitly. In this 0.19 line, `repo-harness run` special-cases `contract-run run`: it reads the contract's numeric `wall_time_minutes` and gives the outer helper process that budget plus two minutes of setup/finalization headroom. Preflight and other ordinary helpers retain the normal 120-second default. This prevents the dispatcher from killing a valid multi-minute delegated run before contract-run's own deadline.

Create two temporary command wrappers:

~~~bash
cat > /tmp/rh-luna-worker.sh <<'SH'
#!/bin/sh
set -eu
exec codex exec \
  --ignore-user-config \
  --strict-config \
  --model gpt-5.6-luna \
  -c 'model_reasoning_effort="low"' \
  -c 'model_verbosity="low"' \
  -c 'web_search="disabled"' \
  --approve-for-me \
  -C "$PWD" \
  "$(cat "$CONTRACT_RUN_PROMPT")"
SH

cat > /tmp/rh-luna-verifier.sh <<'SH'
#!/bin/sh
set -eu
exec codex exec \
  --ignore-user-config \
  --strict-config \
  --model gpt-5.6-luna \
  -c 'model_reasoning_effort="low"' \
  -c 'model_verbosity="low"' \
  -c 'web_search="disabled"' \
  -s read-only \
  -C "$PWD" \
  "$(cat "$CONTRACT_RUN_PROMPT")"
SH

chmod 700 /tmp/rh-luna-worker.sh /tmp/rh-luna-verifier.sh
~~~

Run:

~~~bash
repo-harness run contract-run run \
  --contract "$CONTRACT" \
  --runner codex-exec \
  --effort low \
  --worker-command /tmp/rh-luna-worker.sh \
  --verifier-command /tmp/rh-luna-verifier.sh
~~~

The worker edits. The contract verifier is read-only. Neither one owns final semantic acceptance.

Inspect the actual result:

~~~bash
git status --short
git diff --check
git diff --stat
git diff
~~~

A worker touching a path outside Allowed Paths is a stop condition. Broaden scope only when the broader path is genuinely part of the approved task, then re-freeze the contract before continuing.

## 12. Do not create duplicate workers

A terminal, SSH, desktop-control, or chat transport timeout does not prove the Codex child stopped.

Check:

~~~bash
ps -axo pid,etime,command | grep '[c]odex exec'
git status --short
~~~

If the original worker is alive, do not start another worker on the same worktree.

For uncertain external side effects, reconcile the external state before retrying. Process disappearance is not evidence that the effect did not happen.

If only CodeGraph refresh failed after a successful source mutation, repair indexing separately:

~~~bash
codegraph sync .
~~~

Never repeat the source mutation just to obtain a fresh index.

## 13. Reuse or prepare deterministic acceptance evidence exactly once

The generated contract-run worker prompt already requires the worker to call `repo-harness run verify-sprint --prepare-acceptance` once after implementation and final criteria are frozen. Therefore this operator step is a reconciliation step, not an unconditional second execution.

Inspect the contract-run manifest, worker stdout, and the canonical checks artifact.

Do not use "no tracked file changed" as the reuse condition. The normalized review subject includes non-ignored untracked file contents, while acceptance also binds the contract and Change Assessment authority.

Use the prepared packet to prove that the current subject is still exactly the prepared subject without rerunning expensive criteria:

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

Reuse the evidence only when these checks pass and the goal/plan and frozen review policy have not changed since preparation. Otherwise record the stale reason and run exactly one replacement preparation:

~~~bash
repo-harness run verify-sprint --prepare-acceptance
~~~

The resulting evidence binds the normalized final subject (including non-ignored untracked content), target revision, subject paths, verification evidence, benchmark evidence when required, and Change Assessment. Preserve those bindings until semantic review and receipt recording finish.

## 14. Run the frozen semantic reviewer

Read and capture the contract's exact acceptance policy. For protocol 2, the reviewer and source are part of the frozen authority:

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

Run exactly that reviewer/source, pin the review to the exact target revision frozen by preparation, and request structured output:

~~~bash
REVIEW_JSON="$(repo-harness cross-review \
  --provider "$REVIEW_PROVIDER" \
  --base "$PREPARED_TARGET_REV" \
  --json)"
printf '%s\n' "$REVIEW_JSON"
~~~

Before consuming the verdict, prove that the reviewer observed the same prepared semantic subject:

~~~bash
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

A provider result against another base, subject, or path set is not acceptance evidence. Do not relabel it.

Only after an actual passing, correctly bound review should the orchestrator record `external_pass`, preserving the real summary and findings:

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

For a rejection, record reject and the actual findings.

Then verify the receipt-bound state:

~~~bash
repo-harness run verify-sprint
~~~

Review Markdown is a projection. AcceptanceReceipt is the typed authority.

## 15. Close out

Before a local merge, verify the target branch is still the exact publication base expected by the worktree. A moved target invalidates assumptions about the candidate.

For local single-publication closeout:

~~~bash
repo-harness run contract-worktree finish --merge
~~~

For the repository's normal draft-PR route, use repo-harness-ship / ship-worktrees rather than hand-composing finish, push, and PR creation.

Do not manually mark a Sprint contract row complete before finish. Closeout owns that lifecycle update.

## 16. Continue from state, not chat memory

After closeout:

~~~bash
repo-harness state next --json
~~~

Interpret only the returned envelope.

Typical routes include another planning/execution unit, verify_or_finish, or idle. If the envelope is blocked, return to the named human/owner boundary instead of improvising.

## 17. What should stop unattended execution

Stop for a human when:

- a product or architecture decision is missing;
- scope must expand beyond Allowed Paths;
- an irreversible external effect has uncertain status;
- the target publication base moved;
- deterministic evidence cannot be produced;
- the semantic reviewer/source required by the contract is unavailable and the policy does not authorize another disposition.

A normal failing unit test inside approved scope is not automatically a human escalation. Let the bounded implementation loop repair it when the contract still contains the required decision.

## 18. Host-specific Nix rule

On a Nix-managed Mac, the project runbook stops at project-local adoption, planning, contracts, CodeGraph project state, and execution.

The Nix repository owns:

~~~text
repo-harness runtime pin
Codex binary and hook projection
Codex trust hashes
Waza / skills
Herdr
CodeGraph installation and MCP registration
Planner/Coding MCP launchd service
Cloudflare helper/tunnel utilities
~~~

Do not run repo-harness install globally inside each new repository on such a host.

## 19. Minimal daily checklist

~~~text
[ ] clean or deliberately understood Git base
[ ] .ignore reviewed
[ ] standard adoption previewed and committed
[ ] CodeGraph current
[ ] Sprint row claimed once
[ ] decision-complete work-package plan frozen
[ ] contract worktree started
[ ] contract placeholders removed
[ ] contract-run preflight green
[ ] Luna worker bounded and explicit
[ ] verifier read-only
[ ] diff inside Allowed Paths
[ ] canonical prepare-acceptance evidence is current (reused or run once for a recorded reason)
[ ] frozen semantic reviewer actually ran
[ ] AcceptanceReceipt recorded from the real result
[ ] final verify-sprint green
[ ] closeout ran exactly once
[ ] state next selected the continuation
~~~
