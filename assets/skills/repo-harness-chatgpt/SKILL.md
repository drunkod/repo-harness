---
name: repo-harness-chatgpt
description: Canonical rule owner for repo-harness ChatGPT integration -- Oracle-first browser/GPT Pro consult and continuation, first-class GitHub-app-backed Browser Create, MCP Connector setup, MCP bridge planning handoff, and Connector invocation read-back evidence.
when_to_use: "repo-harness-chatgpt, ChatGPT Web consult, GPT Pro consult, gptpro, browser GPT, ChatGPT GitHub Create, browser-create, GitHub app Create, ChatGPT MCP Connector, ChatGPT bridge, MCP read-back, GPT Pro delegate, delegate to ChatGPT, 外包给 GPT"
---

# repo-harness-chatgpt

Canonical rule owner for every repo-harness ChatGPT integration surface: Oracle
browser consult, first-class GitHub-app-backed Browser Create, session
continuation, MCP Connector/bridge setup and operation, and MCP invocation
read-back evidence. Discoverable only after explicit ChatGPT setup; never
implied by either install profile. Router-only: mode protocol lives in the
linked files below.

## Mode Selection

- First-time Oracle browser or MCP Connector configuration -> `references/setup.md`.
- Start a new local -> ChatGPT Web browser consult -> `references/consult.md`.
- Run `repo-harness chatgpt browser-create` for bounded GitHub writes -> `references/create.md`.
- Continue, read, or clean up a saved browser session -> `references/continue.md`.
- Verify or accept a ChatGPT MCP tool call as real evidence -> `references/read-back.md`.
- Operate the MCP Connector bridge (planner/executor/orchestrator/coding) -> `references/bridge.md`.
- Delegate a self-contained task to GPT Pro and independently accept the result -> `references/delegate.md`.

## Boundaries

- Product planning never implies this package; ChatGPT discovery requires explicit setup.
- Never request or handle ChatGPT passwords, 2FA codes, cookies, browser storage, or session tokens; login/captcha/SSO stop and hand back to the user.
- Setup, consult, Create, and bridge modes share these safety rules by reference; none shares secrets, auth state, or tokens with another mode.
- Consult stays planning/review/critique only. Create is the sole ChatGPT Web mode allowed to perform GitHub writes, and only through `browser-create` on a dedicated branch with explicit scope; delegate remains the no-write patch-text path.
- A missing or unreadable canonical mode file fails the calling workflow closed; it never synthesizes replacement prose.
- Do not enable remote CDP or an orchestrator dev runner unless the user explicitly asks and the boundary is documented.
