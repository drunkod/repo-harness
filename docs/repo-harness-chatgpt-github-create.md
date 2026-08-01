# ChatGPT + GitHub App Create

## Purpose

`ChatGPT + GitHub App Create` is a first-class repo-harness Browser Engine
runtime mode beside non-mutating Plan and Review consults.

```text
Plan   = browser-consult + planning prompt
Create = browser-create + selected GitHub app + bounded write contract
Review = browser-consult + independent review prompt
```

Create reuses the existing Oracle-backed browser transport. It does not add a
second browser engine, store GitHub credentials, or implement the GitHub API
inside repo-harness. Oracle opens ChatGPT Web and requests the selected app;
the app supplies repository tools.

The dedicated command adds runtime behavior that a hand-written
`browser-consult --chatgpt-app ...` prompt does not provide:

- required Create inputs;
- a fixed write-safety prompt prefix;
- mandatory content-level secret scanning;
- Oracle app-preselection capability checks;
- `mode: "create"` session metadata;
- a default Creation Report path;
- a structured assistant-reported GitHub result envelope;
- `surface_blocked` classification when usable write evidence is absent.

## Trust boundary

Repo-harness can prove that it:

- built the bounded prompt;
- scanned the exact prompt bundle;
- requested an app through Oracle's `--browser-app` flag;
- stored the browser session and provider output;
- parsed the returned Create result envelope.

Repo-harness cannot currently prove from Oracle telemetry that:

- the named app was visibly selected in ChatGPT;
- each claimed GitHub tool call occurred;
- the returned commit or pull request exists.

For that reason, parsed GitHub data is stored under:

```json
{
  "trust": "assistant_reported"
}
```

and app selection remains:

```json
{
  "verified": false,
  "source": "oracle_request_only"
}
```

An independent Review and human acceptance remain required.

## Preconditions

Before a real Create run:

1. Adopt the target repository with repo-harness.
2. Produce and approve a plan and task contract.
3. Install or select Gitleaks 8.19 or newer.
4. Bind an authenticated ChatGPT browser profile when required.
5. Resolve an Oracle binary that supports `--browser-app`.
6. Confirm the exact installed ChatGPT app name.
7. Choose a dedicated non-default branch.

Check general Browser Engine readiness:

```bash
repo-harness chatgpt browser-doctor \
  --repo . \
  --provider oracle \
  --json
```

The JSON exposes app preselection at:

```text
oracle.optionalCapabilities.browserAppPreselect
```

`browser-create` also asserts this capability itself immediately before a real
browser launch.

## Required command arguments

```text
--repo <path>
--prompt <text>
--chatgpt-app <name>
--base <ref>
--branch <name>
--plan <path>
--contract <path>
```

The plan and contract must be repo-relative files that already exist. The
branch cannot be `main`, `master`, or the same value as the base ref.

## Step 1: prepare durable inputs

Example plan:

```text
plans/plan-example-change.md
```

Example task contract:

```text
tasks/contracts/example-change.contract.md
```

The contract should freeze:

- repository and baseline;
- dedicated branch;
- allowed and forbidden paths;
- required behavior;
- required checks;
- draft-PR policy;
- rollback.

Create consumes these files but instructs ChatGPT not to modify them.

## Step 2: run a dry run

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

The dry run:

- validates required inputs;
- rejects default-branch targets;
- reads the plan and contract through the Browser Engine file policy;
- builds the fixed Create prompt;
- scans the exact rendered bundle;
- saves a session without opening a browser;
- records `mode: "create"` and `create.outcome: "dry_run"`;
- returns the Oracle command containing `--browser-app GitHub`.

Inspect the returned paths:

```text
paths.sessionDir
paths.prompt
paths.output
paths.transcript
paths.events
```

Inspect metadata:

```bash
repo-harness chatgpt browser-session \
  --repo . \
  <session-id> \
  --metadata-only
```

A representative dry-run result is:

```json
{
  "status": "dry_run",
  "mode": "create",
  "create": {
    "baseRef": "main",
    "targetBranch": "agent/example-change",
    "planPath": "plans/plan-example-change.md",
    "contractPath": "tasks/contracts/example-change.contract.md",
    "draftPr": false,
    "requestedApp": "GitHub",
    "creationReportPath": ".ai/harness/handoff/chatgpt/create-...md",
    "outcome": "dry_run",
    "appSelection": {
      "requestedApp": "GitHub",
      "verified": false,
      "source": "oracle_request_only"
    }
  }
}
```

## Step 3: run Create

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

Create uses Oracle only. Before opening the browser, it resolves and probes the
selected Oracle binary. A binary without `--browser-app` support fails with:

```text
ORACLE_APP_PRESELECT_UNSUPPORTED
```

The fixed prompt instructs ChatGPT to:

- use the selected app;
- read before writing;
- create and use only the dedicated branch;
- remain inside the approved contract;
- avoid force-updating refs;
- avoid merge, auto-merge, ready-for-review, thread resolution, and CI reruns;
- report only checks supported by direct evidence.

The user-supplied `--prompt` is appended after this fixed boundary.

## Step 4: structured Create result

The prompt requires exactly one final fenced JSON block:

````text
```repo-harness-create-result
{
  "selectedApp": "GitHub",
  "repository": "owner/name",
  "baseCommit": "<full commit SHA>",
  "branch": "agent/example-change",
  "commitSha": "<full commit SHA>",
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

Use `null` for `pullRequest` when none was requested.

Repo-harness accepts the envelope only when:

- exactly one block is present;
- it contains valid JSON;
- required strings and arrays are present;
- the reported branch equals `--branch`;
- a reported app, when present, equals `--chatgpt-app`;
- at least one named GitHub write action is reported.

Accepted data is copied into:

```text
meta.create.reportedGitHub
```

separately from the raw Browser Engine output.

## Step 5: understand outcomes

### `reported`

Oracle completed and one valid assistant-reported GitHub envelope was parsed.
This does not independently verify GitHub state.

### `surface_blocked`

Oracle completed, but Create could not obtain usable GitHub evidence. Causes
include:

- no result envelope;
- invalid or duplicate result envelopes;
- wrong branch or app;
- no reported write action.

The CLI exits non-zero and records:

```text
CREATE_SURFACE_BLOCKED
```

The saved conversation may still have caused GitHub writes. Inspect GitHub and
the same saved ChatGPT session before retrying.

### `recoverable`

Provider capture is incomplete. Continue the same provider session rather than
submitting the original Create prompt again.

### `provider_failed`

Oracle failed before a usable Create result was obtained.

### `dry_run`

No browser was opened and no repository write was attempted.

## Step 6: list and inspect Create sessions

```bash
repo-harness chatgpt browser-list \
  --repo . \
  --mode create \
  --json
```

Each summary includes:

```text
mode
status
createOutcome
```

Read complete metadata:

```bash
repo-harness chatgpt browser-session \
  --repo . \
  <session-id> \
  --metadata-only
```

Create follow-ups inherit Create mode, app selection, and secret-scan posture.
They remain linked to the source provider session.

## Step 7: Review handoff

Start a separate non-mutating Review session and provide:

- approved plan and contract;
- base commit;
- assistant-reported implementation commit;
- changed-file list;
- PR patch and metadata fetched independently from GitHub;
- GitHub Actions/status evidence;
- Creation Report;
- saved Create metadata.

Do not treat `reportedGitHub` or the assistant's Creation Report as acceptance.
The reviewer should resolve the reported repository identifiers through GitHub
and compare actual state with the contract.

## Creation Report path

When `--write-output` is omitted, Create generates a unique path:

```text
.ai/harness/handoff/chatgpt/create-<timestamp>-<branch-slug>.md
```

An explicit path can be supplied:

```bash
--write-output .ai/harness/handoff/chatgpt/create-example.md
```

Existing outputs are not overwritten unless `--overwrite-output` is given.
Browser output path policy continues to deny sensitive and source paths.

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

## Security notes

- Create always scans the exact rendered prompt and attached bytes before
  session creation or provider execution.
- The GitHub app remains the repository authority; repo-harness does not hold
  its credentials.
- Prompt guardrails cannot technically intercept the remote app's tool calls.
- A returned tool name is assistant-reported, not provider-attested telemetry.
- Never merge, deploy, resolve review threads, or rerun CI based solely on the
  Create result.

## Minimal operating sequence

```text
1. browser-consult Plan
2. approve plan and contract
3. browser-create --dry-run
4. inspect prompt, scan receipt, and mode metadata
5. browser-create real run
6. independently resolve commit/PR through GitHub
7. browser-consult Review in a new session
8. human decision
```
