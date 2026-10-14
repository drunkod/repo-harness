# Fork integration of upstream Repo Harness 0.22.1

- Source: `Ancienttwo/repo-harness` signed/tagged release `v0.22.1` (`dc0efeb20`).
- Previous fork `main`: `ce4a387c` (published 0.20.0 integration).
- Integration branch: `upgrade/v0.22.1` from `origin/main`; never merge fork branches into `upstream-base`.

## Conflict policy

- Adopt upstream's 0.22 Bot/scheduler retirement: remove obsolete campaign automation files and tests. Their removed interfaces must not be revived.
- Adopt upstream's package test isolation, Sprint canonical-plan dispatch, and revised ChatGPT skill router.
- Preserve fork-specific dynamic contract-run outer timeout derived from `wall_time_minutes`, including its conservative overhead. Keep both packaged and source helper imports functional.
- Remove the orphan campaign-browser-status module after its source type was retired upstream.

## Verification at integration

- `bun install --frozen-lockfile` succeeded with Bun 1.4.0.
- `bun run check:type`, `bun run build:hook-bundle`, `bun run build:oar-hosts` succeeded.
- `bun run check:helpers`, `bun run check:hooks`, `bun run check:pi-package`, `bun run check:reference-configs`, `bun run check:state-boundaries` succeeded.
- Isolated contract-run suite: 35 passed. Closeout/timeout guardrails: 29 passed, 1 Windows-only skip.
- Isolated Sprint canonical dispatch subset: 7 passed. The complete Sprint and CI suites remain separate release/PR gates.

## Nix host rollout

After publishing the validated fork revision, update `~/nix-config/modules/programs/repo-harness/runtime-source.json` to that immutable fork SHA. Repo Harness is not a flake input. Build/evaluate before activation, run `repo-harness-bootstrap`, sync Nix-owned Codex and Waza projections, verify check modes, rebuild, and run the protected runtime smoke. Never run the upstream host installer over Nix-owned configuration.
