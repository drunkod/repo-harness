# Human MVP1 Manual Test Runbook: Zed Interactive Hand-off

This runbook closes the environment-dependent manual compatibility gate for the
Zed Agent MVP1 launcher-only integration.

It validates only the local interactive hand-off implemented by:

```bash
repo-harness zed-agent "<prompt>"
```

A successful run means the local `zed` CLI accepted the hand-off and the human
tester visually confirmed the expected Zed UI behavior. It does **not** prove
thread completion, model execution, ACP behavior, remote execution, or any
headless-agent contract.

## 1. Safety and privacy rules

Use only harmless synthetic markers from this runbook. Do not put credentials,
secrets, personal data, proprietary source text, or sensitive prompts into the
manual test.

The prompt is transported as a `zed://agent?prompt=...` process argument. URL
encoding is not encryption. Process listings, endpoint telemetry, URI-handler
logs, shell history, or Zed diagnostics may observe the prompt.

Do not press Enter in Zed unless you intentionally want to submit the harmless
marker. The expected MVP1 behavior is **prefill without auto-submit**.

## 2. Record the test environment

Fill this in before running the scenarios.

```text
Date/time:
Tester:
Repository:
Branch:
Commit SHA:
OS:
OS version:
Architecture:
Shell:
Bun version:
Zed version:
Zed install channel/build notes:
```

Capture the relevant values:

```bash
git status --short --branch
git rev-parse HEAD
uname -a
bun --version
zed --version
```

For macOS, also record:

```bash
sw_vers
uname -m
```

### Entry gate

- [ ] The checkout is the intended MVP1 branch/head.
- [ ] `zed --version` succeeds.
- [ ] The tester knows whether Zed currently has zero, one, or multiple windows open.
- [ ] No sensitive prompt material will be used.

If `zed --version` fails, stop and record the failure. Do not claim the manual
compatibility gate passed.

## 3. Direct Zed URI preflight

Before testing repo-harness, verify that the installed Zed build itself still
accepts the documented URI shape used by MVP1.

Use this harmless marker:

```bash
zed 'zed://agent?prompt=repo-harness-zed-mvp1-direct-smoke'
```

Observe Zed and record:

```text
Direct URI result: PASS / FAIL
Did Zed open or focus? yes / no
Was the marker visible in the Agent Panel composer? yes / no
Was the marker unsubmitted? yes / no
Did the terminal command return promptly? yes / no
Which workspace/window received the prompt?
Notes:
```

Pass criteria:

- [ ] Zed opens or focuses successfully.
- [ ] `repo-harness-zed-mvp1-direct-smoke` appears in the Agent Panel composer.
- [ ] The prompt is **not** automatically submitted.
- [ ] The CLI invocation returns promptly.
- [ ] The receiving workspace/window is identified.

If the route auto-submits, does not prefill, or is unavailable, stop. The MVP1
compatibility gate fails for this Zed build even if repo-harness unit tests pass.

Clear the composer before the next scenario without submitting the marker.

## 4. Scenario A — no-window launch

Close all Zed windows first. Do not terminate unrelated work without saving it.
Confirm there is no visible Zed window, then run:

```bash
bun src/cli/index.ts zed-agent "repo-harness-zed-mvp1-no-window"
```

Immediately inspect the terminal output.

Terminal pass criteria:

- [ ] Exit status is `0`.
- [ ] The command returns promptly rather than waiting for an Agent turn.
- [ ] Output is generic and truthful.
- [ ] Output tells the user to check Zed and manually review/submit.
- [ ] Output does **not** contain `repo-harness-zed-mvp1-no-window`.
- [ ] Output does **not** contain `zed://agent`.
- [ ] Output does not claim that repo-harness observed Zed displaying or running the prompt.

Then inspect Zed.

GUI pass criteria:

- [ ] A Zed window opens or becomes visible.
- [ ] The Agent Panel composer contains exactly `repo-harness-zed-mvp1-no-window`.
- [ ] The prompt is **not** automatically submitted.
- [ ] No Agent turn starts before human action.
- [ ] The receiving workspace/window behavior is recorded below.

Record:

```text
Scenario A result: PASS / FAIL
CLI exit status:
Approximate CLI return behavior: prompt / delayed / hung
Receiving workspace/window:
Prompt visibly prefilled: yes / no
Prompt auto-submitted: yes / no
Unexpected UI behavior:
Terminal output contained prompt or URI: yes / no
Notes:
```

Clear the composer without submitting the marker.

## 5. Scenario B — existing-window behavior

Open one normal Zed workspace/window before running the command. Record which
workspace is active, then run:

```bash
bun src/cli/index.ts zed-agent "repo-harness-zed-mvp1-existing-window"
```

Pass criteria:

- [ ] CLI exits `0` and returns promptly.
- [ ] Terminal output contains neither the prompt nor `zed://agent`.
- [ ] The existing Zed session handles the URI without auto-submitting.
- [ ] The composer contains exactly `repo-harness-zed-mvp1-existing-window`.
- [ ] The actual workspace/window that receives focus/prompt is recorded rather than inferred.

Record:

```text
Scenario B result: PASS / FAIL
Workspace active before launch:
Workspace/window receiving the prompt:
Did Zed create another window? yes / no
Prompt visibly prefilled: yes / no
Prompt auto-submitted: yes / no
CLI returned promptly: yes / no
Notes:
```

Clear the composer without submitting the marker.

## 6. Scenario C — multiple-window behavior

Open at least two Zed windows/workspaces. Put them in a distinguishable state so
you can identify which one receives the URI. Note which window is focused.

Run:

```bash
bun src/cli/index.ts zed-agent "repo-harness-zed-mvp1-multi-window"
```

This scenario does not prescribe which window Zed must choose. MVP1 does not own
Zed's workspace-routing policy. The requirement is to observe and document the
actual behavior and ensure the hand-off remains interactive and non-submitting.

Pass criteria:

- [ ] CLI exits `0` and returns promptly.
- [ ] Exactly one observable composer receives the marker, or any different behavior is explicitly recorded.
- [ ] The marker is not auto-submitted.
- [ ] Terminal output does not reveal the prompt or URI.
- [ ] The selected/focused workspace behavior is documented.

Record:

```text
Scenario C result: PASS / FAIL
Open workspaces/windows before launch:
Focused workspace before launch:
Workspace/window receiving the prompt:
Did focus move? yes / no
Did Zed create another window? yes / no
Prompt visibly prefilled: yes / no
Prompt auto-submitted: yes / no
Notes:
```

Clear the composer without submitting the marker.

## 7. Scenario D — Unicode and reserved symbols

Use a harmless prompt that exercises spaces, Unicode, `+`, `&`, `=`, and `%`.
Keep the shell quotes exactly as shown:

```bash
bun src/cli/index.ts zed-agent 'repo-harness-zed-mvp1-symbols 你好 👋 a+b & c=d 100%'
```

Visually compare the composer text with this exact expected value:

```text
repo-harness-zed-mvp1-symbols 你好 👋 a+b & c=d 100%
```

Pass criteria:

- [ ] CLI exits `0` and returns promptly.
- [ ] The composer preserves the exact visible prompt text.
- [ ] `+` remains a literal plus rather than becoming a space.
- [ ] `&`, `=`, and `%` remain prompt data rather than changing the URI query structure.
- [ ] Unicode and emoji remain intact.
- [ ] The prompt is not auto-submitted.
- [ ] Terminal output contains neither the prompt nor `zed://agent`.

Record:

```text
Scenario D result: PASS / FAIL
Exact prompt preserved: yes / no
Literal plus preserved: yes / no
Ampersand/equal/percent preserved: yes / no
Unicode/emoji preserved: yes / no
Prompt auto-submitted: yes / no
Notes:
```

Clear the composer without submitting the marker.

## 8. Scenario E — option-like prompt handling

Verify that an unknown option-looking prompt is treated as prompt data rather
than leaked by Commander:

```bash
bun src/cli/index.ts zed-agent --repo-harness-zed-mvp1-option-smoke
```

Pass criteria:

- [ ] CLI exits `0` and returns promptly.
- [ ] Zed receives `--repo-harness-zed-mvp1-option-smoke` as composer text.
- [ ] The marker is not printed to terminal stdout/stderr.
- [ ] The marker is not auto-submitted.

Then verify a known option token can be passed literally using the conventional
`--` separator:

```bash
bun src/cli/index.ts zed-agent -- --help
```

Pass criteria:

- [ ] Zed receives `--help` as prompt text.
- [ ] Repo-harness does not display the `zed-agent` help screen for this invocation.
- [ ] `--help` is not auto-submitted.

Record:

```text
Scenario E result: PASS / FAIL
Unknown option-like prompt reached Zed: yes / no
Unknown option-like prompt leaked to terminal: yes / no
Literal --help reached Zed after -- separator: yes / no
Prompt auto-submitted in either case: yes / no
Notes:
```

Clear the composer without submitting the marker.

## 9. Scenario F — usage failure is prompt-free

Run the command without a prompt:

```bash
bun src/cli/index.ts zed-agent
```

Expected result:

```text
exit: 2
stderr: repo-harness zed-agent: provide a non-empty prompt
```

Pass criteria:

- [ ] Exit status is `2`.
- [ ] No Zed window/composer change is triggered.
- [ ] Error output is generic and contains no URI.

Record:

```text
Scenario F result: PASS / FAIL
CLI exit status:
Zed changed state: yes / no
Unexpected output:
Notes:
```

## 10. Scenario G — missing-Zed failure does not leak prompt data

This scenario temporarily gives the child CLI a `PATH` containing Bun but not
Zed. It does not uninstall or modify Zed.

Run:

```bash
TMP_BIN="$(mktemp -d)"
ln -s "$(command -v bun)" "$TMP_BIN/bun"
PATH="$TMP_BIN" "$TMP_BIN/bun" src/cli/index.ts zed-agent "repo-harness-zed-mvp1-missing-zed"
STATUS=$?
rm -rf "$TMP_BIN"
printf 'exit=%s\n' "$STATUS"
```

Expected exit status is `1`.

Pass criteria:

- [ ] Exit status is `1`.
- [ ] Output clearly indicates that Zed could not be launched/found without dumping raw child-process internals.
- [ ] Output does **not** contain `repo-harness-zed-mvp1-missing-zed`.
- [ ] Output does **not** contain `zed://agent`.
- [ ] No Zed UI state changes.

Record:

```text
Scenario G result: PASS / FAIL
CLI exit status:
Prompt leaked to output: yes / no
URI leaked to output: yes / no
Raw child-process error dumped: yes / no
Zed changed state: yes / no
Notes:
```

## 11. Final acceptance checklist

The manual MVP1 compatibility gate passes only when every required item below is
supported by direct observation from this run.

- [ ] OS and architecture recorded.
- [ ] `zed --version` recorded.
- [ ] Direct `zed://agent?prompt=` preflight works on this Zed build.
- [ ] No-window launch observed and recorded.
- [ ] Existing-window behavior observed and recorded.
- [ ] Multiple-window behavior observed and recorded.
- [ ] Prompt is visually prefilled in the Agent Panel composer.
- [ ] Prompt is never auto-submitted.
- [ ] CLI returns promptly after the local hand-off.
- [ ] Unicode and reserved symbols are visually preserved.
- [ ] Unknown option-like prompt data is preserved without terminal leakage.
- [ ] Literal `--help` works as prompt data after `--`.
- [ ] Missing prompt exits `2` without launching Zed.
- [ ] Missing Zed exits `1` with prompt-independent output.
- [ ] Production stdout/stderr never contains the test prompt or `zed://agent`.
- [ ] No result is interpreted as proof that an Agent turn completed.

Any unchecked item means the manual gate is incomplete or failed for the tested
environment.

## 12. Evidence record for PR closeout

Copy this block into the PR, review artifact, or other approved durable closeout
record and fill it with observed facts. Do not convert an unobserved item into a
pass.

```text
Zed Agent MVP1 manual compatibility evidence

Tester:
Date/time:
Commit SHA:
OS / version:
Architecture:
Bun version:
Zed version:

Direct URI preflight: PASS / FAIL
No-window launch: PASS / FAIL
Existing-window launch: PASS / FAIL
Multi-window launch: PASS / FAIL
Unicode/reserved-symbol preservation: PASS / FAIL
Option-like prompt handling: PASS / FAIL
Missing-prompt behavior: PASS / FAIL
Missing-Zed privacy/failure behavior: PASS / FAIL
Prompt visibly prefilled: PASS / FAIL
Prompt never auto-submitted: PASS / FAIL
CLI returned promptly: PASS / FAIL
Prompt/URI absent from terminal output: PASS / FAIL

Observed workspace/window routing:

Validation gaps or deviations:

Overall manual MVP1 compatibility gate: PASS / FAIL / INCOMPLETE
```

## 13. Failure handling

If any scenario fails:

1. record the exact Zed version, OS/architecture, scenario, and observed behavior;
2. do not include sensitive prompt content in the report;
3. distinguish a Zed URI-route incompatibility from a repo-harness CLI failure;
4. do not broaden MVP1 into ACP, headless execution, installer targets, hooks,
   fleet, reviewer, or provider surfaces as an incidental fix; and
5. leave the manual compatibility gate failed/incomplete until the behavior is
   understood and re-tested.

If product requirements grow to require thread identity, responses, tools,
completion tracking, or first-class external-agent lifecycle control, open a
separate ACP work package rather than extending this launcher-only hand-off.
