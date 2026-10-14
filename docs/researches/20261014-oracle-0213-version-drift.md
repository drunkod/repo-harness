# Oracle 0.21.3 / Repo Harness 0.22.1 compatibility repair

Date: 2026-10-14. Worktree: `fix/oracle-0213-v0221`, based on fork `origin/main` at `4d49c0364`.

## Root cause

The active macOS Nix Repo Harness CLI is 0.22.1, pinned at `9ff9161c`; Homebrew's `oracle` executable is 0.21.3. The 0.22.1 provider still requires Oracle 0.20.0 and four fork-only flags. A real `browser-doctor --provider oracle --json` therefore reports `ORACLE_VERSION_UNSUPPORTED`; the 0.21.3 binary also lacks those flags. Installing official upstream Oracle 0.20.0 would not supply the fork-only flags and is not a sufficient repair.

## CodeGraph trace

CodeGraph of the new worktree indexed 1,453 files, 22,242 nodes, and 103,899 edges. `resolveOracleBin` and `validateOracleVersion` are used by `browserDoctor` and `runOracleProvider`; provider calls flow through `runBrowserConsult`, `runBrowserFollowup`, `runBrowserCreate`, read-back, and MCP tools. Relevant test surfaces are `chatgpt-browser.test.ts`, `chatgpt-browser-create.test.ts`, and `chatgpt-browser-create-readback.test.ts`.

## Repair and boundaries

Rebased the previously developed upstream 0.21.3 compatibility adapter (`ecc230a69`) onto 0.22.1 without replacing the source's newer Create code. Use Oracle's `--slug` and `--browser-capture-provider-native` instead of retired fork flags. Require exact Oracle 0.21.3 and verify the required capabilities before opening a browser. A timeout only admits continuation when invocation-owned metadata proves the prompt was submitted and the parent is correct; otherwise fail closed. Historical metadata and raw capture are not a verified GitHub revision receipt or backend model identity. Explicit unsupported thinking control and legacy network-stream requirements fail closed.

## Verification

Real read-only browser-doctor on `/opt/homebrew/bin/oracle` 0.21.3: `status=ready`, `requiredVersion=0.21.3`, `missingCapabilities=[]`. `bun run check:type` and helpers/hooks/reference/state projection checks passed. Isolated tests: Browser Engine 75/75, Create 13/13, Create read-back 3/3. No ChatGPT prompt, browser login, or GitHub app write was attempted. CI and Nix deployment remain separate gates.
