# ChatGPT GitHub Create hardening

Date: 2026-08-02
Branch: `agent/chatgpt-github-create-mvp`

This follow-up implements the five findings from the Create review.

## 1. Explicit repository binding

`browser-create` now requires `--repository owner/name`. The value is stored in
`meta.create`, embedded in the fixed prompt and result schema, and compared
case-insensitively with the Create result. A local `--repo` path is never used
as a substitute for remote identity.

## 2. Actual default-branch protection

`browser-create` now requires `--default-branch`. The target must differ and
must use `agent/*`. The ChatGPT GitHub app is instructed to fetch repository
metadata and confirm the actual default branch before any write. The result and
new-session read-back must report the same branch.

## 3. Exact base verification

The moving `--base <ref>` input is replaced by `--base-commit <40-character
SHA>`. The GitHub app must fetch that exact commit before writing, create the
target branch from it, and report the same SHA. A different base or a result
commit equal to the base fails closed.

## 4. Separate GitHub read-back

`browser-create-readback` (`browser-create-verify` alias) opens a new
ChatGPT/Oracle browser session with the same GitHub app. It prohibits writes
and requests repository metadata, base and implementation commits, branch head,
comparison, changed files, and PR state.

The result is compared with the frozen Create context and stored separately as
`meta.create.readBack`. It never replaces `meta.create.reportedGitHub`.

Trust remains explicit:

- Create: `assistant_reported`
- read-back: `assistant_reported_readback`

Oracle still does not expose provider-attested ChatGPT tool telemetry, so final
human Review remains required.

## 5. Live integration acceptance

`tests/live/chatgpt-browser-create.live.test.ts` is skipped by default. With
`REPO_HARNESS_LIVE_CHATGPT_CREATE=1` and explicit repository/base/branch/
plan/contract/file variables, it performs a bounded browser Create, draft PR,
and independent new-session read-back.

The test intentionally leaves the branch and draft PR for inspection. It never
merges or deletes remote state.
