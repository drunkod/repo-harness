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

## 1. Prerequisites and repository adoption

You need `repo-harness`, `cloudflared`, Git, `jq`, an adopted target repository,
and ChatGPT Developer mode with permission to create a custom MCP app.

Set local values:

```bash
export REPO="$HOME/Projects/my-repo"
export MCP_HOST="127.0.0.1"
export MCP_PORT="8765"
export MCP_NAME="repo-harness-coding"
export LOCAL_ORIGIN="http://${MCP_HOST}:${MCP_PORT}"
```

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

### Verify adoption survives a Git commit

The standard workflow contract contains directories that may initially be
empty. repo-harness persists required empty workflow directories with tracked
sentinels so they survive a commit and a fresh worktree.

When validating an adoption change, verify that property rather than testing
only the original checkout:

```bash
repo-harness run check-task-workflow --strict

git add -A
git commit -m 'adopt repo-harness workflow'

git worktree add --detach ../repo-harness-adoption-check HEAD
(
  cd ../repo-harness-adoption-check
  repo-harness run check-task-workflow --strict
)
```

The fresh-worktree check must also report:

```text
[workflow] OK
```

Do not create a test commit on a production branch merely to run this check;
use a disposable branch or clone when adoption itself is under test.

## 2. Start a Quick Tunnel

Create the public endpoint before configuring the coding profile. For
repeatable testing, force HTTP/2:

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

Wait before making the first request to the generated hostname. A newly issued
Quick Tunnel name can race public DNS publication, so keep the same tunnel alive
through a quiet grace period:

```bash
sleep 20
```

Inspect registration:

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

Extract the generated endpoint:

```bash
export QUICK_URL="$({
  grep -Eo 'https://[A-Za-z0-9-]+\.trycloudflare\.com' \
    /tmp/repo-harness-quick-tunnel.log || true
} | head -1)"

[ -n "$QUICK_URL" ]
export MCP_URL="${QUICK_URL}/mcp"
printf 'ChatGPT MCP: %s\n' "$MCP_URL"
```

Quick Tunnel hostnames are temporary. A replacement tunnel can receive a new
URL.

## 3. Configure the user-scoped coding profile

Use the generated Quick Tunnel URL and explicitly grant the adopted repository:

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

Expected fundamentals are `scope: user`, `profile: coding`,
`coding.enabled: true`, and an HTTPS `chatgpt.endpoint` ending in `/mcp`.

## 4. Resolve the exact coding `repo_id`

`open_workspace` takes the opaque registered repository ID, for example
`repo_ab12cd34...`; a filesystem path or repository basename is not a substitute.

Some coding-profile deployments return repository visibility metadata from
`discover_harness_repos` without including that opaque `repo_id`. In that case,
do **not** guess the ID and do not pass the absolute path as `repo_id`.

Resolve the exact ID locally from the user-owned registry after setup:

```bash
export REPO_ROOT="$(cd "$REPO" && pwd -P)"
export REPO_ID="$({
  jq -r \
    --arg path "$REPO_ROOT" \
    '.repos[] | select(.path == $path and .accessMode == "read_write") | .id' \
    "$HOME/.repo-harness/registered-repos.json" || true
} | tail -n 1)"

case "$REPO_ID" in
  repo_*) ;;
  *)
    echo "STOP: no exact read_write repo_id found for $REPO_ROOT" >&2
    exit 1
    ;;
esac

printf 'REPO_ID=%s\n' "$REPO_ID"
```

`registered-repos.json` is local authorization/registry state. Read only the
fields needed for the test; do not dump unrelated local state into chat.

In ChatGPT, `discover_harness_repos` remains useful to confirm that the intended
repository is visible. If its response does not contain `repo_id`, provide the
locally resolved `REPO_ID` explicitly to `open_workspace` instead of trying the
returned path or display name.

## 5. Start and verify the local server

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

In another terminal:

```bash
curl -fsS "${LOCAL_ORIGIN}/health"
echo

curl -fsS \
  "${LOCAL_ORIGIN}/.well-known/oauth-protected-resource/mcp"
echo

lsof -nP -iTCP:${MCP_PORT} -sTCP:LISTEN
```

The listener must remain loopback-only.

## 6. Verify the public endpoint and live doctor

Test the generated public hostname:

```bash
curl -fsS "${QUICK_URL}/health"
echo
```

The JSON should report `status: ok`, `profile: coding`, `auth: oauth`, and a
`public_origin` equal to `QUICK_URL`.

If the name does not resolve immediately, keep the same registered tunnel alive
and wait. Do not repeatedly replace the tunnel while DNS publication is still
catching up.

Before ChatGPT mutation testing, require a green live doctor:

```bash
repo-harness mcp doctor \
  --repo "$REPO" \
  --live \
  --json
```

Require:

```text
config_ready
  -> local_ready
  -> tunnel_ready
  -> oauth_ready
  -> mcp_ready
```

## 7. Create or refresh the ChatGPT MCP app

In ChatGPT Developer mode, create or edit the custom MCP app:

```text
Name:           repo-harness-coding
MCP URL:        https://<random>.trycloudflare.com/mcp
Authentication: OAuth
```

Quick Tunnel hostnames are ephemeral. When the hostname changes, update the app
URL and authorize again. Keep confirmations enabled for write and shell tools.

The OAuth passphrase stays local in:

```text
~/.repo-harness/mcp.oauth.json
```

Do not paste it into chat. If the browser-hosted authorization form returns
`origin_not_allowed`, use
`docs/chatgpt-repo-harness-oauth-origin-workaround.md` rather than weakening the
coding server's Origin policy.

## 8. First ChatGPT canaries

Start a new conversation and require a real tool invocation:

```text
Use Repo Harness Coding and call harness_status.
Do not call any other tool.
Do not modify anything and do not run shell commands.
```

Then:

```text
Use Repo Harness Coding and call harness_doctor.
Do not call any other tool.
Do not modify anything and do not run shell commands.
```

A visible **Called tool** event or captured tool-call transcript is invocation
evidence. Model prose claiming that a tool ran is not evidence.

## 9. Read-only managed-worktree test

Choose an approved base branch or exact commit and record it as `BASE_REF`. If
you are validating the newly generated adoption files themselves, use a commit
that contains those files rather than its pre-adoption parent.

Use the exact opaque `REPO_ID` resolved locally in section 4:

```text
Use Repo Harness Coding only.

The exact registered repository ID is:
<REPO_ID>

The approved base is:
<BASE_REF>

1. Call discover_harness_repos for the target repository only to confirm it is visible.
   Do not derive repo_id from that response if the opaque id is absent.
2. Call open_workspace with exactly:
   repo_id: "<REPO_ID>"
   mode: "worktree"
   base_ref: "<BASE_REF>"
3. Report workspace_id, branch, base_sha, dirty_source, and instruction files.
4. Require base_sha to equal "<BASE_REF>" when BASE_REF is an exact commit.
5. Read the applicable AGENTS.md and CLAUDE.md instructions.
6. Read README.md with the workspace read tool.
7. Stop.

Do not modify files.
Do not call exec_command.
```

Do not replace `repo_id` with an absolute path or a repository basename when
`open_workspace` expects the opaque registry ID.

Before mutating the new worktree, verify that its committed adoption state is
self-contained:

```text
Use Repo Harness Coding only.
Use workspace <WORKSPACE_ID>.
Call exec_command exactly once with:
repo-harness run check-task-workflow --strict
Do not modify files. Do not commit or push. Report the real exit status.
```

The expected result is exit status `0` and `[workflow] OK`.

## 10. One harmless mutation

Only after the read-only test and strict workflow check succeed, create one
disposable note with `apply_patch`:

```text
tasks/notes/mcp-coding-smoke.md
```

Require exactly one create operation, no other file changes, returned `diff`
and `mutation_id`, and no commit or push.

A successful mutation may still report a failed post-mutation CodeGraph refresh
when the repository has no CodeGraph index. Treat the mutation result and index
result separately: a returned mutation/diff can be valid while `index.state`
reports that CodeGraph is not initialized. Initialize or repair CodeGraph as a
separate operator task instead of repeating the mutation.

## 11. Shell validation

`exec_command` has local-user authority. Begin with validation only:

```text
git status --short
git diff --check
git diff --stat
git diff
repo-harness run check-task-workflow --strict
```

Do not claim a check passed unless the real exit status and output came back
from `exec_command`. Do not use shell to bypass a direct-file-tool denial.

## 12. Negative path-policy test

Ask the workspace `read` tool for:

```text
../outside
```

It must fail closed with a path-policy error such as `INVALID_RELATIVE_PATH`.
Do not then use `exec_command` to bypass the rejection.

## 13. Quick Tunnel lifecycle and cleanup

If `cloudflared` is restarted and receives a new hostname:

1. wait for HTTP/2 registration and the quiet publication grace period;
2. capture the new `QUICK_URL`;
3. rerun coding setup with `${QUICK_URL}/mcp`;
4. restart the MCP server and require `mcp_ready`;
5. update the ChatGPT app URL;
6. authorize again;
7. rerun the read-only canary.

Stop the Quick Tunnel when finished:

```bash
kill "$CLOUDFLARED_PID" 2>/dev/null || true
```

List managed worktrees:

```bash
repo-harness mcp workspaces list --json
```

Cleanup refuses dirty or unsafe-to-remove worktrees. Preserve or discard test
work deliberately before cleanup.

Revoke coding access when testing is complete:

```bash
repo-harness mcp access set \
  --repo "$REPO" \
  --mode read_only \
  --json
```

## 14. Optional: stable Cloudflare hostname

A custom domain is **not required for the default testing flow**.

Use a named Cloudflare tunnel only when you want a stable endpoint that survives
`cloudflared` restarts without changing the ChatGPT app URL:

```bash
cloudflared tunnel login
cloudflared tunnel create repo-harness-coding
cloudflared tunnel route dns repo-harness-coding mcp.example.com
cloudflared tunnel run repo-harness-coding
```

Then configure repo-harness and ChatGPT with:

```text
https://mcp.example.com/mcp
```

Keep the same loopback, explicit repository grant, OAuth, live-doctor, and
read-only-before-mutation gates described above.
