# Zed Eval MVP 2: Future Implementation and Testing Tutorial

> **Documentation-only branch:** `docs/zed-eval-mvp2-plan` performs no
> implementation. The steps below are a future work package, not behavior that
> exists in this checkout.
>
> **Current verdict:** **REVISE BEFORE APPROVAL**. Do not begin implementation
> until [`audit-and-revised-plan.md`](./audit-and-revised-plan.md) is present,
> reviewed, and approved.

## 1. How to use this guide

Read these documents in order:

1. [`audit-and-revised-plan.md`](./audit-and-revised-plan.md) — decision
   authority for scope, findings, and approval conditions.
2. [`proposed-code-snippets.md`](./proposed-code-snippets.md) — illustrative
   code shapes, not source authority.
3. This tutorial — ordered implementation and verification procedure.

Resolve conflicts with this precedence:

1. the approved audit and revised plan;
2. the current repo-harness source and repository contracts;
3. Zed source at the pinned commit;
4. this tutorial;
5. proposed snippets.

Do not paste the snippets mechanically. Reconcile every snippet with the
approved audit, current `src/effects/process-runner.ts`, current CLI wiring, and
the pinned upstream behavior. If any upstream contract differs, stop and update
the audit/source pin before coding.

## 2. Frozen MVP boundary

Implement one public command with one synchronous operation:

```text
repo-harness zed-eval [options]
  -> Zed-specific admission
  -> runProcess(..., { processGroup: true, ... })
  -> eval-cli exits
  -> validate exit/result/artifacts
  -> print terminal receipt and exit
```

The operation is complete only after `eval-cli` exits and artifacts have been
validated. The public result is terminal, never a promise of a still-running
remote job.

### Required

- A top-level `zed-eval` command.
- A Zed-specific synchronous runner.
- Reuse of `runProcess` from `src/effects/process-runner.ts` with
  `processGroup: true`.
- A caller-built, explicitly selected `eval-cli` executable.
- Read-only built-in tools by default through `ZED_EVAL_DISABLE_TOOLS`.
- A separately requested writable mode admitted only after explicit
  `--disposable-worktree` acknowledgement, independent proof of a non-primary
  clean linked Git worktree, and creation of a fresh run-scoped `HOME`.
- A fresh, non-existing output directory at
  `.ai/harness/runs/zed-eval/<runId>/`.
- Runtime validation of the upstream result schema, artifact set, status, and
  exit-code pair.
- Focused fake-binary tests and a small opt-in real canary.

### Forbidden

Do not add any of the following for MVP 2:

- `src/core/fleet/`;
- `src/effects/fleet/`;
- a `fleet` command for Zed;
- a generic runtime adapter or single-entry runtime registry;
- `probe`/`prepare`/`start`/`collect` lifecycle abstractions;
- a live handle, PID handle, event iterator, or persistent run registry;
- a public `cancel` command or a cancel method that cannot target a live public
  operation;
- direct `spawn`, `spawnSync`, `exec`, or a second process supervisor;
- a second output-redaction implementation;
- Modal, Harbor, Pier, or Zed's Python remote `zed-eval` orchestration;
- automatic installation, download, vendoring, or redistribution of
  `eval-cli`;
- claims that tool filtering is an OS sandbox or pre-tool authorization hook.

The existing **Agent Fleet** name remains reserved for the installed
Claude/Codex specialist roster. A one-entry registry is not future-proofing; it
is unproven indirection.

## 3. Pinned upstream contract

All behavior in this section comes from Zed commit
[`24e25552b1259d56a6fdd7956a419ed9e8a1a25e`](https://github.com/zed-industries/zed/tree/24e25552b1259d56a6fdd7956a419ed9e8a1a25e).
Re-audit before changing the pin.

### 3.1 Upstream options

The executable is named `eval-cli`. Its public options at the pin are:

| Option | Pinned behavior | Wrapper rule |
| --- | --- | --- |
| `--workdir <path>` | Repository working directory; defaults to `.` | Always pass the canonical admitted workdir. |
| `--instruction <text>` | Prompt text; stdin is used if omitted | Prefer an argument array; never construct a shell command. Reject an empty prompt. |
| `--instruction-suffix-file <path>` | Appends non-empty file text | Canonicalize and require a regular readable file. |
| `--model <provider/model>` | Defaults to `anthropic/claude-sonnet-4-6-latest` | Validate a non-empty provider/model form and record it as expected result metadata. |
| `--timeout <seconds>` | Agent wall-clock limit | Require a positive safe integer. Give the process supervisor a small greater outer deadline. |
| `--output-dir <path>` | Artifact directory; defaults to `.` | Never accept a caller-selected directory. Pass the unique run directory. |
| `--no-staff` | Disables staff mode, which is on by default | Forward only when explicitly requested. |
| `--reasoning-effort <level>` | Described as `low`, `medium`, or `high`; thinking-capable default is `high` | Validate the documented values before spawn. |
| `--thinking <bool>` | Optional boolean thinking override | Serialize exactly `true` or `false`. |

`--printenv` exists as a hidden internal Zed option. Do not expose or forward it
in the repo-harness command.

The wrapper may add only wrapper-owned admission options, such as:

- `--binary <absolute-path>`;
- `--mode read-only|writable`;
- `--disposable-worktree`;
- `--json`.

Do not describe these as upstream flags.

### 3.2 Artifacts and result shape

Upstream documents these files under `--output-dir`:

- `result.json` — structured terminal result;
- `thread.md` — Markdown transcript;
- `thread.json` — raw serialized thread.

`result.json` contains:

- `status`;
- optional `error`;
- `duration_secs`;
- optional `timeout_secs`;
- `model`;
- optional `input_tokens`;
- optional `output_tokens`;
- optional `cache_creation_input_tokens`;
- optional `cache_read_input_tokens`;
- optional `step_count`;
- optional `tool_call_count`;
- optional `tool_calls`, a per-tool count object.

Treat this JSON as untrusted external data. `JSON.parse(...) as EvalResult` is
not validation.

### 3.3 Status and exit-code pairs

At the source pin, accepted pairs are exactly:

| Exit | `result.json.status` | Meaning |
| ---: | --- | --- |
| `0` | `completed` | Agent run finished. This does not by itself prove task correctness. |
| `1` | `error` | Model, authentication, configuration, runtime, or agent failure. |
| `2` | `timeout` | Upstream agent wall-clock timeout. |
| `3` | `interrupted` | Upstream handled `SIGTERM` or `SIGINT` and attempted partial output. |

Do not normalize these into invented lifecycle states such as `running`,
`queued`, or `cancelled`. Do not accept a mismatched pair. An outer
`runProcess.timedOut === true` is a wrapper/supervisor failure, not a validated
upstream `timeout`, because the child may have been killed before publishing a
terminal result.

### 3.4 Tool filtering is not containment

At the pin, upstream sets tool permission default to `allow`. It can remove
named built-in tools with comma-separated `ZED_EVAL_DISABLE_TOOLS`. The profile
also enables all context servers. Therefore:

- built-in-tool removal is useful defense in depth;
- it is not an operating-system sandbox;
- it is not a pre-tool authorization callback;
- it does not prove that an unknown context server is harmless;
- write mode still requires filesystem isolation; and
- no docs or output may claim complete host isolation.

## 4. Build and licensing prerequisites

`eval-cli` is part of the Zed source tree, not repo-harness. At the pin its Cargo
package declares `GPL-3.0-or-later`. The binary must **not** become part of the
normal repo-harness install, npm package, setup flow, or agent-fleet install.

From a separate Zed checkout:

```bash
git clone https://github.com/zed-industries/zed.git
cd zed
git checkout 24e25552b1259d56a6fdd7956a419ed9e8a1a25e
cargo build -p eval_cli --release
```

The same-OS binary is normally:

```text
target/release/eval-cli
```

Before a real run:

```bash
git rev-parse HEAD
test -x target/release/eval-cli
target/release/eval-cli --help
```

The first command must print the pinned SHA. Build on the same OS/architecture
as the host running repo-harness. Zed's Linux container build route is a
separate upstream concern and is out of this local MVP.

Do not copy the binary into this repository. Select it with an absolute path:

```bash
repo-harness zed-eval \
  --binary /absolute/path/to/zed/target/release/eval-cli \
  --workdir /absolute/path/to/repository \
  --instruction "Inspect the repository and summarize its test entrypoints." \
  --model anthropic/claude-sonnet-4-6-latest \
  --timeout 120 \
  --json
```

## 5. Environment and API-key safety

A real model run can send the prompt, selected repository content, and tool
outputs to the configured model provider. It can incur cost and trigger
provider rate limits. Obtain approval for the repository/data classification
before a live run.

Provider keys are supplied through environment variables, commonly
`ANTHROPIC_API_KEY` or `OPENAI_API_KEY`. Follow these rules:

1. Load keys from a secret manager or an already-exported environment variable.
2. Never put a literal key in CLI arguments, Markdown, shell history, fixtures,
   snapshots, logs, `result.json`, or transcripts.
3. Never write keys into the disposable `HOME`.
4. Use the existing process runner's inherited-environment behavior plus only
   audited runner-owned overrides; do not copy environment values into CLI
   arguments or receipts.
5. Require the selected provider's key to be present, but never print or persist
   its value. Treat proxy variables, custom CA paths, and provider overrides as
   sensitive inherited inputs.
6. Do not add support for `ZED_EVAL_ENABLE_FLAGS`,
   `ZED_OPENAI_COMPATIBLE_PROVIDERS`, or
   `ZED_ANTHROPIC_AVAILABLE_MODELS` without separate validation and tests.
7. Override `ZED_EVAL_DISABLE_TOOLS` deterministically. Ambient input must never
   weaken the required read-only or writable subagent denials.
8. In writable mode, override HOME only with the newly admitted run-scoped HOME;
   arbitrary caller HOME selection is forbidden.
9. Add command-specific redaction for prompt-bearing arguments; shared generic
   redaction does not otherwise know that instruction text is sensitive.
10. Remember that redaction is defense in depth, not permission to print secrets
    deliberately.

Document every inherited-sensitive input and every runner-owned override. JSON
and human receipts must omit provider-key values, prompt text, and raw
transcripts.

## 6. Future implementation sequence

### Step 0: Open an approved work package

This documentation branch is not implementation approval. After the audit is
approved:

1. capture/promote the approved work-package plan under `plans/`;
2. create its contract and linked contract worktree through the repository's
   plan-to-contract workflow;
3. record the pre-change status, including existing untracked files;
4. preserve `docs/zed-agent-mvp1/` byte-for-byte and status-for-status; and
5. copy the execution boundary into the contract: absent requirements are
   forbidden extras.

### Step 1: Reconcile the snippets

Open `proposed-code-snippets.md` beside the approved audit. For every snippet:

- keep Zed-specific validation and the synchronous call shape;
- replace any direct child-process use with `runProcess`;
- remove generic fleet interfaces, adapters, registries, and commands;
- remove start/handle/collect/cancel APIs;
- replace reusable output paths with exclusive unique creation;
- replace TypeScript assertions with runtime validators;
- make read-only the default;
- place writable mode behind explicit acknowledgement, independent linked-
  worktree proof, and a fresh run-scoped `HOME` gate; and
- preserve the unique run root and opaque artifacts on every terminal path.

If the snippets and approved audit cannot be reconciled without widening scope,
stop and revise the plan rather than improvising a larger subsystem.

### Step 2: Use the smallest file surface

Use the exact approved names from the revised plan. The approved minimal implementation surface is:

- `src/core/zed-eval/types.ts`;
- `src/core/zed-eval/result-schema.ts`;
- `src/core/zed-eval/admission.ts`;
- `src/effects/zed-eval/run-zed-eval.ts`;
- `src/cli/commands/zed-eval.ts`;
- the three required registration edits in `src/cli/index.ts`;
- `tests/zed-eval-result-schema.test.ts`;
- `tests/zed-eval-admission.test.ts`;
- `tests/zed-eval-runner.test.ts`;
- `tests/cli/zed-eval.test.ts`; and
- architecture/workflow projections required by repository policy.

These modules are Zed-specific; they do not define a generic runtime interface.
Do not create `src/core/fleet/`, `src/effects/fleet/`, or
`src/cli/commands/fleet.ts`. Change `tests/process-runner.test.ts` only if a
new shared `runProcess` invariant is genuinely required, not to duplicate
Zed-specific behavior.

### Step 3: Define narrow request and terminal-result types

The request should contain only values the operation controls, for example:

- canonical source workdir;
- absolute `eval-cli` path;
- non-empty instruction;
- optional suffix-file path;
- provider/model identifier;
- upstream timeout seconds;
- optional staff, reasoning, and thinking controls;
- execution mode: `read-only` or `writable`;
- disposable-worktree acknowledgement;
- inherited environment plus audited runner-owned overrides; and
- optional deterministic dependencies used by tests, such as `now` or
  `randomBytes`.

The terminal result should contain:

- generated `runId`;
- repo-relative and absolute artifact-directory paths;
- admitted mode and actual workdir;
- redacted command array;
- upstream exit code, signal, and outer-timeout flag;
- validated upstream result; and
- validation or cleanup error when the operation fails closed.

Do not include a live process, cancel function, event stream, remote job id, or
status polling method.

### Step 4: Validate the executable before any output mutation

Resolve `--binary` without shell or PATH ambiguity:

1. require an absolute path;
2. canonicalize it;
3. require a regular file;
4. require executable permission on the current platform;
5. reject a directory, symlink escape that cannot be canonicalized, or missing
   path; and
6. do not download or install anything when validation fails.

Require the explicit `--binary` option. Do not silently search PATH, infer a
binary from an adapter id, download Zed, or add an ambient fallback. Record the
audited expected commit in the receipt, but record actual binary provenance as
`verified` only when separately established; otherwise say `unverified`.

### Step 5: Validate request values

Before creating the run directory:

- canonicalize the source workdir and prove it is a Git worktree;
- reject a missing or non-directory workdir;
- reject an empty/whitespace-only instruction;
- require `provider/model`, not a bare model name;
- require timeout to be a positive safe integer;
- validate reasoning effort as `low|medium|high`;
- parse thinking as a real boolean;
- canonicalize and validate an optional suffix file;
- reject caller control of `--output-dir`, hidden `--printenv`, and raw extra
  args;
- default `--mode` to `read-only`;
- reject `--disposable-worktree` in read-only mode;
- require `--disposable-worktree` in writable mode; and
- reject unsupported modes and arbitrary HOME/environment overrides.

Fail before model/network activity whenever possible.

### Step 6: Allocate a collision-proof run directory

Use the repository's existing ignored evidence root:

```text
<repo>/.ai/harness/runs/zed-eval/<runId>/
```

Generate `runId` from a sortable UTC timestamp plus sufficient random entropy,
using only a conservative filename alphabet. Then:

1. create `.ai/harness/runs/zed-eval/` recursively;
2. create `<runId>` with exclusive semantics;
3. fail on collision instead of reusing or deleting an existing directory;
4. canonicalize the parent and prove the new directory remains beneath it;
5. create run-scoped `home/` only after writable admission succeeds;
6. require `<runId>/artifacts/` to remain absent before process launch;
7. never accept `..`, separators, an absolute run id, or a user-selected output
   directory; and
8. pass `<runId>/artifacts/` as upstream `--output-dir`, allowing upstream to
   create that exact absent directory.

Every attempt gets a new directory, including errors. Never read artifacts from
an older run after a spawn or write failure.

Recommended shape:

```text
.ai/harness/runs/zed-eval/<runId>/
  home/          # writable mode only; fresh run-scoped HOME
  artifacts/     # exact --output-dir; absent before launch
    result.json
    thread.md
    thread.json
```

Do not turn `.ai/harness/runs/` into tracked durable documentation. Durable
conclusions belong in the repository's normal review/research surfaces.

### Step 7: Create a run-scoped HOME only after writable admission

Read-only mode does not need a new HOME contract in this MVP. Writable mode
must create `<runId>/home/` beneath the canonical run root only after linked-
worktree admission succeeds. Set restrictive permissions where supported and
pass that exact path as `HOME`.

Prove all of these before writable process launch:

- `HOME` canonicalizes successfully beneath the new run root;
- it differs from the operator's real HOME;
- it did not exist before this invocation;
- it was created for this run; and
- arbitrary caller-selected HOME values are rejected.

Never fall back to the operator HOME after a creation or proof failure. Keep the
run-scoped HOME with ignored run evidence for diagnosis/explicit cleanup; do not
automatically promote anything from it into tracked repository artifacts.

### Step 8: Enforce the exact read-only default

`--mode` defaults to `read-only`. Every read-only invocation must set this exact
pinned deterministic value:

```text
copy_path,create_directory,create_thread,delete_path,apply_code_action,edit_file,write_file,fetch,move_path,rename_symbol,spawn_agent,terminal,search_web
```

This removes the known mutation, shell, network, and subagent surfaces from the
pinned upstream write profile while retaining repository read/navigation tools.
Do not make network-tool denial optional in read-only mode.

Rules:

- ignore ambient attempts to weaken `ZED_EVAL_DISABLE_TOOLS`;
- do not pass an empty disable list;
- tests must inspect the fake child's received environment;
- review the pinned upstream `WRITE_TOOLS` list before changing the source pin;
- because upstream can enable context servers, describe this mode as
  "built-in tools restricted", never a sandbox; and
- if validated metrics report a disabled tool, reject the result as a contract
  violation even when the process exits `0`.

### Step 9: Admit writable mode only in a proven disposable linked worktree

The caller creates/selects the candidate worktree and must pass both
`--mode writable` and `--disposable-worktree`. The acknowledgement is necessary
but not sufficient; admission independently proves the worktree facts.

Fail-closed sequence:

1. Canonicalize the repository root and supplied workdir.
2. Require the explicit writable mode and disposable acknowledgement.
3. Prove the workdir is a Git linked worktree, not the primary/source worktree.
4. Prove the linked worktree is clean at admission time, including untracked
   state according to the approved check.
5. Allocate the unique run root while keeping `artifacts/` absent.
6. Create and prove the fresh `<runId>/home/` described in Step 7.
7. Set writable `ZED_EVAL_DISABLE_TOOLS` to at least
   `create_thread,spawn_agent`, preserving the one-process/one-run boundary.
8. Only after every proof passes, invoke `eval-cli` with the supplied admitted
   linked worktree and fresh HOME.

Use Git's own worktree structure, canonical common-dir/git-dir facts, and a
primary-worktree comparison. A branch name, path prefix, marker, or caller
assertion is not proof. Admission creates HOME and run paths; it does not create,
remove, or manage the caller's disposable linked worktree.

Failure must occur before process launch and identify the failed invariant. It
must never fall back to writable execution in the primary worktree or with the
operator HOME.

### Step 10: Build the exact upstream argument vector

Build an array, not a shell string:

```text
[
  "--workdir", admittedWorkdir,
  "--instruction", instruction,
  "--model", model,
  "--timeout", String(timeoutSeconds),
  "--output-dir", outputDir,
  ...optionalPinnedFlags
]
```

Add optional flags only when supplied:

- `--instruction-suffix-file <canonical-path>`;
- `--no-staff`;
- `--reasoning-effort <low|medium|high>`;
- `--thinking <true|false>`.

Do not forward unknown arguments. Do not use `shell: true`. Do not include API
keys in arguments. Enforce exactly one instruction source: explicit option or
stdin. Because `runProcess` has no bounded stdin payload option, the minimal CLI
reads stdin once, rejects empty/conflicting input, and normalizes it into the
same redacted `--instruction` argument.

### Step 11: Execute through the existing process authority

Call the existing operation directly:

```ts
runProcess(evalCliBin, args, {
  cwd: admittedWorkdir,
  env: runnerOwnedOverrides,
  processGroup: true,
  timeoutMs: outerTimeoutMs,
  maxOutputBytes: boundedDiagnosticBytes,
  // Use the approved shared additive-redaction mechanism for prompt text.
});
```

The real implementation should use approved constants and types rather than the
placeholder names above. Environment inheritance remains the shared runner's
default; the overrides must deterministically set tool restrictions and, only
for admitted writable mode, the fresh HOME. The command-specific redaction must
hide `--instruction` content in command/error diagnostics.

At present, `RunProcessOptions.redactions` replaces the shared default list. Do
not pass a Zed-only replacement and do not copy the default patterns into the
Zed module. If prompt redaction cannot be added while retaining shared defaults,
make the smallest additive-redaction extension in
`src/effects/process-runner.ts`, prove it in `tests/process-runner.test.ts`, and
keep ownership of composition in that shared process authority.

Set the outer process deadline greater than the upstream `--timeout` so
`eval-cli` normally owns agent timeout classification and has time to cancel and
write artifacts. For example, add one small fixed artifact/cleanup grace period.
The outer deadline remains an emergency bound, not a second semantic agent
timeout.

Never retry automatically. A retry may incur additional cost and create a
second model-side action. The operator can issue a new invocation, which receives
a new `runId`.

### Step 12: Validate the process envelope first

Before reading JSON:

- reject `runProcess.timedOut === true` as wrapper timeout;
- reject a signal-only/inconsistent supervisor result;
- accept only numeric statuses `0`, `1`, `2`, or `3` for an upstream terminal
  result;
- preserve redacted stdout/stderr for diagnostics;
- never parse stderr's `[eval-cli] result:` line as authority; and
- read only from the newly created `<runId>/artifacts/` directory.

An unknown exit code is a contract failure. Do not reinterpret it as `error`.

### Step 13: Validate `result.json` structurally

Require `artifacts/result.json` to be freshly created as a regular file beneath
the exact run's `artifacts/` directory. Bound its size before reading. Parse JSON
once and validate every field:

- root is a plain object, not null or an array;
- `status` is exactly `completed|error|timeout|interrupted`;
- `error`, when present, is a string;
- `duration_secs` is finite and non-negative;
- `timeout_secs`, when present, is a non-negative safe integer;
- `model` is a non-empty string and equals the requested model;
- every optional token/step/tool total is a non-negative safe integer;
- `tool_calls`, when present, is a plain object;
- every tool name is a non-empty string;
- every per-tool count is a non-negative safe integer;
- the sum of per-tool counts equals `tool_call_count` when both are present;
- `error` status contains an actionable non-empty error string;
- non-error statuses do not contain a non-empty upstream error; and
- the status matches the process exit code exactly.

Reject malformed UTF-8, malformed JSON, duplicate/escaped-path tricks exposed by
the filesystem check, unsupported fields if the approved contract chooses a
closed schema, and values outside safe numeric bounds.

### Step 14: Validate and retain opaque transcript artifacts

`result.json` is the only structured terminal authority. Treat `thread.md` and
`thread.json` as opaque evidence, never as control-flow input:

- inventory only files freshly created beneath the exact `artifacts/` directory;
- reject symlinks, directories, path escapes, and oversized artifacts;
- when a transcript path is returned, require the corresponding regular file to
  exist beneath that directory;
- preserve absence as absence when upstream fails before creating a thread;
- do not parse `thread.json`, infer status from either transcript, synthesize a
  missing transcript, or copy from another run; and
- include an artifact-sensitivity warning in human and JSON receipts.

A process exit of `0` with missing `result.json`, malformed result data, an
invalid artifact path, or contradictory exit/status becomes the distinct
adapter error. Keep the ignored run directory for diagnosis.

### Step 15: Return terminal output and preserve exit semantics

On successful validation, emit one receipt. Human output should identify the
mode, upstream status, exit code, run id, and artifact path without printing the
entire transcript. `--json` should emit a stable object with redacted command
metadata and the validated result.

Exit behavior:

- preserve upstream `0`, `1`, `2`, or `3` when the corresponding terminal result
  validates;
- use one documented non-zero adapter error code outside upstream `0..3` (use
  `4` unless the approved implementation reserves another value) for admission,
  spawn, outer-timeout, schema, artifact, or coherence failure; and
- let Commander handle malformed command usage consistently with the rest of
  the CLI.

Do not claim that upstream `completed` means the task passed its tests. It means
only that the agent loop stopped normally.

### Step 16: Wire all three CLI registration points

Creating `src/cli/commands/zed-eval.ts` is not sufficient. Update
`src/cli/index.ts` in all three places:

1. import `buildZedEvalCommand` beside other command builders;
2. add `'zed-eval'` to `SUBCOMMANDS`; and
3. call `program.addCommand(buildZedEvalCommand())` in `buildProgram()`.

Add help-text tests that prove the command is discoverable and its default mode
is read-only. Do not add a `repo-harness run zed-eval` helper alias; this is a
first-class typed command, not a bundled shell helper.

### Step 17: Keep install and packaging behavior unchanged

The command may be shipped as TypeScript source because `src/` is already in the
repo-harness npm publication surface. Do not:

- add the Zed binary to `package.json#files`;
- add Cargo/Rust to repo-harness's install prerequisites;
- update `install`, `setup`, `init`, `update`, or agent-fleet installation to
  build/download Zed;
- add a postinstall hook;
- add a runtime registry manifest; or
- alter normal repo-harness install profiles.

The operator owns the separately built GPL-3.0-or-later binary and supplies its
absolute path explicitly.

## 7. Command examples

The exact final help text must follow the approved command implementation. These
examples show the intended boundary.

### Read-only built-in tools, default mode

```bash
repo-harness zed-eval \
  --binary /absolute/path/to/zed/target/release/eval-cli \
  --workdir /absolute/path/to/repo \
  --instruction "Read the repository and identify the most focused tests for process execution." \
  --model anthropic/claude-sonnet-4-6-latest \
  --timeout 180 \
  --reasoning-effort low \
  --thinking true \
  --json
```

Expected properties:

- mode defaults to `read-only`;
- the exact pinned mutation/network/terminal/subagent list is passed through
  `ZED_EVAL_DISABLE_TOOLS`;
- no sandbox claim is made;
- output is under the source repo's ignored run root in a fresh `artifacts/`
  directory; and
- the command blocks until validation finishes.

### Instruction suffix file

```bash
repo-harness zed-eval \
  --binary /absolute/path/to/eval-cli \
  --workdir /absolute/path/to/repo \
  --instruction "Audit the requested surface." \
  --instruction-suffix-file /absolute/path/to/non-secret-constraints.md \
  --model anthropic/claude-sonnet-4-6-latest \
  --timeout 180
```

Do not place API keys or other secrets in the suffix file; the model receives
its content.

### Writable mode

First create a disposable linked worktree outside the primary worktree. Then
invoke the command against that exact clean linked worktree:

```bash
repo-harness zed-eval \
  --binary /absolute/path/to/eval-cli \
  --workdir /absolute/path/to/disposable-linked-worktree \
  --mode writable \
  --disposable-worktree \
  --instruction "Apply the narrowly specified change and run its focused test." \
  --model anthropic/claude-sonnet-4-6-latest \
  --timeout 600 \
  --json
```

The command independently proves that the supplied workdir is linked,
non-primary, and clean; creates a fresh run-scoped HOME; disables subagent tools;
and fails before model launch if any proof fails. The caller remains responsible
for reviewing/removing the disposable linked worktree.

### Disable staff mode

```bash
repo-harness zed-eval \
  --binary /absolute/path/to/eval-cli \
  --workdir /absolute/path/to/repo \
  --instruction "Summarize the architecture boundaries." \
  --model anthropic/claude-sonnet-4-6-latest \
  --timeout 120 \
  --no-staff
```

## 8. Fake `eval-cli` test executable

Do not use a real model or API key in unit tests. Create a temporary executable
fixture during the test and remove it in `afterEach`.

### 8.1 Fixture design

A practical fixture is a small executable Bun script with:

```text
#!/usr/bin/env bun
```

It should:

1. parse only the pinned upstream arguments;
2. reject unknown or duplicate singleton flags;
3. require `--workdir`, `--instruction`, `--model`, `--timeout`, and
   `--output-dir` as expected by the wrapper;
4. record a sanitized `argv` and selected environment snapshot in the output
   directory for assertions;
5. never record provider-key values;
6. create deterministic `result.json`, `thread.md`, and `thread.json`;
7. exit with the selected pinned code; and
8. support failure modes through a test-only environment variable that the
   production command never exposes publicly.

Suggested fixture modes:

| Mode | Files | Exit | Purpose |
| --- | --- | ---: | --- |
| `completed` | valid result + both transcripts | `0` | Happy path. |
| `error-pre-thread` | valid error result only | `1` | Allowed pre-thread error shape. |
| `error-with-thread` | valid result + both transcripts | `1` | Error after thread creation. |
| `timeout` | valid result + both transcripts | `2` | Upstream timeout pair. |
| `interrupted` | valid result + both transcripts | `3` | Upstream interrupted pair. |
| `status-mismatch` | valid JSON with wrong status | selected mismatch | Pair rejection. |
| `malformed-result` | invalid JSON | `0` | Parser failure. |
| `missing-result` | transcripts only | `0` | Required artifact failure. |
| `symlink-thread` | result + transcript symlink | `0` | Artifact containment/type rejection. |
| `escaped-thread` | result + attempted outside path | `0` | Artifact escape rejection. |
| `bad-counts` | inconsistent tool totals | `0` | Schema invariant failure. |
| `forbidden-tool` | reports a disabled write tool | `0` | Read-only postcondition failure. |
| `sleep` | no terminal files before delay | n/a | Outer timeout/process-group cleanup. |
| `secret-output` | emits sentinel key-like strings | `1` | Existing redaction remains effective. |

Use a sentinel such as `test-provider-key` only. Assert the fake child receives
the key through its environment when required, but never writes the value to
artifacts or captured output.

### 8.2 No production test backdoor

Inject the fake through the same absolute binary option/resolver used by real
operators. Do not add `if (NODE_ENV === "test")`, a fake result shortcut, or a
production environment variable that bypasses admission/validation.

## 9. Focused automated tests

Use the approved four-file boundary: pure schema tests, pure admission tests,
fake-executable runner tests, and CLI tests. Cover at least the following.

### Admission

- missing, relative, non-executable, directory, and broken-symlink binary paths;
- missing/non-Git workdir;
- empty instruction;
- invalid model, timeout, reasoning effort, and thinking values;
- suffix-file missing/empty/not regular;
- rejection of caller-selected output or unknown passthrough args;
- run-id collision fails rather than reuses;
- output canonicalization remains under `.ai/harness/runs/zed-eval/`;
- ambient environment cannot weaken mandatory disabled tools;
- `artifacts/` is absent before launch; and
- inherited provider secrets never appear in args, receipts, or artifacts
  written by the fake.

### Read-only default

- omitted `--mode` selects read-only;
- fake child receives the exact deterministic pinned disable list, including
  `fetch` and `search_web`;
- no disposable-HOME claim is required for read-only mode;
- no `src/core/fleet`/registry behavior is called;
- forbidden reported tool calls invalidate an otherwise completed result; and
- context-server limitations are not mislabeled as sandbox guarantees.

### Writable gate

- writable mode without `--disposable-worktree` is rejected;
- acknowledgement in read-only mode is rejected;
- primary, non-linked, and dirty worktrees are rejected before `eval-cli` runs;
- canonical common-dir/git-dir and primary-worktree proofs are enforced;
- fake child receives the exact admitted linked-worktree path;
- fake child HOME is the fresh `<runId>/home/`, not operator HOME;
- fake child receives at least `create_thread,spawn_agent` denials;
- a failed linked-worktree or HOME proof never falls back to primary state; and
- the runner does not create or remove the caller-owned disposable worktree.

### Invocation and process behavior

- exact argument order and optional forwarding;
- values containing spaces or shell metacharacters remain one argument;
- `runProcess` receives `processGroup: true`, inherited environment plus only
  audited overrides, command-specific prompt redaction, and a bounded outer
  timeout;
- outer timeout is distinguishable from upstream exit `2`;
- no automatic retry occurs; and
- stdout/stderr and command metadata remain redacted/capped by the shared
  process runner.

### Result and artifacts

- each valid status/exit pair;
- all mismatched and unknown pairs;
- missing, oversized, malformed, symlink, directory, and escaped artifacts;
- required and optional result fields;
- finite/non-negative numbers and safe integers;
- model equality;
- error-field rules;
- per-tool sum consistency;
- transcript paths are contained regular-file references but transcript content
  remains opaque to control flow; and
- no stale artifact reuse between unique runs.

### CLI wiring

- `SUBCOMMANDS` includes `zed-eval`;
- root `--help` lists it;
- command help lists the wrapper and pinned forwarded options;
- default help clearly says read-only built-in tools;
- no `fleet` or `cancel` Zed command appears;
- human and JSON terminal receipts; and
- validated upstream exit codes propagate.

Run the focused set first:

```bash
bun test tests/zed-eval-result-schema.test.ts
bun test tests/zed-eval-admission.test.ts
bun test tests/zed-eval-runner.test.ts
bun test tests/cli/zed-eval.test.ts
bun test tests/process-runner.test.ts
bun run check:type
```

## 10. Architecture projection workflow

This is an architecture-sensitive new CLI/effect path. Do not hand-edit only a
generated architecture module and call it complete.

### 10.1 Update the model authority

Before projection, resolve the new files through the current longest-prefix
capability source. The likely owner is
`capability.verification.evals-checks`, but verify rather than assume.

Update `.archcontext/model/nodes/*.yaml` so the source-of-truth node includes the
new Zed runner, CLI command, and focused tests, and so its entrypoint/data-flow
selectors describe the actual synchronous call path. Do not create a fake
fleet capability.

Keep `src/effects/process-runner.ts` as the existing process authority and show
the new runner calling it; do not duplicate its responsibility in the model.

### 10.2 Plan before applying

From the implementation worktree, use the actual changed paths:

```bash
repo-harness architecture-projection status --json
repo-harness architecture-projection plan --json \
  --changed-path src/core/zed-eval/types.ts \
  --changed-path src/core/zed-eval/result-schema.ts \
  --changed-path src/core/zed-eval/admission.ts \
  --changed-path src/effects/zed-eval/run-zed-eval.ts \
  --changed-path src/cli/commands/zed-eval.ts \
  --changed-path src/cli/index.ts \
  --changed-path tests/zed-eval-result-schema.test.ts \
  --changed-path tests/zed-eval-admission.test.ts \
  --changed-path tests/zed-eval-runner.test.ts \
  --changed-path tests/cli/zed-eval.test.ts
```

Review the planned target, capability, refresh signals, and generated diff.
Stop if the plan routes the work into an unrelated capability or proposes
unreviewed cross-boundary changes.

### 10.3 Apply and process refresh signals

After review:

```bash
repo-harness architecture-projection apply --json \
  --changed-path src/core/zed-eval/types.ts \
  --changed-path src/core/zed-eval/result-schema.ts \
  --changed-path src/core/zed-eval/admission.ts \
  --changed-path src/effects/zed-eval/run-zed-eval.ts \
  --changed-path src/cli/commands/zed-eval.ts \
  --changed-path src/cli/index.ts \
  --changed-path tests/zed-eval-result-schema.test.ts \
  --changed-path tests/zed-eval-admission.test.ts \
  --changed-path tests/zed-eval-runner.test.ts \
  --changed-path tests/cli/zed-eval.test.ts
repo-harness architecture-projection drain --json
```

Follow emitted refresh signals. When the workflow opens an architecture request
or durable workstream, use its emitted exact block/request values with:

```bash
repo-harness run workstream-sync ensure --block "<emitted-block>" --request "<emitted-request>"
repo-harness run context-contract-sync sync-latest
```

Do not invent a request path. Promote durable architectural conclusions into
the human-owned section of the appropriate architecture module. Generated
sections remain projections from `.archcontext/model/nodes/*.yaml`.

### 10.4 Verify projection

```bash
bash scripts/check-architecture-sync.sh
```

Also verify the generated module describes:

- one direct synchronous `zed-eval` operation;
- `runProcess` as the process authority;
- read-only built-in tools by default;
- the disposable worktree/HOME write gate;
- unique ignored artifacts;
- no registry, live handle, or cancel surface; and
- the pinned upstream result contract.

## 11. Repository workflow and root required checks

Because implementation is substantive, sync the active plan/contract/current
status and any required architecture/workstream projections according to root
`AGENTS.md`. Keep `tasks/todos.md` for deferred goals, not an active execution
checklist.

After focused tests and architecture projection pass, run every root required
check exactly as declared:

```bash
bun test
bash scripts/check-deploy-sql-order.sh
bash scripts/check-architecture-sync.sh
bash scripts/check-task-sync.sh
repo-harness run check-task-workflow --strict
bun scripts/inspect-project-state.ts --repo . --format text
bun src/cli/index.ts init --repo . --dry-run
```

Also run type checking when available:

```bash
bun run check:type
```

Do not claim a check passed unless its command was run and exited successfully.
A live model canary does not replace unit tests or root checks.

## 12. Manual canary

A real canary is opt-in because it uses external APIs, can cost money, and may
send repository content to a provider.

### 12.1 Prepare a harmless fixture

Create a small disposable Git repository containing only non-sensitive text and
commit it. Do not use the repo-harness working tree for the first canary.

```bash
mkdir /tmp/zed-eval-canary
cd /tmp/zed-eval-canary
git init -b main
printf '# Canary\n\nNo source code or secrets.\n' > README.md
git add README.md
git -c user.name='Zed Eval Canary' -c user.email='canary@example.invalid' commit -m 'test: add canary fixture'
```

Load the provider key from a secret manager into the environment without
printing it. Do not paste the literal value into the command.

### 12.2 Read-only canary first

From the repo-harness checkout:

```bash
repo-harness zed-eval \
  --binary /absolute/path/to/zed/target/release/eval-cli \
  --workdir /tmp/zed-eval-canary \
  --instruction "Read README.md and answer with its heading. Do not modify files or run terminal commands." \
  --model anthropic/claude-sonnet-4-6-latest \
  --timeout 120 \
  --no-staff \
  --json
```

Verify:

1. the command blocks until completion;
2. receipt exit/status is a valid pinned pair;
3. the run path is unique and its `artifacts/` directory was absent before
   launch;
4. `result.json` validates and transcript paths are contained opaque artifacts;
5. the fixture's `git status --porcelain=v1 --untracked-files=all` is empty;
6. reported tool calls contain no disabled tools; and
7. output does not expose the API key, prompt text, or transcript contents.

### 12.3 Writable canary second

Only after read-only passes, create a disposable linked worktree and confirm it
starts clean:

```bash
git -C /tmp/zed-eval-canary worktree add --detach /tmp/zed-eval-canary-write HEAD
git -C /tmp/zed-eval-canary-write status --porcelain=v1 --untracked-files=all
repo-harness zed-eval \
  --binary /absolute/path/to/zed/target/release/eval-cli \
  --workdir /tmp/zed-eval-canary-write \
  --mode writable \
  --disposable-worktree \
  --instruction "Create CANARY.txt containing only the word isolated, then stop." \
  --model anthropic/claude-sonnet-4-6-latest \
  --timeout 180 \
  --no-staff \
  --json
```

Verify the admitted path is `/tmp/zed-eval-canary-write`, the primary fixture
still has no `CANARY.txt`, the writable change exists only in the linked
worktree, the receipt identifies a fresh run-scoped HOME distinct from operator
HOME, subagent tools were disabled, and unique artifacts remain. Review the
linked worktree, then remove it explicitly:

```bash
git -C /tmp/zed-eval-canary worktree remove --force /tmp/zed-eval-canary-write
git -C /tmp/zed-eval-canary worktree prune
```

Do not run writable mode against a valuable repository until this canary and all
automated gates pass.

## 13. Troubleshooting

| Symptom | Likely cause | Safe response |
| --- | --- | --- |
| `eval-cli` path rejected | Relative, missing, non-regular, or non-executable binary | Build from the pinned Zed checkout and pass the canonical absolute `target/release/eval-cli` path. Do not add PATH fallback. |
| Binary fails to start | OS/architecture mismatch or missing dynamic dependencies | Rebuild on the execution host; do not download an unverified binary automatically. |
| Provider not authenticated | Required provider key absent from the inherited environment | Confirm the selected provider and secret-manager export. Never print the key. |
| Model not found | Provider/model id differs from the pinned Zed registry/discovery result | Use a discovered exact model id or re-audit approved provider overrides; do not silently switch models. |
| Outer process timeout | Supervisor deadline fired before a validated upstream result | Keep artifacts, diagnose runtime duration, and adjust the fixed grace only with tests. Do not relabel as upstream exit `2`. |
| Exit `2` with `timeout` | Upstream agent timeout | Inspect partial transcripts; choose a larger explicit upstream timeout only if cost/risk is approved. |
| Exit/status mismatch | Binary drift, fake-fixture bug, or corrupted artifacts | Fail closed. Verify binary commit and result bytes; never normalize the mismatch. |
| `result.json` missing | Early crash, write failure, wrong output path, or incompatible binary | Preserve the unique run directory and stderr; use the documented adapter error code, never upstream `1`. Never reuse an old result. |
| One transcript missing | Pre-thread failure or partial artifact write | Preserve and report the opaque artifact inventory; never infer status or synthesize the missing file. `result.json` remains the authority. |
| Read-only run reports `terminal` or a write tool | Tool-profile contract drift | Reject the result, stop canaries, and compare the pinned upstream tool list. |
| Writable mode rejects the workdir | Workdir is primary, non-linked, dirty, or lacks acknowledgement | Create/select a clean disposable linked worktree and pass both writable flags. Never weaken the proof. |
| Linked-worktree proof fails | Git metadata/path assumptions do not hold | Abort before model spawn. Fix the proof for the platform; never fall back to original worktree. |
| Run-scoped HOME proof fails | Path canonicalization, containment, or creation failure | Abort before writable launch. Never use operator HOME as fallback. |
| Disposable worktree remains | The caller still owns the linked-worktree lifecycle | Review it, then remove/prune the exact path explicitly. The adapter must not remove it. |
| API key appears in output | Provider/tool emitted it in an unexpected form | Revoke/rotate immediately, stop runs, preserve access-controlled evidence, and extend shared redaction only with a regression test. |
| Unexpected context-server behavior | Upstream eval profile enables all context servers | Stop the run and tighten the disposable environment/HOME policy. Do not claim built-in-tool filtering was a sandbox. |
| Root checks fail in unrelated files | Pre-existing repository failure | Record the exact command/output and distinguish it from introduced failures; do not edit unrelated code to make the slice green. |

## 14. Rollback

### Code rollback

This MVP should be additive and narrow. To roll it back:

1. remove the `buildZedEvalCommand` registration call;
2. remove `'zed-eval'` from `SUBCOMMANDS`;
3. remove the command import;
4. remove `src/cli/commands/zed-eval.ts`;
5. remove `src/effects/zed-eval/run-zed-eval.ts`;
6. remove `src/core/zed-eval/types.ts`, `result-schema.ts`, and `admission.ts`;
7. remove only `tests/zed-eval-result-schema.test.ts`,
   `tests/zed-eval-admission.test.ts`, `tests/zed-eval-runner.test.ts`, and
   `tests/cli/zed-eval.test.ts`;
8. revert the corresponding ArchContext source node and regenerate the
   architecture projection;
9. sync/close the workstream and workflow artifacts through the normal contract
   closeout; and
10. rerun focused and root required checks.

Do not roll back shared `src/effects/process-runner.ts` behavior unless the Zed
slice changed it and the change is independently proven unnecessary. Prefer not
to change it in the first place.

### Runtime cleanup

Run artifacts are ignored evidence. A rollback does not need to delete them.
If policy permits deletion after diagnosis, remove only exact
`.ai/harness/runs/zed-eval/<runId>/` directories selected by the operator.
Never recursively delete `.ai/harness/runs/` as part of command rollback.

A stale disposable linked worktree requires explicit inspection:

```bash
git worktree list --porcelain
git worktree remove --force /exact/disposable/worktree/path
git worktree prune
```

Do not use broad `rm -rf` guesses against repository or HOME paths.

The external `eval-cli` binary remains in the operator's Zed checkout; it was
never installed or owned by repo-harness.

## 15. Forbidden-file and scope checks

Capture baselines before implementation:

```bash
git status --porcelain=v1 --untracked-files=all > /tmp/zed-eval-status.before
git status --porcelain=v1 --untracked-files=all -- docs/zed-agent-mvp1 > /tmp/zed-agent-mvp1.before
```

After implementation, inspect every changed path:

```bash
git status --short
git diff --name-only
git diff --cached --name-only
```

The implementation diff may contain only the approved `src/core/zed-eval/`
files, `src/effects/zed-eval/run-zed-eval.ts`, Zed command,
`src/cli/index.ts`, four focused test files, and required approved
architecture/workflow projections. Investigate every other path.

Prove the protected untracked package was not touched:

```bash
git status --porcelain=v1 --untracked-files=all -- docs/zed-agent-mvp1 > /tmp/zed-agent-mvp1.after
cmp /tmp/zed-agent-mvp1.before /tmp/zed-agent-mvp1.after
```

Explicitly reject the retired generic design:

```bash
test ! -e src/core/fleet
test ! -e src/effects/fleet
test ! -e src/cli/commands/fleet.ts
! git diff --name-only -- package.json install.sh install.ps1 src/cli/commands/install.ts src/cli/commands/global-runtime.ts .ai/harness/workflow-contract.json assets/workflow-contract.v1.json | grep .
```

Search the implementation diff for forbidden lifecycle claims and direct
process authorities:

```bash
git diff -- src tests | grep -E 'FleetRuntimeAdapter|runtime registry|live handle|cancel\(|spawnSync|execSync|child_process' && exit 1 || true
```

Review matches manually: `src/effects/process-runner.ts` legitimately owns
child-process use, while the new Zed-specific files must not. A textual grep is
a review aid, not a substitute for reading the diff.

Also ensure no binary or secret was added:

```bash
git diff --numstat
git status --short --untracked-files=all
```

Reject unexpected executables, large binary files, provider keys, Zed checkout
content, `target/`, or tracked `.ai/harness/runs/zed-eval/` artifacts.

## 16. Acceptance checklist

Implementation is ready for review only when all items are true:

- [ ] The audit verdict has been revised/approved explicitly.
- [ ] The code follows the approved audit rather than unsafe illustrative
      snippets.
- [ ] Exactly one public synchronous `repo-harness zed-eval` operation exists.
- [ ] `src/effects/process-runner.ts#runProcess` is reused with
      `processGroup: true`.
- [ ] No direct child-process or second redaction/supervision authority exists.
- [ ] No generic fleet directory, registry, adapter, or `fleet` command exists.
- [ ] No live handle, event stream, polling lifecycle, or fake cancel exists.
- [ ] The binary is caller-built from the pinned Zed commit and selected by
      canonical absolute path.
- [ ] GPL-3.0-or-later and the non-installed binary boundary are documented.
- [ ] Read-only built-in tools are the default via mandatory
      `ZED_EVAL_DISABLE_TOOLS` entries.
- [ ] Writable mode can run only after explicit disposable acknowledgement,
      independent proof of a caller-supplied non-primary clean linked worktree,
      and creation/proof of a fresh run-scoped HOME.
- [ ] Gate failure never falls back to the source worktree or real HOME.
- [ ] Every run uses a fresh exclusive
      `.ai/harness/runs/zed-eval/<runId>/` root and an `artifacts/` path that is
      absent before launch.
- [ ] The exact pinned flags, statuses, result fields, artifacts, and exit codes
      are tested.
- [ ] Runtime validation rejects malformed or contradictory external output.
- [ ] Fake-binary focused tests pass without real API calls.
- [ ] Architecture model/projection and workflow artifacts are synchronized.
- [ ] All root required checks pass or pre-existing failures are reported
      precisely.
- [ ] The read-only manual canary passes before the writable canary.
- [ ] `docs/zed-agent-mvp1/` and every non-approved path are unchanged.
- [ ] This documentation branch itself remains implementation-free.
