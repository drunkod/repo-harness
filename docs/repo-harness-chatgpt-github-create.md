# ChatGPT + GitHub App Create

`browser-create` is the first-class repo-harness mode for bounded GitHub writes
through a selected ChatGPT app.

General browser transport, Oracle resolution, profile binding, doctor output,
app preselection, secret scanning, session storage, and continuation semantics
are canonical in the [ChatGPT Browser Engine](./repo-harness-chatgpt-browser-engine.md).
This guide documents only the Create-specific contract layered on that engine.

```text
Plan   = browser-consult + non-mutating planning prompt
Create = browser-create + selected GitHub app + bounded write contract
Review = browser-consult + independent review prompt
```

Create does not add a second browser engine, a GitHub credential store, or a
repo-harness-owned GitHub API client. Oracle requests the named ChatGPT app;
the app supplies repository tools.

## What the dedicated command adds

A hand-written `browser-consult --chatgpt-app ...` prompt is not Create. The
first-class command adds:

- required repository, app, base, branch, plan, contract, and task inputs;
- a fixed write-safety prompt prefix;
- mandatory fail-closed Gitleaks scanning;
- a real-run Oracle `--browser-app` capability precondition;
- `mode: "create"` and typed Create metadata;
- a unique default Creation Report path;
- a structured Create result envelope;
- `surface_blocked` classification when usable GitHub evidence is absent.

## Trust boundary

Repo-harness can prove that it built and scanned the exact prompt bundle,
requested the app through Oracle, stored the provider result, and parsed the
returned envelope.

Current Oracle output does not independently prove that the app was visibly
selected, that each claimed GitHub tool call happened, or that a reported
commit or pull request exists. Parsed repository identifiers are therefore
stored as:

```json
{
  "trust": "assistant_reported"
}
```

App-selection metadata remains:

```json
{
  "verified": false,
  "source": "oracle_request_only"
}
```

Independent GitHub read-back, Review, and human acceptance remain required.

## Required inputs

```text
--repo <path>
--prompt <text>
--chatgpt-app <name>
--base <ref>
--branch <name>
--plan <path>
--contract <path>
```

The plan and contract must be existing repo-relative files. The target branch
must be dedicated: it cannot be `main`, `master`, or the same value as the base
ref.

The approved contract should freeze:

- repository and baseline;
- dedicated branch;
- allowed and forbidden paths;
- required behavior and checks;
- draft-PR policy;
- rollback expectations.

Create attaches the plan and contract and instructs ChatGPT not to modify them.

## Readiness

Use the Browser Engine doctor described in the canonical engine guide:

```bash
repo-harness chatgpt browser-doctor \
  --repo . \
  --provider oracle \
  --json
```

For a real Create run, `browser-create` additionally requires the resolved
Oracle binary to advertise app preselection. Failure is
`ORACLE_APP_PRESELECT_UNSUPPORTED` before browser launch. The exact app name is
workspace-dependent; `GitHub` is an example, not an inferred universal name.

## Dry run

```bash
repo-harness chatgpt browser-create \
  --repo . \
  --chatgpt-app GitHub \
  --base main \
  --branch agent/example-change \
  --plan plans/plan-example-change.md \
  --contract tasks/contracts/example-change.contract.md \
  --prompt "Implement the approved task contract." \
  --gitleaks-bin /absolute/path/to/gitleaks \
  --dry-run
```

The dry run validates scope, reads the approved files through Browser Engine
path policy, builds the fixed Create prompt, scans the exact rendered bundle,
and saves a Create session without opening a browser.

Inspect:

```text
paths.prompt
paths.output
paths.transcript
paths.events
meta.mode
meta.create
dryRun.command
dryRun.secretScan
```

The Oracle command must contain `--browser-app <exact-app-name>`. A dry run
proves command construction, not live app availability.

Representative metadata:

```json
{
  "mode": "create",
  "status": "dry_run",
  "create": {
    "baseRef": "main",
    "targetBranch": "agent/example-change",
    "planPath": "plans/plan-example-change.md",
    "contractPath": "tasks/contracts/example-change.contract.md",
    "requestedApp": "GitHub",
    "outcome": "dry_run"
  }
}
```

## Real run

```bash
repo-harness chatgpt browser-create \
  --repo . \
  --chatgpt-app GitHub \
  --base main \
  --branch agent/example-change \
  --plan plans/plan-example-change.md \
  --contract tasks/contracts/example-change.contract.md \
  --prompt "Implement the approved task contract." \
  --draft-pr
```

The fixed execution boundary instructs ChatGPT to:

- treat the approved contract as authoritative;
- read existing target files before writing;
- create and work only on the dedicated branch from the requested base;
- leave the plan and contract unchanged;
- avoid default-branch and force-ref writes;
- avoid unrelated cleanup, dependencies, fallbacks, and refactors;
- avoid merge, auto-merge, ready-for-review transitions, thread resolution,
  and CI reruns;
- report only checks supported by direct evidence.

These are instructions to the remote app. Repo-harness does not intercept the
app's GitHub tool calls.

## Structured Create result

The final answer must contain exactly one fenced JSON block:

````text
```repo-harness-create-result
{
  "selectedApp": "GitHub",
  "repository": "owner/name",
  "baseCommit": "1111111111111111111111111111111111111111",
  "branch": "agent/example-change",
  "commitSha": "2222222222222222222222222222222222222222",
  "pullRequest": {
    "number": 123,
    "url": "https://github.com/owner/name/pull/123",
    "draft": true
  },
  "changedFiles": ["path/to/file"],
  "toolEvents": [
    "create_branch",
    "create_commit",
    "update_ref",
    "create_pull_request"
  ]
}
```
````

Use `null` for `pullRequest` when no PR was requested.

The parser requires:

- exactly one valid JSON envelope;
- the exact requested app and branch;
- `owner/name` repository form;
- full 40-character base and implementation commit SHAs;
- safe repo-relative changed-file paths;
- at least one reported GitHub write action;
- a fully reported draft PR when `--draft-pr` was requested;
- no reported PR when `--draft-pr` was not requested.

Accepted data is stored under `meta.create.reportedGitHub`, separately from the
raw provider output, with `trust: "assistant_reported"`.

## Outcomes

### `reported`

Oracle completed and the structured result passed validation. GitHub state is
still unverified until independently read back.

### `surface_blocked`

Oracle completed, but the response did not provide usable evidence. Examples:
missing or duplicate envelopes, malformed JSON, wrong app or branch, invalid
SHAs, no write event, or a missing/unrequested PR.

The CLI exits non-zero and records:

```text
CREATE_SURFACE_BLOCKED
```

The remote app may already have written to GitHub. Inspect the saved
conversation and GitHub state before retrying.

### `recoverable`

Provider capture may be incomplete. Continue the same provider session rather
than resubmitting the original Create request.

### `provider_failed`

Oracle failed before a usable Create result was obtained.

### `dry_run`

No browser was opened and no repository write was attempted.

## Continue and inspect

Create sessions remain Create sessions across `browser-followup`; they inherit
the selected app, Oracle provider, model/thinking settings, and mandatory scan
posture.

```bash
repo-harness chatgpt browser-followup \
  --repo . \
  --session <session-id> \
  --prompt "Return the required Create result envelope."
```

List only Create sessions:

```bash
repo-harness chatgpt browser-list --repo . --mode create --json
```

Read metadata:

```bash
repo-harness chatgpt browser-session \
  --repo . \
  <session-id> \
  --metadata-only
```

Plan Create-only cleanup before deleting anything:

```bash
repo-harness chatgpt browser-cleanup \
  --repo . \
  --mode create \
  --status surface_blocked \
  --json
```

## Creation Report path

Without `--write-output`, Create allocates:

```text
.ai/harness/handoff/chatgpt/create-<timestamp>-<branch-slug>.md
```

An explicit output path uses the normal Browser Engine write policy. Sensitive
or source paths are denied, existing files require `--overwrite-output`, and
absolute paths require explicit authorization.

## Independent Review

Start a new non-mutating Review session with independently fetched GitHub
state:

- approved plan and contract;
- actual base and implementation commits;
- actual changed-file list and PR patch;
- GitHub Actions/status evidence;
- Creation Report and saved Create metadata.

Do not treat `reportedGitHub` or the Creation Report as acceptance. A human
remains authoritative for comments, thread resolution, ready-for-review,
merge, deployment, and rollback decisions.

## Failure reference

| Code | Meaning |
|---|---|
| `CREATE_APP_REQUIRED` | Missing app name |
| `CREATE_BASE_REF_REQUIRED` | Missing base ref |
| `CREATE_BRANCH_REQUIRED` | Missing target branch |
| `CREATE_PLAN_REQUIRED` | Missing plan argument |
| `CREATE_CONTRACT_REQUIRED` | Missing contract argument |
| `CREATE_DEFAULT_BRANCH_REJECTED` | Target is default/base branch |
| `CREATE_PLAN_NOT_FOUND` | Plan missing or invalid |
| `CREATE_CONTRACT_NOT_FOUND` | Contract missing or invalid |
| `CREATE_ORACLE_NOT_INSTALLED` | Oracle cannot be resolved |
| `ORACLE_APP_PRESELECT_UNSUPPORTED` | Oracle lacks `--browser-app` |
| `PROMPT_SECRET_SCAN_UNAVAILABLE` | Required scanner unavailable |
| `PROMPT_SECRET_SCAN_FAILED` | Prompt bundle rejected |
| `CREATE_SURFACE_BLOCKED` | Completed output lacks usable Create evidence |
