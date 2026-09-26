# Plan: RDC Supervisor: monitor checkpoint and one-project MVP

> **Status**: Draft
> **Created**: 20260926-1340
> **Slug**: rdc-supervisor-mvp
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: parent-planning
> **Source Ref**: plans/prds/20260926-1340-rdc-supervisor-roadmap.prd.md
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: One standalone application vertical slice: monitor checkpoint, bound RDC invocation, one Luna-low task and turn-boundary recovery; separate approval for any Harness dependency
> **Rollback Surface**: Stop external supervisor dispatch; preserve existing workers and Harness evidence; revert any independently approved Harness adapter separately
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260926-1340-rdc-supervisor-mvp.contract.md`
> **Task Review**: `tasks/reviews/20260926-1340-rdc-supervisor-mvp.review.md`
> **Implementation Notes**: `tasks/notes/20260926-1340-rdc-supervisor-mvp.notes.md`

## Agentic Routing
- Selected route: parent
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: plans/prds/20260926-1340-rdc-supervisor-roadmap.prd.md
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260926-1340-rdc-supervisor-mvp.md`
- Sprint contract: `tasks/contracts/20260926-1340-rdc-supervisor-mvp.contract.md`
- Sprint review: `tasks/reviews/20260926-1340-rdc-supervisor-mvp.review.md`
- Implementation notes: `tasks/notes/20260926-1340-rdc-supervisor-mvp.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260926-1340-rdc-supervisor-mvp.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260926-1340-rdc-supervisor-mvp.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260926-1340-rdc-supervisor-mvp.md`.

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
- Contract file: `tasks/contracts/20260926-1340-rdc-supervisor-mvp.contract.md`
- Review file: `tasks/reviews/20260926-1340-rdc-supervisor-mvp.review.md`
- Implementation notes file: `tasks/notes/20260926-1340-rdc-supervisor-mvp.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260926-1340-rdc-supervisor-mvp.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260926-1340-rdc-supervisor-mvp.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Stop external supervisor dispatch; preserve existing workers and Harness evidence; revert any independently approved Harness adapter separately
- **Verification boundary**: One standalone application vertical slice: monitor checkpoint, bound RDC invocation, one Luna-low task and turn-boundary recovery; separate approval for any Harness dependency
- **Review/acceptance boundary**: `tasks/reviews/20260926-1340-rdc-supervisor-mvp.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260926-1340-rdc-supervisor-mvp.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260926-1340-rdc-supervisor-mvp.contract.md`, `tasks/reviews/20260926-1340-rdc-supervisor-mvp.review.md`, and `tasks/notes/20260926-1340-rdc-supervisor-mvp.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260926-1340-rdc-supervisor-mvp.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Stop external supervisor dispatch; preserve existing workers and Harness evidence; revert any independently approved Harness adapter separately

## Captured Planning Output

## MVP scope and approval boundary

Parent roadmap: [RDC Supervisor phased roadmap](prds/20260926-1340-rdc-supervisor-roadmap.prd.md).
Research: [new report](../docs/researches/deep-research-report-Remote-Desktop-Commander-Supervisor-Repo-Harness-ChatGPT.md).

**Draft, not activated.** This document plans work; it does not authorize installation, live browser prompts, local model calls, runtime changes, or implementation. No implementation contract or worktree has been created. Generated contract/review paths in this scaffold are future artifact slots, not existing evidence. Despite the scaffold's “Active plan” inventory label, capture uses `--no-active` and does not select this plan for execution.

Execution is proposed in a separate `rdc-rh-supervisor` repository. The exact execution home is now owned by the separate Draft discovery Sprint `plans/sprints/20260926-1416-rdc-supervisor-discovery.sprint.md`, which carries M0 independently of the implementation Sprint. After discovery fixes the path and `monitor_ready=true`, recapture/transfer M1-M7 there before approving implementation. Browser/worker readiness may remain blocked without delaying M1-M2. Do not use a Repo Harness contract to authorize arbitrary sibling-repository writes. A required Harness evidence-adapter change must receive its own bounded work package after the RDC canary proves the need.

### Release objective

On one Mac, starting the supervisor resumes one registered, approved project task through managed ChatGPT/RDC sessions and Repo Harness, with the exact user-approved Luna-low worker. The process remains useful without a browser/model connection: the monitor checkpoint ships independently. The final execution MVP demonstrates one actual task, one automatic project-chat continuation across a roughly 25-minute boundary, and canonical verification/acceptance/closeout.

This is an **intentionally unhardened personal-local MVP**. Per the user, all new security tasks are in roadmap Phase 5, last. No security implementation or security-review gate is hidden in this checklist. Existing protections remain unchanged. Correct routing, no duplicate work, model-cost controls, and Repo Harness acceptance are functional requirements and remain in scope.

### Included

- One already-adopted pilot project; one active project turn and implementation worker globally.
- Fleet JSONL monitoring; compact status; persistent operational state; reconnect and restart.
- Explicit managed ChatGPT session registration, creation, continuation, URL opening, and captured turn/RDC invocation evidence.
- One bounded approved task; cooperative fixed worker configuration; process and claim recovery; generated handoff.
- Basic negative/recovery fixtures and one real long-turn recovery demonstration.

### Excluded until later

- Global multi-project RDC dispatch and fairness (Phase 3); live Helium all-tab monitoring and fresh-chat rollover UX (Phase 4).
- New-project auto-adoption, arbitrary task discovery, automatic Git updates/deployments, concurrent workers.
- New dashboard, generic plugin system, Temporal/LangGraph, browser-agent fallback, typed RDC integration, launchd installer.
- New auth/RBAC, TLS, secret management, sandboxing, browser isolation hardening, prompt-injection defenses, security audit, or pen testing (Phase 5).
- Claims of unlimited autonomy: login challenges, ambiguous submissions, policy conflicts, and unclear ownership can still require the human.

## P1 — source and authority map

See the roadmap ownership table. Implement an external adapter over public CLI/JSON, not imports from Repo Harness private modules.

- Repo Harness owns plans/tasks/claims/acceptance and its browser-session records.
- Static project configuration owns the user's registered repo and ChatGPT Project choices.
- SQLite owns supervisor dispatch state and the explicit operational mapping to a Harness session lineage.
- Process manager observations and captured browser evidence are observations, not acceptance authority.
- CLI output, logs, and compact handoffs are deterministic projections of those sources.

Known source dependencies: `src/cli/commands/fleet.ts`, `src/core/fleet/board.ts`, `src/cli/chatgpt-browser/engine.ts`, `src/cli/chatgpt-browser/oracle-provider.ts`, `src/core/automation/campaign-browser-session.ts`, `src/core/automation/campaign-revision-evidence.ts`, and `scripts/contract-run.ts` in Repo Harness. Re-read only changed interfaces when implementation begins.

## P2 — exact reconciliation flow

1. Load registered project and journal; recover pending dispatch/process identity before considering new work.
2. Consume Fleet JSONL and due local timers. A collection counter change alone does not schedule a model.
3. If the repo is unknown/degraded/read-only, show its status without execution. Otherwise query `repo-harness state next --json` from the exact owning repo/worktree when reconciliation is due.
4. If a recorded worker is still running, observe it and the claim-renewal owner; do not start a replacement. Unknown liveness remains unresolved.
5. If a browser submission is in progress or outcome-unknown, reconcile exact provider/session/turn evidence; do not send another prompt.
6. For an eligible approved continuation, form an action identity from project, task/claim generation, continuation revision, session lineage, and operation. Admit it atomically into SQLite before any external effect.
7. Revalidate expected task/claim generation, worktree, continuation and session binding immediately before submission. Discard stale decisions and reconcile; changing an action key is not permission to overlap unresolved work. Dispatch one managed project RDC turn. Its prompt has the exact repo/worktree, task/contract/claim references, compact next action, model policy, and turn deadline—not full history.
8. Distinguish process launch, provider submission evidence, browser terminal capture, and actual RDC tool invocation. Missing evidence is not success.
9. Project RDC supervises the existing Harness workflow: before envelope → one unit → required checks → after envelope → `state attempt` → post-receipt envelope. No-progress breakers remain intact.
10. In one SQLite transaction, persist the correlated successor session and evidence, complete the browser dispatch, and compare-and-swap its binding from the expected predecessor. Unexpected successors or manual intervening turns require reconciliation rather than selecting the newest conversation entry. Regenerate the handoff afterward. Canonical acceptance/closeout can advance only through Harness.
11. At turn-boundary recovery, re-observe existing process/claim/session state and send at most one justified followup. No manual “continue” should be needed for the demonstrated ordinary case.

### Operational state machine

```text
planned → admitted → launching → submitted → observing → terminal
                         │            │          │
                         └────────────┴──────────┴→ outcome_unknown
outcome_unknown → reconciled existing effect / human_attention
```

`admitted` is committed before spawning. `launching` means the remote outcome may already exist even if no local session record has appeared. Crash after admission but before launch may be retried only when non-launch is established. A remote prompt has no assumed exactly-once API: local unique admission prevents concurrent duplicate launch, not every remote failure ambiguity.

A `terminal` browser turn only completes that browser operation. Worker completion, verification, acceptance, and integration remain distinct fields read from their authorities.

## P3 — implementation design

Use Bun/TypeScript and `bun:sqlite`; one persistent supervisor process and one database, no broker. Keep interfaces small: Fleet observer, Harness command adapter, managed-browser adapter, process observer, pure reconciliation decision, journal, CLI renderer.

The supervisor is the **only worker-launch owner**. Project RDC invokes a short-lived proposed `worker-request` CLI that atomically records a request against its existing browser dispatch and frozen contract/claim/worktree. It does not directly run Codex or `contract-run`. The running supervisor revalidates authority, records worker launch intent, and spawns the canonical contract runner; that runner remains the claim-renewal owner. The request CLI returns an existing or new durable request ID. The supervisor continues servicing requests/timers while browser processes run; it must not block its event loop awaiting an entire ChatGPT turn. Worker observations are linked to request ID, parent browser dispatch, runner identity and claim generation. If the request tool response is lost, recovery queries the same request rather than launches anew. This is cooperative routing, not shell containment.

### Proposed project layout — does not exist yet

```text
src/cli.ts
src/config.ts
src/journal.ts
src/reconcile.ts
src/adapters/fleet.ts
src/adapters/harness.ts
src/adapters/browser.ts
src/adapters/process.ts
src/worker-policy.ts
src/handoff.ts
tests/config.test.ts
tests/journal.test.ts
tests/fleet.test.ts
tests/reconcile.test.ts
tests/browser.test.ts
tests/worker-policy.test.ts
tests/recovery.test.ts
config/projects.example.json
docs/runbook.md
```

Do not create separate packages for these modules. Test fixtures use synthetic/redacted examples; no browser profiles or operational credential files belong in the repository.

### Minimum records

- `project`: stable ID, canonical repo path, ChatGPT Project URL, execution enabled, selected task/contract references. No copied authoritative task status.
- `session_binding`: project, repo, provider, Harness session ID, provider session ID, conversation identity, predecessor/latest accepted lineage node, last captured turn. Global and project chats must have distinct roles when global coordination arrives.
- `dispatch`: unique action key, project, task/claim generation, before-continuation reference, session binding, state, timestamps, process identity, evidence references, outcome/error.
- `process_observation`: dispatch, PID plus start identity/executable or command digest, owning runner/session, claim-renewal owner, last checked state. PID alone is not identity.
- `observation`: Fleet source digest, received time, material projection, next reconciliation deadline. Store only bounded data necessary for recovery.

SQLite transactions own dispatch updates. Generated handoff files can be rebuilt after a crash; they do not participate in a fragile dual-write protocol.

## Detailed tasks and sub-tasks

The final `Task Breakdown` is the single progress checklist. The IDs below define its implementation and acceptance detail.

### M0 — separate discovery slice: execution home and readiness matrix

Owner: `plans/sprints/20260926-1416-rdc-supervisor-discovery.sprint.md`. This row is intentionally outside the implementation Sprint so it can be approved independently while M1-M7 remain Draft.

1. Confirm standalone repository ownership/path and the pilot repo; select one candidate approved task, not an entire new sprint.
2. Record actual resolved Repo Harness, Oracle, RDC/device agent, Codex and Bun versions/paths/revisions where available. Inspect local fork flags and CLI help rather than copying public startup commands blindly.
3. Check Fleet/status availability and decide `monitor_ready` conclusively.
4. Separately inspect browser-engine requirements, including Oracle evidence-output flags, app selection, provider session persistence, and configured profile transport. Record `browser_ready=ready|blocked` with reasons; do not send a live prompt.
5. Revalidate the installed contract-run timeout/signal behavior. Source containing revision `823f1f8fce000142ba7b69438ac67f7344bc9b95` does not establish that the active Nix executable contains it. Do not silently upgrade the runtime.
6. Inspect the exact upgraded Luna model/reviewer requirements and record `worker_ready=ready|blocked`. If model identity or review policy is unresolved, name the exact M5 decision rather than guessing it.

Output: compatibility matrix with exact execution home plus independent `monitor_ready`, `browser_ready`, and `worker_ready` results. Exit for the monitor path requires execution home fixed and `monitor_ready=true`; browser/model blockers are carried forward to M3/M5 instead of blocking M1-M2.

### M1 — scaffold the smallest local app

Dependencies: discovery M0 fixed the execution home and `monitor_ready=true`; `browser_ready` and `worker_ready` may still be blocked.

1. Create Bun/TypeScript app and proposed module boundaries above; add scripts for focused tests and type checking.
2. Define one project-config schema; canonicalize the repo path; reject duplicate project IDs or ambiguous session mappings.
3. Create versioned SQLite schema with atomic dispatch uniqueness and a single supervisor instance/dispatch admission mechanism. Use standard SQLite transactions; no distributed lock service.
4. Implement proposed `status`, `monitor`, `once`, and `run` commands; `monitor` cannot dispatch, `once` reconciles one unit, `run` operates only configured execution projects.
5. Add bounded subprocess I/O with simultaneous stdout/stderr draining, exit capture, deadlines, and clear errors. Long-lived watch processes use lifecycle cancellation rather than a short request deadline.

Output: app starts against fixture data; second concurrent admission cannot launch the same action. Exit: config/journal tests and type check pass.

### M2 — ship the monitor-only checkpoint

Dependencies: M1; can proceed while M3 feasibility is investigated.

1. Consume `repo-harness fleet watch --format jsonl --interval-ms 30000`. Parse split frames and final newlines; bound buffers; drain stderr continuously.
2. Handle malformed JSON, process exit, unavailable repos, and reconnect with capped backoff. No overlapping collectors or busy restart loop.
3. Use CLI `snapshot_sha256`; distinguish the HTTP projection's `source_snapshot_sha256`. Collection `sequence` is not a material-work revision. Do not recompute the canonical digest from redacted HTTP data.
4. Render compact project/status/last-observed/next-action/error fields. Treat Fleet changes as hints; call `state next` only for affected registered repos or due reconciliation.
5. Keep timers independent of Fleet digest. Process/turn reconciliation still runs when Fleet is unchanged.
6. Persist the last observation and pending operational state; restart without fabricating progress. Prove zero browser submissions, zero Codex calls, and zero task-authority writes in monitor mode.
7. Document startup with the existing Operator Board rather than build another UI.

Output: first useful release. Exit: fixture replay plus a short local Fleet smoke run; all statuses and reconnect behavior work without browser/model setup.

### M3 — prove the managed ChatGPT/RDC path

Dependencies: discovery M0 recorded `browser_ready=ready`; may run independently of M2 after approval for live prompts. A blocked browser result does not block M1-M2.

1. Recover/register one exact Harness browser session or prepare a disposable pilot conversation. Record exact Project URL, provider/profile, visible app selector and conversation identity.
2. Confirm that `browser-open --launch` opens the saved URL in the configured default browser. This demonstrates navigation, not continuous Helium attachment.
3. Finish source/fixture coverage first, then freeze **V4 — RDC invocation canary** before spending the live budget. V4 validity inputs are: browser-adapter subject revision, Repo Harness runtime revision, Oracle/RDC executable versions, Project URL, provider/profile, app/connector selector, prompt digest, predecessor session identity, and evidence parser/schema revision.
4. Run one benign bounded RDC canary; verify the selected connector really invoked a tool and returned a result. Plain assistant text saying “I used RDC” does not pass.
5. Capture provider/session/turn/user-prompt/tool-invocation/final-assistant evidence and test missing invocation, wrong app, unrelated turn, incomplete capture. A canary command succeeding locally is not enough to prove remote invocation.
6. Inspect the current GitHub/campaign verifier against the real fixture. If no public generic RDC evidence route exists, propose a separate minimal Harness work package that shares existing validation mechanics without a second parser or weakening campaign checks.
7. Prove one `browser-followup` stays in the correct conversation and record returned session ancestry. Keep model/thinking arguments explicit where not inherited.
8. If Project placement or connector invocation cannot be proven, report the blocker and retain the monitor release. Do not call the execution MVP complete or add an unplanned browser-agent fallback.

Output: positive/negative captured fixtures, V4 input/evidence record, and a concrete supported integration route. Exit: automatic recognition of a completed bound RDC turn is possible; otherwise Phase 2 execution remains blocked. V4 rerun after an invalidating change requires a recorded reason and renewed live budget.

### M4 — implement dispatch and exact session continuation

Dependencies: M1, M2, M3 evidence route; any required Harness dependency accepted first.

1. Bind repository/project/provider/conversation/session lineage explicitly. Never pick the newest `browser-list` entry. An unrelated consult or dry run cannot replace a binding.
2. Implement the pure reconcile decision and journal state machine. Unique-action admission must return whether this caller actually won; losing admission returns without spawning.
3. Persist launching state before awaiting `browser-consult`/`browser-followup`. Track command lifecycle and remote submission evidence independently of final Harness session creation.
4. Permit one active project turn globally. Build compact, scope-bound prompts from references and changed state; no whole-chat transcript polling.
5. Recover submitted/observing states by querying exact evidence. Unknown submission does not become a resend timeout. Surface the smallest manual reconciliation action when automatic correlation is impossible.
6. Classify browser generation (`busy`, `finished`, `unknown`) separately from RDC invocation and workflow completion. Selector/capture failure produces unknown, not assumed finished. Atomically record correlated followup successor/evidence and dispatch outcome while compare-and-swapping the expected predecessor binding.
7. Inject fake clocks and fake command adapters to test duplicate wakeups, multiple timer events, changed session lineage, crash between result persistence and binding advancement, manual intervening turns, and task completion/claim replacement/continuation advancement between observation and submission.

Output: restartable one-project managed dispatch. Exit: duplicate and ambiguous-submission fixtures produce no extra browser prompt.

### M5 — integrate the Luna-low worker and Harness continuation without consuming the live pilot

Dependencies: discovery M0 recorded `worker_ready=ready` with the exact approved Luna/reviewer policy, and M4 is complete. A blocked worker result does not invalidate the already-usable monitor/browser work; M5 simply cannot start.

1. Build one worker invocation path from structured task inputs. Freeze the exact approved model, low effort/verbosity, and disabled web search using the discovery decision.
2. Reject conflicting model/config arguments; do not append arbitrary trailing arguments that override earlier flags. Inspect nested worker/reviewer configuration and either apply the same policy or stop for the human's acceptance-policy decision.
3. State explicitly that this is a cooperative cost-control mechanism, not containment of an unrestricted RDC shell. OS enforcement is deferred with security work.
4. Add the cooperative `worker-request` CLI bridge described in P3. Persist request admission before returning to RDC; the supervisor alone uses the existing contract preflight/run path and exact claim/worktree. Revalidate expected authority immediately at worker launch and reject stale requests. `--runner`/`--effort` labels alone are not model enforcement.
5. Record runner/process identity and which existing runner owns claim renewal. The supervisor observes renewal; it must not introduce a competing renewer. Stop new dispatch if renewal/liveness is unknown.
6. Exercise before → request/runner wiring → checks → after → attempt receipt → post-receipt continuation with fakes/fixtures and canonical preflight/dry-run where it causes no pilot execution. Preserve no-progress and recovery semantics.
7. Do **not** run or close the real pilot here. M5 exits when integration and model-policy enforcement are ready for the single M6 live pilot.

Output: pilot-ready worker integration under the approved model policy. Exit: argv/config spies reject overrides; stale/lost-response fixtures recover the same request; launch/renewal/lifecycle wiring is proven without an accepted/closed live task.

### M6 — run the single pilot, recover across the RDC turn boundary, then close it

Dependencies: M4-M5; V4 is still valid for the browser/RDC claim or an explicitly authorized rerun has produced a replacement; the pilot task is approved but not yet closed.

1. Complete fake-clock/process/session recovery fixtures before the live launch.
2. Freeze the supervisor implementation and define **V5 — pilot task + >25-minute recovery** before execution. V5 validity inputs are: frozen supervisor revision, Repo Harness runtime revision, exact worker/reviewer model config, pilot repo HEAD, task/contract/claim generation, bound browser-session lineage, timer/recovery-policy revision, and evidence parser/schema revision.
3. Track per-turn start/deadline in the supervisor journal. Treat the fork's lifecycle clock as an observed signal, not proof of ChatGPT completion or a guaranteed per-chat clock.
4. Default checkpoints: prepare handoff around minute 18, stop new work by minute 20, refresh at 23/24, reconcile at expiry. Make test clocks injectable. Do not kill valid workers merely because 25 minutes elapsed.
5. Generate compact handoff: repo/worktree/task/claim generation, contract, session lineage/turn, process identities/renewal owner, verification and acceptance status, next action and do-not-repeat references.
6. Launch the **single** approved pilot through the M5 worker path. Demonstrate the actual contract-run worker chain surviving >25 minutes and one successor RDC turn recovering the same worker/claim/session. A standalone `sleep` process is only preliminary evidence.
7. After recovery, continue that same pilot through deterministic verification, policy-selected independent review, typed AcceptanceReceipt and authorized closeout/integration. Browser-finished or Codex exit alone never passes.
8. Keep comprehensive sleep/wake and multi-project soaks for Phase 3.

Output: one pilot supplies both long-boundary evidence and canonical acceptance/closeout. Exit: V5 passes once; no second pilot is needed. Any invalidating source/runtime/config change after freeze requires a recorded reason and renewed V5 budget before rerun.

### M7 — review frozen evidence and publish the operator runbook

Dependencies: M2 for monitor release; M3-M6 for full MVP. V4 and V5 must still be valid for the claims they support.

1. Write exact setup/start/status/stop/restart instructions using the proven executables/config; document setup-time OAuth/login/pairing and what remains manual on exceptions.
2. Document the two release labels: monitor-only checkpoint versus one-project execution MVP. State explicitly that existing Helium tabs are not yet continuously observed.
3. Validate the recorded V4/V5 inputs and evidence references; **do not** freeze them for the first time here and do not automatically rerun them.
4. Run only cheap documentation/link/integrity checks needed for the final docs/evidence index. A missing cache entry is not permission to rerun a paid canary or long test.
5. If an implementation/test/runtime fix is required, return to the owning row, explicitly invalidate the affected criterion, freeze a new subject and obtain renewed live-test approval before rerun.
6. Record changed paths, live run identities, workflow acceptance/closeout, limitations, and next phase. Promote durable conclusions into the implementation repo docs; archive completed execution artifacts through its normal workflow.

Output: a runnable unhardened local MVP and concise acceptance record, not a claim of production security or unattended multi-project operation.

## Ordering and rough effort

```text
Discovery M0 ── monitor_ready=true ─→ M1 → M2 → monitor-only release
       └────── browser_ready=ready ──→ M3 ─┐
M1 + M2 + M3 ────────────────────────────┴→ M4
Discovery M0 ── worker_ready=ready ─────────→ M5 → M6(single live pilot + recovery + closeout) → M7
```

M3 can run in parallel with monitor development, with disjoint code ownership. M1-M2 do not wait for browser/model readiness. If a separate Harness verifier dependency is needed, it sits between M3 and M4 and has its own approval/verification boundary. Do not let it expand the supervisor app into a generalized browser platform.

| Group | Rough focused effort | Principal uncertainty |
|---|---|---|
| M0 discovery | 0.5–1 day | Execution home and monitor readiness; browser/worker blockers may remain |
| M1–M2 | 1–2 days | Fleet fixture/interface handling |
| M3 | 0.5–1 day if browser-ready | RDC connector evidence; extra Harness dependency may exceed this |
| M4–M5 | 2–3 days after required readiness | Browser submission ambiguity and actual runner lifecycle |
| M6–M7 | 1–2 days plus one live wait | Single >25-minute pilot, acceptance/closeout and evidence reuse |

These are planning ranges, not delivery commitments. The fastest path is the separately approved discovery M0, then M1-M2 as soon as `monitor_ready=true`; M3 and M5 wait only for their own browser/worker readiness gates. Security engineering is not on this critical path.

## Existing commands versus proposed commands

**Existing Repo Harness commands** (run from/against the exact pilot; placeholders below are documentation, not runnable selections):

```text
repo-harness operator serve --host 127.0.0.1 --port 4318
repo-harness fleet watch --format jsonl --interval-ms 30000
repo-harness chatgpt browser-doctor --repo <pilot> --provider oracle --json
repo-harness chatgpt browser-list --repo <pilot> --json
repo-harness chatgpt browser-session --repo <pilot> <session-id> --metadata-only
repo-harness chatgpt browser-open --repo <pilot> <session-id> --launch
repo-harness chatgpt browser-consult --repo <pilot> --provider oracle --chatgpt-url <project-url> --chatgpt-app <verified-connector> --prompt <bounded-prompt>
repo-harness chatgpt browser-followup --repo <pilot> --session <bound-session-id> --provider oracle --prompt <bounded-prompt>
repo-harness state next --json
repo-harness run contract-run preflight --contract <approved-contract>
```

`state next` is cwd/worktree scoped. These examples do not specify complete launch configuration: implementation must add verified provider/profile/model settings from M0. Do not substitute the historical Luna name or assume upstream Oracle meets fork-specific flags. The exact worker run invocation comes from the approved contract and verified CLI help, not a guessed command here.

**Proposed new supervisor interface — not implemented**:

```text
rdc-rh-supervisor monitor --config <projects.json>
rdc-rh-supervisor status --config <projects.json> --json
rdc-rh-supervisor once --config <projects.json> --project <pilot-id>
rdc-rh-supervisor run --config <projects.json> --project <pilot-id>
rdc-rh-supervisor worker-request --config <projects.json> --project <pilot-id> --dispatch <browser-dispatch-id>
```

`worker-request` is called by the project RDC turn; it enqueues the frozen request and returns its identity. It accepts no arbitrary executable/model/contract overrides. The persistent supervisor must already be running to service it.

One command starts the persistent supervisor after one-time setup; it does not imply it can install or authenticate every dependency. Terminal exit/restart procedures must preserve observations of already-running workers.

## Verification design for the future execution contract

No implementation tests or live experiments have been run by drafting this plan. Proposed test files/commands must be created and verified in the approved standalone project before being declared executable criteria.

| Criterion | Coverage / necessity | Phase and cost | Inputs and evidence |
|---|---|---|---|
| V1 core tests and type check | Config, SQLite admission, subprocess drainage, Fleet framing/digest/timers; catches duplicate or idle-call bugs | Development; cheap, proposed `bun test tests/config.test.ts tests/journal.test.ts tests/fleet.test.ts tests/reconcile.test.ts` plus actual type-check script | Source/fixture digests, Bun version, fake clock, command spies |
| V2 browser/worker/recovery tests | Exact lineage, wrong/missing invocation, busy/unknown, override rejection, ambiguous submission, PID reuse/claim loss | Development; cheap, proposed `bun test tests/browser.test.ts tests/worker-policy.test.ts tests/recovery.test.ts` | Source/fixture digests; no live accounts/models |
| V3 monitor smoke | Prove installed Fleet integration and zero dispatch/authority writes, not just fixtures | Monitor acceptance; short local run, target 5 minutes | CLI revision/config, counters, status/restart outputs |
| V4 RDC evidence canary | Account/fork-specific connector invocation cannot be established by source tests | M3 integration; live/paid, bounded to one consult plus one justified followup | Freeze before run: browser-adapter subject revision, Repo Harness runtime revision, Oracle/RDC versions, Project URL, provider/profile, connector selector, prompt digest, predecessor session identity, evidence parser/schema revision; store run/turn/session/tool evidence |
| V5 single pilot + long recovery + closeout | Prove actual worker/renewal/RDC chain, >25-minute recovery and canonical task acceptance in one run | M6 final execution acceptance; expensive, one pilot with 35–45 minute observation budget | Freeze before run: supervisor revision, Repo Harness runtime revision, exact worker/reviewer model config, pilot repo HEAD, task/contract/claim generation, browser lineage, timer/recovery-policy revision, evidence parser/schema revision; store runner/browser/receipt/closeout refs |
| V6 repository integrity | Preserve owning repository workflow/projection invariants | Final acceptance; repository-required checks | Record commands and subject revision; apply Harness checks if Harness is changed |

V4/V5 require explicit approval and a recorded budget **before** each live run. Evidence remains valid only while the criterion's recorded validity inputs relevant to the claim remain unchanged. Any invalidating source/runtime/config change requires a recorded invalidation reason, a newly frozen subject and renewed budget approval. Missing cache metadata alone is not permission to rerun. M7 reviews/reuses valid V4/V5 evidence and never schedules them automatically. If runtime behavior cannot fit the bounded test, stop and report; do not loop indefinitely. Full Repo Harness suite is not a default criterion; use affected browser/continuation tests for any dependency change unless a concrete uncovered cross-module risk or explicit release requirement justifies more.

For a Harness-side change, required integrity checks are `bun run check:hooks`, `bun run check:helpers`, `bash scripts/check-deploy-sql-order.sh`, `bash scripts/check-architecture-sync.sh`, `bash scripts/check-task-sync.sh`, `bash scripts/check-task-workflow.sh --strict`, `bun scripts/inspect-project-state.ts --repo . --format text`, and `bun src/cli/index.ts init --repo . --dry-run`. They are not invented commands for the external app.

### Measurable acceptance

- Monitor checkpoint: zero browser/Codex invocations, zero workflow-authority writes, correct degraded status, durable restart, bounded reconnect.
- Execution MVP: exactly one registered project/task; no duplicate dispatch/worker in retry fixtures or live test; no blind resend for unknown remote outcome.
- Only exact approved Luna-low local invocations, including policy-compatible review; conflicting defaults stop before launch.
- Positive evidence of RDC tool invocation bound to the selected conversation/turn; no proof by assistant prose alone.
- One automatic project-turn recovery across the budget boundary, with existing worker/claim ownership preserved.
- One task has required checks, independent review, valid acceptance and explicit closeout/integration status; browser-finished alone never passes.
- Inactive periods invoke no model. Functional event summaries remain compact; no repeating screenshots/full transcripts.
- Runbook clearly states managed-session scope and unhardened personal-local operating assumptions.

## Follow-on phase tasks — not MVP blockers

- Phase 3: global RDC chat and compact change notifications; 2–3 project serial queue with fairness; no-work suppression; crash/sleep/reconnect matrix; separately budgeted 8-hour and 24-hour soaks.
- Phase 4: Helium attach feasibility and registered-tab activity adapter; explicit Project placement/fresh-chat rollover; new-repo adoption workflow; packaging/autostart; optional typed RDC tools after protocol stability.
- Phase 5 LAST: threat model, auth/authorization and network controls, credential storage/redaction/retention, sandbox and permissions, CDP/profile hardening, adversarial browser-content tests, dependency/release integrity and final security review.

## Rollback and stop conditions

Before implementation, removing this Draft plan and linked planning notes changes no runtime. During implementation, stop the supervisor to stop new dispatch; inspect and preserve separately running workers and claims, then use their canonical stop/recovery procedure. Removing the external app must not delete Repo Harness task/worktree/browser-session evidence. Retain the operational journal until unknown effects are reconciled. Revert any independently approved Harness adapter patch separately.

Stop new execution for an unresolved model identity, incompatible runner, missing RDC evidence, unknown process/submission outcome, invalid ownership, no-progress breaker, or failed acceptance policy. These are correctness and cost boundaries, not deferred security-hardening tasks.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] M0 — **Separate discovery Sprint**: fix execution home/pilot and record `monitor_ready`, `browser_ready`, `worker_ready` independently.
  - [ ] `monitor_ready=true` releases M1-M2 even when browser/model facts remain blocked; unresolved Luna/reviewer facts become an M5 gate, not a monitor blocker.
- [ ] M1 — Scaffold Bun app, project registry, SQLite admission and bounded subprocess adapters.
  - [ ] Add CLI modes, type check and fixture-driven config/journal tests.
- [ ] M2 — Deliver monitor-only release with Fleet JSONL, compact status and restart.
  - [ ] Verify framing, digest/timer semantics, reconnect and zero model/authority writes.
- [ ] M3 — Prove exact managed ChatGPT/RDC invocation and followup after `browser_ready=ready`.
  - [ ] Freeze V4 inputs/budget before the live canary; capture positive/negative evidence; separately approve any necessary Harness adapter work.
- [ ] M4 — Implement one-project dispatch, authority revalidation and atomic session-lineage advancement.
  - [ ] Verify duplicate wakeups, unknown submission, stale decisions and manual intervening turns.
- [ ] M5 — Integrate durable worker requests, exact Luna-low invocation and canonical Harness lifecycle after `worker_ready=ready`, without running the real pilot.
  - [ ] Verify configuration conflicts, launch ownership, claim-renewal observation and lifecycle wiring with fixtures/preflight.
- [ ] M6 — Freeze V5, run the **single** pilot, recover the same worker across >25 minutes, then verify/review/accept/close it.
  - [ ] Verify lost tool response, restart/crash windows, PID reuse, no duplicate replacement and canonical closeout on the same pilot.
- [ ] M7 — Reuse valid V4/V5 evidence and publish the operator runbook.
  - [ ] Do not fix implementation or rerun live criteria inside M7; invalidate/return to the owning row if a fix is required. Record release label, evidence, limitations and follow-on roadmap; security remains Phase 5.
