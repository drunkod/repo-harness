# ChatGPT + GitHub App Create MVP — Research and Implementation Notes

Date: 2026-07-31
Updated: 2026-08-01

## Research inputs

- User-supplied DeepWiki session export covering the ChatGPT Browser Plan and
  Review call path.
- User-supplied full-repository DeepWiki export.
- Current `drunkod/repo-harness` `main` at
  `01c821d121577c461aea4fc9373ad5090ec3bdda` (`repo-harness` 0.12.0).
- User-tested ChatGPT GitHub app action surface.
- Follow-up implementation report identifying the gap between a skill-level
  Create protocol and a first-class runtime entity.

## Findings

1. “ChatGPT Browser Plan” and “ChatGPT Browser Review” are prompt-level uses of
   the shared `repo-harness chatgpt browser-consult` engine rather than
   independent browser providers.
2. The browser engine already forwards `--chatgpt-app <name>` to Oracle as
   `--browser-app <name>` and fails closed when the resolved Oracle binary does
   not advertise that flag.
3. Browser Doctor already exposes app-preselection support under
   `oracle.optionalCapabilities.browserAppPreselect`, but general readiness
   does not make that optional capability mandatory.
4. The canonical `repo-harness-chatgpt` skill is the existing explicit-setup
   integration package and routes behavior through `references/*.md`.
5. The tested GitHub app can perform repository reads and writes, including
   branch, file, blob/tree/commit, ref, pull-request, review, and Actions
   operations.
6. Repo-harness should not absorb GitHub credentials or duplicate the GitHub
   API implementation.
7. Oracle currently returns provider output, session identifiers, and the
   conversation URL, but not an independently attested stream of ChatGPT app
   selection or GitHub tool-call events.

## Runtime decision

Create is implemented as a thin, first-class runtime wrapper over the existing
Browser Engine:

```text
repo-harness chatgpt browser-create
  -> validate Create inputs
  -> build fixed bounded prompt
  -> require exact-bundle secret scan
  -> require Oracle app-preselection support
  -> runBrowserConsult
  -> persist mode=create metadata
  -> parse the Create result envelope
  -> classify reported or surface_blocked
```

No second browser provider or duplicated session engine was introduced.

## Implemented MVP

### Dedicated command

Added:

```bash
repo-harness chatgpt browser-create
```

Required arguments:

```text
--repo
--prompt
--chatgpt-app
--base
--branch
--plan
--contract
```

The command rejects missing plan/contract files, repository escapes, default
branches, and branch/base equality before provider activity.

### Typed Create identity

Browser metadata now records:

```json
{
  "mode": "create",
  "create": {
    "baseRef": "...",
    "targetBranch": "...",
    "planPath": "...",
    "contractPath": "...",
    "draftPr": false,
    "requestedApp": "GitHub",
    "creationReportPath": "...",
    "outcome": "..."
  }
}
```

Old sessions without a mode are normalized to `consult` on read.
`browser-list --mode create` filters Create sessions and reports the Create
outcome.

### Fixed execution contract

`browser-create` builds the write boundary internally. It does not rely on the
operator copying a safety prompt from documentation.

The prompt requires a dedicated branch, prohibits default-branch and force-ref
writes, prohibits unrelated scope, and excludes merge, auto-merge,
ready-for-review, review-thread, and CI-rerun actions.

### Mandatory egress scan

Create calls the existing Browser Engine with:

```text
requireSecretScan: true
```

The exact rendered prompt and attached bytes must pass Gitleaks before session
or provider activity.

### Oracle readiness

A real Create run resolves and probes Oracle before browser launch. Missing
`--browser-app` support fails with:

```text
ORACLE_APP_PRESELECT_UNSUPPORTED
```

Dry-run remains possible without a live Oracle probe and exposes the generated
Oracle command for inspection.

### Creation Report path

When the operator does not pass `--write-output`, Create allocates a timestamped
path under:

```text
.ai/harness/handoff/chatgpt/create-<timestamp>-<branch>.md
```

### Structured result envelope

The Create prompt requires exactly one `repo-harness-create-result` fenced JSON
block containing the reported app, repository, base commit, branch, commit,
optional draft PR, changed files, and tool names.

Parsed data is stored separately from raw assistant prose at:

```text
meta.create.reportedGitHub
```

with the explicit trust label:

```json
{
  "trust": "assistant_reported"
}
```

App selection remains `verified: false` and records
`source: "oracle_request_only"`.

### Result classification

Create outcomes are:

```text
dry_run
reported
surface_blocked
recoverable
provider_failed
```

`surface_blocked` is also a browser session status. It is used when Oracle
completed but the output lacked a single valid result envelope, reported the
wrong branch/app, or reported no GitHub write action.

### Runtime tests

Added execution-focused tests with fake Oracle and Gitleaks binaries covering:

- command help and required flags;
- default-branch rejection;
- missing plan rejection;
- mandatory secret scanning;
- generated `--browser-app` command;
- `mode=create` persistence;
- Create-only browser listing;
- unsupported Oracle failure before browser launch;
- parsed assistant-reported GitHub identifiers;
- missing evidence classification as `surface_blocked`;
- reported branch mismatch classification.

## Safety model

- no direct writes to a default/base branch in the declared Create scope;
- no force ref updates in the fixed prompt contract;
- no implicit repository or app-name selection;
- no scope beyond the approved contract;
- draft PR only when requested;
- no merge, auto-merge, ready-for-review transition, review-thread mutation,
  or CI rerun without separate authorization;
- raw assistant prose is not repository evidence;
- parsed identifiers are explicitly assistant-reported;
- Create cannot review or accept its own work.

## Known boundary

Repo-harness cannot currently intercept the GitHub app's remote tool calls or
prove the visible ChatGPT app selection. The MVP therefore enforces local
preconditions and output structure, but does not claim provider-attested GitHub
telemetry.

Independent Review should resolve the reported commit and pull request through
GitHub and compare actual state with the plan and contract.

## Deferred beyond MVP

- Oracle/provider export of structured ChatGPT app-selection evidence;
- provider-attested GitHub tool-call events in `events.jsonl`;
- independent GitHub identifier verification inside repo-harness without
  adding a credential boundary;
- MCP exposure of `browser-create`;
- automatic CI polling or repair loops;
- automatic review acceptance, merge, or deployment.
