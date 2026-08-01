# ChatGPT + GitHub App Create MVP — Research Notes

Date: 2026-07-31

## Research inputs

- User-supplied DeepWiki session export covering the ChatGPT Browser Plan and
  Review call path.
- User-supplied full-repository DeepWiki export.
- Current `drunkod/repo-harness` `main` at `01c821d121577c461aea4fc9373ad5090ec3bdda`
  (`repo-harness` 0.12.0).
- User-tested ChatGPT GitHub app action surface.

## Findings

1. “ChatGPT Browser Plan” and “ChatGPT Browser Review” are not separate engine
   implementations. They are two prompt-level uses of
   `repo-harness chatgpt browser-consult`.
2. The browser engine already supports `--chatgpt-app <name>`. App
   preselection is Oracle-only and fails closed on unsupported providers.
3. The canonical `repo-harness-chatgpt` skill is the existing explicit-setup
   integration package and routes behavior through `references/*.md` mode
   files.
4. The tested GitHub app can create branches, create/update files, build
   blob/tree/commit sequences, update refs, and open pull requests.
5. repo-harness should not absorb GitHub credentials or duplicate the GitHub
   API implementation merely to describe this workflow.
6. `--secret-scan` is implemented on the current branch across the ChatGPT
   command, Browser Engine types/dispatch, and browser tests; analysis based
   on an older indexed source snapshot must not remove the live gate.
7. App-name forwarding is intentionally generic. `GitHub` is an example, not
   a universal workspace name, so Create must stop when the requested app is
   not visibly selected.

## MVP decision

Implement Create as a new canonical mode of `repo-harness-chatgpt`:

```text
browser-consult
  + --chatgpt-app GitHub
  + approved plan/task contract
  + dedicated branch
  + GitHub write protocol
  + Creation Report
  + separate Review session
```

The MVP therefore adds:

- `assets/skills/repo-harness-chatgpt/references/create.md`;
- router discovery and boundaries in the canonical ChatGPT skill;
- inclusion in the canonical closed reference set;
- a published operator guide;
- contract tests for app selection and write safety.

## Safety model

- no direct writes to the default branch;
- no force ref updates;
- no implicit repository or app-name selection;
- no scope beyond the approved contract;
- draft PR only when requested;
- no merge, auto-merge, ready-for-review transition, review-thread mutation,
  or CI rerun without separate authorization;
- tool events and returned GitHub identifiers are evidence; prose is not;
- Create cannot review or accept its own work.

## Deferred beyond MVP

- a dedicated `repo-harness chatgpt github-create` CLI alias;
- structured import of GitHub tool-call results into session metadata;
- MCP tool exposure;
- a repo-harness-owned GitHub API client;
- automatic CI polling or correction loops;
- automatic merge or deployment.
