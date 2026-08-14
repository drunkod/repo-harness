# Implementation and Testing Tutorial: Zed Interactive Hand-off MVP 1

> This tutorial describes a future implementation. Do not execute it until the
> launcher-only plan is approved and captured through the repository workflow.

## 1. Understand what you are building

The command is a UI hand-off:

```bash
repo-harness zed-agent "Explain the current failing test"
```

It is not:

- an install target;
- a hook adapter;
- an LLM provider;
- an ACP External Agent;
- a headless runner; or
- a command that knows whether the agent finished.

A successful command means only: **the local Zed CLI accepted a request to open
the prompt URI**.

## 2. Preflight

### 2.1 Confirm repository state

```bash
git status --short --branch
git branch --show-current
```

If current state conflicts with the approved work package, use the repository's
contract-worktree workflow rather than absorbing unrelated changes.

### 2.2 Capture the approved plan

Use the repo-harness work-package capture and plan-to-contract flow required by
`AGENTS.md`. The documentation package you are reading is not itself an active
execution lock.

### 2.3 Verify Zed behavior first

Install the CLI if needed. Current Zed documentation says macOS users can run
`cli: install cli binary` from the Command Palette.

Check the version:

```bash
zed --version
```

Use a harmless marker:

```bash
zed 'zed://agent?prompt=repo-harness-zed-mvp1-smoke'
```

Verify visually:

1. Zed opens.
2. The Agent Panel composer contains the marker.
3. No message was submitted.
4. The CLI returns promptly.
5. You know which workspace received the prompt.

Do not continue if the route auto-submits or is unavailable.

## 2A. Bind the architecture capability

The current longest-prefix model already assigns `src/cli/index.ts` and the
external-tooling docs to
`capability.runtime-harness.global-runtime-reconciliation`. The new command,
effect, and tests are otherwise unmatched/root paths.

Edit the capability source of truth:

```text
.archcontext/model/nodes/capability.runtime-harness.global-runtime-reconciliation.yaml
```

Use the proposed node fragment to add responsibility, path claims, and focused
verification. Then run:

```bash
archctx docs plan --json
```

Record and apply the generated output set reported by that plan. Do not hand
edit the generated architecture module.

## 3. Add the effect module

Create:

```text
src/effects/zed-agent-launcher.ts
```

Use the complete snippet from
[`proposed-code-snippets.md`](proposed-code-snippets.md#1-srceffectszed-agent-launcherts-new).

### Why this file is flat

There is no existing `src/effects/agent/` directory, and one effect does not
justify a new shared layer. A flat effect matches current repository structure.

### Why the URI builder is separate

`buildZedAgentUri` is pure and can be tested without opening an editor. It also
makes the transport contract explicit:

```ts
buildZedAgentUri('test prompt')
// zed://agent?prompt=test%20prompt
```

### Why use `URLSearchParams`

It correctly encodes query delimiters such as `&`, `=`, `%`, and `+` as prompt
data. Its form encoding uses `+` for spaces, so the implementation normalizes
those separator plus signs to `%20`. A literal prompt plus is already `%2B` and
is not changed.

### Why inject the process function

A fake binary path alone forces every test through filesystem/process setup. A
typed runner lets unit tests capture command, arguments, and options directly.
The CLI integration test still uses a fake executable to verify the real
registration path.

### Why the launcher result omits the URI

The URI contains the prompt. Returning it makes accidental logging likely. The
pure builder exposes it only where encoding tests need it; the effect result
contains only status and non-sensitive failure metadata.

## 4. Add the command module

Create:

```text
src/cli/commands/zed-agent.ts
```

Use the complete snippet from
[`proposed-code-snippets.md`](proposed-code-snippets.md#2-srcclicommandszed-agentts-new).

### Validation behavior

Treat an empty or whitespace-only prompt as usage failure:

```text
exit:   2
stdout: empty
stderr: repo-harness zed-agent: provide a non-empty prompt
```

The effect must not be called.

### Success wording

Safe output should communicate exactly two facts:

1. The local Zed CLI accepted the hand-off request.
2. The user must check Zed and, if the prompt appears, review and submit it.

It must not claim that repo-harness observed Zed opening or displaying the
prompt.

It must not print:

- the prompt;
- the URI;
- the child command line; or
- raw child-process errors.

### Why use optional variadic Commander arguments

A required Commander argument can fail before command-domain validation and may
use Commander's default exit code. `[prompt...]` lets `runZedAgent` consistently
own the specified exit code `2` while accepting either:

```bash
repo-harness zed-agent "test prompt"
repo-harness zed-agent test prompt
```

Quoted input remains recommended because the shell otherwise performs its own
expansion and spacing rules.

Commander normally prints an unknown option before `.action()` executes. The
builder therefore uses `.allowUnknownOption(true)` so an option-like prompt such
as `--review-this` reaches the prompt action without being echoed. Known options
such as `--help` still behave as options; pass them literally after `--`:

```bash
repo-harness zed-agent -- --help
```

## 5. Register the command

Edit:

```text
src/cli/index.ts
```

Apply the three focused changes shown in
[`proposed-code-snippets.md`](proposed-code-snippets.md#3-srccliindexts-edit).

### 5.1 Add the import

Place it with other public command builders.

### 5.2 Add the subcommand id

Add `zed-agent` to `SUBCOMMANDS` so public command inventory remains complete.

### 5.3 Register the builder

Add:

```ts
program.addCommand(buildZedAgentCommand());
```

near the other builder registrations.

### Do not change installer help

Leave this unchanged:

```ts
const TARGET_HELP = 'codex|claude|both';
```

The command is not an install target.

## 6. Add effect tests

Create:

```text
tests/effects/zed-agent-launcher.test.ts
```

Use the proposed test snippet.

Run it alone:

```bash
bun test tests/effects/zed-agent-launcher.test.ts
```

### Encoding cases to inspect

| Prompt | Required property |
|---|---|
| `test prompt` | URI contains `test%20prompt` |
| `a+b` | URI contains `a%2Bb` |
| `a&b=c` | delimiters remain inside one prompt value |
| `100%` | percent is encoded |
| `line 1\nline 2` | newline round-trips |
| `你好 👋` | Unicode round-trips |

For all cases, the strongest assertion is:

```ts
expect(new URL(uri).searchParams.get('prompt')).toBe(prompt);
```

Also assert the canonical `%20` spelling for spaces.

### Process seam cases

Assert:

- call count is one;
- command is `zed`;
- argument count is one;
- argument is the built URI;
- stdio is ignored;
- timeout is bounded;
- cwd is passed through;
- `ENOENT` becomes `not-found`; and
- non-zero status or signal becomes `launch-failed`.

## 7. Add command and CLI tests

Create:

```text
tests/cli/zed-agent.test.ts
```

Use the proposed test snippet.

Run it alone:

```bash
bun test tests/cli/zed-agent.test.ts
```

### Prompt-leakage sentinel

Use an unmistakable fake secret such as:

```text
SENTINEL_DO_NOT_LOG_7f4c2f
```

Call the command-domain function with the sentinel and assert:

```ts
expect(`${result.stdout}\n${result.stderr}`).not.toContain(secret);
expect(`${result.stdout}\n${result.stderr}`).not.toContain('zed://agent');
```

Repeat on ordinary failure and injected-exception paths. Also run the real CLI
with an unknown option-like sentinel beginning with `--`; assert it reaches the
fake `zed` URI and is absent from stdout/stderr. Test a known option name as
literal prompt data after the standard `--` separator.

### Fake Zed integration test

Create a temporary executable named `zed` that writes its first argument to a
temporary log, then exits `0`. Prepend its directory to `PATH`, run the real CLI
entrypoint, and inspect the captured argument.

This proves:

- Commander registration;
- prompt argument adaptation;
- default effect invocation;
- binary resolution through `PATH`; and
- URI encoding.

The captured test log may contain the non-sensitive test URI. Production
stdout/stderr must not.

### Missing binary test

Invoke the absolute Bun executable while giving the child a `PATH` that cannot
resolve `zed`. Assert exit `1` and safe guidance. Do not assert raw Node error
text.

## 8. Update canonical external-tooling docs and project them

Edit only the canonical source:

```text
assets/reference-configs/external-tooling.md
```

Insert the section in
[`proposed-code-snippets.md`](proposed-code-snippets.md#6-external-tooling-documentation-edit).

The section must distinguish:

- interactive URI hand-off;
- ACP External Agents; and
- headless execution.

Generate and verify the tracked target using the repository's explicit
projection model:

```bash
bun run sync:reference-configs
bun run check:reference-configs
```

The canonical root is `assets/reference-configs`; the generated target is
`docs/reference-configs`. Do not hand-edit the target.

## 9. Focused validation

Run the smallest checks first:

```bash
bun test tests/effects/zed-agent-launcher.test.ts tests/cli/zed-agent.test.ts
bun src/cli/index.ts --help
bun src/cli/index.ts zed-agent --help
```

Expected help properties:

- `zed-agent` appears in top-level help;
- command help says interactive hand-off;
- command help says manual submission is required; and
- install target help remains Claude/Codex/both.

## 10. Safe manual validation

Use only a harmless marker:

```bash
bun src/cli/index.ts zed-agent "repo-harness-zed-mvp1-smoke"
```

Expected terminal output is generic. It must not contain:

```text
repo-harness-zed-mvp1-smoke
zed://agent
```

Then inspect Zed:

- marker is in the composer;
- marker is unsubmitted;
- correct/observed workspace behavior is recorded.

Press Enter only if you intentionally want to run that harmless prompt.

## 11. Privacy review

Before merge, inspect all new messages and errors:

```bash
rg -n "prompt|uri|error\.message|result\.error|args" \
  src/effects/zed-agent-launcher.ts \
  src/cli/commands/zed-agent.ts
```

Review each match. Legitimate internal URI construction is expected; prompt or
URI interpolation into user-visible output is not.

Remember that even safe output does not hide the URI from process observers.
Document, do not deny, that residual risk.

## 12. Full repository validation

Run all required checks from `AGENTS.md`:

```bash
bun test
bash scripts/check-deploy-sql-order.sh
bash scripts/check-architecture-sync.sh
bash scripts/check-task-sync.sh
repo-harness run check-task-workflow --strict
bun scripts/inspect-project-state.ts --repo . --format text
bun src/cli/index.ts init --repo . --dry-run
```

Also run:

```bash
git diff --check
git status --short
git diff --name-only
```

The product paths should match the approved future list plus workflow artifacts
created by the active contract. Any installer, hook, compatibility, fleet, or
reviewer path is an execution-boundary violation.

## 13. Review checklist

- [ ] `both` still expands to Claude and Codex only.
- [ ] `ALL_TARGETS` remains length two.
- [ ] No Zed `AgentTarget` exists.
- [ ] Workflow compatibility agents remain Claude and Codex.
- [ ] Success output is truthful and generic.
- [ ] Manual-submit wording is present.
- [ ] URI and prompt are absent from output.
- [ ] Missing prompt exits `2`.
- [ ] Missing/failing Zed exits `1`.
- [ ] Effect tests do not open real Zed.
- [ ] Manual test uses only a harmless marker.
- [ ] Official ACP docs are linked for first-class integration.

## 14. Rollback tutorial

No persistent state is written, so rollback is source-only:

1. remove the `buildZedAgentCommand` import;
2. remove `zed-agent` from `SUBCOMMANDS`;
3. remove its `addCommand` call;
4. delete the command module;
5. delete the effect module;
6. delete the two focused test files; and
7. remove the canonical documentation section and re-run
   `sync:reference-configs`; and
8. remove the new paths/responsibility from the capability node and regenerate
   architecture docs.

Re-run focused and full checks. There is no user config to migrate or uninstall.

## 15. Escalation to ACP

Stop extending this command if requirements grow to include threads, responses,
tools, completion tracking, remote execution, or first-class Zed agent UI.
Open a separate ACP work package using Zed's documented `agent_servers` custom
agent boundary. Do not evolve the URI convenience command into an implicit
protocol adapter.
