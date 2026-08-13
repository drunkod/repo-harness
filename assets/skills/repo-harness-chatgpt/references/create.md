# Create Mode: ChatGPT Web + GitHub App

Create is the only mutating ChatGPT Browser mode. It reuses the same Oracle
Browser Engine transport as Plan and Review, names the expected GitHub app in
the fixed prompt contract, attaches the approved plan and contract, and
performs bounded writes.

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

Before any write, the GitHub app is instructed to read repository metadata,
confirm the actual default branch, fetch the exact base commit, and prove the
target branch does not already exist. Any reported mismatch fails closed.

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
target values. Dry-run must not show `--browser-app`; `paths.prompt` must name
the expected app and require a no-write stop when that app or its tools are
unavailable. It must also show a passed Gitleaks receipt and `meta.create`
containing repository, default branch, exact base commit, and target branch.

## Write boundary

Create instructs the app to:

- operate only on the exact `owner/name`;
- prove the `agent/*` branch is absent, then create it directly from the exact base SHA;
- read before writing;
- stay inside the approved plan and contract;
- never modify the plan or contract;
- never write to the default or another branch;
- never force-update a ref;
- avoid unrelated work;
- never merge, enable auto-merge, mark ready, resolve review threads, or rerun
  CI;
- open a draft PR only when requested.

## Create result

Require exactly one `repo-harness-create-result` JSON block containing:

- exact selected app;
- exact repository;
- exact default branch;
- exact base commit;
- exact target branch plus `targetBranchExisted: false`;
- a different full implementation commit SHA;
- safe non-empty changed files excluding the protected plan and contract;
- the complete recognized repository/base/branch/create/commit/ref action sequence;
- when requested, a draft PR with matching URL, base, head, head SHA, and create action.

Store accepted data under `meta.create.reportedGitHub` with
`trust: "assistant_reported"`. Reject repository/default/base/branch/app
mismatches, a pre-existing target branch, an implementation SHA equal to the
base, unsafe/protected/empty changed files, missing or unknown action evidence,
a mismatched requested draft PR, and an unrequested PR object as
`CREATE_SURFACE_BLOCKED`.

The prompt asks for repository/base reads and a bounded branch/commit/ref
sequence, but current Oracle output does not provider-attest individual ChatGPT
tool calls. Treat `toolEvents` as structured assistant-reported evidence.

## Independent read-back

After a reported Create result, run:

```bash
repo-harness chatgpt browser-create-readback \
  --repo . \
  --session <create-session-id>
```

`browser-create-verify` is an alias.

Read-back opens a new browser session, names the same expected GitHub app in its
prompt contract, prohibits all writes, and requests:

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

A match requires the exact identity and commit, comparison status `ahead` with
`aheadBy >= 1` and `behindBy === 0`, the same safe changed-file set, the complete
recognized read sequence, an explicit PR lookup whether present or absent,
matching PR state when reported, and no unrecognized or write action. `mismatch` or malformed output
fails closed without erasing the original Create report.

Oracle does not export provider-attested app-selection or GitHub tool telemetry,
so neither trust label is direct API proof. Final Review and human acceptance
remain required.

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
