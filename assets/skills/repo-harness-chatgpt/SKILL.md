---
name: repo-harness-chatgpt
description: Canonical router for Oracle browser consult, GitHub-app-backed Browser Create, continuation, advisory orchestration, MCP Connector, read-back, and delegation.
when_to_use: "repo-harness-chatgpt, ChatGPT Web, GPT Pro orchestrate, gptpro, browser-create, GitHub app Create, ChatGPT MCP Connector, ChatGPT bridge, MCP read-back, GPT Pro delegate, delegate to ChatGPT, 外包给 GPT"
---

# repo-harness-chatgpt

Canonical ChatGPT integration router. Explicit setup only; never implied by either install profile.

## Mode Selection

- Configure Oracle/browser or MCP Connector -> `references/setup.md`.
- Explicit GPT Pro orchestration -> setup lane in `references/setup.md`, then `references/orchestrate.md`.
- Start a non-mutating browser consult -> `references/consult.md`.
- GitHub-app-backed Browser Create via `repo-harness chatgpt browser-create` -> `references/create.md`.
- Continue, read, or clean browser sessions -> `references/continue.md`.
- Validate MCP invocation evidence -> `references/read-back.md`.
- Operate the MCP Connector bridge -> `references/bridge.md`.
- Delegate bounded work to GPT Pro -> `references/delegate.md`.
- Campaign Issue batch -> `references/campaign-issues.md`.

## Boundaries

- Product planning never implies this package; ChatGPT discovery requires explicit setup.
- Never handle passwords, 2FA, cookies, browser storage, or session tokens; login/captcha/SSO stops for the user.
- Modes share safety rules by reference, never secrets, auth state, or tokens.
- Consult is planning/review only. Create is the sole ChatGPT Web mode allowed to perform GitHub writes, only through `browser-create` on a dedicated branch and explicit contract. Delegate remains no-write patch text.
- Orchestrate is explicit opt-in advisory planning/review; GPT Pro never owns task, lease, writes, shell, or acceptance authority.
- Missing canonical references fail closed; do not synthesize replacements.
- Remote CDP or dev runners require explicit user authorization and a documented boundary.
