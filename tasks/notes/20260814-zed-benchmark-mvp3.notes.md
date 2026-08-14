# Zed benchmark MVP 3 implementation slice

## Decision

Applied the prepared narrow `repo-harness zed-benchmark` implementation on
`feat/zed-benchmark-mvp3` from baseline `ddfc493e`. The surface remains limited
to `submit`, `status`, `logs`, `fetch`, and `report`; it does not add a generic
fleet runtime, writer admission, cancellation, deployment, installer, hook, or
reviewer integration.

## Implementation note

The supplied patch had one integration defect: the admission test imports
`ZED_BENCHMARK_SELECTORS` from `admission.ts`, so that module now re-exports the
selector constant owned by `types.ts`. This preserves one source of truth while
matching the test and public admission surface.

## Validation

- Focused benchmark and CLI tests: pass (74 tests, 181 assertions).
- Reference-config projection check: pass.
- Deploy SQL, task workflow, project inspection, and init dry-run: pass.
- Full typecheck remains blocked by the pre-existing `archctx-contracts`
  `AcceptedArchitectureChangeReferenceV1` mismatch in
  `src/core/architecture/projection.ts`.
- Architecture sync remains blocked by the environment's missing capability-
  resolver helper.
- Paid live canary intentionally not run; it requires fresh approval,
  dedicated credentials, and an explicit budget/quota.
- Existing untracked `docs/upstream-maintenance-workflow.md` was not modified.

## Follow-up gates

Run the contract-worktree/Waza acceptance flow, repair or provide the
architecture provider state and dependency mismatch, then run the full suite
before considering the implementation complete. Do not run the paid canary as
ordinary CI.
