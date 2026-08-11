# ChatGPT coding MCP testing with Cloudflare Quick Tunnel

This tutorial is the default test path for exposing the repo-harness `coding`
profile to ChatGPT.

It deliberately does **not** require a Cloudflare account, a custom domain, DNS
changes, or a pre-created named tunnel. The default public endpoint is a
Cloudflare Quick Tunnel under `*.trycloudflare.com`.

Use a named Cloudflare tunnel with your own hostname only when you explicitly
want a stable long-lived endpoint. That optional path is documented at the end.

The test architecture is:

```text
ChatGPT
  -> OAuth HTTPS /mcp
    -> https://<random>.trycloudflare.com/mcp
      -> cloudflared Quick Tunnel
        -> http://127.0.0.1:8765
          -> repo-harness MCP coding profile
            -> explicitly granted adopted repository
              -> managed Git worktree
```

The coding profile is intentionally high authority. `exec_command` runs with
the authority of the local OS user and is not a filesystem sandbox. Keep the
MCP server bound to loopback and keep ChatGPT confirmations enabled for writes
and shell execution.

## 1. Prerequisites

You need:

- `repo-harness` on `PATH`;
- `cloudflared`;
- Git;
- `jq`;
- an adopted target repository;
- ChatGPT Developer mode with permission to create a custom MCP app.

Set the local values:

```bash
export REPO="$HOME/Projects/my-repo"
export MCP_HOST="127.0.0.1"
export MCP_PORT="8765"
export MCP_NAME="repo-harness-coding"
export LOCAL_ORIGIN="http://${MCP_HOST}:${MCP_PORT}"
```

Do **not** set a public hostname yet. Quick Tunnel creates it for you.

Check the repository:

```bash
repo-harness --version
command -v repo-harness
command -v cloudflared

cd "$REPO"
git status --short --branch
repo-harness mcp doctor --repo "$REPO" --json || true
```

If the repository is not adopted, preview and apply initialization:

```bash
repo-harness init --dry-run
repo-harness init
```

Review the generated repository contract before continuing.

## 2. Start a Quick Tunnel first

A fresh coding setup needs a valid public HTTPS `/mcp` endpoint. Quick Tunnel
can publish a hostname before the local MCP server is started, so create the
public endpoint first.

For repeatable testing, use HTTP/2:

```bash
rm -f /tmp/repo-harness-quick-tunnel.log

nohup cloudflared tunnel \
  --protocol http2 \
  --loglevel info \
  --url "$LOCAL_ORIGIN" \
  > /tmp/repo-harness-quick-tunnel.log 2>&1 &

export CLOUDFLARED_PID=$!
printf 'cloudflared pid=%s\n' "$CLOUDFLARED_PID"
```

Wait before making the first request to the new hostname. In real testing,
querying the hostname immediately after connector registration can race public
DNS publication. A quiet 20-second grace period avoids that race:

```bash
sleep 20
```

Inspect the tunnel:

```bash
grep -E \
  'Your quick Tunnel|Registered tunnel connection|TCP Connectivity|UDP Connectivity|TLS handshake|Connection terminated' \
  /tmp/repo-harness-quick-tunnel.log
```

A healthy HTTP/2 path contains:

```text
Your quick Tunnel has been created!
Registered tunnel connection ... protocol=http2
TCP Connectivity ... PASS
```

When HTTP/2 is forced, failed QUIC/UDP prechecks are not fatal as long as the
HTTP/2 connection registers and the TCP prechecks pass.

Extract the generated origin:

```bash
export QUICK_URL="$({
  grep -Eo 'https://[A-Za-z0-9-]+\.trycloudflare\.com' \
    /tmp/repo-harness-quick-tunnel.log || true
} | head -1)"

[ -n "$QUICK_URL" ]
printf 'Quick Tunnel: %s\n' "$QUICK_URL"

export MCP_URL="${QUICK_URL}/mcp"
printf 'ChatGPT MCP: %s\n' "$MCP_URL"
```

The hostname is temporary. Restarting the Quick Tunnel can generate a different
URL.

## 3. Configure the user-scoped coding profile

Use the generated Quick Tunnel URL as the endpoint:

```bash
repo-harness mcp setup chatgpt \
  --scope user \
  --repo "$REPO" \
  --profile coding \
  --grant-read-write "$REPO" \
  --host "$MCP_HOST" \
  --port "$MCP_PORT" \
  --server-name "$MCP_NAME" \
  --endpoint "$MCP_URL"
```

The first coding setup must be user-scoped and must include an explicit
`read_write` grant for an adopted repository.

User-scoped state is stored under `~/.repo-harness/`, including:

```text
~/.repo-harness/mcp.local.json
~/.repo-harness/mcp.oauth.json
~/.repo-harness/mcp.tokens.json
~/.repo-harness/registered-repos.json
```

Do not commit or paste OAuth passphrases, tokens, or live authorization URLs.

Inspect only non-secret configuration:

```bash
jq '{
  scope,
  profile,
  chatgpt: {
    serverName: .chatgpt.serverName,
    endpoint: .chatgpt.endpoint
  },
  coding: { enabled: .coding.enabled },
  authorizationRevision
}' ~/.repo-harness/mcp.local.json
```

Expected fundamentals:

```text
scope              user
profile            coding
coding.enabled     true
chatgpt.endpoint   https://<random>.trycloudflare.com/mcp
```

## 4. Start the local coding MCP server

Run one coding-profile server instance:

```bash
repo-harness mcp serve \
  --repo "$REPO" \
  --transport http \
  --host "$MCP_HOST" \
  --port "$MCP_PORT" \
  --profile coding \
  --auth oauth
```

Do not bind to `0.0.0.0`.

In another terminal, verify local health:

```bash
curl -fsS "${LOCAL_ORIGIN}/health"
echo

curl -fsS \
  "${LOCAL_ORIGIN}/.well-known/oauth-protected-resource/mcp"
echo
```

Also prove the listener is loopback-only:

```bash
lsof -nP -iTCP:${MCP_PORT} -sTCP:LISTEN
```

Reject a configuration that listens on `0.0.0.0:${MCP_PORT}` or `*:${MCP_PORT}`.

## 5. Verify the public Quick Tunnel

Now test the generated public hostname:

```bash
curl -fsS "${QUICK_URL}/health"
echo
```

The returned JSON should report:

```text
status:        ok
profile:       coding
auth:          oauth
public_origin: <the same QUICK_URL>
```

If the hostname does not resolve immediately, keep the same registered tunnel
alive and wait. Do not repeatedly create new Quick Tunnels while DNS publication
is still catching up.

Useful diagnostics:

```bash
tail -n 120 /tmp/repo-harness-quick-tunnel.log

ps -p "$CLOUDFLARED_PID" -o pid,ppid,command
```

## 6. Require a green live doctor

Before using ChatGPT for mutation testing:

```bash
repo-harness mcp doctor \
  --repo "$REPO" \
  --live \
  --json
```

Require the readiness chain to reach:

```text
config_ready
  -> local_ready
  -> tunnel_ready
  -> oauth_ready
  -> mcp_ready
```

The live doctor validates the local and public endpoints, OAuth discovery and
PKCE flow, MCP initialization, and the advertised tool schema.

Do not continue to mutation testing until `mcp_ready` is true.

## 7. Create or refresh the ChatGPT MCP app

In ChatGPT Developer mode, create or edit the custom MCP app:

```text
Name:           repo-harness-coding
MCP URL:        https://<random>.trycloudflare.com/mcp
Authentication: OAuth
```

Use the exact value of:

```bash
printf '%s\n' "$MCP_URL"
```

Quick Tunnel hostnames are ephemeral. When the hostname changes, update the
ChatGPT app URL and authorize again.

Keep confirmations enabled for write and shell tools.

## 8. Complete OAuth safely

The OAuth passphrase stays local in:

```text
~/.repo-harness/mcp.oauth.json
```

Do not paste it into chat.

If the normal authorization page works in your environment, enter the local
passphrase there.

If the browser-hosted form returns:

```json
{"error":"origin_not_allowed"}
```

use the documented local authorization helper flow instead of weakening the
coding server's origin policy:

```text
docs/chatgpt-repo-harness-oauth-origin-workaround.md
```

The safe helper flow uses the fresh `/authorize?...` transaction generated by
ChatGPT, reads the passphrase locally, submits with `Origin: https://chatgpt.com`,
validates the callback host, and opens the ChatGPT callback. Never paste the
fresh authorization URL, callback URL, authorization code, passphrase, or token
into chat.

## 9. First ChatGPT canary: status only

Start a new ChatGPT conversation and require a real tool invocation:

```text
Use Repo Harness Coding and call harness_status.
Do not call any other tool.
Do not modify anything and do not run shell commands.
```

Pass condition:

- ChatGPT shows a visible `Called tool` event or equivalent tool transcript;
- `harness_status` returns the expected repository and `coding` profile;
- no write tool runs;
- no shell tool runs.

Model prose claiming that a tool ran is not invocation evidence.

## 10. Second canary: live doctor

Then ask ChatGPT:

```text
Use Repo Harness Coding and call harness_doctor.
Do not call any other tool.
Do not modify anything and do not run shell commands.
```

Require a real tool call and a healthy result before testing direct coding
operations.

## 11. Read-only managed-worktree test

Use a managed worktree before any mutation:

```text
Use the repo-harness coding MCP app.

1. Call discover_harness_repos for my target repository.
2. Select its exact repo_id.
3. Call open_workspace with mode "worktree" and an approved base_ref.
4. Report workspace_id, branch, base_sha, dirty_source, and instruction files.
5. Read the applicable repository instructions and README.md.
6. Stop. Do not edit files and do not run shell commands.
```

Require visible tool calls for discovery, workspace open, and read.

## 12. One harmless mutation

Only after the read-only test succeeds, create one disposable test note with
`apply_patch`:

```text
tasks/notes/mcp-coding-smoke.md
```

Require:

- one create operation;
- no other file changes;
- returned diff and `mutation_id`;
- no commit;
- no push.

Then inspect the result with read-only validation commands.

## 13. Shell test: validation commands only

`exec_command` has local-user authority. Start with validation only:

```text
git status --short
git diff --check
git diff --stat
git diff
```

Do not claim a check passed unless the real exit status and output came back
from `exec_command`.

Do not use shell to bypass `PATH_DENIED`, `PATH_IGNORED`, or `SYMLINK_ESCAPE`
from the direct file tools.

## 14. Safe negative test

Ask the direct `read` tool for an unauthorized traversal such as:

```text
../outside
```

It should fail closed.

A denied secret-style path may also be tested when appropriate. Do not then ask
`exec_command` to bypass the denial.

## 15. Quick Tunnel lifecycle

A Quick Tunnel is intentionally temporary. If `cloudflared` is restarted, the
hostname may change.

For a new hostname:

1. start the new Quick Tunnel;
2. wait for registration and a quiet publication grace period;
3. capture the new `QUICK_URL`;
4. rerun `repo-harness mcp setup chatgpt` with `${QUICK_URL}/mcp`;
5. restart the MCP server;
6. require `mcp_ready` again;
7. update the ChatGPT app URL;
8. authorize again;
9. run the read-only canary again.

Do not keep an old ChatGPT app URL after Repo Harness has been configured with a
new public origin.

## 16. Cleanup and revoke access

Stop the Quick Tunnel:

```bash
kill "$CLOUDFLARED_PID" 2>/dev/null || true
```

Revoke coding access when testing is complete:

```bash
repo-harness mcp access set \
  --repo "$REPO" \
  --mode read_only \
  --json
```

Changing repository access may invalidate existing coding authorization and
require a new OAuth authorization later.

List managed worktrees:

```bash
repo-harness mcp workspaces list --json
```

Cleanup refuses dirty or unsafe-to-remove worktrees. Preserve or discard test
work deliberately before cleanup.

## 17. Optional: stable Cloudflare hostname

A custom domain is **not required for the default testing flow**.

Use a named Cloudflare tunnel only when you want a stable endpoint that survives
`cloudflared` restarts without changing the ChatGPT app URL.

Example optional flow:

```bash
cloudflared tunnel login
cloudflared tunnel create repo-harness-coding
cloudflared tunnel route dns repo-harness-coding mcp.example.com
```

Example configuration:

```yaml
tunnel: <tunnel-uuid>
credentials-file: ~/.cloudflared/<tunnel-uuid>.json

ingress:
  - hostname: mcp.example.com
    service: http://127.0.0.1:8765
  - service: http_status:404
```

Run it:

```bash
cloudflared tunnel run repo-harness-coding
```

Then configure repo-harness with:

```bash
export MCP_URL="https://mcp.example.com/mcp"

repo-harness mcp setup chatgpt \
  --scope user \
  --repo "$REPO" \
  --profile coding \
  --grant-read-write "$REPO" \
  --host "$MCP_HOST" \
  --port "$MCP_PORT" \
  --server-name "$MCP_NAME" \
  --endpoint "$MCP_URL"
```

Treat Cloudflare login certificates and tunnel credential JSON as secrets. Do
not commit them or copy them into normal configuration strings.

## 18. Acceptance checklist

The default Quick Tunnel test is complete when all of these are true:

```text
[ ] repo-harness repository is adopted
[ ] coding setup is user-scoped
[ ] repository grant is explicitly read_write
[ ] MCP listener is loopback-only
[ ] Quick Tunnel registers over HTTPS transport
[ ] generated trycloudflare.com hostname becomes reachable
[ ] configured endpoint ends in /mcp
[ ] live doctor reaches mcp_ready
[ ] ChatGPT OAuth completes
[ ] visible harness_status invocation succeeds
[ ] visible harness_doctor invocation succeeds
[ ] read-only managed-worktree test succeeds
[ ] first mutation changes exactly one harmless file
[ ] validation commands return real exit status/output
[ ] traversal/secret-path negative test fails closed
[ ] no OAuth or Cloudflare secret is committed or pasted into chat
```

For routine testing, use Quick Tunnel first. Move to a named Cloudflare tunnel
and custom hostname only when stable external addressing is actually needed.
