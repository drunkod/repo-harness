# ChatGPT Repo Harness OAuth Authorization Workaround

This guide documents the working OAuth authorization flow for connecting a Repo Harness coding MCP server to ChatGPT when the normal browser passphrase form returns:

```json
{"error":"origin_not_allowed"}
```

## Why this happens

Repo Harness coding mode accepts browser/API requests only when the `Origin` header is either absent or exactly:

```text
https://chatgpt.com
```

The Repo Harness authorization page itself is served from the public MCP origin, for example:

```text
https://example.trycloudflare.com/authorize?...oauth parameters...
```

Submitting the passphrase form directly from that page causes the browser to send the Quick Tunnel origin as the `Origin` header. Repo Harness correctly rejects that request.

The workaround is to keep the production origin check unchanged and submit the same fresh OAuth authorization request locally with:

```text
Origin: https://chatgpt.com
```

The helper below reads the Repo Harness OAuth passphrase locally and never prints it.

## Prerequisites

The MCP server should already be healthy and configured for OAuth. For example:

```bash
curl -fsS http://127.0.0.1:8765/health
```

The public MCP endpoint should also be reachable, for example:

```text
https://CURRENT-PUBLIC-HOST/mcp
```

Do not print or share these files:

```text
~/.repo-harness/mcp.oauth.json
~/.repo-harness/mcp.tokens.json
```

## 1. Start the ChatGPT OAuth flow

In ChatGPT, create or connect the custom MCP app using:

```text
Authentication: OAuth
Server URL: https://CURRENT-PUBLIC-HOST/mcp
```

Click **Sign in with Repo Harness Coding**.

When the Repo Harness passphrase page opens, **do not submit the passphrase in the browser**.

Copy the complete fresh authorization URL from the browser address bar with `Cmd+L`, then `Cmd+C`.

The URL should look structurally like:

```text
https://CURRENT-PUBLIC-HOST/authorize?response_type=code&client_id=...&redirect_uri=https%3A%2F%2Fchatgpt.com%2Fconnector%2Foauth%2F...&scope=offline_access+repo-harness+repo-harness.coding&code_challenge=...&code_challenge_method=S256&resource=https%3A%2F%2FCURRENT-PUBLIC-HOST%2Fmcp&state=...
```

Treat this URL as temporary OAuth transaction data. Do not paste it into chat, logs, issues, or documentation.

## 2. Capture the URL without executing it in zsh

Do **not** paste the URL directly at the shell prompt. OAuth URLs contain `&`, which has shell meaning and will cause errors such as:

```text
zsh: parse error near `&'
```

Instead capture the clipboard directly:

```bash
export AUTH_URL="$(pbpaste)"
```

Optionally validate it without printing the OAuth parameters:

```bash
python3 - <<'PY'
import os
import urllib.parse

u = urllib.parse.urlsplit(os.environ["AUTH_URL"])

assert u.scheme == "https"
assert u.path == "/authorize"

q = dict(urllib.parse.parse_qsl(u.query))

assert q.get("response_type") == "code"
assert q.get("code_challenge_method") == "S256"
assert urllib.parse.urlsplit(q["redirect_uri"]).hostname == "chatgpt.com"

print("OK: fresh OAuth URL captured")
PY
```

Expected:

```text
OK: fresh OAuth URL captured
```

## 3. Create the local OAuth helper

Create a temporary Python helper instead of pasting a large Python program directly into the interpreter:

```bash
cat > /tmp/repo-harness-oauth.py <<'PY'
import json
import os
import pathlib
import http.client
import subprocess
import urllib.parse

auth_url = os.environ["AUTH_URL"].strip()
u = urllib.parse.urlsplit(auth_url)

if u.scheme != "https" or u.path != "/authorize" or not u.hostname:
    raise SystemExit("Invalid authorization URL")

params = dict(
    urllib.parse.parse_qsl(
        u.query,
        keep_blank_values=True,
    )
)

required = [
    "response_type",
    "client_id",
    "redirect_uri",
    "code_challenge",
    "code_challenge_method",
    "state",
]

missing = [k for k in required if not params.get(k)]
if missing:
    raise SystemExit(
        "Missing OAuth parameters: " + ", ".join(missing)
    )

if params["response_type"] != "code":
    raise SystemExit("Unexpected response_type")

if params["code_challenge_method"] != "S256":
    raise SystemExit("Expected PKCE S256")

redirect = urllib.parse.urlsplit(params["redirect_uri"])

if redirect.scheme != "https" or redirect.hostname != "chatgpt.com":
    raise SystemExit("Unexpected ChatGPT callback")

secret_path = (
    pathlib.Path.home()
    / ".repo-harness"
    / "mcp.oauth.json"
)

with secret_path.open() as f:
    oauth = json.load(f)

passphrase = oauth.get("passphrase")
if not passphrase:
    raise SystemExit("OAuth passphrase missing")

params["passphrase"] = passphrase
body = urllib.parse.urlencode(params)

conn = http.client.HTTPSConnection(
    u.hostname,
    u.port or 443,
    timeout=30,
)

conn.request(
    "POST",
    "/authorize",
    body=body,
    headers={
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": "https://chatgpt.com",
        "Accept": "text/html,application/xhtml+xml",
    },
)

resp = conn.getresponse()
location = resp.getheader("Location")

print("Authorization HTTP status:", resp.status)

if resp.status not in (302, 303):
    text = resp.read(1000).decode(
        "utf-8",
        errors="replace",
    )
    print("Authorization failed:")
    print(text)
    raise SystemExit(1)

if not location:
    raise SystemExit("No callback redirect returned")

callback = urllib.parse.urlsplit(location)

if callback.scheme != "https" or callback.hostname != "chatgpt.com":
    raise SystemExit("Unexpected callback host")

print("OAuth accepted; opening ChatGPT callback")

subprocess.run(
    ["open", location],
    check=True,
)
PY
```

The helper performs these safety checks before opening the callback:

- authorization URL must be HTTPS
- path must be `/authorize`
- OAuth response type must be `code`
- PKCE method must be `S256`
- registered callback must target `https://chatgpt.com`
- returned redirect must also target `https://chatgpt.com`
- passphrase is loaded locally from `~/.repo-harness/mcp.oauth.json`
- passphrase is never printed

## 4. Run the helper

```bash
python3 /tmp/repo-harness-oauth.py
```

Success looks like:

```text
Authorization HTTP status: 302
OAuth accepted; opening ChatGPT callback
```

The helper opens the returned ChatGPT callback in the browser. ChatGPT should then complete the OAuth flow and discover the MCP actions.

## 5. Clean up temporary state

After authorization succeeds:

```bash
unset AUTH_URL
rm -f /tmp/repo-harness-oauth.py
pbcopy </dev/null
```

## 6. Verify with a read-only ChatGPT canary

In a fresh ChatGPT conversation, select or mention the connected Repo Harness app and run only a harmless read-only tool first:

```text
Use Repo Harness Coding and call harness_status.
Do not call any other tool.
Do not modify anything and do not run shell commands.
```

A successful live invocation should show an actual MCP tool call and return information such as the repository root, adoption state, coding profile, branch, and workflow roots.

Only after this read-only canary succeeds should you test repository mutation or `exec_command`.

## Troubleshooting

### `Expected HTTPS authorization URL`

The clipboard does not contain the fresh browser authorization URL. Generate a new OAuth transaction in ChatGPT, copy the full address-bar URL, and then run:

```bash
export AUTH_URL="$(pbpaste)"
```

Do not copy the passphrase into `AUTH_URL`.

### `zsh: parse error near '&'`

The OAuth URL was pasted directly into zsh. Capture it from the clipboard instead:

```bash
export AUTH_URL="$(pbpaste)"
```

### `origin_not_allowed`

Do not weaken the Repo Harness origin allowlist. Use the helper so the authorization POST carries:

```text
Origin: https://chatgpt.com
```

### Authorization URL was shared or logged

Discard that OAuth transaction and start a fresh **Sign in with Repo Harness Coding** flow. Do not reuse the exposed URL.

## Security notes

The coding profile can expose tools such as `apply_patch` and `exec_command`. `exec_command` runs with the authority of the local OS user and is not a sandbox.

Keep the local MCP listener bound to loopback, expose it only through the intended HTTPS/OAuth tunnel, and begin ChatGPT testing with read-only actions.
