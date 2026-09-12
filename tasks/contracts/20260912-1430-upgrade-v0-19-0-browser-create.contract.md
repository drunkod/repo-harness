# Task Contract: upgrade-v0-19-0-browser-create

> **Status**: Active
> **Plan**: plans/plan-20260912-1430-upgrade-v0-19-0-browser-create.md
> **Task Profile**: delegated-run
> **Owner**: Parent upgrade agent
> **Capability ID**: root
> **Last Updated**: 2026-09-12
> **Review File**: `tasks/reviews/20260912-1430-upgrade-v0-19-0-browser-create.review.md`
> **Notes File**: `tasks/notes/20260912-1430-upgrade-v0-19-0-browser-create.notes.md`

## Why

The in-progress v0.19.0 merge needs truthful, worktree-local workflow evidence without absorbing unrelated changes or treating pre-freeze checks as acceptance.

## Goal

Record the approved local upgrade direction and run the eight root integrity gates with supported Bun, reporting exact failures. Preserve the parent's browser-create integration boundary; do not implement source changes in this slice.

## Scope

- In scope: new upgrade workflow artifacts and ignored local gate evidence in the existing `upgrade/v0.19.0` worktree; read-only tracked sprint migration assessment.
- Out of scope: source/assets, existing upstream workflow history or `tasks/todos.md`, policy, staging/commits/pushes, branches/worktrees, main/feature, Nix, global runtime/profile migration, unrelated gate repairs, full-suite execution and final acceptance. v0.19.1 remains separate.

## Stop Conditions

Report rather than repair any blocker requiring out-of-scope writes. Do not run `plan-to-todo` because it rewrites the existing ledger. No fabricated passing review, waiver, or AcceptanceReceipt. Parent remains responsible for freeze, full suite, and semantic acceptance.

## Falsifier

An integrity failure, missing sprint identity, or a helper that mutates an unauthorized surface prevents a clean result; preserve the failure evidence and hand back to the parent.

## Workflow Inventory

- Source plan: `plans/plan-20260912-1430-upgrade-v0-19-0-browser-create.md`
- Worktree: `/Users/test/Documents/work/repo-harness/.ai/harness/worktrees/upgrade-v0.19.0`
- Deferred-goal ledger: `tasks/todos.md` (read-only)
- Review: `tasks/reviews/20260912-1430-upgrade-v0-19-0-browser-create.review.md`
- Notes: `tasks/notes/20260912-1430-upgrade-v0-19-0-browser-create.notes.md`
- Checks: `.ai/harness/checks/latest.json` (not proof of this run)
- Run snapshots: `.ai/harness/runs/upgrade-v0.19.0-gates/`
- Scope gate: only the exact new artifacts and ignored local evidence below.
- Completion gate: report completed gate attempts separately from acceptance; parent must freeze the implementation and obtain the required verification and typed review evidence before closing the upgrade.

## Change Assessment

```json
{"protocol":1,"oracles":[]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-review","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260912-1430-upgrade-v0-19-0-browser-create.md
  - tasks/contracts/20260912-1430-upgrade-v0-19-0-browser-create.contract.md
  - tasks/reviews/20260912-1430-upgrade-v0-19-0-browser-create.review.md
  - tasks/notes/20260912-1430-upgrade-v0-19-0-browser-create.notes.md
  - .ai/harness/runs/upgrade-v0.19.0-gates/
  - .ai/harness/active-plan
  - .ai/harness/active-worktree
  - .ai/harness/planning/pending.json
```

## Evidence Requirements

```yaml
evidence_requirements:
  benchmark: not_applicable
```

## Delegation Contract

```yaml
delegation:
  budget:
    tokens: null
    runner_invocations: null
    wall_time_minutes: null
  permission_scope:
    mode: inherit_allowed_paths
    writable_paths: []
    network: inherited
  roles:
    parent: Own source integration, freeze, full suite, and final acceptance.
    explorer: Read-only helper and tracked sprint inspection.
    worker: Write only the new upgrade artifacts and ignored local evidence.
    verifier: Read-only gate reporting against exit criteria; no acceptance fabrication.
```

## Exit Criteria

```yaml
exit_criteria:
  files_exist:
    - plans/plan-20260912-1430-upgrade-v0-19-0-browser-create.md
    - tasks/notes/20260912-1430-upgrade-v0-19-0-browser-create.notes.md
    - tasks/reviews/20260912-1430-upgrade-v0-19-0-browser-create.review.md
  artifacts_exist:
    - .ai/harness/runs/upgrade-v0.19.0-gates/results.json
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {"id":"hooks","kind":"command","command":"npm exec --yes --package=bun@1.4.0 -- bun run check:hooks","cwd":".","phase":"verification","cost":"normal","evidence_policy":"current_exact","necessity":"Check hook source/projection integrity.","inputs":{"env":[]}},
    {"id":"helpers","kind":"command","command":"npm exec --yes --package=bun@1.4.0 -- bun run check:helpers","cwd":".","phase":"verification","cost":"normal","evidence_policy":"current_exact","necessity":"Check helper source/projection integrity.","inputs":{"env":[]}},
    {"id":"deploy-sql","kind":"command","command":"npm exec --yes --package=bun@1.4.0 -- bash scripts/check-deploy-sql-order.sh","cwd":".","phase":"verification","cost":"normal","evidence_policy":"current_exact","necessity":"Check deployment SQL ordering.","inputs":{"env":[]}},
    {"id":"architecture","kind":"command","command":"npm exec --yes --package=bun@1.4.0 -- bash scripts/check-architecture-sync.sh","cwd":".","phase":"verification","cost":"normal","evidence_policy":"current_exact","necessity":"Report architecture integrity and drift without repairing unrelated state.","inputs":{"env":[]}},
    {"id":"task-sync","kind":"command","command":"npm exec --yes --package=bun@1.4.0 -- bash scripts/check-task-sync.sh","cwd":".","phase":"verification","cost":"normal","evidence_policy":"current_exact","necessity":"Check diff-bound workflow evidence; unresolved index divergence must remain visible.","inputs":{"env":[]}},
    {"id":"task-workflow","kind":"command","command":"npm exec --yes --package=bun@1.4.0 -- bash scripts/check-task-workflow.sh --strict","cwd":".","phase":"verification","cost":"normal","evidence_policy":"current_exact","necessity":"Check strict workflow integrity via the source helper.","inputs":{"env":[]}},
    {"id":"inspect-state","kind":"command","command":"npm exec --yes --package=bun@1.4.0 -- bun scripts/inspect-project-state.ts --repo . --format text","cwd":".","phase":"verification","cost":"normal","evidence_policy":"current_exact","necessity":"Inspect drift and required decisions without applying migrations.","inputs":{"env":[]}},
    {"id":"init-dry-run","kind":"command","command":"npm exec --yes --package=bun@1.4.0 -- bun src/cli/index.ts init --repo . --dry-run","cwd":".","phase":"verification","cost":"normal","evidence_policy":"current_exact","necessity":"Inspect source CLI adoption operations without applying changes.","inputs":{"env":[]}}
  ]
}
```

## Acceptance Notes (Human Review)

Pending. These gates run before source freeze and cannot prove final integration acceptance. Parent-reported focused 125/126 and initial campaign-status typecheck failure require reruns after fixes. Parent owns full-suite execution after freeze and final semantic review; no full-suite or review pass is asserted here. This contract covers only the delegated evidence slice, not permission to ship the whole merge.

## Rollback Point

Fork HEAD `41671fdb4c8bffa593657cb4304d6a3a038e5e5d`; merging upstream `a8b5620308a3d2123e4e4c1dc59ad2f34883fe2f`. New evidence remains unstaged. Any rollback or merge completion is a separate parent/user decision; this agent performs neither.
