# ChatGPT + GitHub App Create

`repo-harness chatgpt browser-create` is the first-class repo-harness mode for
bounded GitHub writes through a selected ChatGPT app.

General browser transport, Oracle resolution, profile binding, doctor output,
app preselection, secret scanning, session storage, continuation, cleanup, and
file policy remain canonical in the
[ChatGPT Browser Engine](./repo-harness-chatgpt-browser-engine.md). This guide
owns only the Create-specific target, write, result, and independent read-back
contracts.

```text
Plan      = browser-consult + non-mutating planning prompt
Create    = browser-create + selected GitHub app + bounded write contract
Read-back = browser-create-readback + new read-only GitHub-app browser session
Review    = browser-consult + independent review prompt
```

Create does not add another browser engine, store GitHub credentials, or
implement a GitHub API client inside repo-harness. Oracle opens ChatGPT Web and
requests the named app; the app supplies GitHub read and write actions.

## Strict target identity

Create never infers a remote repository from the local checkout. These values
are independent and mandatory:

```text
--repo <local-path>
--chatgpt-app <installed-app-name>
--repository <owner/name>
--default-branch <name>
--base-commit <40-character SHA>
--branch <agent/*>
--plan <repo-relative path>
--contract <repo-relative path>
--prompt <bounded task>
```

- `--repo` selects the local session store and approved input files.
- `--repository` binds the only remote repository the app may access.
- `--default-branch` records the expected actual GitHub default branch.
- `--base-commit` freezes the exact commit used to create the target branch.
- `--branch` must be a dedicated `agent/*` branch and must differ from the
  declared default branch.

The former moving `--base <ref>` input is not accepted by strict Create.
Before any write, the generated prompt requires the GitHub app to fetch the
named repository, confirm its actual default branch, and fetch the exact base
commit. A mismatch must stop without writing.

## Readiness

Check the shared Browser Engine first:

```bash
repo-harness chatgpt browser-doctor \
  --repo . \
  --provider oracle \
  --json
```

A real Create or read-back run also requires Oracle to advertise
`--browser-app`. Failure is `ORACLE_APP_PRESELECT_UNSUPPORTED` before prompt
submission. The app name is workspace-dependent; `GitHub` is only an example.

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
  --prompt "Implement the approved task contract." \
  --gitleaks-bin /absolute/path/to/gitleaks \
  --dry-run
```

Replace all example identities with the approved target values. Dry-run
validates inputs and output policy, builds the fixed prompt, scans the exact
rendered bundle, records a `mode: "create"` session, and exposes the generated
Oracle command without opening a browser.

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

`dryRun.command` must contain `--browser-app <exact-app-name>`. This proves
command construction, not live app availability or GitHub state.

## Real Create

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
  --prompt "Implement the approved task contract." \
  --draft-pr
```

The fixed execution boundary requires the remote app to:

- operate only on the exact `owner/name` repository;
- read repository metadata and the exact base commit before writing;
- stop if the actual default branch or base is different;
- create the dedicated branch directly from the exact base SHA;
- read existing target files before writing;
- leave the attached plan and contract unchanged;
- write only to the dedicated branch and never force-update a ref;
- avoid unrelated cleanup, dependencies, fallbacks, and refactors;
- never merge, enable auto-merge, mark ready, comment, submit a review, resolve
  review threads, or rerun CI;
- open a draft pull request only when requested;
- report only actions and checks supported by direct evidence.

## Structured Create result

The response must contain exactly one fenced JSON block:

````text
```repo-harness-create-result
{
  "selectedApp": "GitHub",
  "repository": "owner/repository",
  "defaultBranch": "main",
  "baseCommit": "1111111111111111111111111111111111111111",
  "branch": "agent/example-change",
  "commitSha": "2222222222222222222222222222222222222222",
  "pullRequest": {
    "number": 123,
    "url": "https://github.com/owner/repository/pull/123",
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

Use `null` for `pullRequest` when no pull request was requested.

The Create contract requires:

- the exact selected app, repository, default branch, base commit, and target
  branch;
- an implementation SHA different from the base SHA;
- safe, non-empty changed files that do not include the attached plan or
  contract;
- `get_repo` and `fetch_commit` read evidence;
- `create_branch`, `create_commit`, and `update_ref` write evidence;
- when `--draft-pr` was requested, `create_pull_request` and matching draft-PR
  URL, base, head, and head SHA;
- when no PR was requested, neither PR metadata nor `create_pull_request`.

The parser rejects identity mismatches, missing required actions,
plan/contract changes, contradictory PR evidence, and merge, auto-merge,
ready-for-review, comment, review, thread-resolution, or CI-rerun actions.
Accepted data is stored under `meta.create.reportedGitHub` with:

```json
{
  "trust": "assistant_reported"
}
```

This is a structured Create-session report, not provider-attested GitHub
telemetry.

## Independent GitHub read-back

After Create returns a validated result, open a new browser session:

```bash
repo-harness chatgpt browser-create-readback \
  --repo . \
  --session <create-session-id>
```

`browser-create-verify` is an alias.

The command:

1. reads the frozen target identity and `reportedGitHub` result from the Create
   session;
2. opens a new Oracle browser session rather than using `--followup`;
3. selects the same GitHub app;
4. prohibits all GitHub write actions;
5. reads repository metadata, base commit, target branch head, implementation
   commit, comparison, changed files, and PR state;
6. compares the new report with the Create contract and result;
7. stores it separately under `meta.create.readBack`.

A successful envelope has this shape:

````text
```repo-harness-create-readback-result
{
  "selectedApp": "GitHub",
  "repository": "owner/repository",
  "defaultBranch": "main",
  "baseCommit": "1111111111111111111111111111111111111111",
  "branch": "agent/example-change",
  "branchHead": "2222222222222222222222222222222222222222",
  "commitSha": "2222222222222222222222222222222222222222",
  "commitExists": true,
  "pullRequest": {
    "number": 123,
    "url": "https://github.com/owner/repository/pull/123",
    "draft": true,
    "baseBranch": "main",
    "headBranch": "agent/example-change",
    "headSha": "2222222222222222222222222222222222222222"
  },
  "changedFiles": ["path/to/file"],
  "comparison": {
    "baseCommit": "1111111111111111111111111111111111111111",
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

A match requires:

- a different `readBackSessionId` from the Create `sessionId`;
- the exact repository/default/base/branch/app identity;
- an existing implementation commit and matching branch head;
- comparison status `ahead`, `aheadBy >= 1`, and `behindBy = 0`;
- the same changed-file set as the Create result;
- `get_repo`, `fetch_commit`, and `compare_commits`, plus a PR read action when
  a PR was reported;
- no write action.

A matching result records:

```json
{
  "outcome": "matched",
  "evidence": {
    "trust": "assistant_reported_readback"
  }
}
```

A mismatch records `CREATE_READBACK_MISMATCH`. Malformed or incomplete output
records `CREATE_READBACK_SURFACE_BLOCKED`. Neither outcome overwrites the
original `reportedGitHub` object.

### Remaining trust boundary

The second session is independent from the Create conversation, but Oracle does
not export provider-attested ChatGPT app-selection or tool-call telemetry.
`assistant_reported_readback` is therefore stronger than Create self-report
alone but is not equivalent to a direct GitHub API read performed by
repo-harness. Final Review and human acceptance remain required.

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

Inspect Create sessions:

```bash
repo-harness chatgpt browser-list --repo . --mode create --json
repo-harness chatgpt browser-session --repo . <create-session-id> --metadata-only
```

## Live browser and GitHub-app acceptance test

Unit tests use fake Oracle and Gitleaks binaries. They validate CLI wiring,
policy, metadata, parsing, and comparison, but cannot prove the live website or
app integration.

The opt-in smoke test exercises:

```text
visible ChatGPT browser
  -> GitHub app write
  -> branch/commit/draft PR
  -> second ChatGPT browser session
  -> GitHub app read-back
```

It is self-gated and is skipped during ordinary `bun test` unless explicitly
enabled:

```bash
export REPO_HARNESS_LIVE_CHATGPT_CREATE=1
export REPO_HARNESS_LIVE_CREATE_REPO_ROOT=/absolute/path/to/checkout
export REPO_HARNESS_LIVE_CREATE_REPOSITORY=owner/repository
export REPO_HARNESS_LIVE_CREATE_DEFAULT_BRANCH=main
export REPO_HARNESS_LIVE_CREATE_BASE_COMMIT=1111111111111111111111111111111111111111
export REPO_HARNESS_LIVE_CREATE_BRANCH=agent/chatgpt-create-smoke
export REPO_HARNESS_LIVE_CREATE_PLAN=plans/plan-chatgpt-create-smoke.md
export REPO_HARNESS_LIVE_CREATE_CONTRACT=tasks/contracts/chatgpt-create-smoke.contract.md
export REPO_HARNESS_LIVE_CREATE_FILE=tasks/notes/chatgpt-create-smoke.md

bun run test:live:chatgpt-create
```

The plan and contract must permit exactly the smoke-test file and draft PR. The
test intentionally leaves the remote branch and draft PR for inspection; it
never merges or deletes remote state.

## Reusable test map

Reuse existing repository patterns rather than creating another harness:

| Test file | Reusable coverage |
|---|---|
| `tests/cli/chatgpt-browser.test.ts` | fake Oracle argv capture, app preselection, prompt/file/output policy, session/list/follow-up/cleanup behavior |
| `tests/cli/chatgpt-browser-create.test.ts` | strict target validation, result parsing, draft-PR contract, separate read-back, mismatch classification |
| `tests/skill-surface/chatgpt-package.test.ts` | canonical reference closed set, router reachability, 2048-byte router budget |
| `tests/skill-surface/chatgpt-create-mode.test.ts` | Create-specific documentation/runtime/packaging consistency |
| `tests/skill-surface/retired-names-scan.test.ts` | repository-wide retired package-name guard |
| `tests/live/chatgpt-browser-create.live.test.ts` | opt-in visible-browser and GitHub-app smoke chain |
| `tests/cli/mcp-tools.test.ts` | reuse only if Create/read-back later becomes an MCP tool surface |

## Failure reference

| Code | Meaning |
|---|---|
| `CREATE_APP_REQUIRED` | Missing app name |
| `CREATE_REPOSITORY_REQUIRED` | Missing remote repository |
| `CREATE_REPOSITORY_INVALID` | Repository is not `owner/name` |
| `CREATE_DEFAULT_BRANCH_REQUIRED` | Missing actual default branch |
| `CREATE_DEFAULT_BRANCH_INVALID` | Unsafe default-branch name |
| `CREATE_BASE_COMMIT_REQUIRED` | Missing exact base commit |
| `CREATE_BASE_COMMIT_INVALID` | Base is not a full SHA |
| `CREATE_BRANCH_REQUIRED` | Missing target branch |
| `CREATE_BRANCH_INVALID` | Unsafe target branch name |
| `CREATE_BRANCH_PREFIX_REQUIRED` | Target is not an `agent/*` branch |
| `CREATE_DEFAULT_BRANCH_REJECTED` | Target equals default branch |
| `CREATE_PLAN_REQUIRED` | Missing plan argument |
| `CREATE_PLAN_NOT_FOUND` | Plan missing, outside the repo, or invalid |
| `CREATE_CONTRACT_REQUIRED` | Missing contract argument |
| `CREATE_CONTRACT_NOT_FOUND` | Contract missing, outside the repo, or invalid |
| `CREATE_PROVIDER_UNSUPPORTED` | Create/read-back provider is not Oracle |
| `CREATE_ORACLE_NOT_INSTALLED` | Oracle cannot be resolved |
| `ORACLE_APP_PRESELECT_UNSUPPORTED` | Oracle lacks `--browser-app` |
| `PROMPT_SECRET_SCAN_UNAVAILABLE` | Required scanner unavailable |
| `PROMPT_SECRET_SCAN_FAILED` | Prompt bundle rejected |
| `CREATE_SURFACE_BLOCKED` | Create output lacks usable evidence |
| `CREATE_READBACK_MODE_MISMATCH` | Source session is not a Create session |
| `CREATE_READBACK_RESULT_REQUIRED` | Create has no validated result |
| `CREATE_READBACK_APP_MISMATCH` | Read-back app differs from Create app |
| `CREATE_READBACK_MISMATCH` | Read-back disagrees with target/result |
| `CREATE_READBACK_SURFACE_BLOCKED` | Read-back output is malformed or incomplete |
