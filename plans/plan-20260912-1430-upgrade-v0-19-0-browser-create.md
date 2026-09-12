# Plan: Upgrade v0.19.0 while preserving fork browser-create

> **Status**: Approved
> **Created**: 20260912-1430
> **Slug**: upgrade-v0-19-0-browser-create
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: user-approved upgrade/v0.19.0 merge at 41671fdb + upstream a8b5620
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Verification Boundary**: Eight root integrity gates in the existing merge worktree; parent owns frozen-source full suite and final acceptance.
> **Rollback Surface**: Existing upgrade/v0.19.0 merge worktree only; no rollback, merge completion, branch or index mutations authorized for this agent.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260912-1430-upgrade-v0-19-0-browser-create.contract.md`
> **Task Review**: `tasks/reviews/20260912-1430-upgrade-v0-19-0-browser-create.review.md`
> **Implementation Notes**: `tasks/notes/20260912-1430-upgrade-v0-19-0-browser-create.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan planning output.
- Source ref: user-approved upgrade/v0.19.0 merge at 41671fdb + upstream a8b5620
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260912-1430-upgrade-v0-19-0-browser-create.md`
- Sprint contract: `tasks/contracts/20260912-1430-upgrade-v0-19-0-browser-create.contract.md`
- Sprint review: `tasks/reviews/20260912-1430-upgrade-v0-19-0-browser-create.review.md`
- Implementation notes: `tasks/notes/20260912-1430-upgrade-v0-19-0-browser-create.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260912-1430-upgrade-v0-19-0-browser-create.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260912-1430-upgrade-v0-19-0-browser-create.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260912-1430-upgrade-v0-19-0-browser-create.md`.

## Approach
### Strategy
Use the captured planning output below as the execution source of truth.

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Captured plan | Preserves the approved Codex Plan or Waza think decision | Requires the captured text to be concrete enough to execute | Use |

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|
| See captured planning output | Follow | Implement only the approved scope named below |

### Code Snippets
See captured planning output.

### Data Flow
See captured planning output.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Captured plan lacks enough detail | Medium | Execution may need clarification | Stop before implementation if the captured output contradicts repo rules or lacks concrete file targets |

## Task Contracts
- Contract file: `tasks/contracts/20260912-1430-upgrade-v0-19-0-browser-create.contract.md`
- Review file: `tasks/reviews/20260912-1430-upgrade-v0-19-0-browser-create.review.md`
- Implementation notes file: `tasks/notes/20260912-1430-upgrade-v0-19-0-browser-create.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260912-1430-upgrade-v0-19-0-browser-create.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260912-1430-upgrade-v0-19-0-browser-create.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Existing upgrade/v0.19.0 merge worktree only; no rollback, merge completion, branch or index mutations authorized for this agent.
- **Verification boundary**: Eight root integrity gates in the existing merge worktree; parent owns frozen-source full suite and final acceptance.
- **Review/acceptance boundary**: `tasks/reviews/20260912-1430-upgrade-v0-19-0-browser-create.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: merge_boundary

## Evidence Contract

> **Substantive Change SHA256**: `sha256:bb1a78b9f7e293bff15c1c9c922224728128c6ac4974a1346805e229f7929473`

- **State/progress path**: `plans/plan-20260912-1430-upgrade-v0-19-0-browser-create.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260912-1430-upgrade-v0-19-0-browser-create.contract.md`, `tasks/reviews/20260912-1430-upgrade-v0-19-0-browser-create.review.md`, and `tasks/notes/20260912-1430-upgrade-v0-19-0-browser-create.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260912-1430-upgrade-v0-19-0-browser-create.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Existing upgrade/v0.19.0 merge worktree only; no rollback, merge completion, branch or index mutations authorized for this agent.

## Captured Planning Output

### Approved direction and isolation
Continue the existing `upgrade/v0.19.0` merge of fork HEAD `41671fdb4c8bffa593657cb4304d6a3a038e5e5d` with upstream v0.19.0 `a8b5620308a3d2123e4e4c1dc59ad2f34883fe2f`, only in `/Users/test/Documents/work/repo-harness/.ai/harness/worktrees/upgrade-v0.19.0`. Approval covers implementation, not acceptance, commit, push, or merge completion. Keep v0.19.1 a separate future decision.

### P1 map / P2 trace / P3 decision
The parent owns source/docs integration; a sibling agent owns campaign browser-status compatibility. Preserve fork browser-create on upstream Oracle 0.20.0 transport: keep upstream copy-profile transport, descriptor and capability probes; retain Create's prompt-only app contract, scanning, recovery, and readback. Do not restore retired transports or weaken upstream gates. This agent owns only new upgrade plan/contract/notes/review files and ignored local workflow evidence. Root integrity checks use source helpers and ephemeral Bun 1.4.0 because the global Bun 1.3.13 is unsupported. Frozen dependencies were installed by the parent.

### Scope / Non-goals
- New upgrade workflow artifacts, local capture markers, command logs, and gate reporting only for this agent.
- No source, assets, policy, existing upstream workflow-history, main/feature, Nix, or global runtime/profile changes.
- No staging, commits, pushes, branch/worktree creation, merge completion, forced migrations, or unrelated gate repairs.
- No full suite in this delegated slice. Parent owns full-suite execution after source freeze, final semantic review, and acceptance.
- EXECUTION_BOUNDARY: absent requirements are forbidden design space, not permission to improve; unrequested extras fail closed.

### Workflow safety decision
`capture-plan` can safely write the new plan and ignored active-plan/worktree markers here. Do not use `--execute` or `plan-to-todo`: even though its linked-worktree guard avoids creating another worktree, it unconditionally rewrites existing `tasks/todos.md`, outside this agent's scope. Author the new contract/notes/review directly with this deviation recorded. Leave the plan Approved and final acceptance pending; do not synthesize receipts or disable policy. `tasks/current.md` remains the upstream ignored local projection (its tracked deletion is parent-owned).

### Verification and acceptance boundary
Run exactly these root integrity gates with per-command exit codes and logs under `.ai/harness/runs/upgrade-v0.19.0-gates/`: `bun run check:hooks`; `bun run check:helpers`; `bash scripts/check-deploy-sql-order.sh`; `bash scripts/check-architecture-sync.sh`; `bash scripts/check-task-sync.sh`; `bash scripts/check-task-workflow.sh --strict`; `bun scripts/inspect-project-state.ts --repo . --format text`; `bun src/cli/index.ts init --repo . --dry-run`. Prefix with `npm exec --yes --package=bun@1.4.0 --` so child helpers also resolve supported Bun. Read tracked sprint data to determine whether schema-v2 migration is needed; do not execute migration. Existing merge/index divergence may block gates: record exact blockers, do not stage to make checks pass.

Parent-reported starting evidence: focused run 125/126 passed; documentation failure fixed but rerun pending. Initial typecheck failed on the campaign status union; sibling fix and rerun pending. These reports are not this agent's fresh validation. Full suite, frozen-subject review, AcceptanceReceipt, and acceptance remain pending.

### Task Breakdown
- [ ] Capture the approved upgrade plan and new bounded workflow artifacts without touching existing workflow history.
- [ ] Inspect tracked sprint schema and record whether a local v2 migration is required.
- [ ] Run the eight root integrity gates with Bun 1.4.0 and record exact exit codes, logs, and blockers.
- [ ] Parent: freeze integrated source and confirm focused regressions plus typecheck.
- [ ] Parent: run the required full suite after source freeze and obtain final semantic review/acceptance; keep v0.19.1 separate.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Capture the approved upgrade plan and new bounded workflow artifacts without touching existing workflow history.
- [ ] Inspect tracked sprint schema and record whether a local v2 migration is required.
- [ ] Run the eight root integrity gates with Bun 1.4.0 and record exact exit codes, logs, and blockers.
- [ ] Parent: freeze integrated source and confirm focused regressions plus typecheck.
- [ ] Parent: run the required full suite after source freeze and obtain final semantic review/acceptance; keep v0.19.1 separate.
