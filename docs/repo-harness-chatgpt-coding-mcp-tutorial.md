# ChatGPT MCP Coding Profile Tutorial

This tutorial explains how to run the repo-harness MCP server with the
`coding` profile and use it from a ChatGPT developer-mode app.

The `coding` profile is the direct local-editing mode:

```text
ChatGPT
  -> OAuth-protected public /mcp endpoint
    -> loopback repo-harness MCP server
      -> adopted read_write repository
        -> managed local Git worktree
          -> read / apply_patch / exec_command / write_stdin
```

It does not invoke Codex or Claude and does not consume their quotas. It also
does not use Oracle, `browser-create`, or the connected ChatGPT GitHub app.
Those belong to the separate ChatGPT Browser Engine workflow.

## 1. Choose the correct mode

repo-harness has two distinct ways to create changes from ChatGPT:

| Mode | Transport | Where changes happen | Main boundary |
|---|---|---|---|
| MCP `coding` profile | Custom MCP app | Local managed Git worktree | Direct local-user-authority Bash |
| `chatgpt browser-create` | Oracle browser session + connected GitHub app | Remote GitHub branch/commit/PR | Fixed prompt and result contract |

Use this tutorial when ChatGPT must edit a local checkout, run tests, or run Git
commands through MCP.

Use `docs/repo-harness-chatgpt-github-create.md` when ChatGPT should write
through the GitHub app in the browser instead.

## 2. Understand the security boundary

The coding profile is intentionally default-off and fail-closed.

It requires all of the following:

- user-scoped MCP configuration;
- `profile: coding`;
- `coding.enabled: true`;
- at least one repo-harness adopted repository;
- an explicit `read_write` grant for that repository;
- OAuth authorization carrying the current coding authorization revision;
- an MCP server bound to loopback;
- a request Host matching the configured local or public endpoint.

The repository grant controls which repository may be opened as a coding
workspace. It is **not** a shell sandbox. `exec_command` starts in the selected
workspace, but the command has the authority of the local OS user and may reach
files outside the repository.

Keep ChatGPT confirmations enabled for every write and shell action. Do not use
`exec_command` to bypass a denial from `read` or `apply_patch`.

## 3. Prerequisites

Confirm that you have:

- `repo-harness` installed and available on `PATH`;
- Git;
- `jq`;
- an adopted target repository;
- ChatGPT Developer mode enabled;
- permission to create a developer-mode app;
- a public HTTPS endpoint ending in `/mcp`;
- a tunnel client such as `cloudflared`.

Set operator variables:

```bash
export REPO="$HOME/Projects/my-repo"
export MCP_HOST="127.0.0.1"
export MCP_PORT="8765"
export MCP_NAME="repo-harness-coding"
export MCP_URL="https://mcp.example.com/mcp"
```

Check the CLI and repository:

```bash
repo-harness --version
command -v repo-harness

cd "$REPO"
git status --short --branch
repo-harness mcp doctor --repo "$REPO" --json
```

If the repository is not adopted, preview and apply repo-harness initialization:

```bash
repo-harness init --dry-run
repo-harness init
```

Review the generated repository contract before continuing.

## 4. Configure the user-scoped coding profile

The first coding setup must include an explicit read-write grant:

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

The setup command fails when:

- `--scope user` is missing;
- the granted path is not repo-harness adopted;
- the first coding setup has no `--grant-read-write`;
- the endpoint is not a valid public HTTPS `/mcp` URL.

User-scoped state is stored under `~/.repo-harness/`, including:

```text
~/.repo-harness/mcp.local.json
~/.repo-harness/mcp.oauth.json
~/.repo-harness/mcp.tokens.json
~/.repo-harness/registered-repos.json
```

These files are local operator state. Do not commit them or paste their secrets
into chat, issues, pull requests, or shared logs.

Inspect non-secret configuration:

```bash
jq '{
  version,
  scope,
  profile,
  server,
  chatgpt: {serverName: .chatgpt.serverName, endpoint: .chatgpt.endpoint},
  capabilities,
  coding: {enabled: .coding.enabled},
  authorizationRevision
}' ~/.repo-harness/mcp.local.json
```

Inspect the registered repository state without editing it:

```bash
jq . ~/.repo-harness/registered-repos.json
```

Treat `repo-harness mcp access set` and MCP discovery tools as the supported
control surface rather than editing the registry manually.

## 5. Read the OAuth passphrase locally

The ChatGPT authorization page asks for the local OAuth passphrase:

```bash
jq -r .passphrase ~/.repo-harness/mcp.oauth.json
```

Copy it directly into the authorization page. Do not put it in a prompt.

Changing the configured profile, coding enablement, or repository access may
advance the authorization revision. Old coding authorization then stops being
valid and ChatGPT must authorize again.

## 6. Start the local MCP server

Start one coding-profile server instance:

```bash
repo-harness mcp serve \
  --repo "$REPO" \
  --transport http \
  --host "$MCP_HOST" \
  --port "$MCP_PORT" \
  --profile coding \
  --auth oauth
```

Do not bind the coding server to `0.0.0.0`. The supported ChatGPT path keeps the
server on loopback and exposes it through an authenticated HTTPS tunnel.

In another terminal, check the local service:

```bash
curl "http://${MCP_HOST}:${MCP_PORT}/health"

curl \
  "http://${MCP_HOST}:${MCP_PORT}/.well-known/oauth-protected-resource/mcp"
```

A server instance advertises one profile at startup. When switching between
`planner` and `coding`, restart the server, refresh the ChatGPT app schema, and
start a new chat.

## 7. Expose the server through HTTPS

Keep these values distinct:

| Value | Example |
|---|---|
| Local origin | `http://127.0.0.1:8765` |
| Tunnel upstream | `http://127.0.0.1:8765` |
| Public origin | `https://mcp.example.com` |
| ChatGPT MCP URL | `https://mcp.example.com/mcp` |

For recurring use, prefer a stable hostname.

### Stable Cloudflare tunnel

Example `cloudflared` configuration:

```yaml
tunnel: <tunnel-uuid>
credentials-file: ~/.cloudflared/<tunnel-uuid>.json

ingress:
  - hostname: mcp.example.com
    service: http://127.0.0.1:8765
  - service: http_status:404
```

Create and start it:

```bash
cloudflared tunnel login
cloudflared tunnel create repo-harness-coding
cloudflared tunnel route dns repo-harness-coding mcp.example.com
cloudflared tunnel run repo-harness-coding
```

repo-harness does not create tunnel, DNS, launchd, or systemd state.

### One-off smoke tunnel

```bash
cloudflared tunnel --url "http://${MCP_HOST}:${MCP_PORT}"
```

A quick-tunnel URL changes. When it changes, rerun MCP setup with the new URL
and update the ChatGPT app. Do not treat a quick tunnel as durable
configuration.

## 8. Create the ChatGPT developer-mode app

You already enabled Developer mode. Keep **Enforce CSP in developer mode**
enabled; repo-harness uses a normal OAuth-protected HTTPS MCP endpoint and does
not require unrestricted app networking.

ChatGPT UI labels may say **Apps**, **Plugins**, or **Connectors**.

1. Open ChatGPT settings.
2. Open the developer-mode app management page.
3. Create an app named `repo-harness-coding`, or use the value supplied through
   `--server-name`.
4. Enter a clear description, for example:
   `Direct coding in explicitly granted local repositories through repo-harness.`
5. Enter the public URL ending in `/mcp`.
6. Select OAuth authentication.
7. Complete authorization with the passphrase from
   `~/.repo-harness/mcp.oauth.json`.
8. Scan or refresh the tool schema.
9. Keep the confirmation policy set to ask before changes.
10. Start a new ChatGPT conversation.

The default coding schema retains the workflow/status tools and adds exactly
these five direct coding tools:

```text
open_workspace
read
apply_patch
exec_command
write_stdin
```

Without extra browser flags, the documented coding profile exposes 24 tools in
total: 19 workflow/status tools plus the five direct coding tools.

A visible **Called tool** event or captured tool-call transcript is invocation
evidence. Model prose saying that a tool ran is not evidence.

## 9. Run the live doctor

With the server and tunnel running:

```bash
repo-harness mcp doctor \
  --repo "$REPO" \
  --live \
  --json
```

The live path checks:

```text
config_ready
  -> local_ready
  -> tunnel_ready
  -> oauth_ready
  -> mcp_ready
```

It probes local/public health, TLS and Host policy, OAuth discovery,
DCR/PKCE/token flow, MCP initialization, and the advertised `tools/list`
without printing the passphrase or tokens.

Do not start mutation testing until the doctor reaches `mcp_ready`.

## 10. First read-only smoke test

Start with a managed worktree and no mutations.

Use this prompt in ChatGPT:

```text
Use the repo-harness coding MCP app.

1. Call discover_harness_repos for my target repository.
2. Select the exact repo_id.
3. Call open_workspace with:
   - mode: "worktree"
   - base_ref: the approved base branch or exact commit
4. Return workspace_id, branch, base_sha, dirty_source, and the instruction
   files supplied by the workspace.
5. Call read on README.md.
6. Stop. Do not edit files and do not run shell commands.
```

Equivalent `open_workspace` arguments:

```json
{
  "repo_id": "<repo-id>",
  "mode": "worktree",
  "base_ref": "main"
}
```

`worktree` is the default and recommended mode. `checkout` must be requested
explicitly and operates in the existing checkout.

`open_workspace` returns root instruction content such as `AGENTS.md` or
`CLAUDE.md`, plus discoverable nested instruction filenames. Follow those
instructions before making changes.

## 11. Create a harmless test file

Use a small repo-harness evidence path for the first mutation:

```text
tasks/notes/mcp-coding-smoke.md
```

Prompt:

```text
In the open managed workspace, call apply_patch with exactly one create
operation for tasks/notes/mcp-coding-smoke.md.

Content:

# MCP coding smoke

Created through the repo-harness coding profile.

Do not modify any other file. After the write, show the returned diff and
mutation_id. Do not commit or push.
```

Equivalent tool arguments:

```json
{
  "workspace_id": "<workspace-id>",
  "operations": [
    {
      "op": "create",
      "path": "tasks/notes/mcp-coding-smoke.md",
      "content": "# MCP coding smoke\n\nCreated through the repo-harness coding profile.\n"
    }
  ]
}
```

`apply_patch` applies up to 100 create, replace, delete, or move operations as
one rollback-capable transaction. A path may appear in only one operation.

## 12. Safely replace, delete, or move an existing file

Existing files require optimistic concurrency.

1. Call `read`.
2. Capture the returned `sha256`.
3. Use it as `expected_sha256`.
4. Stop on `REVISION_CONFLICT`; reread the file and reconsider the change.

Replace example:

```json
{
  "workspace_id": "<workspace-id>",
  "operations": [
    {
      "op": "replace",
      "path": "docs/example.md",
      "expected_sha256": "<sha256-from-read>",
      "content": "<complete replacement file content>"
    }
  ]
}
```

Delete example:

```json
{
  "workspace_id": "<workspace-id>",
  "operations": [
    {
      "op": "delete",
      "path": "docs/obsolete.md",
      "expected_sha256": "<sha256-from-read>"
    }
  ]
}
```

Move example:

```json
{
  "workspace_id": "<workspace-id>",
  "operations": [
    {
      "op": "move",
      "path": "docs/old-name.md",
      "to_path": "docs/new-name.md",
      "expected_sha256": "<sha256-from-read>"
    }
  ]
}
```

The destination of a move must not already exist.

## 13. Run commands and tests

`exec_command` runs arbitrary Bash with local-user authority. Begin with
read-only or validation commands:

```json
{
  "workspace_id": "<workspace-id>",
  "cmd": "git status --short && git diff --check && git diff --stat",
  "working_directory": ".",
  "yield_time_ms": 1000,
  "max_output_tokens": 8000
}
```

A useful repo-harness validation sequence is:

```text
git status --short
git diff --check
<focused project tests>
repo-harness run check-task-workflow --strict
git diff
```

Never claim a check passed unless `exec_command` returned its real exit status
and output.

For a process that remains active, `exec_command` returns a numeric
`session_id`. Poll it with:

```json
{
  "session_id": 123,
  "yield_time_ms": 1000,
  "max_output_tokens": 8000
}
```

To interrupt it:

```json
{
  "session_id": 123,
  "interrupt": true,
  "yield_time_ms": 1000
}
```

The coding process contract uses pipes, not a PTY. Interactive full-screen
terminal applications and terminal resizing are not supported.

## 14. Inspect, commit, and publish deliberately

Before any commit:

```text
git status --short
git diff --check
git diff
```

Ask ChatGPT to summarize:

- the exact workspace and branch;
- the base SHA;
- files changed;
- checks actually run;
- checks skipped;
- remaining risks.

Do not combine permission to edit with permission to publish.

A safe publication boundary is:

1. Human approves the final diff.
2. ChatGPT stages only approved paths.
3. ChatGPT creates one approved commit.
4. ChatGPT shows the exact branch, remote, and push command.
5. Human separately approves push.
6. Pull-request creation and merge remain separate approvals.

The coding profile itself does not automatically commit, push, open a pull
request, or merge.

## 15. File and environment policy

The direct file tools reject:

```text
.git/**
.env*
*.pem
*.key
*.p12
*.pfx
.ssh/**
.aws/**
.kube/**
.config/gcloud/**
.docker/config.json
.npmrc
.netrc
.pypirc
secrets/**
credentials/**
_ops/**
```

Writes additionally reject `_ref/**`.

File operations also reject:

- absolute paths;
- `..` traversal;
- empty path segments;
- symlink traversal or escape;
- paths excluded by the repository `.ignore`;
- non-regular files;
- binary content for `read`.

The shell remains open-world despite these file-tool guards. Treat a request to
use shell to bypass `PATH_DENIED`, `PATH_IGNORED`, or `SYMLINK_ESCAPE` as a
security failure.

Process environments inherit only basic OS keys. Additional environment names
must be explicitly allowed in ignored coding configuration, while sensitive
names involving tokens, secrets, credentials, cookies, private/API keys, or
patterns such as `KEY`, `PASS`, and `AUTH` remain denied.

## 16. Evidence and CodeGraph behavior

Successful file and shell mutations append audit and index evidence under the
workspace repository, including:

```text
.ai/harness/mcp/audit.log
.ai/harness/mcp/index-events.jsonl
```

Audit records hashes and metadata rather than raw commands, stdout, stderr, or
patch bodies.

`apply_patch` attempts CodeGraph refresh after a mutation and reports index
state. A mutation can succeed while refresh is `failed` or `unavailable`.
Preserve the mutation result and follow the returned retry evidence rather than
claiming the index is current.

## 17. Inspect and clean managed worktrees

Managed worktrees are local state under `~/.repo-harness/`.

List them:

```bash
repo-harness mcp workspaces list --json
```

Clean one after its changes have been preserved and its branch is merged or
otherwise safe to remove:

```bash
repo-harness mcp workspaces cleanup \
  --workspace-id <workspace-id> \
  --json
```

Cleanup refuses dirty or unmerged worktrees. The remote MCP tool surface does
not expose worktree deletion; cleanup is intentionally a local operator action.

## 18. Revoke coding access

Revoke the repository grant:

```bash
repo-harness mcp access set \
  --repo "$REPO" \
  --mode read_only \
  --json
```

This advances authorization state and prevents new coding workspaces from being
opened for that repository.

To return the configured server to planner mode:

```bash
repo-harness mcp setup chatgpt \
  --scope user \
  --repo "$REPO" \
  --profile planner \
  --server-name repo-harness \
  --endpoint "$MCP_URL"
```

Then restart `mcp serve` with `--profile planner`, refresh the app tool schema,
and start a new chat.

Setting the profile back to planner does not by itself change an existing
repository grant. Use `mcp access set --mode read_only` when you also want to
revoke write authorization.

## 19. Troubleshooting

### `coding profile setup requires --scope user`

Repeat setup with:

```bash
--scope user
```

Coding authorization and grants must live in user-owned ignored state.

### `coding profile setup requires at least one explicit --grant-read-write`

The first coding setup needs:

```bash
--grant-read-write "$REPO"
```

### `cannot grant coding access: repo is not repo-harness adopted`

Run repo-harness initialization in that repository, inspect the result, then
repeat setup.

### `WRITE_DISABLED`

The selected `repo_id` is not currently `read_write`:

```bash
repo-harness mcp access set --repo "$REPO" --mode read_write
```

Changing access may require a new OAuth authorization.

### ChatGPT cannot connect

Check:

```bash
curl "http://${MCP_HOST}:${MCP_PORT}/health"
repo-harness mcp doctor --repo "$REPO" --live --json
```

Confirm that the public endpoint uses HTTPS and ends in `/mcp`.

### The app shows old or missing tools

1. Restart `repo-harness mcp serve`.
2. Refresh or rescan the developer-mode app.
3. Start a fresh ChatGPT conversation.
4. Recreate the app when ChatGPT retains a stale schema.

### ChatGPT writes prose instead of calling a tool

Classify the result as `surface_blocked`. Only a visible tool invocation is
evidence.

### `REVISION_CONFLICT`

The file changed after it was read. Call `read` again, inspect the new content,
and construct a new guarded operation.

### `PATH_DENIED`, `PATH_IGNORED`, or `SYMLINK_ESCAPE`

Do not work around the error with shell. Choose an authorized path or update
the repository policy through a separate reviewed change.

### Cleanup refuses a workspace

The worktree is dirty or its branch is not safely merged. Inspect it first:

```bash
repo-harness mcp workspaces list --json
```

Preserve or discard the work deliberately, then retry cleanup.

## 20. Recommended first complete exercise

Use a disposable task and stop before push:

1. Configure the `coding` profile with one `read_write` repository.
2. Reach `mcp_ready` in the live doctor.
3. Open a managed worktree from an exact base.
4. Read `AGENTS.md`, `CLAUDE.md`, and the target file.
5. Create one note under `tasks/notes/`.
6. Run `git diff --check`.
7. Run the strict repo-harness workflow check.
8. Inspect the complete diff.
9. Leave the branch unpushed.
10. Clean the worktree locally only after the exercise is resolved.

## Related documentation

- `docs/repo-harness-chatgpt-mcp-setup.md` — general ChatGPT MCP setup.
- `docs/reference-configs/chatgpt-coding-mcp.md` — authoritative coding
  profile and security reference.
- `docs/reference-configs/general-repo-mcp.md` — structured registered-repo
  reading and mutation without the direct coding shell.
- `docs/repo-harness-chatgpt-github-create.md` — browser-based GitHub app
  Create mode, which is separate from MCP coding.
