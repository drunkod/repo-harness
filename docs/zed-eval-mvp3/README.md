# Zed Eval MVP 3: Remote Benchmark Orchestration

**Status:** implementation present; static/T13 validation green; opt-in paid T14 canary and T15 final closeout pending
**Draft verdict:** **REJECT AS A GENERIC FLEET MVP**
**Revised direction:** **CONDITIONAL APPROVAL** for a narrow `zed-benchmark`
wrapper after the gates in this package are accepted

> This package began as a documentation-only audit. Production implementation
> now exists under `src/core/zed-benchmark/`,
> `src/effects/zed-benchmark/`, and `src/cli/commands/zed-benchmark.ts`.
>
> Production source and focused tests are authoritative for implementation
> behavior. These planning documents remain authoritative for product boundary,
> stop conditions, validation gates, and definition of done.
>
> Branch names are working-location metadata, not immutable acceptance evidence;
> use reviewed commit SHAs and the active task note.

## Why the original MVP 3 must change

The draft models Zed's Python `zed-eval` package as a generic remote agent
runtime and assumes it can safely satisfy a writable fleet contract. The pinned
upstream implementation does not support that interpretation:

- `zed-eval` launches fixed benchmark families against Zed's `eval-cli`; it is
  not an arbitrary-repository prompt runner.
- `--from` selects the **Zed source used to build `eval-cli`**, not the current
  repo-harness checkout or an arbitrary target repository.
- there is no `zed-eval cancel` command at the reviewed upstream pin;
- upstream already owns a local atomic run index and accepts an explicit
  `--run-id`, so regex run-id scraping plus a second mapping store is unnecessary;
- `status` emits the remote `state.json`, whose pinned lifecycle is
  `pending -> running -> completed|failed`;
- `fetch` extracts under an explicit `--jobs-dir`; the draft's claimed local
  artifact path is not created by its proposed command;
- container-oriented execution is not, by itself, a repo-harness sandbox
  attestation; and
- the draft's `writable` flag is not translated to any upstream option, so the
  proposed admission decision would be false evidence.

The current repository also has no `src/core/fleet/`, `src/effects/fleet/`,
`FleetRuntimeAdapter`, runtime registry, or `repo-harness fleet` command to
extend. Creating those abstractions here would violate the repository rule to
extract shared components only after observed reuse or a cross-module invariant.

## Revised product boundary

The implemented MVP 3 surface is intentionally narrow:

```text
repo-harness zed-benchmark submit/status/logs/fetch/report
```

It:

1. runs only pinned supported Zed benchmark selectors;
2. executes the one-off `zed-eval` script from the approved integration checkout;
3. requires a full lowercase Zed source commit SHA and rejects moving/local refs;
4. generates and supplies the exact upstream run ID rather than scraping it;
5. persists a local receipt before submission so ambiguous results become
   `submission-uncertain`;
6. reconciles ambiguous submission by the same run ID without resubmission;
7. uses explicit namespace, experiment, and artifact paths;
8. validates upstream lifecycle and report JSON;
9. places fetched evidence under ignored
   `.ai/harness/runs/zed-benchmark/`;
10. requires explicit remote cost/data acknowledgement; and
11. exposes no fleet, writer, provider, deployment, cancellation, scheduler, or
    generic remote-agent authority.

This is evaluation tooling. It does not execute arbitrary repository tasks,
produce mergeable patches, or make Zed equivalent to the repository's
Claude/Codex integration surfaces.

## Package index

1. [`audit-and-revised-plan.md`](./audit-and-revised-plan.md) — historical
   evidence and the security/product boundary that authorized the narrow
   benchmark wrapper.
2. [`tasks-and-subtasks.md`](./tasks-and-subtasks.md) — active acceptance graph,
   validation gates, stop conditions, and definition of done.
3. [`proposed-code-snippets.md`](./proposed-code-snippets.md) — superseded design
   artifact that points to authoritative production source and tests.
4. [`implementation-and-testing-tutorial.md`](./implementation-and-testing-tutorial.md)
   — implementation-state and acceptance-validation walkthrough.
5. [`../researches/20260814-zed-eval-mvp3-remote-benchmark-audit.md`](../researches/20260814-zed-eval-mvp3-remote-benchmark-audit.md)
   — durable upstream research/audit basis.

## Reviewed source pin

Upstream claims in this package are pinned to Zed commit:

```text
24e25552b1259d56a6fdd7956a419ed9e8a1a25e
```

Primary sources:

- [Python `zed-eval` README](https://github.com/zed-industries/zed/blob/24e25552b1259d56a6fdd7956a419ed9e8a1a25e/crates/eval_cli/zed_eval/README.md)
- [`cli.py`](https://github.com/zed-industries/zed/blob/24e25552b1259d56a6fdd7956a419ed9e8a1a25e/crates/eval_cli/zed_eval/cli.py)
- [`launch.py`](https://github.com/zed-industries/zed/blob/24e25552b1259d56a6fdd7956a419ed9e8a1a25e/crates/eval_cli/zed_eval/launch.py)
- [`run_index.py`](https://github.com/zed-industries/zed/blob/24e25552b1259d56a6fdd7956a419ed9e8a1a25e/crates/eval_cli/zed_eval/run_index.py)
- [`volume.py`](https://github.com/zed-industries/zed/blob/24e25552b1259d56a6fdd7956a419ed9e8a1a25e/crates/eval_cli/zed_eval/volume.py)
- [`report.py`](https://github.com/zed-industries/zed/blob/24e25552b1259d56a6fdd7956a419ed9e8a1a25e/crates/eval_cli/zed_eval/report.py)

Any implementation must repin and repeat the contract audit. An editable or
moving upstream checkout is not an acceptable production dependency.

## Remaining acceptance checklist

Implementation presence is not acceptance evidence. Do not declare MVP 3 done
until all of the following are true:

- [ ] Benchmark-only product intent remains approved.
- [ ] The reviewed upstream Zed pin remains exact and supported.
- [ ] The absence of cancellation remains accepted.
- [ ] Cost, credential, task-data, log, artifact, and retention risks remain
      accepted.
- [ ] Resource limits remain explicitly approved.
- [ ] ArchContext ownership is projected from its source model and strict sync
      passes.
- [ ] All T13 gates pass from the final candidate diff.
- [ ] One T14 paid canary has separately received fresh operator approval and
      completes without automatic resubmission.
- [ ] T15 review and closeout are complete.
