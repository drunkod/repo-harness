# Repo Harness Coding MCP on macOS with Cloudflare Quick Tunnel

This guide describes the working setup for exposing a local Repo Harness coding MCP server to ChatGPT.

The final architecture is:

```
ChatGPT
   ↓ HTTPS + OAuth
Cloudflare Quick Tunnel
   ↓ HTTP/2
cloudflared on Mac
   ↓
Optional local proxy/TUN
   ↓
Optional trusted SOCKS relay
   ↓
Trusted outbound proxy/VPS
   ↓
direct route for TCP/7844
   ↓
Cloudflare Tunnel edge

Cloudflare request returns through tunnel
   ↓
127.0.0.1:8765
   ↓
Repo Harness MCP
   ↓
~/your-repository

```

If the outbound host uses Cloudflare WARP, normal proxy traffic can continue through it while Cloudflare Tunnel TCP/7844 uses a direct route.

The important working conditions are:

```
Repo Harness MCP: 127.0.0.1:8765
Profile:          coding
Authentication:   OAuth
Tunnel protocol:  HTTP/2
Cloudflare TCP:   7844
V2Ray sniffing:   disabled

```

---

# 1. Verify Repo Harness

On the Mac:

```
type -a repo-harness

repo-harness --version

```

Also verify the Home Manager/profile version:

```
/etc/profiles/per-user/$USER/bin/repo-harness --version

```

They should report the same Repo Harness version.

The working setup used:

```
Repo Harness 0.12.0

```

---

# 2. Verify the local Repo Harness MCP service

Repo Harness should listen only on loopback:

```
lsof -nP -iTCP:8765 -sTCP:LISTEN

```

Expected:

```
127.0.0.1:8765

```

Do not expose Repo Harness directly on:

```
0.0.0.0:8765
*:8765

```

The coding profile includes `exec_command`, which executes with the authority of the local macOS user. The HTTP MCP server therefore stays loopback-only and is exposed externally only through the authenticated tunnel.

Check local health:

```
curl -fsS http://127.0.0.1:8765/health
echo

```

Or use the helper:

```
/etc/profiles/per-user/USER/bin/repo-harness-mcp-health

```

A healthy server reports approximately:

```
{
  "status": "ok",
  "server": "repo-harness-mcp",
  "package_version": "0.12.0",
  "mcp_protocol": "streamable-http",
  "profile": "coding",
  "auth": "oauth"
}

```

---

# 3. Phone proxy

The Mac reaches the VPS through the phone's SOCKS listener.

Example phone FlClash listeners:

```
port: 7890
socks-port: 7891
mixed-port: 7892

allow-lan: true
bind-address: "*"

```

The phone's VMess outbound goes to the VPS.

Do not publish VMess UUIDs, SOCKS passwords, OAuth secrets, or WARP credentials.

The phone should exclude Cloudflare Tunnel discovery names from fake-IP DNS:

```
dns:
  fake-ip-filter:
    - "+.argotunnel.com"
    - "+.trycloudflare.com"
    - "+.cfargotunnel.com"

```

Verify from the Mac that the phone SOCKS port is reachable:

```
nc -vz -w 5 PHONE_OR_RELAY_IP 7891

```

Expected:

```
Connection succeeded

```

Then verify normal HTTPS through the phone:

```
curl -v \
  --connect-timeout 10 \
  --max-time 30 \
  --proxy socks5h://PHONE_OR_RELAY_IP:7891 \
  https://www.cloudflare.com/cdn-cgi/trace

```

A successful response proves:

```
Mac
→ phone SOCKS
→ VMess VPS
→ Internet

```

---

# 4. Mac FlClash configuration

The Mac uses the phone as its SOCKS outbound:

```
proxies:
  - name: "PhoneProxy"
    type: socks5
    server: PHONE_OR_RELAY_IP
    port: 7891
    udp: true

```

Keep local/private networks direct before proxy rules:

```
rules:
  - IP-CIDR,127.0.0.0/8,DIRECT,no-resolve
  - IP-CIDR,PHONE_OR_RELAY_IP/32,DIRECT,no-resolve
  - IP-CIDR,192.168.0.0/16,DIRECT,no-resolve
  - IP-CIDR,10.0.0.0/8,DIRECT,no-resolve
  - IP-CIDR,172.16.0.0/12,DIRECT,no-resolve

```

Exclude Cloudflare Tunnel names from fake-IP DNS:

```
dns:
  fake-ip-filter:
    - "*.lan"
    - "localhost"
    - "+.local"
    - "+.argotunnel.com"
    - "+.trycloudflare.com"
    - "+.cfargotunnel.com"

```

Cloudflare traffic should go to the phone proxy:

```
rules:
  - DOMAIN,api.trycloudflare.com,PhoneProxy
  - DOMAIN,api.cloudflare.com,PhoneProxy
  - DOMAIN-SUFFIX,trycloudflare.com,PhoneProxy
  - DOMAIN-SUFFIX,argotunnel.com,PhoneProxy
  - DOMAIN-SUFFIX,cfargotunnel.com,PhoneProxy

  - IP-CIDR,198.41.192.0/24,PhoneProxy,no-resolve
  - IP-CIDR,198.41.200.0/24,PhoneProxy,no-resolve

  - DST-PORT,7844,PhoneProxy
  - PROCESS-NAME,cloudflared,PhoneProxy

```

Do not route the phone's own address back through `PhoneProxy`, or a routing loop can occur.

---

# 5. VPS WARP architecture

The VPS uses V2Ray with WARP through a local `wireproxy` SOCKS listener:

```
V2Ray
  ↓
warp-out
  ↓
127.0.0.1:40000
  ↓
wireproxy
  ↓
Cloudflare WARP

```

Normal proxied traffic should continue to use this path.

Example outbounds:

```
"outbounds": [
  {
    "protocol": "socks",
    "tag": "warp-out",
    "settings": {
      "servers": [
        {
          "address": "127.0.0.1",
          "port": 40000
        }
      ]
    }
  },
  {
    "protocol": "freedom",
    "tag": "direct-out",
    "settings": {}
  },
  {
    "protocol": "blackhole",
    "tag": "block-out",
    "settings": {}
  }
]

```

---

# 6. Critical VPS fix: Cloudflare Tunnel must bypass WARP

Cloudflare Tunnel HTTP/2 uses TCP port `7844`.

Sending this connection through WARP caused:

```
TLS handshake with edge error: EOF

```

Therefore all TCP/7844 traffic arriving through the VMess inbound should use `direct-out`.

Use this as the first V2Ray routing rule:

```
{
  "type": "field",
  "inboundTag": [
    "proxy-in"
  ],
  "port": "7844",
  "network": "tcp",
  "outboundTag": "direct-out"
}

```

For example:

```
"routing": {
  "domainStrategy": "AsIs",
  "rules": [
    {
      "type": "field",
      "inboundTag": [
        "proxy-in"
      ],
      "port": "7844",
      "network": "tcp",
      "outboundTag": "direct-out"
    },
    {
      "type": "field",
      "domain": [
        "geosite:category-ads-all"
      ],
      "outboundTag": "block-out"
    }
  ]
}

```

The result is:

```
normal traffic
    ↓
warp-out
    ↓
WARP

Cloudflare Tunnel TCP/7844
    ↓
direct-out
    ↓
VPS normal Internet

```

---

# 7. Critical VPS fix: disable V2Ray sniffing

This was the final issue preventing the tunnel from working.

The original inbound contained:

```
"sniffing": {
  "enabled": true,
  "destOverride": [
    "http",
    "tls"
  ],
  "metadataOnly": false
}

```

During a real `cloudflared` handshake, V2Ray sniffing rewrote the destination to:

```
h2.cftunnel.com:7844

```

The server log showed:

```
default route for tcp:h2.cftunnel.com:7844

```

This caused the Cloudflare Tunnel connection to fail even when TCP/7844 routing otherwise looked correct.

Disable sniffing on the VMess server inbound:

```
"sniffing": {
  "enabled": false
}

```

Do not re-enable TLS destination rewriting until a selective configuration has been tested.

The working behavior after this change is:

```
region1.v2.argotunnel.com:7844 [direct-out]
region2.v2.argotunnel.com:7844 [direct-out]

```

---

# 8. Deploy the VPS configuration

Validate:

```
cd ~/work/nix-v2

jq empty v2ray-server-config-warp.json

nix --extra-experimental-features 'nix-command flakes' \
  flake check

```

Deploy:

```
WARP_DIR=/var/lib/nix-v2ray-warp \
  nix --extra-experimental-features 'nix-command flakes' \
  run .#vps-install

```

Check:

```
systemctl status nix-v2ray-warp.service --no-pager

```

Follow logs:

```
journalctl \
  -u nix-v2ray-warp.service \
  -f

```

Verify Cloudflare Tunnel connections are direct:

```
journalctl \
  -u nix-v2ray-warp.service \
  --since '2 minutes ago' \
  --no-pager |
grep -E 'argotunnel|7844'

```

Expected for TCP:

```
accepted tcp:region1.v2.argotunnel.com:7844 [direct-out]
accepted tcp:region2.v2.argotunnel.com:7844 [direct-out]

```

UDP/7844 may still use WARP. That is acceptable because `cloudflared` will be forced to HTTP/2 rather than QUIC.

---

# 9. Verify the VPS can perform the exact Cloudflare TLS handshake

Cloudflare's HTTP/2 Tunnel connection uses an edge IP with the TLS SNI:

```
h2.cftunnel.com

```

Test region 2:

```
openssl s_client \
  -connect 198.41.200.63:7844 \
  -servername h2.cftunnel.com \
  -alpn h2 \
  -brief \
  </dev/null

```

Test region 1:

```
openssl s_client \
  -connect 198.41.192.67:7844 \
  -servername h2.cftunnel.com \
  -alpn h2 \
  -brief \
  </dev/null

```

A working VPS shows:

```
CONNECTION ESTABLISHED
Protocol version: TLSv1.3

```

This proves the VPS's normal Internet path can reach the Cloudflare Tunnel edge.

---

# 10. Start a fresh Cloudflare Quick Tunnel

On the Mac:

```
pkill -f 'cloudflared tunnel.*127.0.0.1:8765' || true

rm -f /tmp/repo-harness-quick-tunnel.log

nohup cloudflared tunnel \
  --protocol http2 \
  --loglevel info \
  --url http://127.0.0.1:8765 \
  > /tmp/repo-harness-quick-tunnel.log 2>&1 &

echo "PID=$!"

```

Force:

```
--protocol http2

```

because the working network path supports TCP/7844 but not QUIC/UDP 7844.

Inspect:

```
sleep 20

grep -E \
  'quick Tunnel|TCP Connectivity|UDP Connectivity|Registered tunnel connection|TLS handshake|Serve tunnel error' \
  /tmp/repo-harness-quick-tunnel.log

```

The successful result is:

```
Your quick Tunnel has been created!

Registered tunnel connection
protocol=http2

TCP Connectivity region1 ... PASS
TCP Connectivity region2 ... PASS

UDP Connectivity region1 ... FAIL
UDP Connectivity region2 ... FAIL

```

UDP failure is expected in this configuration.

---

# 11. Extract the Quick Tunnel URL

```
export QUICK_URL="$(
  grep -o 'https://[^ ]*trycloudflare.com' \
    /tmp/repo-harness-quick-tunnel.log |
    head -1
)"

echo "$QUICK_URL"

```

Example:

```
https://random-words.trycloudflare.com

```

Quick Tunnel hostnames are temporary.

A new `cloudflared` Quick Tunnel process may receive a different hostname.

---

# 12. Test tunnel stability before changing Repo Harness

Before bootstrapping Repo Harness with the new hostname:

```
for i in {1..10}; do
  printf '%02d: ' "$i"

  curl -sS \
    --max-time 10 \
    -o /dev/null \
    -w '%{http_code}\n' \
    "${QUICK_URL}/health" ||
      echo FAIL

  sleep 2
done

```

If Repo Harness still knows the previous public hostname, the expected pre-bootstrap result is:

```
01: 421
02: 421
03: 421
04: 421
05: 421
06: 421
07: 421
08: 421
09: 421
10: 421

```

Stable `421` is good here.

It proves:

```
Internet
→ Cloudflare
→ tunnel
→ local Repo Harness

```

and the request is only being rejected because Repo Harness's configured public origin has not yet been switched to the new hostname.

Also verify the tunnel did not disconnect:

```
grep -E \
  'Registered tunnel connection|Lost connection|Connection terminated|Serve tunnel error' \
  /tmp/repo-harness-quick-tunnel.log

```

---

# 13. Bootstrap Repo Harness with the real public endpoint

Once the Quick Tunnel is stable:

```
/etc/profiles/per-user/USER/bin/repo-harness-mcp-bootstrap \
  --repo "$HOME/your-repository" \
  --endpoint "${QUICK_URL}/mcp"

```

This configures:

```
scope:       user
profile:     coding
local MCP:   http://127.0.0.1:8765/mcp
public MCP:  ${QUICK_URL}/mcp
auth:        OAuth

```

Do not print:

```
~/.repo-harness/mcp.oauth.json
~/.repo-harness/mcp.tokens.json

```

---

# 14. Ensure launchd can find Bun

The current runtime workaround is:

```
launchctl setenv PATH \
  "$HOME/.bun/bin:/etc/profiles/per-user/USER/bin:/usr/bin:/bin:/usr/sbin:/sbin"

```

Then restart Repo Harness:

```
/etc/profiles/per-user/USER/bin/repo-harness-mcp-restart

```

This `launchctl setenv` setting is session-level and may need to be restored after logout or reboot.

A permanent launchd/Home Manager PATH fix can be done separately.

---

# 15. Verify public health

```
curl -fsS "${QUICK_URL}/health"
echo

```

Expected:

```
{
  "status": "ok",
  "server": "repo-harness-mcp",
  "package_version": "0.12.0",
  "mcp_protocol": "streamable-http",
  "profile": "coding",
  "auth": "oauth"
}

```

The `public_origin` should equal the current Quick Tunnel hostname.

---

# 16. Run Repo Harness health

```
/etc/profiles/per-user/USER/bin/repo-harness-mcp-health

```

Expected:

```
repo-harness MCP health and OAuth discovery passed

```

---

# 17. Run full doctor

```
/etc/profiles/per-user/USER/bin/repo-harness-mcp-doctor

```

The successful final state is:

```
status: mcp_ready

config_ready: true
local_ready:  true
tunnel_ready: true
oauth_ready:  true
mcp_ready:    true

```

The successful coding profile exposes 24 MCP tools, including:

```
harness_status
harness_doctor
discover_harness_repos

list_workflow_files
read_workflow_file
latest_handoff
latest_checks

list_prds
list_sprints
summarize_repo_harness_state

write_prd
write_prd_from_idea
write_sprint
write_checklist_sprint
write_plan

prepare_codex_goal_from_sprint
write_codex_goal
append_handoff_note
run_workflow_check

open_workspace
read
apply_patch
exec_command
write_stdin

```

At this point the server, OAuth flow, tunnel and exact MCP `tools/list` schema are working end-to-end.

---

# 18. Connect the MCP server to ChatGPT

Use the current public MCP URL:

```
https://CURRENT-QUICK-TUNNEL.trycloudflare.com/mcp

```

The server uses OAuth, so complete the OAuth authorization flow when ChatGPT requests it.

Do not use:

```
http://127.0.0.1:8765/mcp

```

from ChatGPT.

That address is intentionally accessible only from the Mac.

---

# 19. First ChatGPT canary

Do not begin with `exec_command`, `apply_patch`, or another write-capable operation.

Start with a read-only MCP request such as:

```
Call harness_status on my Repo Harness coding MCP server.

```

Then:

```
Call harness_doctor and show me the reported runtime status.

```

Then test repository discovery:

```
Call discover_harness_repos.

```

The purpose of this stage is to verify that ChatGPT is actually invoking the connected MCP server rather than merely describing what the MCP server should return.

Repo Harness doctor reports:

```
invocation_verification: manual_required

```

Therefore acceptable evidence is an actual tool-call event/transcript from ChatGPT.

---

# 20. Test repository reading

After the basic canary succeeds:

```
Use the Repo Harness MCP server to open the nix-config workspace and read a harmless text file. Do not make changes.

```

Keep this read-only initially.

Only after confirming real MCP invocation should you test coding capabilities.

---

# 21. Test command execution carefully

The coding profile exposes:

```
exec_command

```

This command is **not a sandbox**.

It executes with the authority of your macOS user.

Use a harmless first command, for example:

```
Use Repo Harness exec_command to run:
pwd

```

Then:

```
Use Repo Harness exec_command to run:
git status --short

```

Do not use destructive or write operations during the initial canary.

---

# 22. Quick Tunnel lifecycle

A Cloudflare Quick Tunnel is temporary.

If `cloudflared` stops and you start a new Quick Tunnel, the hostname may change.

When that happens:

```
export QUICK_URL="https://NEW-HOST.trycloudflare.com"

```

Verify ten stable probes first:

```
for i in {1..10}; do
  printf '%02d: ' "$i"

  curl -sS \
    --max-time 10 \
    -o /dev/null \
    -w '%{http_code}\n' \
    "${QUICK_URL}/health" ||
      echo FAIL

  sleep 2
done

```

Then update Repo Harness:

```
/etc/profiles/per-user/USER/bin/repo-harness-mcp-bootstrap \
  --repo "$HOME/your-repository" \
  --endpoint "${QUICK_URL}/mcp"

```

Restart:

```
launchctl setenv PATH \
  "$HOME/.bun/bin:/etc/profiles/per-user/USER/bin:/usr/bin:/bin:/usr/sbin:/sbin"

/etc/profiles/per-user/USER/bin/repo-harness-mcp-restart

```

Verify:

```
/etc/profiles/per-user/USER/bin/repo-harness-mcp-doctor

```

Do not keep using an old Quick Tunnel hostname after restarting `cloudflared`.

---

# 23. Useful tunnel diagnostics

Current URL:

```
grep -o 'https://[^ ]*trycloudflare.com' \
  /tmp/repo-harness-quick-tunnel.log |
head -1

```

Registration:

```
grep 'Registered tunnel connection' \
  /tmp/repo-harness-quick-tunnel.log

```

Connectivity:

```
grep -E \
  'TCP Connectivity|UDP Connectivity' \
  /tmp/repo-harness-quick-tunnel.log

```

Failures:

```
grep -E \
  'TLS handshake|Serve tunnel error|Lost connection|Connection terminated' \
  /tmp/repo-harness-quick-tunnel.log

```

VPS TCP/7844 routing:

```
journalctl \
  -u nix-v2ray-warp.service \
  --since '5 minutes ago' \
  --no-pager |
grep -E 'argotunnel|7844'

```

Good:

```
tcp:region*.v2.argotunnel.com:7844 [direct-out]

```

Bad:

```
tcp:...:7844 [warp-out]

```

---

# 24. Useful Repo Harness diagnostics

Local health:

```
curl -fsS http://127.0.0.1:8765/health
echo

```

Helper:

```
rh-mcp-health

```

Doctor:

```
rh-mcp-doctor

```

Service:

```
launchctl print \
  "gui/$UID/org.nix-community.home.repo-harness-mcp"

```

Listener:

```
lsof -nP -iTCP:8765 -sTCP:LISTEN

```

Logs:

```
tail -n 100 \
  "$HOME/.local/state/repo-harness-mcp/stderr.log"

```

and:

```
tail -n 100 \
  "$HOME/.local/state/repo-harness-mcp/stdout.log"

```

---

# 25. Security notes

Keep these files private:

```
~/.repo-harness/mcp.oauth.json
~/.repo-harness/mcp.tokens.json

/var/lib/nix-v2ray-warp/wgcf-account.toml
/var/lib/nix-v2ray-warp/wgcf-profile.conf
/var/lib/nix-v2ray-warp/wireproxy.conf

```

Do not paste:

```
OAuth passphrases
bearer tokens
VMess UUIDs
WARP private keys
SOCKS credentials

```

If any VMess UUID or proxy credential has already been exposed, rotate it.

Because the phone has:

```
allow-lan: true

```

consider restricting LAN clients after setup is stable.

Most importantly, remember:

```
Repo Harness exec_command != sandbox

```

The local MCP listener should remain:

```
127.0.0.1:8765

```

and external access should continue to pass through authenticated HTTPS/OAuth.

---

# Final working checklist

```
Phone SOCKS reachable
    ✓

Normal HTTPS through phone/VPS
    ✓

VPS WARP works for ordinary traffic
    ✓

V2Ray sniffing disabled
    ✓

TCP/7844 routed to direct-out
    ✓

VPS h2.cftunnel.com TLS handshake
    ✓

cloudflared HTTP/2 registered
    ✓

TCP region1 precheck
    ✓

TCP region2 precheck
    ✓

Quick Tunnel stable
    ✓

Repo Harness local health
    ✓

Repo Harness public health
    ✓

OAuth DCR + PKCE
    ✓

MCP initialize
    ✓

MCP tools/list
    ✓

24 coding tools
    ✓

Repo Harness doctor
    mcp_ready

```

The next step is no longer network debugging. It is **ChatGPT MCP invocation verification**: connect the current `/mcp` endpoint, complete OAuth, and perform a read-only `harness_status` or `harness_doctor` canary before allowing any write or shell operation.
