# ChatGPT + GitHub App Create

`browser-create` is the first-class repo-harness mode for bounded GitHub writes
through a selected ChatGPT app. It uses the same Oracle-backed ChatGPT Browser
Engine as Plan and Review.

General browser transport, Oracle resolution, profile binding, doctor output,
app preselection, secret scanning, session storage, and continuation semantics
are canonical in the [ChatGPT Browser Engine](./repo-harness-chatgpt-browser-engine.md).

```text
Plan      = browser-consult + non-mutating planning prompt
Create    = browser-create + selected GitHub app + bounded write contract
Read-back = browser-create-readback + new read-only GitHub-app browser session
Review    = browser-consult + independent review prompt
```

Create does not add a second browser engine, store GitHub credentials, or
implement the GitHub API inside repo-harness. Oracle opens ChatGPT Web and
requests the named app; the app supplies GitHub read and write actions.

## Strict target identity

Create never infers a remote repository from the local checkout. These values
are mandatory:

```text
--repository <owner/name>
--default-branch <name>
--base-commit <40-character SHA>
--branch <agent/*>
```

They have separate purposes:

- `--repo` selects the local repository root and session store;
- `--repository` binds the one remote repository the app may access;
- `--default-branch` states the remote repository's actual default branch;
- `--base-commit` freezes the exact commit used to create the branch;
- `--branch` must be a dedicated `agent/*` branch.

The former ambiguous `--base <ref>` input is not part of strict Create. A
moving branch name such as `main` is not an acceptable base identity.

Before any write, the generated prompt requires the GitHub app to fetch the
named repository, confirm its actual default branch, and fetch the exact base
commit. A mismatch must stop without a write.

## Required inputs

```text
--repo <path>
--prompt <text>
--chatgpt-app <name>
--repository <owner/name>
--default-branch <name>
--base-commit <40-character SHA>
--branch <agent/name>
--plan <path>
--contract <path>
```

The plan and contract must be existing repo-relative files. The target branch
must differ from the declared default branch and must start with `agent/`.

## Readiness

Check the shared Browser Engine first:

```bash
repo-harness chatgpt browser-doctor \
  --repo . \
  --provider oracle \
  --json
```

A real Create or read-back run additionally requires the resolved Oracle
binary to advertise `--browser-app`. Failure is
`ORACLE_APP_PRESELECT_UNSUPPORTED` before browser launch.

The app name is workspace-dependent. `GitHub` is an example, not an inferred
universal name.

## Dry run

```bash
repo-harness chatgpt browser-create \
  --repo . \
  --chatgpt-app GitHub \
  --repository drunkod/repo-harness \
  --default-branch main \
  --base-commit 01c821d121577c461aea4fc9373ad5090ec3bdda \
  --branch agent/example-change \
  --plan plans/plan-example-change.md \
  --contract tasks/contracts/example-change.contract.md \
  --prompt "Implement the approved task contract." \
  --gitleaks-bin /absolute/path/to/gitleaks \
  --dry-run
```

Dry-run validates the strict target identity, reads the approved files through
Browser Engine path policy, builds the fixed prompt, scans the exact rendered
bundle, and saves a `mode: "create"` session without opening a browser.

Inspect:

```text
paths.prompt
paths.output
paths.transcript
paths.events
meta.mode
meta.create.repository
meta.create.defaultBranch
meta.create.baseCommit
meta.create.targetBranch
dryRun.command
dryRun.secretScan
```

The Oracle command must contain `--browser-app <exact-app-name>`. Dry-run proves
command construction, not live app availability.

## Real Create

```bash
repo-harness chatgpt browser-create \
  --repo . \
  --chatgpt-app GitHub \
  --repository drunkod/repo-harness \
  --default-branch main \
  --base-commit 01c821d121577c461aea4fc9373ad5090ec3bdda \
  --branch agent/example-change \
  --plan plans/plan-example-change.md \
  --contract tasks/contracts/example-change.contract.md \
  --prompt "Implement the approved task contract." \
  --draft-pr
```

The fixed execution boundary instructs ChatGPT to:

- operate only on the exact `owner/name` repository;
- fetch repository metadata and the exact base commit before writing;
- stop without writing if the actual default branch or base is different;
- create the dedicated branch directly from the exact commit SHA;
- read existing target files before writing;
- leave the plan and contract unchanged;
- write only to the dedicated branch;
- never force-update a ref;
- avoid unrelated cleanup, dependencies, fallbacks, and refactors;
- avoid merge, auto-merge, ready-for-review transitions, thread resolution,
  and CI reruns;
- open a draft PR only when requested;
- report only actions and checks supported by direct evidence.

## Structured Create result

The final answer must contain exactly one fenced JSON block:

````text
```repo-harness-create-result
{
  "selectedApp": "GitHub",
  "repository": "drunkod/repo-harness",
  "defaultBranch": "main",
  "baseCommit": "01c821d121577c461aea4fc9373ad5090ec3bdda",
  "branch": "agent/example-change",
  "commitSha": "2222222222222222222222222222222222222222",
  "pullRequest": {
    "number": 123,
    "url": "https://github.com/drunkod/repo-harness/pull/123",
    "draft": true,
    "baseBranch": "main",
    "headBranch": "agent/example-change",
    "headSha": "2222222222222222222222222222222222222222"
  },
  "changedFiles": ["path/to/file"],
  "toolEvents": [
    "get_repo",
    "fetch_commit",
    "create_branch",
    "create_commit",
    "update_ref",
    "create_pull_request"
  ]
}
```
````

Use `null` for `pullRequest` when no PR was requested.

The parser rejects:

- another repository;
- another default branch;
- another base commit;
- another target branch or selected app;
- a commit equal to the base commit;
- unsafe or empty changed-file paths;
- no reported GitHub write action;
- merge, auto-merge, ready-for-review, thread-resolution, or CI-rerun actions;
- a PR whose URL, base, head, draft state, or head SHA does not match the
  declared target.

Accepted identifiers are stored under `meta.create.reportedGitHub` with:

```json
{
  "trust": "assistant_reported"
}
```

This is a structured report from the Create session, not provider-attested
GitHub telemetry.

## Independent GitHub read-back

After Create reports a result, open a **new** browser session:

```bash
repo-harness chatgpt browser-create-readback \
  --repo . \
  --session <create-session-id>
```

`browser-create-verify` is an alias.

The read-back command:

1. reads the strict target identity from the saved Create session;
2. requires a validated `reportedGitHub` result;
3. opens a new Oracle browser session rather than using `--followup`;
4. selects the same GitHub app;
5. prohibits every GitHub write action;
6. asks the app to fetch repository metadata, base commit, branch head,
   implementation commit, compare result, changed files, and PR state;
7. compares that independent report with the Create contract and result;
8. stores it separately under `meta.create.readBack`.

A successful envelope looks like:

````text
```repo-harness-create-readback-result
{
  "selectedApp": "GitHub",
  "repository": "drunkod/repo-harness",
  "defaultBranch": "main",
  "baseCommit": "01c821d121577c461aea4fc9373ad5090ec3bdda",
  "branch": "agent/example-change",
  "branchHead": "2222222222222222222222222222222222222222",
  "commitSha": "2222222222222222222222222222222222222222",
  "commitExists": true,
  "pullRequest": {
    "number": 123,
    "url": "https://github.com/drunkod/repo-harness/pull/123",
    "draft": true,
    "baseBranch": "main",
    "headBranch": "agent/example-change",
    "headSha": "2222222222222222222222222222222222222222"
  },
  "changedFiles": ["path/to/file"],
  "comparison": {
    "baseCommit": "01c821d121577c461aea4fc9373ad5090ec3bdda",
    "headCommit": "2222222222222222222222222222222222222222",
    "status": "ahead",
    "aheadBy": 1,
    "behindBy": 0
  },
  "readActions": [
    "get_repo",
    "fetch_commit",
    "compare_commits",
    "get_pr_info"
  ]
}
```
````

A matching read-back records:

```json
{
  "outcome": "matched",
  "evidence": {
    "trust": "assistant_reported_readback"
  }
}
```

A mismatch records `CREATE_READBACK_MISMATCH` and exits non-zero without
overwriting the original `reportedGitHub` object.

### Remaining trust boundary

The new session makes the read-back independent from the Create conversation,
but Oracle still does not export provider-attested ChatGPT app-selection or
tool-call telemetry. Therefore `assistant_reported_readback` is stronger than
self-report alone but is not equivalent to a direct GitHub API client owned by
repo-harness.

A final human Review should still fetch or inspect the PR and decide whether to
comment, mark ready, merge, deploy, or roll back.

## Outcomes

Create outcomes:

- `dry_run`
- `reported`
- `surface_blocked`
- `recoverable`
- `provider_failed`

Read-back outcomes:

- `dry_run`
- `matched`
- `mismatch`
- `surface_blocked`
- `recoverable`
- `provider_failed`

List Create sessions:

```bash
repo-harness chatgpt browser-list --repo . --mode create --json
```

Read complete metadata:

```bash
repo-harness chatgpt browser-session \
  --repo . \
  <create-session-id> \
  --metadata-only
```

## Live browser and GitHub-app acceptance test

Unit tests use fake Oracle and Gitleaks binaries. They validate command
construction, safety checks, metadata, parsing, and read-back comparison, but
they cannot prove the live website integration.

An explicit opt-in live test now exercises:

```text
visible ChatGPT browser
  -> GitHub app write
  -> branch/commit/draft PR
  -> second ChatGPT browser session
  -> GitHub app read-back
```

It is skipped unless all target values are deliberately supplied:

```bash
export REPO_HARNESS_LIVE_CHATGPT_CREATE=1
export REPO_HARNESS_LIVE_CREATE_REPO_ROOT=/absolute/path/to/checkout
export REPO_HARNESS_LIVE_CREATE_REPOSITORY=drunkod/repo-harness
export REPO_HARNESS_LIVE_CREATE_DEFAULT_BRANCH=main
export REPO_HARNESS_LIVE_CREATE_BASE_COMMIT=01c821d121577c461aea4fc9373ad5090ec3bdda
export REPO_HARNESS_LIVE_CREATE_BRANCH=agent/chatgpt-create-smoke
export REPO_HARNESS_LIVE_CREATE_PLAN=plans/plan-chatgpt-create-smoke.md
export REPO_HARNESS_LIVE_CREATE_CONTRACT=tasks/contracts/chatgpt-create-smoke.contract.md
export REPO_HARNESS_LIVE_CREATE_FILE=tasks/notes/chatgpt-create-smoke.md

bun run test:live:chatgpt-create
```

The plan and contract must permit exactly the smoke-test file and draft PR. The
test intentionally leaves the remote branch and draft PR for human inspection;
it never merges or deletes remote state.

## Failure reference

| Code | Meaning |
|---|---|
| `CREATE_REPOSITORY_REQUIRED` | Missing remote repository |
| `CREATE_REPOSITORY_INVALID` | Repository is not `owner/name` |
| `CREATE_DEFAULT_BRANCH_REQUIRED` | Missing actual default branch |
| `CREATE_DEFAULT_BRANCH_INVALID` | Unsafe default-branch name |
| `CREATE_BASE_COMMIT_REQUIRED` | Missing exact base commit |
| `CREATE_BASE_COMMIT_INVALID` | Base is not a full SHA |
| `CREATE_BRANCH_PREFIX_REQUIRED` | Target is not an `agent/*` branch |
| `CREATE_DEFAULT_BRANCH_REJECTED` | Target equals default branch |
| `CREATE_PLAN_NOT_FOUND` | Plan missing or invalid |
| `CREATE_CONTRACT_NOT_FOUND` | Contract missing or invalid |
| `ORACLE_APP_PRESELECT_UNSUPPORTED` | Oracle lacks `--browser-app` |
| `PROMPT_SECRET_SCAN_UNAVAILABLE` | Required scanner unavailable |
| `PROMPT_SECRET_SCAN_FAILED` | Prompt bundle rejected |
| `CREATE_SURFACE_BLOCKED` | Create output lacks usable evidence |
| `CREATE_READBACK_RESULT_REQUIRED` | Create has no validated result |
| `CREATE_READBACK_MISMATCH` | Read-back disagrees with target/result |
| `CREATE_READBACK_SURFACE_BLOCKED` | Read-back output is malformed or incomplete |
