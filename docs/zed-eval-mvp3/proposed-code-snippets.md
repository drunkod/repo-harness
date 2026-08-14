# Proposed Code Snippets: Zed Eval MVP 3

**Status:** superseded implementation design artifact

> Do not copy executable code from historical versions of this file.
> Production code now exists and is authoritative.

## Authoritative implementation

- `src/core/zed-benchmark/types.ts`
- `src/core/zed-benchmark/admission.ts`
- `src/core/zed-benchmark/state-schema.ts`
- `src/effects/zed-benchmark/receipt-store.ts`
- `src/effects/zed-benchmark/run-zed-benchmark.ts`
- `src/cli/commands/zed-benchmark.ts`
- `src/cli/index.ts`

## Authoritative tests

- `tests/zed-benchmark-admission.test.ts`
- `tests/zed-benchmark-state-schema.test.ts`
- `tests/zed-benchmark-receipt-store.test.ts`
- `tests/zed-benchmark-runner.test.ts`
- `tests/cli/zed-benchmark.test.ts`
- `tests/live/zed-benchmark.live.test.ts`

## Security deltas from the original sketches

The implemented design includes:

- constrained generated run IDs;
- exact pinned integration checkout identity;
- rejection of tracked and non-ignored untracked integration-source changes;
- receipt creation before remote submission;
- `submission-uncertain` with no automatic retry;
- strict receipt read validation;
- prototype-safe receipt-phase validation;
- serialized receipt transitions;
- exact immutable resource-policy validation;
- exact namespace/model/source validation on receipt read;
- symlink/path-confinement checks;
- exact upstream JSON lifecycle validation;
- report `job_dir` provenance validation;
- bounded process supervision;
- explicit cost/data acknowledgement; and
- a five-command benchmark-only public surface.

Historical versions remain available from Git history when design archaeology is required.
