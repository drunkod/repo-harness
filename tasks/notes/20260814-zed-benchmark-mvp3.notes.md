# Zed benchmark MVP 3 implementation slice

## Decision

Implement the narrow `repo-harness zed-benchmark` product boundary.

The public surface is limited to `submit`, `status`, `logs`, `fetch`, and
`report`. The slice does not add a generic fleet runtime, repository writer
admission, cancellation, deployment automation, installer, hook, provider, or
reviewer integration.

## Review lineage

- Planning/audit baseline: `41671fdb`
- Initial implementation review head: `10e46031d432c554371638f615a68f3f56b83ee8`
- Current hardening review head: `e212d543d3bd9670e8c94685bc8001e89ab8bf35`

Branch names are working-location metadata, not immutable acceptance evidence.
The current local branch is `feat/zed-benchmark-mvp3`.

## Upstream authority

Pinned Zed integration commit:

`24e25552b1259d56a6fdd7956a419ed9e8a1a25e`

## Applied steps

- Checkout verification rejects tracked and non-ignored untracked changes, but
  permits expected ignored uv runtime state such as `.venv`.
- Admission predicates are shared with receipt read validation.
- Receipt reads enforce exact pin, SHA, namespace/model, task/concurrency,
  timestamps, and resource-policy invariants.
- Negative tests cover prototype phases, policy tampering, lock contention,
  dirty checkouts, and ignored runtime state.
- Planning artifacts now identify production source as authoritative; the
  obsolete executable snippet document is superseded.
- The paid canary remains opt-in and must reconcile uncertain submissions by
  the same run ID without resubmitting.

## Validation status

Focused tests and typecheck must be rerun after every patch step. The paid
canary is not ordinary CI and requires fresh approval, credentials, budget, and
quota. ArchContext generation/synchronization is intentionally not changed in
this slice per the review instruction to skip ArchContext package/type work.

## Definition of done

The implementation is complete only after the available T13 gates, final
execution-boundary review, separately authorized T14 canary, and T15
Waza/contract-worktree closeout are satisfied.
