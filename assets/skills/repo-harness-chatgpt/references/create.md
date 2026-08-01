# Create Mode: ChatGPT Web + GitHub App

Create mode is the repo-harness protocol for an authenticated ChatGPT Web
session that uses the selected GitHub app to make repository changes. It is a
distinct mode from `consult.md`: consult remains non-mutating
planning/review/critique, while Create may perform bounded GitHub writes.

This is an environment-dependent integration. The repo-harness browser engine
selects the app and records the browser session; the GitHub app supplies the
actual repository read/write tools. If the selected app is unavailable, is
named differently, or does not expose the required write actions for the
target repository, fail closed.

## Identity

- Transport: the existing Oracle-backed
  `repo-harness chatgpt browser-consult` engine.
- App: the ChatGPT GitHub app selected with `--chatgpt-app GitHub` (or the
  exact installed app name supplied by the user).
- Authority: the approved plan and task contract in the repository.
- Output: a managed Browser Engine session plus a Creation Report.
- Acceptance: a separate Review session and a human decision.
- Not a new provider: Create reuses the browser engine and does not add a
  GitHub credential, token store, or direct GitHub client to repo-harness.

## Required Inputs

Resolve these before any write:

- exact `owner/repository`;
- exact base ref and base commit;
- a dedicated target branch;
- approved plan path;
- approved task-contract path;
- allowed and forbidden paths;
- required checks;
- the exact installed ChatGPT app name;
- whether a draft PR is requested.

Missing or ambiguous scope is a blocker, not permission to infer a repository,
guess an app name, or widen the task.

## Protocol

1. Verify Browser Engine readiness:
   `repo-harness chatgpt browser-doctor --repo <repo> --provider oracle --json`.
2. Confirm the exact installed ChatGPT app name before the real run. The
   examples use `GitHub`; if the workspace uses another name, pass that exact
   value to `--chatgpt-app`.
3. Dry-run the exact Create bundle first. Attach only approved workflow
   artifacts and require the normal content-level egress gate:

   ```bash
   repo-harness chatgpt browser-consult \
     --repo <repo> \
     --provider oracle \
     --chatgpt-app GitHub \
     --secret-scan \
     --dry-run \
     --prompt "<bounded Create prompt>" \
     --file AGENTS.md \
     --file plans/plan-<task>.md \
     --file tasks/contracts/<task>.contract.md
   ```

4. Inspect the saved `prompt.md`, file manifest, app preselection, and secret
   scan receipt. Do not add unscanned context after the dry run.
5. Run the real Create session with the same bundle and a timestamped,
   non-reused output path:

   ```bash
   stamp="$(date -u +%Y%m%dT%H%M%SZ)"
   repo-harness chatgpt browser-consult \
     --repo <repo> \
     --provider oracle \
     --chatgpt-app GitHub \
     --secret-scan \
     --model gpt-5.5-pro \
     --heartbeat 59 \
     --prompt "<bounded Create prompt>" \
     --file AGENTS.md \
     --file plans/plan-<task>.md \
     --file tasks/contracts/<task>.contract.md \
     --write-output ".ai/harness/handoff/chatgpt/create-${stamp}-<task>.md"
   ```

6. In ChatGPT, verify that the intended app is visibly selected, then resolve
   the repository and base commit through GitHub reads before requesting a
   write. Read `AGENTS.md`, the approved plan, the task contract, and every
   existing file that may be changed.
7. Return a pre-write summary containing the exact repository, base commit,
   target branch, and proposed file list. If any item differs from the
   contract, stop.
8. Create the dedicated branch from the exact recorded base commit. Never
   write directly to the default branch.
9. For an existing file, refetch its current blob/content SHA immediately
   before updating it. A stale-SHA conflict requires a fresh read and a new
   decision; never force the previous replacement.
10. Use the narrowest write path:
    - one simple file: create/update the file on the dedicated branch;
    - related multi-file change: create blobs, one tree, one commit, then
      fast-forward the branch ref.
11. Keep every changed path inside the task contract. Deletions, dependency
    changes, lockfile changes, workflow changes, and generated-file updates
    require explicit contract coverage.
12. Open a **draft** pull request only when requested. Do not mark it ready,
    enable auto-merge, merge it, resolve review threads, or rerun CI unless
    the user separately authorizes that exact write.
13. Return a Creation Report containing:
    - repository;
    - base ref and base commit;
    - branch;
    - commit SHA;
    - files created/updated/deleted;
    - draft PR number/URL when created;
    - checks actually observed;
    - checks not run or not available;
    - residual risks;
    - actions intentionally not performed.
14. Trust the Browser Engine managed `--write-output` and session metadata as
    the transport record. GitHub commit/PR identifiers are the repository
    record. Neither alone is acceptance.
15. Hand the frozen plan, contract, commit/PR patch, changed-file list, and CI
    evidence to a new Review session. The Create conversation does not review
    or approve its own work.

## Create Prompt Contract

The prompt must include this execution boundary:

```text
The approved task contract is authoritative.
Use the selected GitHub app.
Read before writing.
Work only on the dedicated branch and only inside allowed paths.
Do not modify the plan or contract.
Do not add unrelated cleanup, dependencies, fallbacks, or refactors.
Do not merge, enable auto-merge, mark the PR ready, resolve review threads,
or claim checks ran without direct evidence.
Return the exact branch, commit, changed files, draft PR, and unverified risks.
```

## Write Safety

- Every GitHub write is an external side effect and must target the exact
  repository and dedicated branch named in the approved scope.
- Never force-update a ref.
- Never write to a default branch.
- Never reuse a prior task's branch without explicit approval.
- Never treat repository visibility as write authorization.
- Never send secrets, browser state, cookies, tokens, or credentials through
  the prompt bundle or GitHub files.
- Never interpret app-generated prose as proof of a tool call. Require a real
  GitHub tool event and returned repository identifier.
- Never claim tests ran merely because a commit or PR exists. Use GitHub
  Actions/status evidence or say that verification is unavailable.
- The Create result is always subject to independent Review and human
  acceptance.

## Failure Modes

- `ORACLE_APP_PRESELECT_UNSUPPORTED`: the Oracle binary cannot select a
  ChatGPT app. Upgrade/fix Oracle or select the app manually; do not pretend
  prompt text selected it.
- Selected app name unavailable or mismatched: if the requested app is not
  visibly selected in ChatGPT, stop before repository access. Correct the
  exact installed app name or select it manually; do not assume `GitHub` is
  universal.
- No visible GitHub tool event: classify the run as `surface_blocked`; no
  repository write is proven.
- Repository or permission mismatch: stop before branch creation.
- Base ref moved after the contract baseline: stop and request a rebase or
  explicit baseline update.
- Target branch already exists: inspect it; do not overwrite or repoint it.
- Stale file SHA or non-fast-forward ref: refetch and stop for a new decision;
  never force.
- `ORACLE_CAPTURE_INCOMPLETE`: the GitHub writes may already have occurred.
  Inspect the saved session and GitHub state, then continue the same provider
  session through `continue.md`; do not submit the Create request again from
  zero.
- Secret/path-policy failure: preserve the failed dry-run evidence and do not
  start the real session.

## Boundaries

- Create does not add a GitHub API implementation to repo-harness.
- Create does not store GitHub credentials.
- Create does not replace `repo-harness-ship`; it is a browser-mediated,
  GitHub-app write protocol for the explicitly selected repository.
- Create does not grant permission to merge, deploy, resolve review threads,
  or rerun CI.
- Create does not turn consult mode into an executor.
- Delegate mode remains the no-write patch-text path; Create is the distinct
  GitHub-write path.
