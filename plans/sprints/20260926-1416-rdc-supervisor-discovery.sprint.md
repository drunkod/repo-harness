# Sprint: RDC Supervisor discovery: execution home and readiness matrix

> **Status**: Approved
> **Slug**: rdc-supervisor-discovery
> **Created**: 2026-09-26 14:16
> **Updated**: 2026-09-26 14:32
> **Source PRD**: `plans/prds/20260926-1340-rdc-supervisor-roadmap.prd.md`
> **Source Plan**: `plans/plan-20260926-1340-rdc-supervisor-mvp.md`
> **Implementation Sprint**: `plans/sprints/20260926-1404-rdc-supervisor-mvp.sprint.md`
> **Source Notes**: `tasks/notes/20260926-1340-rdc-supervisor-mvp.notes.md`
> **Backlog Schema**: 2
> **Goal Mode**: incremental

One-row discovery Sprint. It exists so M0 can be approved independently of the
implementation Sprint. It may establish facts and planning artifacts only; it does
not authorize supervisor implementation, live ChatGPT prompts, model calls, runtime
upgrades, Nix/MCP changes, or sibling-repository writes.

## PRD

### Problem

The implementation Sprint cannot be approved until the standalone execution
repository is known, but a contract row inside that Draft Sprint cannot execute to
discover it. Monitoring also must not wait for browser/model compatibility.

### Users

- Human owner approving the execution home and pilot.
- RDC parent orchestrator gathering local facts.
- Maintainer reviewing readiness before implementation approval.

### Success Criteria

- Exact standalone execution repository/path is recorded.
- One already-adopted pilot repository and one candidate approved task are recorded.
- `monitor_ready` is conclusively true or false with concrete blockers.
- `browser_ready` and `worker_ready` are each recorded as `ready` or `blocked`
  with reasons; unresolved browser/model facts do not block monitor work.
- If `worker_ready=blocked`, the exact unresolved model/reviewer/runtime decision is
  named for M5 rather than guessed.
- No runtime, browser, model, Nix, MCP or application mutation occurs.

### Acceptance Scenarios

- Monitor prerequisites pass while browser or worker readiness remains blocked:
  discovery still completes and M1-M2 may later be approved.
- Browser prerequisites are blocked: M3 remains blocked without blocking M1-M2.
- Worker/model prerequisites are blocked: M5 remains blocked without blocking M1-M4.
- Execution-home ambiguity remains: discovery does not complete and implementation
  Sprint remains Draft.

### Non-goals

- Running a live browser/RDC canary.
- Resolving browser evidence by changing Repo Harness.
- Launching Codex/Luna.
- Implementing the supervisor.
- Repairing the existing architecture-projection dead letter.
- Security hardening.

## Architecture Notes

### Authority boundary

This Sprint may update only planning/readiness artifacts in the Repo Harness source
checkout. The implementation repository is an output of discovery, not a writable
target of this Sprint.

### Dependency handoff

After this Sprint is completed and reviewed:

- M1 requires exact execution home + `monitor_ready=true`.
- M2 requires M1 only.
- M3 requires `browser_ready=ready` and separate approval for its live criterion.
- M5 requires `worker_ready=ready` and the exact approved Luna/reviewer policy.
- The implementation Sprint stays Draft until its transferred/recaptured artifacts
  are reviewed in the chosen execution repository.

### Risks

- Version strings may not identify the installed runtime revision.
- Browser or worker readiness may remain blocked; that is an acceptable discovery
  result and must not be converted into guessed configuration.
- The current architecture-projection dead letter remains a separately reported gate.

## Backlog

| # | ID | Status | Task | Mode | Acceptance | Plan |
|---|----|--------|------|------|------------|------|
| 1 | a672b78dfe600e658a9095c9f6cde37136c6b87b765c5cf39f5867302c53edfc | [ ] | M0 — freeze execution home, pilot and readiness matrix | contract | Readiness artifact fixes exact execution repo and pilot; `monitor_ready` is conclusive; `browser_ready` and `worker_ready` are ready or blocked with reasons; no live/model/runtime mutation occurred | (pending) |

## Detailed Work Package

### M0 — Freeze execution home, pilot and readiness matrix

**Allowed paths:** this discovery Sprint, the source PRD/Plan/Notes, and one
compatibility/readiness artifact under `plans/` or `tasks/notes/`. No runtime
source, Nix/Home Manager, MCP, browser profile, application source or sibling repo.

**Work:**

1. Record the exact standalone application repository/path.
2. Select one already-adopted pilot repository and one candidate approved task.
3. Record resolved Repo Harness, Oracle, RDC/device agent, Codex, Bun and CodeGraph
   executable paths/versions/revisions where available.
4. Check Fleet/status and monitor prerequisites; set `monitor_ready`.
5. Inspect browser-engine prerequisites without sending a prompt; set
   `browser_ready=ready|blocked` with evidence/reason.
6. Inspect installed contract-run/model/reviewer prerequisites without launching a
   worker; set `worker_ready=ready|blocked` with evidence/reason.
7. If model identity or review policy is unresolved, record the exact decision needed
   by M5. Do not guess or upgrade anything.
8. Record whether a separate Repo Harness evidence-adapter slice appears necessary;
   do not implement it here.

**Verification:**

```text
repo-harness status --json
repo-harness state next --json
codegraph status .
resolved executable/version/revision probes
repo-harness chatgpt browser-doctor against the chosen pilot, if it is read-only
```

No `browser-consult`, `browser-followup`, Codex worker, runtime upgrade, Nix/MCP
change or live mutation is an M0 verification step.

**Budget:** one RDC orchestration turn plus one bounded follow-up only if a local
identity/readiness fact cannot be established. No paid/live canary budget.

**Rollback:** planning-only. Supersede the readiness artifact if facts change; do not
rewrite runtime state to make a readiness result pass.

## Execution Log

| When | Task | Plan | Result |
|------|------|------|--------|
