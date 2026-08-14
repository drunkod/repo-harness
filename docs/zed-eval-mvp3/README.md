# Zed Eval MVP 3: Remote Benchmark Orchestration

**Status:** implementation present; acceptance validation incomplete
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

The only coherent MVP 3 supported by current evidence is a narrow command:

```text
repo-harness zed-benchmark submit/status/logs/fetch/report
```

It would:

1. run only pinned, supported Zed benchmark selectors;
2. execute an explicitly pinned Zed checkout's one-off `zed-eval` script;
3. require a full Zed source commit SHA and reject `--from local`/`main`;
4. generate and pass the exact upstream `--run-id` rather than parse stdout;
5. persist a repo-harness receipt before submission so timeout is represented as
   `submission-uncertain`, not silently retried;
6. pass explicit namespace, experiment, and artifact paths on every operation;
7. parse and validate upstream `state.json` and report JSON;
8. place fetched artifacts under ignored `.ai/harness/runs/zed-benchmark/`;
9. require an explicit cost/data acknowledgement; and
10. expose no generic writable-worker, lease, reviewer, provider, scheduler,
    registry, or cancellation claim.

This is evaluation tooling. It does **not** run a free-form task against the
current repository, return a mergeable patch, or make Zed equivalent to Claude
or Codex in repo-harness compatibility metadata.

## Package index

1. [`audit-and-revised-plan.md`](./audit-and-revised-plan.md) — evidence,
   severity-ranked findings, rejected assumptions, revised architecture, file
   list, and approval gates.
2. [`tasks-and-subtasks.md`](./tasks-and-subtasks.md) — decision-complete future
   task graph with objectives, subtasks, stop conditions, and acceptance
   criteria.
3. [`proposed-code-snippets.md`](./proposed-code-snippets.md) — detailed future
   TypeScript and YAML sketches. They are illustrative and not source files.
4. [`implementation-and-testing-tutorial.md`](./implementation-and-testing-tutorial.md)
   — future operator/developer tutorial covering preflight, implementation,
   fixtures, canary, rollback, security, cost, and validation.

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

## Approval checklist

Do not promote this package into an active plan until all are true:

- [ ] The user confirms the goal is **benchmark orchestration**, not a general
      remote agent for arbitrary repositories.
- [ ] The absence of cancellation is accepted, or a newer pinned upstream
      contract with a tested cancel API is supplied.
- [ ] Remote cost, credential, source-patch, task-data, log, and artifact sharing
      are accepted.
- [ ] Initial task/concurrency/resource limits are approved.
- [ ] Architecture ownership is accepted and projected from ArchContext.
- [ ] The exact upstream commit and supported benchmark list are frozen.
- [ ] A work-package plan and contract are captured through the normal
      repo-harness workflow before implementation.
