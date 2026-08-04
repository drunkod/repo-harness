# ChatGPT + GitHub App Create MVP — Research and Implementation Notes

Date: 2026-07-31
Updated: 2026-08-04

## Research inputs

- User-supplied DeepWiki session export covering the ChatGPT Browser Plan and
  Review call path.
- User-supplied full-repository DeepWiki export.
- Current `drunkod/repo-harness` branch
  `agent/chatgpt-github-create-mvp`.
- User-tested ChatGPT GitHub app action surface.
- Follow-up implementation reports comparing the Create-scoped patch with the
  shared Browser Engine architecture.
- Oracle 0.16.1 command help showing that no supported `--browser-app` option
  exists.

## Findings

1. Plan, Create, Review, Create read-back, and follow-up all use the shared
   `runBrowserConsult` Browser Engine path. They are distinguished by their
   fixed prompts, attached files, validation, and metadata—not by separate
   browser providers.
2. The original generic Browser Engine incorrectly modeled ChatGPT app
   preselection as an Oracle capability. It probed help text for
   `--browser-app`, emitted that argument when `chatgptApp` was set, reported
   `browserAppPreselect` in Browser Doctor, and could fail before launch with
   `ORACLE_APP_PRESELECT_UNSUPPORTED`.
3. Published Oracle versions, including the tested 0.16.1 binary, do not expose
   that option. `--chatgpt-url`, `--browser-tab`, model strategy, cookie path,
   heartbeat, attachments, and follow-ups do not select a connected ChatGPT
   app.
4. Commit `c2598edca63dfad3efb79f6b587d00d112e37c91` correctly fixed the
   Create-specific path: Create/read-back/follow-up stopped forwarding the app
   to Oracle, prompts changed from "selected" to "connected", and app metadata
   changed to `prompt_contract_only`.
5. The architecture still required a follow-up cleanup because generic Plan and
   Review consults retained the dead preselection surface after `c2598ed`.
6. Repo-harness must not absorb GitHub credentials or duplicate the GitHub API.
   The connected ChatGPT GitHub app remains the external capability used by the
   browser conversation.
7. Oracle returns provider output, session identifiers, and a conversation URL,
   but not independently attested app-selection or GitHub tool-call telemetry.

## Final runtime decision

Use one standard Oracle browser transport for every Browser Engine mode:

```text
Plan / Create / Review / read-back / follow-up
  -> validate mode-specific inputs
  -> build mode-specific prompt and attachments
  -> apply shared file/output/secret-scan policy
  -> runBrowserConsult
  -> buildOracleCommand using supported Oracle browser options only
  -> persist mode-specific metadata
  -> validate the mode-specific result envelope
```

There is no Oracle app-selection argument and no substitute Plan/Review option.

Create keeps `--chatgpt-app <name>` only as a required repo-harness contract
value. The value is used in:

- the fixed Create/read-back prompt;
- session `create.requestedApp` metadata;
- `appSelection.source: "prompt_contract_only"` with `verified: false`;
- structured result validation requiring the reported `selectedApp` to match.

It is never translated into an Oracle CLI flag. If the named app or its GitHub
tools are unavailable in the conversation, the fixed prompt requires ChatGPT
to stop without writing and explain the missing capability.

## Implemented Create surface

### Dedicated command

```bash
repo-harness chatgpt browser-create
```

Required arguments:

```text
--repo
--prompt
--chatgpt-app
--repository
--default-branch
--base-commit
--branch
--plan
--contract
```

The command rejects missing or unsafe repository/default/base/branch identity,
missing plan/contract files, repository escapes, default-branch writes, and
non-`agent/*` branches before provider activity.

### Typed Create identity

Browser metadata records:

```json
{
  "mode": "create",
  "create": {
    "repository": "owner/repository",
    "defaultBranch": "main",
    "baseCommit": "<full SHA>",
    "targetBranch": "agent/example",
    "planPath": "plans/plan-example.md",
    "contractPath": "tasks/contracts/example.contract.md",
    "draftPr": false,
    "requestedApp": "GitHub",
    "creationReportPath": ".ai/harness/handoff/chatgpt/create-...md",
    "outcome": "...",
    "appSelection": {
      "requestedApp": "GitHub",
      "verified": false,
      "source": "prompt_contract_only"
    }
  }
}
```

Old sessions without a mode are normalized to `consult` on read.
`browser-list --mode create` filters Create sessions and reports the Create
outcome.

### Fixed execution contract

`browser-create` builds the write boundary internally. The prompt requires
GitHub read checks before writes, an exact repository/default/base/branch,
creation of a dedicated `agent/*` branch, and adherence to the approved plan and
contract. It prohibits default-branch writes, force ref updates, unrelated
scope, merge, auto-merge, ready-for-review transitions, review-thread mutation,
and CI reruns.

### Mandatory egress scan

Create and independent read-back call the existing Browser Engine with:

```text
requireSecretScan: true
```

The exact rendered prompt and attached bytes must pass Gitleaks before session
or provider activity.

### Standard Oracle readiness

A real Create run uses the same required Oracle capability set as Plan and
Review. Browser Doctor verifies only flags repo-harness actually sends:

```text
browserEngine
writeOutput
browserFollowup
sessionFollowup
browserArchive
browserModelStrategy
browserCookiePath
browserThinkingTime
chatgptUrl
heartbeat
```

Browser Doctor no longer reports an optional `browserAppPreselect` field. No
run fails on `ORACLE_APP_PRESELECT_UNSUPPORTED`, and no generated or real Oracle
command contains `--browser-app`.

### Creation Report path

When the operator does not pass `--write-output`, Create allocates a timestamped
path under:

```text
.ai/harness/handoff/chatgpt/create-<timestamp>-<branch>.md
```

### Structured result envelope

The Create prompt requires exactly one `repo-harness-create-result` fenced JSON
block containing the reported app, repository, default branch, base commit,
branch, implementation commit, optional draft PR, changed files, and tool names.
Parsed data is stored separately from raw prose at:

```text
meta.create.reportedGitHub
```

with the explicit trust label:

```json
{
  "trust": "assistant_reported"
}
```

### Independent read-back

`browser-create-readback` / `browser-create-verify` opens a new Oracle browser
session rather than using Oracle `--followup`. It names the same expected app in
a read-only prompt, prohibits GitHub writes, requests repository/commit/compare/
PR evidence, and validates a `repo-harness-create-readback-result` envelope.
The result is stored with `assistant_reported_readback` trust and never erases
the original Create evidence.

### Result classification

Create outcomes are:

```text
dry_run
reported
surface_blocked
recoverable
provider_failed
```

Read-back outcomes are:

```text
dry_run
matched
mismatch
surface_blocked
recoverable
provider_failed
```

`surface_blocked` is used when provider output lacks one valid envelope or
reports an invalid/mismatched surface. `mismatch` is reserved for a structurally
valid read-back that disagrees with the frozen target or reported Create result.

## Full-parity cleanup completed

The follow-up change removes the obsolete generic preselection architecture:

- `oracle-provider.ts` no longer exports `supportsBrowserAppPreselect`, emits
  `--browser-app`, or returns `ORACLE_APP_PRESELECT_UNSUPPORTED`.
- `engine.ts` no longer reports `browserAppPreselect`, rejects provider app
  preselection, or inherits an app value in generic follow-ups.
- `commands/chatgpt.ts` no longer exposes `--chatgpt-app` on generic
  `browser-consult` or `browser-followup`; Create/read-back retain their
  prompt-contract app argument.
- generic Browser Engine tests now assert that help, dry-run commands, real
  Oracle invocations, follow-ups, and doctor JSON contain no app-preselection
  surface.
- Create tests retain the app in the prompt/result contract while asserting no
  Oracle command contains `--browser-app`.
- the Browser Engine guide and canonical consult reference describe one standard
  Oracle transport and prompt-contract-only Create app selection.

## Runtime test coverage

Execution-focused tests reuse the existing fake Oracle/Gitleaks patterns and
cover:

- generic consult/follow-up help without `--chatgpt-app`;
- dry-run and real Oracle argv without `--browser-app`;
- Browser Doctor without `optionalCapabilities.browserAppPreselect`;
- Create/read-back/follow-up operation with an Oracle binary that advertises no
  app-preselection capability;
- connected-app prompt wording and no-write stop clause;
- `prompt_contract_only` metadata;
- strict repository/default/base/branch validation;
- mandatory secret scanning;
- `mode=create` persistence and Create-only listing;
- Creation Report output-path policy;
- parsed assistant-reported GitHub identifiers;
- no-PR and requested-draft-PR result contracts;
- malformed result classification as `surface_blocked`;
- read-back match/mismatch classification;
- mode-aware follow-up and cleanup behavior.

## Safety model

- no direct writes to a default/base branch in the declared Create scope;
- no force ref updates in the fixed prompt contract;
- no implicit repository selection;
- app name is explicit but prompt-contract-only and unverified;
- no scope beyond the approved contract;
- draft PR only when requested;
- no merge, auto-merge, ready-for-review transition, review-thread mutation,
  or CI rerun without separate authorization;
- raw assistant prose is not repository evidence;
- parsed identifiers are explicitly assistant-reported;
- Create cannot review or accept its own work.

## Known boundary

Repo-harness cannot currently intercept the connected GitHub app's remote tool
calls or prove the visible ChatGPT app selection. The MVP enforces local
preconditions, prompt policy, secret scanning, and result structure, but does
not claim provider-attested GitHub telemetry.

Independent read-back and final Review must resolve the reported commit and pull
request through GitHub and compare actual state with the plan and contract.

## Deferred beyond MVP

- Oracle/provider export of structured ChatGPT app-selection evidence;
- provider-attested GitHub tool-call events in `events.jsonl`;
- independent GitHub identifier verification inside repo-harness without
  adding a credential boundary;
- MCP exposure of `browser-create`;
- automatic CI polling or repair loops;
- automatic review acceptance, merge, or deployment.
