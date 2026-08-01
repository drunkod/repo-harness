---
name: repo-harness-chatgpt
description: Canonical router for Oracle browser consult, GitHub-app-backed Browser Create, continuation, MCP Connector, read-back, and delegation.
when_to_use: "repo-harness-chatgpt, ChatGPT Web, GPT Pro, browser-create, GitHub app Create, ChatGPT MCP, delegate to ChatGPT"
---

# repo-harness-chatgpt

Canonical ChatGPT integration router. Explicit setup only; never implied by either install profile.

## Mode Selection

- Configure Oracle/browser or MCP Connector -> `references/setup.md`.
- Start a non-mutating browser consult -> `references/consult.md`.
- Run first-class GitHub-app-backed Browser Create with `repo-harness chatgpt browser-create` -> `references/create.md`.
- Continue, read, or clean browser sessions -> `references/continue.md`.
- Validate MCP invocation evidence -> `references/read-back.md`.
- Operate the MCP Connector bridge -> `references/bridge.md`.
- Delegate bounded work to GPT Pro -> `references/delegate.md`.

## Boundaries

- Never handle passwords, 2FA, cookies, browser storage, or session tokens; login/captcha/SSO stops for the user.
- Consult is planning/review only. Create is the sole ChatGPT Web mode allowed to perform GitHub writes, only through `browser-create` on a dedicated branch and explicit contract. Delegate remains no-write patch text.
- Missing canonical references fail closed; do not synthesize replacements.
- Remote CDP or dev runners require explicit user authorization and a documented boundary.
