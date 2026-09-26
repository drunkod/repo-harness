# RDC Supervisor MVP — planning decisions

> **Substantive Change SHA256**: `sha256:ab107447181af33e7eccf41df7c1df200f1a0e99936b5663e59faa0b66532f10`

Plan: [Draft MVP work package](../../plans/plan-20260926-1340-rdc-supervisor-mvp.md).
Roadmap: [phased PRD](../../plans/prds/20260926-1340-rdc-supervisor-roadmap.prd.md).
Discovery Sprint: [Draft M0 readiness slice](../../plans/sprints/20260926-1416-rdc-supervisor-discovery.sprint.md).
Implementation Sprint: [Draft M1-M7 backlog](../../plans/sprints/20260926-1404-rdc-supervisor-mvp.sprint.md).

## Decisions and tradeoffs

- The user's latest direction explicitly defers all new security engineering to the final roadmap phase. The first implementation is an unhardened personal-local MVP. Preserve existing protections; no hardening project is an MVP blocker.
- Release the Fleet-only monitor early, but do not present it as the requested autonomous product. The MVP acceptance boundary is one real managed ChatGPT/RDC project lifecycle with Luna-low and turn recovery. Broad Helium tab observation and global multi-project scheduling remain explicit later deliverables.
- Keep implementation in a proposed standalone app rather than expanding the observe-first Operator Board or coupling Desktop Commander immediately. This repository holds planning only; transfer/recapture after the execution home is approved. Any required generic RDC evidence support in Repo Harness is a separately approved dependency, not permission for cross-repository writes.
- Use one durable SQLite operational journal, explicit session lineage, and persist-before-effect dispatch. Local admission does not promise remote exactly-once execution. Unknown submissions are reconciled rather than retried blindly.
- The local supervisor owns worker launch through a cooperative durable `worker-request` bridge from project RDC. The existing contract runner owns claim renewal. This closes the lost-tool-response recovery gap without pretending a launcher controls an unrestricted shell.
- M0 is now a separate discovery Sprint so it can be approved independently; the implementation Sprint contains only M1-M7 and remains Draft until the standalone execution home is fixed and recaptured/transferred.
- Discovery may complete with `browser_ready=blocked` and/or `worker_ready=blocked` as long as the blockers are explicit. `monitor_ready=true` alone releases M1-M2; M3 owns the browser gate and M5 owns the worker/model/reviewer gate.
- Exact upgraded Luna model identity remains unresolved. Historical Luna docs and current Astra defaults disagree; M5 must wait for the actual approved identifier, while monitor development can proceed.
- M5 no longer consumes or closes the live pilot. It proves worker/lifecycle wiring with fixtures/preflight; M6 owns the single pilot, >25-minute recovery, deterministic verification, independent review, AcceptanceReceipt and closeout.
- Live criteria are frozen before execution: V4 in M3 and V5 in M6. Their recorded validity inputs determine reuse; invalidation requires a reason and renewed budget approval. M7 reviews valid evidence and does not automatically rerun live tests.

## Planning validation boundary

No application code or runtime was changed. Hook/helper projection checks, SQL ordering, project-state inspection, downstream-init dry-run, and strict workflow validation passed. The init dry-run correctly reports zero operations for this self-host source checkout. Link/whitespace and Draft active-marker checks cover the planning artifacts; task-sync binds this roadmap through the digest above.

Architecture validation is blocked by the reported durable projection state (`dead_letters=1`, `blocking=1`), although its changed-capability scan reported zero blocking changes. This planning task does not retry or repair that projection event. No full suite, live browser canary, model invocation, or long-running recovery test was performed.

## Open questions before activation

1. Actual app repository/path and pilot project/task.
2. Exact available Luna model and compatible independent-review policy.
3. Installed runtime compatibility, real RDC connector capture and provider/session behavior.
4. Whether the RDC canary needs a narrow shared-evidence change in Repo Harness.

The active Sprint marker points to the separately approved discovery Sprint `plans/sprints/20260926-1416-rdc-supervisor-discovery.sprint.md`; this approval comes from the user's current instruction to fix the remaining issues and start the Sprint. The implementation Sprint `plans/sprints/20260926-1404-rdc-supervisor-mvp.sprint.md` remains a separate non-active Draft. Discovery approval authorizes M0 planning/readiness work only: no live browser canary, implementation worker, runtime upgrade, Nix/MCP mutation, or M1-M7 execution. Upon implementation closeout, promote measured conclusions into the owning application's documentation and archive these slice notes through the normal workflow.
