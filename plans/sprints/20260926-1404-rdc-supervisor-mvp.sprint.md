# Sprint: RDC Supervisor MVP: monitor, managed ChatGPT continuation, Luna-low recovery

> **Status**: Draft
> **Slug**: rdc-supervisor-mvp
> **Created**: 2026-09-26 14:04
> **Updated**: 2026-09-26 14:16
> **Source PRD**: `plans/prds/20260926-1340-rdc-supervisor-roadmap.prd.md`
> **Source Plan**: `plans/plan-20260926-1340-rdc-supervisor-mvp.md`
> **Discovery Sprint**: `plans/sprints/20260926-1416-rdc-supervisor-discovery.sprint.md`
> **Source Notes**: `tasks/notes/20260926-1340-rdc-supervisor-mvp.notes.md`
> **Research**: `docs/researches/deep-research-report-Remote-Desktop-Commander-Supervisor-Repo-Harness-ChatGPT.md`
> **Source Spec**: `docs/spec.md`
> **Backlog Schema**: 2
> **Goal Mode**: incremental

Program-level sprint container. The Source PRD summary and ordered backlog
decompose product intent into ordered rows. Contract rows become task-contract
slices after `$think` expansion; inline rows stay in the sprint backlog or
active plan Task Breakdown.
`tasks/todos.md` stays the deferred-goal ledger and never carries this backlog.

## PRD

This Sprint is the first executable slice of the phased RDC Supervisor roadmap. It keeps Repo Harness as workflow authority while a small deterministic local supervisor coordinates managed ChatGPT/RDC turns and one bounded coding worker. The monitor checkpoint must remain useful even when browser or model integration is unavailable.

### Problem

- The current workflow can complete bounded RDC turns, but no durable local supervisor continuously reconciles Fleet, browser/session lineage, process state and the next Repo Harness action across the ~25-minute RDC boundary.
- Browser completion, RDC tool invocation, worker completion and Repo Harness acceptance are distinct events; treating any one as the others risks duplicate prompts or duplicate workers.
- Idle monitoring must make zero model calls, and implementation must use only the exact approved low-cost Luna lane.

### Users

- Human owner operating Helium and ChatGPT Projects.
- Global RDC supervisor for cross-project decisions and exceptions.
- Project RDC orchestrator for one repository/work unit.
- Repo Harness as task, claim, worktree, verification, acceptance and closeout authority.

### Success Criteria

- A Fleet-only monitor survives restart, reports degraded state correctly and performs zero browser/Codex/workflow mutations.
- One managed ChatGPT/RDC project session is bound by explicit lineage and proves real RDC tool invocation before execution.
- One approved task runs through the canonical Repo Harness lifecycle with the approved Luna-low policy and no duplicate dispatch/worker under retries or recovery.
- One real >25-minute boundary test recovers the existing worker/claim/session and continues without a manual `continue` in the ordinary case.

### Acceptance Scenarios

- Monitor-only operation with Fleet changes, malformed frames, process exit and reconnect.
- Managed session creation/recovery, one benign RDC canary, one same-conversation followup and negative evidence cases.
- Crash/restart before launch, after remote submit, while worker runs and after worker exit; no blind resend or replacement worker.
- Deterministic verification, independent review, typed AcceptanceReceipt and explicit closeout/integration status for the pilot task.

### Non-goals

- Multi-project autonomous scheduling, fairness and long soaks; those are Phase 3.
- Continuous observation of arbitrary already-open Helium tabs, fresh-chat rollover and packaging/autostart; those are Phase 4.
- New authentication/RBAC, credential vaulting, sandboxing, browser hardening, prompt-injection defenses or security review; security is Phase 5 and remains last.
- Replacing Repo Harness, adding Temporal/LangGraph, building a second dashboard, or treating browser-finished as task acceptance.

## Architecture Notes

### Capabilities Touched

Existing Repo Harness surfaces are dependencies, not automatically editable scope: `src/cli/commands/fleet.ts`, `src/core/fleet/board.ts`, `src/core/operator/fleet-snapshot.ts`, `src/cli/chatgpt-browser/session-store.ts`, `src/cli/chatgpt-browser/oracle-provider.ts`, `src/cli/chatgpt-browser/oracle-session-evidence.ts`, `src/core/automation/campaign-browser-session.ts`, `src/core/state/project-continuation-envelope.ts`, `src/core/state/attempt-ledger.ts`, and `scripts/contract-run.ts`.

The proposed standalone supervisor owns only operational state absent from Repo Harness: project-to-chat/session bindings, dispatch idempotency, process observations, timers and compact handoffs. It must not copy authoritative Sprint/task/claim/acceptance state into a second authority.

### Execution-home gate

This Sprint is being drafted in the Repo Harness source checkout because it owns the roadmap and integration research. Execution-home discovery is now owned by the separate Draft Sprint `plans/sprints/20260926-1416-rdc-supervisor-discovery.sprint.md`. That Sprint carries the original M0 task identity and may be approved independently. This implementation Sprint remains Draft until discovery fixes the exact standalone repository/path and its M1-M7 scope is recaptured or transferred there. Any required Repo Harness evidence-adapter change receives a separate bounded Repo Harness plan/contract; no sibling-repository writes are authorized by this Sprint.

### Dependency Order

Discovery M0 -> M1 -> M2 produces the monitor checkpoint when `monitor_ready=true`; browser or worker readiness may still be blocked. M3 requires discovery `browser_ready=ready` and its own live-canary authorization. Full execution is `M1 + M2 + M3 -> M4 -> M5 -> M6 -> M7`. M5 additionally requires discovery `worker_ready=ready`. If M3 proves a Repo Harness evidence dependency, that separately accepted dependency sits between M3 and M4.

### Global Invariants

- One registered execution project, one active project RDC turn and one implementation worker globally in the MVP.
- Persist dispatch intent before external effects; unknown remote outcome is reconciled, never blindly resent.
- Exact session lineage beats newest-session selection; exact task/claim generation is revalidated immediately before browser or worker effects.
- Browser terminal state, RDC invocation, worker exit, verification and acceptance remain separate states.
- Idle monitoring invokes no model; the worker/reviewer lane must match the exact approved Luna-low configuration or stop.
- Existing Repo Harness no-progress, verification, acceptance and closeout authority remains unchanged.

### Risks

- Helium or the local Oracle/RDC connector may not expose the assumed managed-session evidence; M3 must prove it with positive and negative fixtures.
- Installed runtime/version strings can differ from checked-in source behavior; discovery M0 records executable paths/revisions. A blocked worker result does not block M1-M2, but M5 cannot start until `worker_ready=ready`.
- Remote ChatGPT submission has no assumed exactly-once API; local idempotency prevents concurrent duplicates but cannot turn an ambiguous remote effect into certainty.
- Architecture projection currently reports one blocking dead-letter event; this Sprint records the blocker but does not silently repair or bypass it.

### Live evidence policy

Live browser/model evidence is frozen before it is spent, not retroactively in M7.

- **V4 — RDC invocation canary** is defined by: application/browser-adapter subject revision, Repo Harness runtime revision, Oracle/RDC executable versions, ChatGPT Project URL, provider/profile, selected app/connector, prompt digest, session predecessor identity, and evidence-schema/parser revision. M3 records these inputs and the approved budget before the consult. The result remains reusable only while every validity input relevant to the claim is unchanged.
- **V5 — pilot task + >25-minute recovery** is defined by: frozen supervisor subject revision after M5, Repo Harness runtime revision, exact approved worker/reviewer model configuration, pilot repository HEAD, task/contract/claim generation, bound browser-session lineage, timer/recovery policy revision, and evidence-schema/parser revision. M6 freezes these inputs before launching the single live pilot.
- A source/runtime/configuration change that can affect the criterion invalidates that evidence. The owning row must record the invalidation reason and obtain a renewed explicit live-test budget before rerun.
- Missing cache metadata alone is not permission to repeat a paid/live criterion. M7 consumes valid V4/V5 evidence and does not automatically rerun either criterion.

## Backlog

Ordered execution queue; keep rows in dependency order. Mode `contract` runs
the full plan -> contract -> worktree flow; `inline` allows primary-tree
execution for small tasks. Every row needs a concrete acceptance line.

The `ID` cell is the persisted, immutable task identity (64 lowercase hex
characters). It is minted once when the row is created and must never be edited,
copied between rows, or regenerated: editing the Task text is a rename, not a new
task.

| # | ID | Status | Task | Mode | Acceptance | Plan |
|---|----|--------|------|------|------------|------|
| 1 | 2e3f094004f6dbd38bd463162c5eca127657c38be8b15c9bf95133857e1aa09a | [ ] | M1 — scaffold deterministic supervisor and durable journal | contract | Standalone Bun/TypeScript app has validated project config, SQLite schema, atomic dispatch admission, bounded process adapter and focused tests; duplicate admission cannot launch twice | (pending) |
| 2 | 5668798b559bd1358c05b1ee36b970601ad567fa3a846e590535161ab1715f7a | [ ] | M2 — deliver Fleet monitor-only checkpoint | contract | Fleet JSONL replay and local smoke prove restart/reconnect/degraded handling with zero browser calls, zero Codex calls and zero workflow-authority writes | (pending) |
| 3 | bb692141221247fdaef4b723e904d61409fb3f9b648e220cb2be23269b6ccf4d | [ ] | M3 — prove managed ChatGPT and RDC invocation path | contract | V4 inputs/budget are frozen before the live canary; one bound conversation has real RDC tool-invocation evidence, negative wrong/missing/incomplete fixtures and one verified same-conversation followup | (pending) |
| 4 | 0a13ad58e0c8f78ea7424681a7565153280547cbc91ef0870f59feeab2e1aef3 | [ ] | M4 — implement idempotent dispatch and exact session lineage | contract | Restart/duplicate/stale/unknown-submission fixtures create no extra browser prompt and lineage advances only by compare-and-swap from the expected predecessor | (pending) |
| 5 | a1871387eeb5ac4bb6376217a257ef19987c1163770d72f02608132dcfb31cad | [ ] | M5 — integrate Luna-low worker and canonical Harness lifecycle | contract | Exact approved model policy is enforced; conflicting overrides fail closed; fixture/preflight integration proves durable worker-request and canonical lifecycle wiring without consuming the live pilot | (pending) |
| 6 | 68fa901214c4ca4c5f60b31a31d60484362b8f08cebb7487cb16cd77b24907b5 | [ ] | M6 — run the single pilot, recover across ~25 minutes, then close out | contract | V5 inputs are frozen before launch; one real pilot survives >25 minutes, successor RDC recovers the same worker/claim/session, then deterministic verification, independent review, AcceptanceReceipt and closeout complete | (pending) |
| 7 | 5c3dea4c65db9654e9feafb162d612924b91c6a7a48ca98fbff9bccabad79712 | [ ] | M7 — review frozen evidence and publish operator runbook | contract | Valid V4/V5 evidence is reused without automatic rerun; runbook proves start/status/stop/restart and labels monitor-only versus execution MVP with limitations and later phases | (pending) |

## Detailed Work Packages

### M1 — Scaffold deterministic supervisor and durable journal

**Dependencies:** discovery M0 completed with exact execution home and `monitor_ready=true`. `browser_ready` and `worker_ready` may still be blocked. Recapture this row in the standalone repository before starting it.

**Allowed paths after transfer:** `package.json`, lockfile, TypeScript config, `src/cli.ts`, `src/config.ts`, `src/journal.ts`, bounded subprocess adapter, and focused config/journal tests.

**Work:** create the Bun/TypeScript app; define one project schema with canonical repo paths and unique project/session bindings; create versioned SQLite tables for project bindings, dispatch intent, process observations and timers; implement atomic action admission; add `status`, `monitor`, `once`, and `run` command shells; drain stdout/stderr concurrently and capture exit/deadline state.

**Verification:** focused Bun tests plus type check; two concurrent attempts for one action identity prove only one admission wins; restart preserves pending journal state.

**Budget:** <=90 minutes worker wall time, max 2 implementation attempts, each supervised through bounded RDC turns.

**Rollback:** remove the standalone scaffold/database migration before external effects exist; no Repo Harness task state is modified.

### M2 — Deliver Fleet monitor-only checkpoint

**Dependencies:** M1.

**Allowed paths after transfer:** Fleet adapter, reconcile/read-model code, journal migrations if required, monitor/status CLI, fixtures/tests, monitor runbook section.

**Work:** consume `repo-harness fleet watch --format jsonl --interval-ms 30000`; handle split JSONL, malformed frames, process exit and capped reconnect; use canonical Fleet digest semantics rather than collection sequence; reconcile due timers even if Fleet is unchanged; persist bounded observations; render compact project/status/error/next-reconcile state.

**Verification:** fixture replay, restart/reconnect tests and a short local Fleet smoke run. Spies/counters must prove zero ChatGPT submissions, zero Codex invocations and zero Repo Harness authority writes while in monitor mode.

**Budget:** <=90 minutes worker wall time, max 2 attempts; local monitor smoke <=5 minutes.

**Rollback:** stop the supervisor and remove its local operational DB; Repo Harness Fleet/Operator state remains untouched.

### M3 — Prove managed ChatGPT and RDC invocation path

**Dependencies:** discovery M0 recorded `browser_ready=ready`. It may proceed in parallel with M1-M2 only after explicit approval for live prompts; blocked browser readiness does not block the monitor checkpoint.

**Allowed paths after transfer:** browser adapter, redacted fixtures, browser integration tests and runbook notes. Repo Harness source remains read-only unless a separate dependency plan is approved.

**Work:** recover/register one exact Repo Harness browser session or create one disposable pilot conversation; record exact ChatGPT Project URL, provider/profile, connector/app selector and conversation identity; prove `browser-open --launch` navigation; finish source/fixture coverage first; then freeze the V4 subject/validity inputs and approved budget before sending one benign RDC canary; capture provider/session/turn/prompt/tool-invocation/final-assistant evidence; prove one `browser-followup` remains in the bound conversation.

**Negative cases:** missing RDC invocation, wrong app, unrelated turn, incomplete capture and successor session that does not descend from the expected predecessor all fail closed.

**Verification:** source/fixture tests plus V4, containing at most one consult and one justified followup. Assistant prose claiming RDC use is not evidence. Record the exact V4 validity inputs and evidence references with the result.

**Budget:** <=60 minutes implementation/test wall time; V4 live budget is exactly one consult plus one followup and must be separately approved before execution. If V4 is invalidated later, rerun requires a recorded invalidation reason and renewed budget approval.

**Rollback:** delete disposable test conversation/session bindings from the supervisor journal only; preserve Repo Harness browser evidence. Do not weaken campaign validation to force success.

### M4 — Implement idempotent dispatch and exact session lineage

**Dependencies:** M1, M2 and successful M3 evidence route; any Repo Harness evidence dependency accepted separately.

**Allowed paths after transfer:** reconcile/state-machine code, journal schema, browser/Harness adapters, dispatch CLI, fixtures and focused tests.

**Work:** bind repository/project/provider/conversation/session lineage explicitly; derive a stable action identity from project, task/claim generation, continuation revision, session lineage and operation; atomically admit before effect; record launching/submitted/observing/terminal/outcome_unknown separately; revalidate task/claim/worktree/session authority immediately before submission; compare-and-swap the predecessor binding when a correlated successor is accepted.

**Verification:** injected-clock and fake-adapter tests cover duplicate wakeups, multiple timer events, crash after admission, crash after submit, stale task generation, unrelated newer consult, manual intervening turn and unknown remote outcome. No fixture may emit an extra browser prompt.

**Budget:** <=120 minutes worker wall time, max 2 implementation attempts.

**Rollback:** stop dispatch and preserve unresolved journal rows for reconciliation; never delete an unknown-effect record merely to permit retry.

### M5 — Integrate Luna-low worker and canonical Harness lifecycle

**Dependencies:** discovery M0 recorded `worker_ready=ready` with the exact approved Luna/reviewer policy, and M4 is complete. If worker readiness is blocked, M1-M4 may remain valid but M5 does not start.

**Allowed paths after transfer:** worker-policy/request modules, Harness/process adapters, worker-policy tests and runbook updates. Any Repo Harness source change is a separate contract.

**Work:** accept only structured frozen task inputs; enforce the exact discovery-approved model, low effort/verbosity and web-disabled policy; reject trailing/config overrides; add durable `worker-request` admission; make the supervisor the only worker-launch owner; wire the canonical Repo Harness preflight/run path against exact contract/claim/worktree inputs; observe the existing runner's claim renewal rather than adding another renewer. This row implements and tests the lifecycle wiring but does not consume the single live pilot.

**Lifecycle under test:** before continuation envelope -> bounded worker request/runner launch -> required checks -> after envelope -> attempt receipt -> post-receipt continuation. Independent review, AcceptanceReceipt and closeout are exercised on the live pilot in M6, not here.

**Verification:** argv/config spies reject conflicting model settings; stale worker requests fail authority revalidation; lost worker-request response recovers the existing request; fake/synthetic runner fixtures prove launch ownership, process identity, renewal observation and lifecycle transitions; canonical preflight/dry-run is used where it does not execute the pilot. No accepted/closed pilot task is required in M5.

**Budget:** <=120 minutes worker wall time, max 2 implementation attempts; no live pilot/model budget in this row beyond deterministic fixture/preflight work.

**Rollback:** stop new requests while preserving any canonical worktree/claim evidence created by separately authorized tests; use Repo Harness recovery rather than journal deletion.

### M6 — Run the single pilot, recover across the ~25-minute RDC boundary, then close out

**Dependencies:** M4 and M5 complete; V4 remains valid for the browser/RDC claim or has an explicitly approved rerun; the pilot task is approved but not yet closed.

**Allowed paths after transfer:** timer/recovery/handoff code, recovery fixtures/tests, runbook recovery section and the exact pilot's normal Repo Harness workflow artifacts.

**Work:** finish recovery fixtures first; freeze the supervisor implementation and all V5 validity inputs before launch; persist the RDC turn start/deadline; treat the fork lifecycle clock as an observation rather than proof of chat completion; prepare compact handoff around minute 18, stop starting new work by minute 20, refresh observations at warning/critical points, and reconcile at expiry without killing a valid worker. Launch the single approved pilot through the M5 worker path, keep the actual contract-run chain active beyond 25 minutes, recover it from a successor RDC turn, then continue the same pilot through deterministic verification, policy-selected independent review, typed AcceptanceReceipt and authorized closeout.

**Recovery matrix before live launch:** restart before spawn; after remote submit before receipt; while worker runs; after worker exit before observation; lost RDC tool response; PID reuse; stale claim generation; unknown renewal owner. Recovery must reuse existing effects when proven.

**Verification:** focused fake-clock/process/session tests plus V5. V5 succeeds only when the same worker/claim/session lineage survives the boundary and that same pilot subsequently reaches canonical verification, review, AcceptanceReceipt and closeout. Browser completion alone is insufficient.

**Budget:** <=90 minutes implementation/test wall time, max 2 implementation attempts before freeze; V5 is one live pilot with 35-45 minutes observation and one successor RDC turn. Any invalidating source/runtime/config change after freeze requires a recorded reason and renewed V5 budget before rerun.

**Rollback:** stop new dispatch and preserve the running or completed pilot's worker/claim/browser/evidence state; never treat turn expiry as authority to release or steal a claim. If V5 fails after the task has legitimately advanced, recover that same task rather than creating a second pilot.

### M7 — Review frozen evidence and publish operator runbook

**Dependencies:** M2 for the monitor release; M3-M6 for the execution MVP. V4 and V5 must be valid for the claims they support.

**Allowed paths after transfer:** operator runbook, release/acceptance notes and evidence-index metadata only, plus documentation-only corrections that cannot affect V4/V5 validity. No implementation or test-fix work and no Phase 3-5 feature work in M7.

**Work:** document exact setup/start/status/stop/restart procedures using proven executables; distinguish monitor-only checkpoint from one-project execution MVP; state managed-session and unhardened personal-local limits; review the already frozen V4/V5 input sets and evidence references; record exact changed paths, run identities, workflow acceptance/closeout references and follow-on phases. Do not automatically rerun live criteria.

**Verification:** cheap documentation/link/integrity checks and evidence-reference validation. Reuse valid V4/V5 evidence. If a code/test/runtime fix is needed, return to the owning row, invalidate the affected criterion explicitly, freeze a new subject and obtain renewed live-test budget before rerun.

**Budget:** <=60 minutes documentation/evidence-review orchestration; zero new live browser/model runs unless an explicit invalidation + renewed authorization occurred outside M7.

**Rollback:** documentation rollback does not erase accepted task evidence or supervisor recovery journal; any Repo Harness dependency is reverted/closed separately.

**Sprint exit:** discovery M0 is complete in its separate Sprint; all seven implementation rows are complete in their owning repository/contract boundaries; monitor and execution release labels are explicit; one pilot task is accepted and closed once; security remains a later Phase 5 Sprint.

## Execution Log

Keep this section last; `repo-harness run sprint-backlog complete-task` appends rows here.

| When | Task | Plan | Result |
|------|------|------|--------|
