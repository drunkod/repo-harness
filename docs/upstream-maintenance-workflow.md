# Upstream Maintenance Workflow

This document describes how this fork incorporates future `repo-harness` releases from the `upstream` remote while preserving local MVP changes.

## Branch and remote roles

| Name | Role |
| --- | --- |
| `upstream/main` | The original `Ancienttwo/repo-harness` development line. Never push local work here. |
| `origin/upstream-base` | The latest upstream release adopted by this fork, with no fork-specific commits. |
| `origin/main` | The product branch: adopted upstream code plus all local MVP changes. |
| `origin/mvp` | A retained legacy integration branch. Do not use it as the base for new work. |
| `origin/agent/chatgpt-github-create-mvp` | The retained original MVP implementation branch. Do not add routine development to it. |
| `feature/*` and `fix/*` | Short-lived branches created from `main`. |
| `upgrade/vX.Y.Z` | A short-lived branch used to integrate one upstream release into `main`. |

The invariant is:

```text
upstream release ──> upstream-base ──> upgrade/vX.Y.Z ──> main
                                                       + local MVP changes
```

Never merge `main`, `mvp`, or a feature branch back into `upstream-base`. Keeping `upstream-base` clean makes every future upstream upgrade auditable.

## Current baseline

The initial maintained layout was established as follows:

- `upstream-base` points to the clean upstream `0.15.0` release-close state at commit `ab12a3c5`.
- `main` contains that upstream baseline plus the GitHub Create MVP merged by PR #2 at commit `96535dd6`.
- `mvp` and `agent/chatgpt-github-create-mvp` are retained for history and recovery.

Commit hashes document the initial setup only. Use branch names and signed upstream release tags for future work.

## One-time remote setup

Verify that `origin` is this fork and `upstream` is the original repository:

```bash
git remote -v
```

If `upstream` is missing:

```bash
git remote add upstream https://github.com/Ancienttwo/repo-harness.git
git fetch upstream --tags --prune
```

Do not push to `upstream`.

## Adopt a new upstream release

The examples below use `v0.16.0`. Replace it with the exact release tag being adopted.

### 1. Start from a clean worktree

```bash
git status --short --branch
```

Commit or stash unrelated work before continuing. Do not run an upgrade from a dirty worktree.

### 2. Fetch both repositories and inspect the release

```bash
git fetch origin --prune
git fetch upstream --tags --prune
git tag --list '*0.16*'
git show --no-patch --decorate v0.16.0
```

Use a release tag rather than the moving `upstream/main` branch. This prevents accidentally adopting unreleased upstream commits.

Optionally inspect the incoming upstream commits:

```bash
git log --oneline upstream-base..v0.16.0
git diff --stat upstream-base...v0.16.0
```

### 3. Advance the clean upstream baseline

```bash
git switch upstream-base
git pull --ff-only origin upstream-base
git merge --ff-only v0.16.0
git push origin upstream-base
```

`--ff-only` must succeed. If it fails, stop: `upstream-base` may contain a local commit, the selected tag may not descend from the adopted release, or the wrong tag may have been selected. Diagnose the graph before changing history:

```bash
git log --graph --oneline --decorate upstream-base v0.16.0
```

Do not repair this failure with `git reset --hard` or a force-push without first creating a backup and reviewing the divergence.

### 4. Create an isolated upgrade branch

```bash
git switch main
git pull --ff-only origin main
git switch -c upgrade/v0.16.0
git merge --no-ff upstream-base
```

Resolve conflicts only on `upgrade/v0.16.0`, never directly on `upstream-base`.

For each conflict:

```bash
git status
git add <resolved-file>
```

When all conflicts are resolved:

```bash
git commit
```

To abandon an in-progress merge safely:

```bash
git merge --abort
```

### 5. Verify the combined product

Run the repository gates:

```bash
bun test
bash scripts/check-deploy-sql-order.sh
bash scripts/check-architecture-sync.sh
bash scripts/check-task-sync.sh
repo-harness run check-task-workflow --strict
bun scripts/inspect-project-state.ts --repo . --format text
bun src/cli/index.ts init --repo . --dry-run
```

Also manually exercise the fork-specific MVP paths affected by upstream changes.

### 6. Review and merge the upgrade

Push the temporary branch:

```bash
git push -u origin upgrade/v0.16.0
```

Open a pull request with:

```text
base:    main
compare: upgrade/v0.16.0
```

The pull request should identify:

- the adopted upstream tag;
- the previous and new upstream baseline commits;
- every conflict resolution that changes behavior;
- the verification commands and results;
- any intentionally deferred upstream change.

After the pull request is merged:

```bash
git switch main
git pull --ff-only origin main
git branch -d upgrade/v0.16.0
git push origin --delete upgrade/v0.16.0
```

Deleting the completed temporary upgrade branch is optional but recommended. Never delete `upstream-base`.

## Develop local changes

Create each local change from the current product branch:

```bash
git switch main
git pull --ff-only origin main
git switch -c feature/<short-name>
```

For a bug fix, use `fix/<short-name>`. Push the branch and open a pull request back to `main`:

```bash
git push -u origin feature/<short-name>
```

Do not base new work on `upstream-base`, `mvp`, or `agent/chatgpt-github-create-mvp`.

## Emergency recovery

Before any unusual history repair, create local backup branches:

```bash
git branch backup/main-before-repair main
git branch backup/upstream-base-before-repair upstream-base
```

Useful read-only diagnostics:

```bash
git status --short --branch
git branch -a -vv
git log --graph --oneline --decorate --all -40
git rev-list --left-right --count upstream-base...main
git log --oneline upstream-base..main
```

Avoid `git push --force`. If rewriting a non-shared temporary branch is unavoidable, use `--force-with-lease`, never plain `--force`, and confirm that no one else uses the branch.

## Rules to preserve the structure

1. `upstream-base` contains upstream commits only.
2. `main` is the only long-lived product integration branch.
3. Upstream releases reach `main` through one `upgrade/vX.Y.Z` pull request.
4. Local features start from and return to `main`.
5. Use exact upstream release tags, not a moving branch, for normal upgrades.
6. Keep upgrade conflict resolutions reviewable and covered by tests.
7. Do not routinely update or develop on the retained legacy `mvp` and `agent/chatgpt-github-create-mvp` branches.
