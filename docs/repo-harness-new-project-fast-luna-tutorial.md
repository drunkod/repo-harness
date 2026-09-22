# New Project Fast Path: Repo Harness -> PRD/Sprint/Contract -> Luna-Low

This tutorial is the practical fast path for taking a new or existing local Git
project, adopting repo-harness, turning an already-understood feature into the
smallest executable PRD/Sprint/Task Contract, and running the first bounded
Codex worker on **GPT-5.6 Luna with low reasoning**.

It is written against repo-harness `0.19.x` and the current three-layer model:

```text
PRD -> Sprint backlog -> Task Contract -> isolated worktree -> verification
```

The intended split is:

```text
Human / ChatGPT Pro / existing research   decides what to build
repo-harness                              freezes scope and evidence
GPT-5.6 Luna low                          executes the frozen brief
Codex read-only reviewer                  verifies the exact final subject
```

The key speed rule is: **do not make Luna rediscover architecture that is
already decided**. Give it a small, decision-complete contract and let it act as
an inexpensive implementation worker.

## 1. Prerequisites

The host should already have Git, repo-harness, Codex, and the normal host
adapter configuration available:

```bash
repo-harness --version
codex --version
git --version
```

For the Luna fast lane, verify the active Codex defaults or override them on the
worker command later:

```bash
grep -E '^(model|model_reasoning_effort|model_verbosity|plan_mode_reasoning_effort|web_search)' \
  ~/.codex/config.toml
```

A typical cheap execution baseline is:

```toml
model = "gpt-5.6-luna"
model_reasoning_effort = "low"
plan_mode_reasoning_effort = "low"
```

The worker command in this tutorial still passes the model/effort explicitly so
a later user-config change cannot silently make the task expensive.

## 2. Create or select the project repository

For a brand-new folder:

```bash
export REPO="$HOME/Documents/work/my-project"
mkdir -p "$REPO"
cd "$REPO"
git init -b main
printf '# my-project\n' > README.md
git add README.md
git commit -m 'chore: initial project baseline'
```

Repo-harness contract worktrees need a real Git commit to branch from. Do not
start the workflow from an unborn branch.

For an existing project, first inspect the current state:

```bash
export REPO="$HOME/Documents/work/my-project"
cd "$REPO"
git status --short --branch
git log -5 --oneline
```

If the checkout is dirty, treat those edits as user work. Do not reset, stash,
or blanket-rewrite them just to make repo-harness happy.

### Preserve dirty work before adoption

A lightweight local backup is useful even when you intend to commit the work:

```bash
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="/tmp/$(basename "$REPO")-$STAMP"
mkdir -p "$BACKUP"
git diff --binary > "$BACKUP/tracked.patch"
git ls-files --others --exclude-standard -z > "$BACKUP/untracked.zlist"
if [ -s "$BACKUP/untracked.zlist" ]; then
  tar --null -T "$BACKUP/untracked.zlist" -cf "$BACKUP/untracked.tar"
fi
printf 'backup=%s\n' "$BACKUP"
```

Run the project's existing checks before adoption. For example:

```bash
pnpm typecheck
pnpm test
pnpm build
```

Use the real project commands instead of these examples when they differ. The
point is to know whether the baseline was already red before repo-harness was
introduced.

If every dirty path is intentional and the baseline checks are green, checkpoint
that product state before adoption:

```bash
git status --short
# Review every path. Only when every item belongs to the intended baseline:
git add -A
git commit -m 'chore: checkpoint pre-harness project state'
```

If unrelated work is present, stage only the intended paths instead. The goal is
not a particular commit message; it is a clean, reproducible base for the first
contract worktree.

## 3. Preview and apply repo-harness adoption

Always preview first:

```bash
cd "$REPO"
repo-harness init --dry-run
```

Then apply:

```bash
repo-harness init
```

Initialization adds the repo-local workflow contract, plans/tasks directories,
agent instructions, architecture surfaces, and harness runtime state. It does
not create an application stack or replace product code.

Verify adoption immediately:

```bash
repo-harness run check-task-workflow --strict
repo-harness setup check --target codex --json
repo-harness state next --json
```

At this point `state next` will normally be `idle` with
`no_active_plan_or_sprint`; that is expected before planning artifacts exist.

Inspect the adoption diff:

```bash
git status --short
git diff --check
git diff --stat
```

If the pre-adoption baseline was clean, commit the harness adoption separately:

```bash
git add -A
git commit -m 'chore: adopt repo-harness workflow'
```

A separate adoption commit makes later product diffs much easier to inspect and
lets a maintainer revert harness adoption without reverting application work.

### Optional: confirm CodeGraph readiness

If the project already has `.codegraph/`, prefer using it. Otherwise initialize
or configure CodeGraph according to the host setup before broad code discovery.

## 4. Create the smallest executable PRD and Sprint

Keep the first program intentionally small. A good first Sprint has **one to
three ordered tasks**, each with an acceptance line that can be checked without
interpretation.

Create a Draft Sprint shell:

```bash
export SPRINT_SLUG="first-luna-slice"
repo-harness run new-sprint \
  --slug "$SPRINT_SLUG" \
  --title "First Luna implementation slice"
```

The command prints the new file path, for example:

```text
plans/sprints/20260913-1935-first-luna-slice.sprint.md
```

There is no need to create a huge product document. Copy the compact PRD
template and fill only the decisions required for this Sprint:

```bash
STAMP="$(date +%Y%m%d-%H%M)"
PRD="plans/prds/${STAMP}-${SPRINT_SLUG}.prd.md"
cp .claude/templates/prd.template.md "$PRD"
```

For the fast lane, the PRD only needs enough authority to stop the worker from
making product decisions. Fill at least:

- Problem and user;
- one hard constraint;
- one to three acceptance scenarios;
- P0 module behavior;
- explicit non-goals;
- exact verification commands or evidence expectations.

Mark the PRD `Approved` only after those decisions are real.

Then edit the generated Sprint so it contains:

- `Status: Approved`;
- the exact Source PRD path;
- a concrete Problem / Users / Success Criteria summary;
- architecture notes and dependency order;
- one to three ordered backlog rows;
- a machine-checkable Acceptance cell for every row.

Generate immutable task IDs with:

```bash
openssl rand -hex 32
```

Each ID must be exactly 64 lowercase hexadecimal characters and must never be
regenerated for the same backlog row.

Example minimal backlog:

```markdown
## Backlog

| # | ID | Status | Task | Mode | Acceptance | Plan |
|---|----|--------|------|------|------------|------|
| 1 | <64-hex-id> | [ ] | prove provider read contract | contract | sanitized fixture exists and project checks pass | (pending) |
| 2 | <64-hex-id> | [ ] | add persisted user profile | contract | profile survives reload and focused tests pass | (pending) |
| 3 | <64-hex-id> | [ ] | add read-only provider adapter | contract | real read path works and no mutation tool is invoked | (pending) |
```

Use `contract` mode when the row deserves its own worktree/review boundary.
Use `inline` only for genuinely tiny changes that should stay inside an already
active plan.

Validate and checkpoint planning authority:

```bash
repo-harness run check-task-workflow --strict
repo-harness run sprint-backlog status
repo-harness state next --json
git add "$PRD" plans/sprints/
git commit -m 'plan: add first executable sprint'
```

A healthy continuation envelope should now route to `advance_sprint` and name
the first pending backlog row.

## 5. Claim the first Sprint row without executing it yet

For a new contract row, claim it **without** `--execute` first:

```bash
repo-harness run sprint-backlog start-task --task 1
```

This reserves the row and captures a thin Approved sprint-task plan. The thin
plan intentionally tells the planner to expand the row before implementation.

Do not use this as the implementation brief yet.

### Why not `start-task --execute` immediately?

On 0.19.x, `--execute` can project the thin plan before its Task Contract is
self-sufficient. If projection stops at contract preflight, the plan may already
have advanced into execution state while a later worktree start still expects
an Approved plan. The workflow fails closed, but you lose time repairing state.

The fast reliable order is:

```text
claim row
-> freeze decision-complete plan
-> freeze self-sufficient contract
-> preflight
-> start worktree
-> run Luna
```

## 6. Freeze a decision-complete work-package plan

There are two good routes.

### Route A: planning already exists

If ChatGPT Pro, Devin, a design document, or previous research already contains
the architecture, file boundaries, failure semantics, and tests, **reuse it**.
Do not spend Luna tokens re-planning it.

Save the decision-complete body to a temporary file, for example:

```bash
PLAN_BODY=/tmp/first-luna-plan.md
$EDITOR "$PLAN_BODY"
```

The body should name concrete files/commands and include the exact task
breakdown. Then capture it as an Approved work package:

```bash
repo-harness run capture-plan \
  --slug first-luna-task \
  --title "First Luna task" \
  --status Approved \
  --artifact-level work-package \
  --promotion-reason worktree_boundary \
  --verification-boundary "focused tests plus project typecheck/test/build" \
  --rollback-surface "revert the codex/first-luna-task branch or reviewed commit" \
  --source repo-harness-plan \
  --orchestration-kind sprint-task \
  --source-ref "sprint:<sprint-file>#<exact task text>" \
  --body-file "$PLAN_BODY"
```

Use the exact Sprint path and Task cell text in `--source-ref`.

### Route B: the row still needs engineering planning

Run Waza `$think` before implementation, then capture that finished output:

```bash
repo-harness run capture-plan \
  --slug first-luna-task \
  --title "First Luna task" \
  --status Approved \
  --artifact-level work-package \
  --promotion-reason worktree_boundary \
  --verification-boundary "focused tests plus project checks" \
  --rollback-surface "revert the task branch or reviewed commit" \
  --source waza-think \
  --orchestration-kind sprint-task \
  --source-ref "sprint:<sprint-file>#<exact task text>" \
  --body-file /tmp/waza-think-output.md
```

For architecture-heavy work, the parent agent should own the architecture
judgment; do not force a cheap implementation model to make irreversible design
decisions just because it is available.

Resolve and checkpoint the authoritative plan before creating a worktree:

```bash
PLAN="$(ls -t plans/plan-*-first-luna-task.md | head -1)"
printf 'plan=%s\n' "$PLAN"
git add "$PLAN" plans/sprints/ tasks/todos.md
git commit -m 'plan: freeze first Luna task'
```

Only stage paths that actually belong to this planning checkpoint.

## 7. Start the isolated contract worktree

Start from the Approved work-package plan:

```bash
repo-harness run contract-worktree start --plan "$PLAN"
```

The helper creates or reuses a branch such as:

```text
codex/first-luna-task
```

and a sibling worktree such as:

```text
../my-project-wt-first-luna-task
```

It also projects the plan into Task Contract / Review / Notes artifacts inside
the linked worktree when needed. Keep the primary checkout as a clean merge
target.

Inside the worktree, locate the generated artifacts:

```bash
cd ../my-project-wt-first-luna-task
ls plans/plan-*.md
ls tasks/contracts/*.contract.md
ls tasks/reviews/*.review.md
ls tasks/notes/*.notes.md
```

Do not start the worker while the contract still contains template text such as
`Describe the exact outcome`, `In scope:`, or placeholder test paths.

## 8. Make the Task Contract self-sufficient

The contract is the cheap worker's complete brief. At minimum, fill:

1. **Why** — why the slice exists and what downstream work depends on it.
2. **Goal** — one exact observable outcome.
3. **Scope** — in-scope and explicitly out-of-scope behavior.
4. **Falsifier** — the cheapest observation that would prove the direction wrong.
5. **Allowed Paths** — every path the worker may change, and nothing broader.
6. **Change Assessment** — deterministic/runtime oracles required by the changed surface.
7. **Delegation Contract** — runner budget and worker/verifier permissions.
8. **Exit Criteria** — required files/artifacts only.
9. **Verification Plan** — every executable check exactly once.

For a read-only discovery/docs task, use `Task Profile: docs-only`; for product
code use `code-change` unless another profile is more precise.

A narrow discovery contract might allow only:

```yaml
allowed_paths:
  - docs/research/provider-contract.md
  - docs/research/fixtures/provider/
  - plans/plan-20260913-1937-first-luna-task.md
  - tasks/contracts/20260913-1937-first-luna-task.contract.md
  - tasks/reviews/20260913-1937-first-luna-task.review.md
  - tasks/notes/20260913-1937-first-luna-task.notes.md
```

A useful first-task delegation budget is:

```yaml
delegation:
  budget:
    tokens: null
    runner_invocations: 1
    wall_time_minutes: 20
  permission_scope:
    mode: inherit_allowed_paths
    writable_paths: []
    network: inherited
```

`tokens: null` is intentional: current `contract-run` rejects a non-null token
budget because it cannot mechanically enforce one. Cost control comes from the
explicit Luna model/effort plus a bounded process runtime.

For a TypeScript project, a small Verification Plan can be three real commands:

```json
{
  "protocol": 1,
  "checks": [
    {
      "id": "typecheck",
      "kind": "command",
      "command": "pnpm typecheck",
      "cwd": ".",
      "phase": "preflight",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Proves TypeScript contracts remain valid.",
      "inputs": { "env": [] }
    },
    {
      "id": "tests",
      "kind": "command",
      "command": "pnpm test",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Covers project behavior and focused regressions.",
      "inputs": { "env": [] }
    },
    {
      "id": "build",
      "kind": "command",
      "command": "pnpm build",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Proves the production build still succeeds.",
      "inputs": { "env": [] }
    }
  ]
}
```

Use the package manager and commands the project actually owns. Do not copy
`pnpm` into a Bun/npm project just because this tutorial uses it as an example.

After editing the contract, run the brief gate before starting any worker:

```bash
CONTRACT="tasks/contracts/<plan-stem>.contract.md"
repo-harness run contract-run preflight --contract "$CONTRACT"
repo-harness run check-task-workflow --strict
```

Do not delegate until both commands are green.

## 9. Make Luna a typewriter, not the planner
The cheap-worker rule is simple: planning is already frozen in the plan and
contract. Luna executes the brief; it does not redesign the task.

For the first canary, invoke Codex with the model and effort explicitly instead
of depending on whichever profile happens to be active in the user's home:

```bash
codex exec \
  --ignore-user-config \
  --strict-config \
  --model gpt-5.6-luna \
  -c 'model_reasoning_effort="low"' \
  -c 'model_verbosity="low"' \
  -c 'web_search="disabled"' \
  --approve-for-me \
  -C "$PWD" \
  -
```

`--ignore-user-config` makes the invocation reproducible, while Codex still
uses the existing `CODEX_HOME` authentication. `--approve-for-me` supplies a
workspace-write execution path; do not combine it with an explicit `--sandbox`
on Codex 0.154.

The worker prompt should be short because the contract carries the details:

```text
Execute the active Repo Harness Task Contract exactly.
The plan and contract are already approved; do not re-plan or widen scope.
Use CodeGraph first when code discovery is needed.
Run every Verification Plan command before reporting completion.
If a required decision is absent or a path outside Allowed Paths is needed,
stop and report BLOCKED instead of improvising.
```
## 10. Run the first Luna-low worker with a hard wall-clock bound

repo-harness 0.19 has one important operational wrinkle: the ordinary helper
dispatcher currently caps `repo-harness run ...` helpers at 120 seconds, while
`contract-run` can declare a longer `wall_time_minutes`. For a task that may run
longer than two minutes, do not assume the outer wrapper will honor the longer
contract deadline.

For the first bounded canary, use a tiny local process-group wrapper. It gives
Codex 20 minutes, terminates the whole child process group on timeout, and exits
124 on timeout:

```bash
cat > /tmp/run-luna-bounded.py <<'PY'
import os, signal, subprocess, sys
repo, seconds = sys.argv[1], int(sys.argv[2])
prompt = sys.stdin.read()
cmd = [
  "codex", "exec", "--ignore-user-config", "--strict-config",
  "--model", "gpt-5.6-luna",
  "-c", 'model_reasoning_effort="low"',
  "-c", 'model_verbosity="low"',
  "-c", 'web_search="disabled"',
  "--approve-for-me", "-C", repo, "-",
]
p = subprocess.Popen(cmd, stdin=subprocess.PIPE, text=True,
                     cwd=repo, start_new_session=True)
p.stdin.write(prompt); p.stdin.close()
try:
  code = p.wait(timeout=seconds)
except subprocess.TimeoutExpired:
  os.killpg(p.pid, signal.SIGTERM)
  try: p.wait(timeout=5)
  except subprocess.TimeoutExpired: os.killpg(p.pid, signal.SIGKILL)
  code = 124
raise SystemExit(code)
PY
```
From the contract worktree:

```bash
WT="$(pwd -P)"
CONTRACT="tasks/contracts/<plan-stem>.contract.md"

cat <<'PROMPT' | python3 /tmp/run-luna-bounded.py "$WT" 1200
Execute the active Repo Harness Task Contract exactly.
Read AGENTS.md, CLAUDE.md, the active plan, and the active contract first.
The plan and contract are already approved; do not re-plan or widen scope.
Use CodeGraph first when code discovery is needed.
Stay inside Allowed Paths.
Run every command in the contract Verification Plan before reporting completion.
Append task-local decisions and deviations to the contract Notes file.
If a required decision is absent, a check cannot run, or scope must widen,
stop and report BLOCKED instead of improvising.
PROMPT
```

A zero exit means only that the worker process completed. It is **not** task
acceptance. Repo Harness verification and semantic review still own completion.

Immediately inspect what the worker actually changed:

```bash
git status --short
git diff --check
git diff --stat
git diff
```

If the worker changed a path outside `allowed_paths`, stop. Amend the contract
only when the broader path is genuinely required; otherwise revert the stray
change before proceeding.

## 11. Do not accidentally start two workers
If the terminal, SSH session, or desktop-control transport times out while Codex
is running, first inspect the local machine. A transport timeout does not prove
the worker stopped.

```bash
ps -axo pid,etime,command | grep '[c]odex exec'
git status --short
```

If the original worker is still alive, keep monitoring that process. Do not
launch another worker against the same worktree.

If it exited, inspect its diff and evidence before deciding whether to retry.
For uncertain mutating external side effects, reconcile state before any retry;
never infer "process disappeared" means "effect did not happen."

When source files changed and the project uses CodeGraph, refresh the worktree
index before semantic review:

```bash
codegraph sync
```

Do not make CodeGraph failure an excuse to repeat an already completed source
mutation. Treat indexing as a separate repair step.

## 12. Run deterministic verification and freeze acceptance evidence

The worker's self-check is useful iteration evidence, but Repo Harness must run
the canonical Verification Plan itself:

```bash
repo-harness run verify-contract --contract "$CONTRACT" --strict
repo-harness run verify-sprint --prepare-acceptance
```

The second command freezes the exact normalized implementation subject,
verification evidence, reviewed paths, and target revision in
`.ai/harness/checks/latest.json` plus an immutable run snapshot.
