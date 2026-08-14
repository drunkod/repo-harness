# Zed `zed-eval` MVP 3 Remote Benchmark Audit

**Date:** 2026-08-14  
**Detailed work package:** [`../zed-eval-mvp3/README.md`](../zed-eval-mvp3/README.md)  
**Upstream source pin:** Zed `24e25552b1259d56a6fdd7956a419ed9e8a1a25e`

## Durable conclusion

Zed's Python `zed-eval` package is a remote **benchmark orchestrator**, not a
generic arbitrary-repository agent runtime. A repo-harness integration must not
advertise it as a generic fleet writer or infer an attested writable sandbox
from the presence of Modal/Harbor/Pier containers.

At the reviewed pin:

- `run` supports an explicit caller-provided `--run-id` and spawns a detached
  Modal controller;
- the upstream package already persists an atomic local run index mapping run ID
  to namespace/experiment metadata;
- `status` prints structured `state.json` with the coarse lifecycle
  `pending -> running -> completed|failed`;
- `fetch` accepts `--jobs-dir` and extracts the Harbor/Pier archive there;
- `report --json` computes metrics from a fetched job directory;
- `--from` selects Zed source used to build `eval-cli`, not an arbitrary target
  repository; and
- there is no supported per-run `cancel` command. The fact that `deploy` may
  cancel in-flight runs is a deployment hazard, not a cancellation API.

## Repository consequence

The current repo-harness baseline has no `src/core/fleet/`,
`src/effects/fleet/`, generic runtime registry, or public `fleet` command to
extend. The research architecture that sketches those abstractions schedules
scheduler, admission, leases, run-store, registry, and several independent
runtime adapters together in a later phase. A one-consumer Zed registry would be
premature and would collide with the repository's existing specialist-fleet
terminology.

The coherent future MVP is a narrow `repo-harness zed-benchmark` wrapper with:

- one allowed benchmark per submission;
- an explicitly pinned Zed orchestrator checkout;
- a full clean Zed source SHA;
- a generated run ID passed directly to upstream;
- a local receipt written before submission;
- `submission-uncertain` handling with no automatic retry;
- JSON state/report validation;
- explicit namespace/experiment/artifact paths;
- artifacts under ignored `.ai/harness/runs/zed-benchmark/`; and
- explicit remote cost/data acknowledgement.

It must expose no writer, mergeable patch, cancellation, deploy, installer,
hook, provider, reviewer, compatibility, scheduler, lease, or generic runtime
claim.

## Primary evidence

- [Zed `zed-eval` README](https://github.com/zed-industries/zed/blob/24e25552b1259d56a6fdd7956a419ed9e8a1a25e/crates/eval_cli/zed_eval/README.md)
- [CLI parser](https://github.com/zed-industries/zed/blob/24e25552b1259d56a6fdd7956a419ed9e8a1a25e/crates/eval_cli/zed_eval/cli.py)
- [Submission and explicit run ID](https://github.com/zed-industries/zed/blob/24e25552b1259d56a6fdd7956a419ed9e8a1a25e/crates/eval_cli/zed_eval/launch.py)
- [Atomic local run index](https://github.com/zed-industries/zed/blob/24e25552b1259d56a6fdd7956a419ed9e8a1a25e/crates/eval_cli/zed_eval/run_index.py)
- [State, logs, fetch, and jobs directory](https://github.com/zed-industries/zed/blob/24e25552b1259d56a6fdd7956a419ed9e8a1a25e/crates/eval_cli/zed_eval/volume.py)
- [Report JSON](https://github.com/zed-industries/zed/blob/24e25552b1259d56a6fdd7956a419ed9e8a1a25e/crates/eval_cli/zed_eval/report.py)
- [`repo-harness` bounded process authority](../../src/effects/process-runner.ts)
- [Earlier multi-runtime research architecture](./20260808-repo-harness-in-opencode.md)
