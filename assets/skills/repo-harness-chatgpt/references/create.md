# Create Mode: ChatGPT Web + GitHub App

Create is the only mutating ChatGPT Browser mode. It reuses the Oracle Browser
Engine, selects the named GitHub app, attaches the approved plan and contract,
and performs bounded writes.

Use:

```bash
repo-harness chatgpt browser-create
```

Do not emulate Create with a hand-written `browser-consult` prompt. Plan and
Review remain non-mutating.

## Required target identity

Require all of:

- `--repo <path>` for the local session store;
- `--chatgpt-app <name>`;
- `--repository <owner/name>`;
- `--default-branch <name>`;
- `--base-commit <40-character SHA>`;
- `--branch <agent/name>`;
- `--plan <repo-relative path>`;
- `--contract <repo-relative path>`;
- `--prompt <bounded task>`.

Never infer the remote repository from the local path. Never accept a moving
base ref. The target branch must start with `agent/` and differ from the actual
default branch.

Before any write, the GitHub app must read repository metadata, confirm the
actual default branch, and fetch the exact base commit. Any mismatch stops
without a write.

## Dry run

```bash
repo-harness chatgpt browser-create \
  --repo . \
  --chatgpt-app GitHub \
  --repository owner/repository \
  --default-branch main \
  --base-commit 1111111111111111111111111111111111111111 \
  --branch agent/example-change \
  --plan plans/plan-example-change.md \
  --contract tasks/contracts/example-change.contract.md \
  --prompt "Implement the approved contract." \
  --gitleaks-bin /absolute/path/to/gitleaks \
  --dry-run
```

Replace the repository, branch, base SHA, plan, and contract with the approved
target values. Dry-run must show `--browser-app <name>`, a passed Gitleaks
receipt, and `meta.create` containing repository, default branch, exact base
commit, and target branch.

## Write boundary

Create must:

- operate only on the exact `owner/name`;
- report `get_repo` and `fetch_commit` before its write actions;
- create the `agent/*` branch directly from the exact base SHA;
- report `create_branch`, `create_commit`, and `update_ref`;
- read before writing;
- stay inside the approved plan and contract;
- never modify the plan or contract;
- never write to the default or another branch;
- never force-update a ref;
- avoid unrelated work;
- never merge, enable auto-merge, mark ready, comment, review, resolve review
  threads, or rerun CI;
- report `create_pull_request` and matching draft-PR metadata only when a draft
  PR was requested.

## Create result

Require exactly one `repo-harness-create-result` JSON block containing:

- exact selected app;
- exact repository;
- exact default branch;
- exact base commit;
- exact target branch;
- a different full implementation commit SHA;
- safe non-empty changed files that exclude the attached plan and contract;
- the required repository/base read actions and branch/commit/ref write actions;
- when requested, `create_pull_request` plus a draft PR with matching URL, base,
  head, and head SHA.

Store accepted data under `meta.create.reportedGitHub` with
`trust: "assistant_reported"`. Reject any repository/default/base/branch
mismatch, missing required action, contradictory PR event, plan/contract change,
or merge, auto-merge, ready, comment, review, thread-resolution, or CI-rerun
action as `CREATE_SURFACE_BLOCKED`.

## Independent read-back

After a reported Create result, run:

```bash
repo-harness chatgpt browser-create-readback \
  --repo . \
  --session <create-session-id>
```

`browser-create-verify` is an alias.

Read-back must open a new browser session, select the same GitHub app, prohibit
all writes, and read:

- repository metadata and actual default branch;
- exact base commit;
- target branch head;
- implementation commit;
- base/head comparison;
- changed files;
- draft PR state when present.

Compare the read-back result with the frozen Create context and
`reportedGitHub`. Store it separately under `meta.create.readBack` with
`trust: "assistant_reported_readback"`.

A match requires the implementation to be strictly ahead of the exact base
(`aheadBy >= 1`, `behindBy = 0`), the same changed-file set, and all required
read actions. `mismatch` or malformed output fails closed. It does not erase or
rewrite the original Create report.

Oracle does not yet export provider-attested GitHub tool telemetry, so neither
trust label is direct API proof. Final Review and human acceptance remain
required.

## Live acceptance

The default unit suite uses fake Oracle and Gitleaks binaries. The opt-in live
test is:

```bash
bun run test:live:chatgpt-create
```

It is self-gated and remains skipped during ordinary `bun test` unless
`REPO_HARNESS_LIVE_CHATGPT_CREATE=1` is present. It also requires explicit
repository, default branch, base commit, branch, plan, contract, and smoke-test
file environment variables. It performs one bounded write and a new-session
read-back. It never merges or removes remote state.
