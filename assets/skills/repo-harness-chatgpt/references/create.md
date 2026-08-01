# Create Mode: ChatGPT Web + GitHub App

Create is the first-class mutating ChatGPT Browser mode. It opens ChatGPT Web
through Oracle, requests the named GitHub app, attaches the approved plan and
task contract, and asks ChatGPT to perform bounded GitHub writes.

Use the dedicated command:

```bash
repo-harness chatgpt browser-create
```

Do not emulate Create with a hand-written `browser-consult` prompt. Plan and
Review remain non-mutating consult sessions; Create has typed metadata,
preconditions, mandatory egress scanning, and result classification.

## Required inputs

Create requires all of these:

- `--repo <path>`: local adopted repository root and session store;
- `--chatgpt-app <name>`: exact installed ChatGPT app name;
- `--base <ref>`: exact base ref or commit;
- `--branch <name>`: dedicated non-default branch;
- `--plan <path>`: repo-relative approved plan;
- `--contract <path>`: repo-relative approved task contract;
- `--prompt <text>`: bounded implementation request.

The plan and contract must exist before any provider activity. The target
branch must differ from the base and cannot be `main` or `master`.

## Dry run

Create always requires the normal fail-closed Gitleaks scan. Dry-run builds and
scans the exact prompt bundle, records a `mode=create` session, and shows the
Oracle command without opening a browser.

```bash
repo-harness chatgpt browser-create \
  --repo . \
  --chatgpt-app GitHub \
  --base main \
  --branch agent/example-change \
  --plan plans/plan-example-change.md \
  --contract tasks/contracts/example-change.contract.md \
  --prompt "Implement the approved contract." \
  --gitleaks-bin /absolute/path/to/gitleaks \
  --dry-run
```

Inspect:

- `prompt.md`;
- the attached-file manifest;
- `dryRun.command`, including `--browser-app <name>`;
- the secret-scan receipt;
- `meta.json`, including `mode: "create"` and the Create context.

A dry run does not prove that the installed Oracle can find the app in the
live ChatGPT interface. The real command probes the Oracle binary for
`--browser-app` support before browser launch.

## Real run

```bash
repo-harness chatgpt browser-create \
  --repo . \
  --chatgpt-app GitHub \
  --base main \
  --branch agent/example-change \
  --plan plans/plan-example-change.md \
  --contract tasks/contracts/example-change.contract.md \
  --prompt "Implement the approved contract." \
  --draft-pr
```

Optional flags include additional `--file` inputs, model/thinking selection,
Oracle and Gitleaks binary overrides, timeouts, heartbeat, and an explicit
`--write-output` Creation Report path.

When no output path is supplied, Create allocates a timestamped path under:

```text
.ai/harness/handoff/chatgpt/create-<timestamp>-<branch>.md
```

## Fixed execution boundary

`browser-create` builds this boundary internally; the operator does not need to
remember or paste it:

- the approved task contract is authoritative;
- read before writing;
- create and work only on the dedicated branch from the exact base;
- do not modify the plan or contract;
- do not write to the default branch;
- do not force-update refs;
- do not add unrelated cleanup, dependencies, fallbacks, or refactors;
- do not merge, enable auto-merge, mark a PR ready, resolve review threads, or
  rerun CI;
- do not claim checks ran without direct evidence.

These are still instructions to the remote ChatGPT app. Repo-harness does not
intercept GitHub tool calls, so human and Review verification remain required.

## Structured result envelope

Create requires the assistant response to end with exactly one fenced JSON
block named `repo-harness-create-result`:

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
  "toolEvents": ["create_branch", "create_commit", "update_ref"]
}
```

Use `null` for `pullRequest` when no PR was requested.

Repo-harness parses this envelope into `meta.create.reportedGitHub`, separate
from the raw assistant output. The evidence is explicitly marked:

```json
{
  "trust": "assistant_reported"
}
```

It is not independent proof that the GitHub app was selected or that the tool
calls occurred. `appSelection.verified` remains `false` until a future provider
can export structured ChatGPT tool telemetry.

## Outcomes

A Create session records one of these outcomes:

- `dry_run`: prompt, inputs, app request, and scan receipt were recorded;
- `reported`: one valid result envelope matched the requested branch and
  contained at least one GitHub write action;
- `surface_blocked`: Oracle completed, but the response lacked usable evidence,
  reported the wrong branch/app, or contained no write action;
- `recoverable`: provider capture may be incomplete; continue the same session;
- `provider_failed`: provider execution failed before a usable result.

`surface_blocked` is also a browser session status, so it is visible in
`browser-list`, `browser-session --metadata-only`, and cleanup status filters.

List only Create sessions:

```bash
repo-harness chatgpt browser-list --repo . --mode create --json
```

## Fail-closed behavior

Create stops before browser launch when:

- a required input is missing;
- the plan or contract does not exist or escapes the repository;
- the target is a default/base branch;
- Oracle is unavailable;
- Oracle does not advertise `--browser-app`;
- the exact prompt bundle fails secret scanning;
- the output target is denied or already exists.

If the provider returns `ORACLE_CAPTURE_INCOMPLETE`, inspect GitHub state before
retrying because writes may already have happened. Continue the saved provider
session instead of submitting the Create request again from zero.

## Review handoff

Create never reviews or accepts its own work. Give a new Review session:

- approved plan and contract;
- base and implementation commits;
- changed-file list and PR patch;
- CI/status evidence;
- Creation Report;
- `meta.create.reportedGitHub`, with its assistant-reported trust label.

A human remains the authority for comments, thread resolution, ready-for-review,
merge, deployment, and rollback decisions.
