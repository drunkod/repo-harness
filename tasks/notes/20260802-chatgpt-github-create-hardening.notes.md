# ChatGPT GitHub Create hardening

Date: 2026-08-02
Branch: `agent/chatgpt-github-create-mvp`

This follow-up implements and reconciles the five findings from the Create
review against the actual branch source.

## 1. Explicit repository binding

`browser-create` requires `--repository owner/name`. The value is stored in
`meta.create`, embedded in the fixed prompt and result schema, and compared
case-insensitively with the Create result. A local `--repo` path is never used
as a substitute for remote identity.

## 2. Actual default-branch protection

`browser-create` requires `--default-branch`. The target must differ and must
use `agent/*`. The ChatGPT GitHub app is instructed to fetch repository metadata
and confirm the actual default branch before any write. The Create result and
new-session read-back must report the same branch.

## 3. Exact base verification

The moving `--base <ref>` input is replaced by `--base-commit <40-character
SHA>`. The GitHub app is instructed to fetch that exact commit before writing,
create the target branch from it, and report the same SHA. A different reported
base or an implementation commit equal to the base fails closed.

## 4. Separate GitHub read-back

`browser-create-readback` (`browser-create-verify` alias) opens a new
ChatGPT/Oracle browser session with the same GitHub app. It prohibits writes and
requests repository metadata, base and implementation commits, branch head,
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
`REPO_HARNESS_LIVE_CHATGPT_CREATE=1` and explicit repository/default/base/
branch/plan/contract/file values, it performs a bounded browser Create, draft
PR, and independent new-session read-back.

The test now verifies that:

- `createSessionId` equals the source Create session;
- `readBackSessionId` is different;
- `meta.create.readBack.sessionId` points at the new session;
- branch head, implementation commit, changed files, comparison, and draft-PR
  identity agree with the Create result.

The test intentionally leaves the branch and draft PR for inspection. It never
merges or deletes remote state.

## Report-specific source verification

The report identified two fields that needed direct source confirmation. Both
are present in the branch runtime:

1. `browser-create-readback` returns `readBackSessionId` on dry-run, matched,
   recoverable/provider-failed, mismatch, and surface-blocked paths.
2. `create-mode.ts` contains the documented codes
   `CREATE_READBACK_RESULT_REQUIRED`, `CREATE_READBACK_MISMATCH`, and
   `CREATE_READBACK_SURFACE_BLOCKED`.

`tests/skill-surface/chatgpt-create-mode.test.ts` now locks those names and the
read-back return field against documentation drift.

## Canonical documentation form

- `assets/skills/repo-harness-chatgpt/references/create.md` is the single
  agent-facing Create protocol home.
- `tests/skill-surface/chatgpt-package.test.ts` declares `create.md` in the
  closed reference set.
- `SKILL.md` remains a routing-only package under the shared 2048-byte limit.
- `docs/repo-harness-chatgpt-github-create.md` is explicitly published by
  `package.json` and delegates transport/setup details to the canonical Browser
  Engine guide.
- Published examples use neutral `owner/repository` and synthetic SHA values,
  not a fork-specific repository or a moving real branch commit.
- The guide records the complete Create/read-back failure taxonomy found in the
  runtime and preserves the `assistant_reported` trust boundary.
- No artificial provenance line was added to the genuinely new Create
  reference; migrated references keep their existing reconciliation notes.

## Reused test surfaces

The implementation reuses or extends these existing test families:

- `tests/cli/chatgpt-browser.test.ts`: fake Oracle invocation, app selection,
  file/output policy, and session lifecycle patterns;
- `tests/cli/chatgpt-browser-create.test.ts`: strict target, result, PR, and
  independent read-back behavior;
- `tests/skill-surface/chatgpt-package.test.ts`: closed reference set, router
  reachability, and byte budget;
- `tests/skill-surface/retired-names-scan.test.ts`: repository-wide retired-name
  guard;
- `tests/skill-surface/chatgpt-create-mode.test.ts`: Create-specific source/doc
  contract;
- `tests/live/chatgpt-browser-create.live.test.ts`: opt-in real browser/app
  acceptance.

`tests/cli/mcp-tools.test.ts` remains the reusable pattern only if Create or
Create read-back is later exposed as an MCP tool. This MVP does not add that
surface.

## Verification boundary

The branch was reviewed through the connected GitHub source and API. No local
Bun test suite, TypeScript check, or authenticated live browser run was executed
as part of this reconciliation. Those remain required before acceptance; the
live test additionally requires deliberate remote branch and draft-PR inputs.
