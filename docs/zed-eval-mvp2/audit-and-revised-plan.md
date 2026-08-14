# Zed eval-cli MVP2 Audit and Revised Plan

**Status:** Audit complete; implementation not started  
**Verdict:** **REVISE BEFORE APPROVAL**  
**Reviewed target:** Zed `eval-cli` at commit `24e25552b1259d56a6fdd7956a419ed9e8a1a25e`  
**Repository branch inspected:** `docs/zed-eval-mvp2-plan`  
**Scope of this artifact:** Documentation and future-plan definition only

> This document performs no implementation. It does not add a runtime adapter, command, registry, admission code, tests, workflow routing, policy changes, or compatibility changes.

## 1. Executive verdict

The proposed MVP2 should not be approved in its original “Fleet Runtime Adapter” form.

The current repository has no `src/core/fleet/` or `src/effects/fleet/` implementation to extend. The proposed `runtime-adapter`, `admission`, `adapter`, `registry`, and `fleet` command would therefore create a new generic subsystem before there is a second runtime consumer or a demonstrated shared invariant. That is inconsistent with the repository rule to create shared components only for observed reuse or a cross-module invariant.

The name is also already occupied. In this repository, **Agent Fleet** means the installed Claude/Codex specialist roster sourced from `agents/fleet`, projected into the two host-specific agent directories, and managed through `external_tooling.agent_fleet`. A new `repo-harness fleet` command for Zed process execution would overload an established product term with a different meaning.

The upstream Zed executable does provide enough capability for a useful narrow integration:

- one headless invocation;
- explicit work directory and instruction input;
- model, timeout, reasoning, thinking, and staff-mode controls;
- a structured terminal `result.json`;
- transcript artifacts;
- stable status/exit-code pairs at the pinned commit; and
- tool removal through `ZED_EVAL_DISABLE_TOOLS`.

It does **not** provide the capabilities implied by the proposed generic runtime interface:

- no structured event stream;
- no native sandbox control exposed by `eval-cli`;
- no pre-tool authorization callback;
- no asynchronous start/handle/collect protocol;
- no registry or runtime-discovery protocol; and
- no safe read-only mode as a first-class CLI option.

The corrected MVP2 is therefore a narrow `zed-eval` domain with exactly one synchronous operation. It should reuse the repository’s existing bounded `runProcess` authority, validate the upstream result schema explicitly, allocate a unique non-existing output directory under `.ai/harness/runs/zed-eval/`, and fail closed at every admission or result-contract boundary.

## 2. Audit scope and interpretation of the original proposal

The proposal’s named surfaces are interpreted as the following intended additions:

| Proposed surface | Intended role | Audit disposition |
|---|---|---|
| `src/core/fleet/runtime-adapter.ts` | Generic runtime interface | **Reject for MVP2.** No second runtime consumer and upstream does not satisfy the proposed asynchronous/evented shape. |
| `src/core/fleet/admission.ts` | Generic fleet admission | **Replace with Zed-specific admission.** Keep only the path, mode, output, and environment invariants actually required by `eval-cli`. |
| `src/effects/fleet/adapter.ts` | Zed process adapter under a fleet effects layer | **Replace with one Zed-specific synchronous operation.** Reuse `runProcess`; do not introduce another process authority. |
| `src/effects/fleet/registry.ts` | Runtime registry | **Defer.** A registry with one entry is indirection without demonstrated reuse. Extract only after a second independently implemented runtime consumer exposes a real common contract. |
| `src/cli/commands/fleet.ts` | Public `fleet` command | **Rename and narrow to `zed-eval`.** `fleet` already denotes the installed specialist roster. |

This audit does not treat the older multi-provider research sketch as implemented architecture. That document itself describes a much broader asynchronous `FleetRuntimeAdapter` with `probe`, `prepare`, `start`, event iteration, cancellation, and collection, plus capabilities such as structured events, pre-tool guards, and native sandboxes. It separately schedules admission and runtime registries only in a later scheduler phase. See `docs/researches/20260808-repo-harness-in-opencode.md:365-408`, `docs/researches/20260808-repo-harness-in-opencode.md:1171-1199`, and `docs/researches/20260808-repo-harness-in-opencode.md:1286-1307`.

## 3. Verified current-repository baseline

### 3.1 There is no fleet runtime implementation to extend

A repository inventory on this branch found neither `src/core/fleet/` nor `src/effects/fleet/`. The existing references to a possible runtime abstraction are research material, not source authority.

This matters because the original proposal is not a small adapter addition. It would establish the naming, layers, interfaces, lifecycle, and registry semantics of a new generic subsystem. MVP2 has evidence for only one concrete executable and one invocation shape.

### 3.2 The bounded process authority already exists

`src/effects/process-runner.ts` already owns the process-execution concerns needed by this slice:

- synchronous execution through `spawnSync`;
- optional exact or inherited environment construction;
- bounded timeout;
- output caps;
- command/stdout/stderr redaction;
- explicit result status and signal capture; and
- optional supervised process-group termination.

The public request/result contracts are at `src/effects/process-runner.ts:7-36`. Supervised process-group execution is at `src/effects/process-runner.ts:126-217`. The exported synchronous `runProcess` operation, timeout classification, redaction, and output capping are at `src/effects/process-runner.ts:220-260`.

The existing unit tests already prove redaction, output capping, exact-environment execution, and timeout reporting in `tests/process-runner.test.ts:1-51`.

**Consequence:** the Zed integration must call `runProcess(..., { processGroup: true, ... })`. It must not add direct `spawn`, `spawnSync`, `exec`, a second supervisor, or a second redaction implementation.

### 3.3 CLI registration has three required touchpoints

A new builder-style command is not registered merely by creating a command file. Current CLI construction requires all of the following:

1. import the command builder in `src/cli/index.ts` alongside the existing builders (`src/cli/index.ts:9-32`);
2. add the public command name to `SUBCOMMANDS` (`src/cli/index.ts:73-95`); and
3. call `program.addCommand(...)` inside `buildProgram` (`src/cli/index.ts:334-340`, with existing builder registrations at `src/cli/index.ts:716-724`).

Any future implementation plan or acceptance test that covers only `src/cli/commands/zed-eval.ts` is incomplete.

### 3.4 `fleet` is already an established repository term

`docs/reference-configs/external-tooling.md:444-451` defines **Agent Fleet** as the repo-harness-owned package surface whose single authored source is `package:agents/fleet` and whose managed list is the installed specialist roster. Its Claude and Codex projections are documented at `docs/reference-configs/external-tooling.md:453-458`.

The machine-readable authority is `.ai/harness/policy.json:376-393`, under `external_tooling.agent_fleet`, including the managed agents and the `repo-harness run install-agent-fleet` command.

**Consequence:** `repo-harness fleet` would collide semantically with installed-agent management. The Zed command must be named `zed-eval`, and its internal domain should likewise be `zed-eval`, not `fleet`.

### 3.5 Runs already have a canonical ignored evidence root

`.ai/harness/policy.json:106-115` defines `.ai/harness/runs` as the harness run directory. `.ai/harness/policy.json:149-162` classifies run snapshots as ignored raw evidence rather than durable tracked artifacts.

**Consequence:** Zed output belongs under `.ai/harness/runs/zed-eval/`; no new evidence root or tracked output convention is needed.

### 3.6 Host compatibility is not the Zed executable matrix

`.ai/harness/workflow-contract.json:4-9` defines `compatibility.agents` as `claude` and `codex`. That field describes supported agent hosts in the installed workflow contract. A local invocation of Zed’s evaluation executable does not make Zed a new host adapter and does not justify adding `zed` to `compatibility.agents`.

**Consequence:** no `compatibility.agents` change belongs in this MVP2.

## 4. Verified upstream `eval-cli` contract

All upstream claims below are pinned to:

- repository: `zed-industries/zed`;
- commit: `24e25552b1259d56a6fdd7956a419ed9e8a1a25e`;
- file: `crates/eval_cli/src/main.rs`.

### 4.1 Inputs

At the pinned commit, `eval-cli` exposes:

| Upstream option | Semantics | Citation |
|---|---|---|
| `--workdir` | Repository working directory; defaults to `.` | [main.rs lines 72-74](https://github.com/zed-industries/zed/blob/24e25552b1259d56a6fdd7956a419ed9e8a1a25e/crates/eval_cli/src/main.rs#L72-L74) |
| `--instruction` or stdin | Prompt text; stdin is used when the option is omitted | [main.rs lines 76-78](https://github.com/zed-industries/zed/blob/24e25552b1259d56a6fdd7956a419ed9e8a1a25e/crates/eval_cli/src/main.rs#L76-L78) |
| `--instruction-suffix-file` | File appended to the instruction | [main.rs lines 80-82](https://github.com/zed-industries/zed/blob/24e25552b1259d56a6fdd7956a419ed9e8a1a25e/crates/eval_cli/src/main.rs#L80-L82) |
| `--model` | Provider/model identifier | [main.rs lines 84-86](https://github.com/zed-industries/zed/blob/24e25552b1259d56a6fdd7956a419ed9e8a1a25e/crates/eval_cli/src/main.rs#L84-L86) |
| `--timeout` | Agent wall-clock timeout in seconds | [main.rs lines 88-90](https://github.com/zed-industries/zed/blob/24e25552b1259d56a6fdd7956a419ed9e8a1a25e/crates/eval_cli/src/main.rs#L88-L90) |
| `--output-dir` | Artifact directory | [main.rs lines 92-94](https://github.com/zed-industries/zed/blob/24e25552b1259d56a6fdd7956a419ed9e8a1a25e/crates/eval_cli/src/main.rs#L92-L94) |
| `--no-staff` | Disables default staff mode | [main.rs lines 96-98](https://github.com/zed-industries/zed/blob/24e25552b1259d56a6fdd7956a419ed9e8a1a25e/crates/eval_cli/src/main.rs#L96-L98) |
| `--reasoning-effort` | Optional reasoning effort | [main.rs lines 100-103](https://github.com/zed-industries/zed/blob/24e25552b1259d56a6fdd7956a419ed9e8a1a25e/crates/eval_cli/src/main.rs#L100-L103) |
| `--thinking` | Optional boolean thinking override | [main.rs lines 105-107](https://github.com/zed-industries/zed/blob/24e25552b1259d56a6fdd7956a419ed9e8a1a25e/crates/eval_cli/src/main.rs#L105-L107) |

Instruction/suffix validation is implemented at [main.rs lines 403-430](https://github.com/zed-industries/zed/blob/24e25552b1259d56a6fdd7956a419ed9e8a1a25e/crates/eval_cli/src/main.rs#L403-L430).

### 4.2 Outputs and result shape

The executable writes three files under `--output-dir`:

- `result.json`;
- `thread.md`; and
- `thread.json`.

The upstream file-level contract is documented at [main.rs lines 15-30](https://github.com/zed-industries/zed/blob/24e25552b1259d56a6fdd7956a419ed9e8a1a25e/crates/eval_cli/src/main.rs#L15-L30). Transcript writes occur at [main.rs lines 934-950](https://github.com/zed-industries/zed/blob/24e25552b1259d56a6fdd7956a419ed9e8a1a25e/crates/eval_cli/src/main.rs#L934-L950).

`result.json` is structured but unversioned. Its pinned fields are defined at [main.rs lines 116-142](https://github.com/zed-industries/zed/blob/24e25552b1259d56a6fdd7956a419ed9e8a1a25e/crates/eval_cli/src/main.rs#L116-L142):

- `status`;
- optional `error`;
- `duration_secs`;
- optional `timeout_secs`;
- `model`;
- optional input/output/cache token counts;
- optional `step_count`;
- optional `tool_call_count`; and
- optional per-tool call counts.

The adapter must treat this as untrusted external JSON and validate it before exposing a normalized result. A TypeScript type assertion alone is not validation.

### 4.3 Status and exit semantics

The pinned exit codes are declared at [main.rs lines 155-158](https://github.com/zed-industries/zed/blob/24e25552b1259d56a6fdd7956a419ed9e8a1a25e/crates/eval_cli/src/main.rs#L155-L158), and the result mapping is implemented at [main.rs lines 284-333](https://github.com/zed-industries/zed/blob/24e25552b1259d56a6fdd7956a419ed9e8a1a25e/crates/eval_cli/src/main.rs#L284-L333):

| Exit code | Required `result.json.status` | Meaning |
|---:|---|---|
| `0` | `completed` | Agent run completed |
| `1` | `error` | Model, authentication, runtime, or other error |
| `2` | `timeout` | Upstream agent timeout |
| `3` | `interrupted` | SIGTERM/SIGINT interruption |

A missing result, invalid JSON, invalid field, unknown status, unknown exit code, or exit/status mismatch must be an adapter contract error. It must not be silently normalized into `error` or `completed`.

### 4.4 Tool and safety behavior

The upstream executable does not expose a native sandbox flag or a pre-tool guard in its argument surface. It constructs agent settings with `"tool_permissions": {"default": "allow"}` at [main.rs lines 716-735](https://github.com/zed-industries/zed/blob/24e25552b1259d56a6fdd7956a419ed9e8a1a25e/crates/eval_cli/src/main.rs#L716-L735).

Specific built-in tools can be removed with `ZED_EVAL_DISABLE_TOOLS`. The environment parsing, full write-profile tool list, and filtering are at [main.rs lines 661-715](https://github.com/zed-industries/zed/blob/24e25552b1259d56a6fdd7956a419ed9e8a1a25e/crates/eval_cli/src/main.rs#L661-L715). The list includes both `create_thread` and `spawn_agent`, so subagent tools can be disabled. It also includes file mutation, terminal, fetch, and search tools.

This mechanism is a built-in-tool profile reduction, not an operating-system sandbox and not a pre-tool authorization boundary. The generated eval profile also enables all context servers at [main.rs lines 705-713](https://github.com/zed-industries/zed/blob/24e25552b1259d56a6fdd7956a419ed9e8a1a25e/crates/eval_cli/src/main.rs#L705-L713), so the adapter must not claim that `ZED_EVAL_DISABLE_TOOLS` alone proves complete host isolation.

### 4.5 Event behavior

`result.json` is structured; the live event stream is not. The event subscriber writes assistant text and human-oriented status lines to stderr with `eprint!`/`eprintln!`, including tool status and subagent messages, at [main.rs lines 963-1020](https://github.com/zed-industries/zed/blob/24e25552b1259d56a6fdd7956a419ed9e8a1a25e/crates/eval_cli/src/main.rs#L963-L1020).

The MVP2 adapter must not parse these lines into invented structured events. It may retain bounded/redacted stdout and stderr as diagnostic text, while treating `result.json` as the only structured terminal result and `thread.json` as an opaque upstream artifact.

## 5. Severity-ranked findings

### Critical

#### C1. Writable execution is not safely admitted by the original design

The upstream default is an allow-by-default write profile, with no native sandbox or pre-tool callback exposed by `eval-cli`. Passing a repository path directly to the executable therefore grants the model the runtime’s available mutation and terminal tools unless they are explicitly disabled.

A generic `admission.ts` name does not create containment. Writable mode must be an explicit opt-in and must fail closed unless all of these conditions hold:

1. the work directory is canonicalized and proven to be a Git linked worktree, not the primary/source worktree;
2. the worktree is clean at admission time;
3. the caller explicitly marks the run as writable and disposable;
4. the process receives a fresh isolated `HOME`, distinct from the operator’s real home;
5. the exact output directory is a unique, absent child under `.ai/harness/runs/zed-eval/`;
6. subagent tools are disabled so the one-process/one-run contract cannot fan out; and
7. diagnostics clearly state that this is a disposable-state gate, **not** an OS sandbox or network boundary.

If these conditions cannot be proven, writable mode must stop before process launch.

For read-only mode, the adapter must always set an explicit disable list rather than relying on upstream defaults. The minimum pinned list is:

```text
copy_path,create_directory,create_thread,delete_path,apply_code_action,edit_file,write_file,fetch,move_path,rename_symbol,spawn_agent,terminal,search_web
```

This leaves repository-reading/navigation tools available while removing the known built-in mutation, shell, network, and subagent surfaces from the pinned write profile. Because upstream can enable context servers, documentation and output must describe this as “built-in tools restricted,” not “sandboxed.”

#### C2. `fleet` collides with an existing product concept

The current Agent Fleet is the installed Claude/Codex specialist roster. Reusing `fleet` for Zed eval process execution would make CLI help, policy, documentation, and future maintenance ambiguous.

**Required correction:** use the top-level command and domain name `zed-eval`. Do not add `repo-harness fleet`, `src/core/fleet`, or `src/effects/fleet` in this slice.

### High

#### H1. The proposed interface promises capabilities the executable does not expose

The older generic research interface assumes async preparation, start handles, structured event iteration, explicit cancellation, and collection. The pinned Zed CLI offers a foreground process, signal handling, human-readable stderr, and terminal artifacts.

Implementing the generic interface now would either:

- fake structured events by parsing unstable log text;
- fake asynchronous lifecycle with local bookkeeping;
- create methods that have only one implementation and one call site; or
- weaken interface semantics to the least common denominator before a second runtime is known.

**Required correction:** one synchronous function that returns only after the process terminates and the result contract is validated.

#### H2. Output-directory reuse can mix or overwrite evidence

Upstream creates the supplied output directory and writes fixed filenames. Reusing a directory can mix stale `result.json` or transcript files with a later run, making attribution impossible.

**Required correction:** for each invocation, allocate a run root such as:

```text
.ai/harness/runs/zed-eval/<run-id>/
├── home/          # fresh isolated HOME when writable mode is admitted
└── artifacts/     # exact --output-dir; must not exist before launch
```

The `artifacts/` path passed to `eval-cli` must be unique and non-existing. Reject existing paths and symlinked ancestors that escape the canonical `.ai/harness/runs/zed-eval` root. Do not expose an arbitrary `--output-dir` override in MVP2.

#### H3. Structured output is being trusted without a schema boundary

The upstream Rust struct is not a versioned wire schema. A blind `JSON.parse(...) as EvalResult` would accept missing fields, invalid numeric values, unknown statuses, and exit/status contradictions.

**Required correction:** add explicit runtime validation for the pinned result shape and enforce exit/status coherence. Preserve unknown artifact files as opaque evidence; do not infer success from `thread.md` or stderr.

#### H4. Two timeout authorities need a defined relationship

Zed has an inner agent timeout in seconds. `runProcess` has an outer process timeout in milliseconds and can terminate the process group. Using the same deadline for both creates a race in which the outer supervisor kills Zed before it writes its `timeout` result and partial transcripts.

**Required correction:** define the outer timeout as the requested upstream timeout plus a fixed, tested result-flush grace. If the outer supervisor fires, return a distinct adapter-level `supervisor_timeout`; do not forge an upstream `status: "timeout"`.

#### H5. A one-entry runtime registry has no value

There is no second runtime implementation and no runtime selection requirement in this MVP. A registry adds naming, lookup, duplicate-ID, and capability-negotiation behavior that cannot yet be validated against reuse.

**Required correction:** call the Zed operation directly from the `zed-eval` command. Reconsider extraction only when a second runtime consumer is independently implemented and concrete duplicated behavior is visible.

### Medium

#### M1. CLI wiring in the original file list is incomplete unless `src/cli/index.ts` is included

The command requires import, `SUBCOMMANDS`, and `buildProgram().addCommand(...)` changes. These are acceptance requirements, not optional cleanup.

#### M2. `compatibility.agents` must not change

Zed eval execution is a tool integration, not a third installed workflow host. Adding `zed` would misstate compatibility and force unrelated workflow-contract projection changes.

#### M3. Hook and review routing are unrelated to the vertical slice

A Zed invocation does not need new host hooks, prompt routes, review-provider modes, AcceptanceReceipt semantics, or delegation dispatch. Routing changes would turn a bounded process adapter into a workflow redesign.

#### M4. Transcript and result artifacts may contain sensitive content

`runProcess` redacts its returned command/stdout/stderr, but upstream writes `result.json`, `thread.md`, and `thread.json` directly. Those files may contain prompts, model output, tool inputs, paths, or error details not processed by repo-harness redaction.

The runs directory is ignored runtime evidence, which limits accidental commits but is not data sanitization. The CLI must print the artifact location and a sensitivity warning; it must not copy transcripts into tracked docs, tasks, reviews, or notes automatically.

#### M5. Binary provenance is not defined by a generic adapter ID

The behavior audited here is commit-specific. MVP2 should require an explicit executable path and record the pinned expected upstream commit/build provenance in the normalized receipt. It must not download, build, install, or auto-update Zed.

If executable provenance cannot be established outside the adapter, the result must say `provenance: unverified`; it must not claim the binary exactly matches the audited commit.

### Low

#### L1. Upstream optional metrics must remain optional

Token, cache, step, and tool-call fields are optional in the upstream result. Absence is not zero and must remain `undefined`/absent in the normalized result.

#### L2. Human-readable stderr should remain diagnostics only

Do not add regex parsers for `[tool]`, `[eval-cli]`, or subagent lines. Such parsing would create a shadow protocol without upstream guarantees.

## 6. Corrected capability matrix

| Capability | Pinned upstream reality | MVP2 support | Required design response |
|---|---|---:|---|
| Single foreground run | Yes | Yes | One synchronous operation per CLI invocation. |
| Work directory | `--workdir` | Yes | Canonicalize and validate before launch. |
| Instruction argument | `--instruction` | Yes | Support explicit string input. |
| Instruction from stdin | Used when `--instruction` is absent | Yes | Read once; reject empty input and conflicting sources. |
| Instruction suffix file | `--instruction-suffix-file` | Yes | Canonicalize/readability-check path; pass through without copying. |
| Model selection | `--model` | Yes | Pass exact non-empty provider/model string. |
| Agent timeout | `--timeout` in seconds | Yes | Validate positive integer; pair with a larger outer timeout. |
| Process-tree termination | Not a repo-harness concern upstream | Yes, locally | Use `runProcess` with `processGroup: true`. |
| `--no-staff` | Yes | Yes | Exact boolean pass-through. |
| Reasoning effort | Optional string upstream | Yes, pinned values only | Accept `low`, `medium`, or `high` for this pinned contract; reject other values unless upstream evidence changes. |
| Thinking override | Optional boolean | Yes | Preserve omitted/true/false distinctly. |
| Structured terminal result | `result.json` | Yes | Runtime schema validation plus exit/status coherence. |
| Structured live events | No; human-readable stderr | No | Do not expose `AsyncIterable` or parse log lines. |
| Transcript artifacts | `thread.md`, `thread.json` | Yes, opaque | Retain in the unique run directory; do not parse for control flow. |
| Completed status | Exit `0`, status `completed` | Yes | Preserve exact mapping. |
| Error status | Exit `1`, status `error` | Yes | Preserve exact mapping and validated error text. |
| Timeout status | Exit `2`, status `timeout` | Yes | Distinguish from outer supervisor timeout. |
| Interrupted status | Exit `3`, status `interrupted` | Yes | Preserve exact mapping. |
| Native sandbox | No exposed `eval-cli` control | No | Never label the run sandboxed. |
| Pre-tool guard | No | No | Admission occurs before launch only. |
| Built-in read-only restriction | No first-class mode; disable-list mechanism exists | Yes, constrained | Set the explicit `ZED_EVAL_DISABLE_TOOLS` list on every read-only run. |
| Writable mode | Default tools allow writes | Conditional | Explicit disposable linked-worktree and isolated-HOME gate; fail closed otherwise. |
| Subagent suppression | `create_thread` and `spawn_agent` are disable-list entries | Yes | Disable for MVP2 to preserve a single-run boundary. |
| Concurrent runs / scheduler | No adapter-level protocol | No | No scheduler, leases, queue, or registry. |
| Async cancellation handle | No external handle protocol | No | Rely on upstream timeout and bounded process-group supervision. |
| Usage reporting | Optional result fields | Yes, optional | Validate non-negative integer values; never convert absence to zero. |
| Runtime discovery/probe | No stable machine-readable capability endpoint | No | Require explicit binary path; no registry probe abstraction. |
| Binary installation/update | Outside executable contract | No | No download, build, install, or update behavior. |

## 7. Revised MVP2 boundary

### 7.1 In scope

1. A narrow internal `zed-eval` domain.
2. Exactly one synchronous operation that launches one `eval-cli` process and returns after terminal artifact validation.
3. Explicit executable path supplied by the caller.
4. Pass-through support for the verified upstream inputs.
5. Read-only mode as the default, implemented with the explicit built-in tool disable list.
6. Explicit opt-in writable mode guarded by a disposable linked worktree and fresh isolated `HOME`.
7. A unique non-existing output directory under `.ai/harness/runs/zed-eval/`.
8. `runProcess` reuse with process-group supervision, timeout, output cap, and redaction.
9. Runtime validation of `result.json` and exact exit/status mapping.
10. Human-readable and JSON CLI summaries that point to retained artifacts.
11. Focused unit and CLI tests using a fake executable; no live model/API dependency in the default test suite.

### 7.2 Out of scope

1. `src/core/fleet/` or `src/effects/fleet/`.
2. A generic runtime adapter interface.
3. A runtime registry, scheduler, queue, admission pool, lease, run store, or daemon.
4. Structured event streaming or stderr protocol parsing.
5. Multiple simultaneous runs from one invocation.
6. Start/status/cancel/collect subcommands.
7. Zed download, installation, compilation, version management, or update checks.
8. Model-provider credential setup or secret storage.
9. Native sandbox claims or a pre-tool guard.
10. Changes to `.ai/harness/workflow-contract.json#compatibility.agents` or its asset projection.
11. Changes to hook adapters, hook routes, prompt routing, delegation routing, review routing, AcceptanceReceipt, or agent-fleet installation.
12. Automatic promotion of raw transcripts into tracked workflow or documentation artifacts.
13. Compatibility aliases from `fleet` to `zed-eval`.

## 8. Revised public operation

The MVP2 public surface should be one top-level command, not a command family:

```text
repo-harness zed-eval \
  --binary /absolute/path/to/eval-cli \
  --workdir /absolute/path/to/repo-or-linked-worktree \
  [--instruction <text> | stdin] \
  [--instruction-suffix-file <path>] \
  [--model <provider/model>] \
  [--timeout <seconds>] \
  [--no-staff] \
  [--reasoning-effort low|medium|high] \
  [--thinking true|false] \
  [--mode read-only|writable] \
  [--disposable-worktree] \
  [--json]
```

Rules:

- `--mode` defaults to `read-only`.
- `--disposable-worktree` is invalid in read-only mode and mandatory in writable mode.
- The flag is an explicit caller assertion, but admission must independently verify linked-worktree, non-primary, and clean-state conditions.
- The adapter creates the run root and, for writable mode, a fresh isolated `HOME`; arbitrary caller-selected HOME values are not accepted.
- The adapter allocates `artifacts/` and does not expose upstream `--output-dir` directly.
- The adapter passes `--instruction` only when explicitly supplied; otherwise it forwards the already-read stdin content to the child’s stdin only if `runProcess` is deliberately extended for bounded stdin support. If MVP2 does not extend `runProcess`, the CLI must normalize stdin to an explicit `--instruction` argument and rely on command redaction/output limits. It must not introduce direct spawning to obtain stdin support.
- The command produces one normalized terminal receipt. It does not expose a live event API.

The stdin detail above is an implementation decision boundary: `runProcess` currently has no stdin payload option. The preferred minimal choice is to read stdin in the CLI and pass the resulting instruction as `--instruction`, because extending the shared process runner solely for this command would enlarge scope. The command array is already redacted by `runProcess`, but the implementation must add a command-specific redaction covering the instruction argument so prompt text is not echoed in diagnostics.

## 9. Future implementation file list

The following paths are a **future plan only**. None are created or modified by this audit.

### 9.1 Source files

| Future path | Purpose |
|---|---|
| `src/core/zed-eval/types.ts` | Zed-specific request, mode, validated result, and normalized receipt types. No generic runtime interface. |
| `src/core/zed-eval/result-schema.ts` | Dependency-free runtime validation of pinned `result.json`, including finite/non-negative numeric checks and exit/status coherence. |
| `src/core/zed-eval/admission.ts` | Pure Zed-specific admission rules for canonical workdir, read-only disable list, writable linked-worktree gate, isolated HOME requirements, and output-root containment. |
| `src/effects/zed-eval/run-zed-eval.ts` | The single synchronous effect: allocate run paths, construct exact args/env, call `runProcess`, read/validate terminal artifacts, and return a normalized receipt. |
| `src/cli/commands/zed-eval.ts` | Commander definition, option validation, stdin normalization, text/JSON formatting, and exit-code projection. |
| `src/cli/index.ts` | Required import, `SUBCOMMANDS` entry, and `buildProgram().addCommand(...)` registration. |

No `runtime-adapter.ts`, generic `adapter.ts`, `registry.ts`, `src/core/fleet/`, or `src/effects/fleet/` is part of this plan.

### 9.2 Test files

| Future path | Purpose |
|---|---|
| `tests/zed-eval-result-schema.test.ts` | Valid and invalid result fixtures, optional fields, numeric constraints, statuses, and exit/status mismatches. |
| `tests/zed-eval-admission.test.ts` | Read-only disable list, canonical containment, output non-existence, symlink escape, primary-worktree rejection, dirty linked-worktree rejection, and isolated-HOME checks. |
| `tests/zed-eval-runner.test.ts` | Fake executable integration covering argument/env construction, process-group timeout, all four upstream statuses, missing/invalid artifacts, redaction, and unique run paths. |
| `tests/cli/zed-eval.test.ts` | Command registration, help/options, stdin/instruction exclusivity, mode validation, text/JSON output, and CLI exit projection. |

The existing `tests/process-runner.test.ts` should be changed only if implementation reveals a missing shared invariant that must be added to `runProcess`. It must not be modified merely to duplicate Zed-specific behavior.

## 10. Task and subtask breakdown

### Task 1 — Freeze the pinned external contract

1. Define constants for the expected statuses and exit mapping.
2. Define the exact pinned result fields and validation rules.
3. Record the audited upstream commit in normalized receipts.
4. Treat binary provenance separately as `verified` or `unverified`; do not infer provenance from behavior.
5. Add fixtures for all four terminal statuses and malformed variants.

**Completion gate:** result validation can be tested without launching a real Zed binary.

### Task 2 — Implement Zed-specific admission

1. Canonicalize repository root and workdir.
2. Resolve the canonical `.ai/harness/runs/zed-eval` root.
3. Generate a collision-resistant run ID.
4. Create only the run parent needed for local state; require the exact `artifacts/` output directory to remain absent before launch.
5. Reject symlink/path traversal outside the runs root.
6. For read-only mode, return the exact required disable list.
7. For writable mode:
   - require explicit writable mode and disposable-worktree acknowledgement;
   - prove the workdir is a linked worktree rather than the primary worktree;
   - prove it is clean at admission time;
   - create a fresh run-scoped HOME distinct from the real home; and
   - always suppress subagent tools.
8. Return a typed admission result or a precise fail-closed reason.

**Completion gate:** no process can be launched from a failed or partially verified admission.

### Task 3 — Implement the one synchronous effect

1. Require an explicit executable path; check that it resolves to a file and is executable.
2. Construct the verified upstream argument list only.
3. Construct a command-specific redaction for prompt-bearing arguments.
4. Set `ZED_EVAL_DISABLE_TOOLS` deterministically:
   - read-only: minimum read-only list;
   - writable: at least `create_thread,spawn_agent` to preserve the single-run boundary.
5. Set isolated `HOME` only after writable admission succeeds.
6. Call `runProcess` with:
   - canonical workdir;
   - bounded output;
   - `processGroup: true`;
   - outer timeout greater than upstream timeout by a tested flush grace; and
   - inherited environment plus only the required overrides.
7. After termination, require a fresh `result.json` under the exact run directory.
8. Parse and validate the result.
9. Enforce exit/status coherence.
10. Distinguish upstream timeout from outer supervisor timeout.
11. Return transcript paths as opaque artifact references.
12. Never parse stderr into events.

**Completion gate:** one call produces exactly one normalized receipt and cannot reuse stale artifacts.

### Task 4 — Add the `zed-eval` CLI

1. Build one top-level `zed-eval` command with no nested lifecycle subcommands.
2. Validate option enums and positive integer timeout.
3. Enforce exactly one instruction source.
4. Default to read-only mode.
5. Print a concise human summary or a stable JSON receipt.
6. Report artifact sensitivity and the run directory.
7. Map validated upstream statuses to the upstream exit codes.
8. Use a distinct non-zero adapter error code for admission, spawn, schema, or coherence failures; document that code in command help/tests.
9. Register the command through all three `src/cli/index.ts` touchpoints.

**Completion gate:** `buildProgram` exposes `zed-eval`, and `SUBCOMMANDS` recognizes it without adding a `fleet` alias.

### Task 5 — Verify boundaries and regression behavior

1. Run focused result-schema tests.
2. Run focused admission tests.
3. Run fake-executable runner tests.
4. Run CLI tests.
5. Re-run `tests/process-runner.test.ts` to prove the shared process authority remains intact.
6. Run type checking.
7. Run the repository’s required checks.
8. Inspect the changed-path set and reject any compatibility, hook, review-routing, or fleet-registry expansion.

**Completion gate:** all acceptance criteria below pass with no live API key or model invocation.

## 11. Acceptance criteria

### Naming and architecture

- [ ] The public command is `repo-harness zed-eval`; there is no `repo-harness fleet` command or alias.
- [ ] No `src/core/fleet/` or `src/effects/fleet/` directory is added.
- [ ] No generic runtime interface or runtime registry is added.
- [ ] The implementation exposes one synchronous Zed operation only.
- [ ] A future generic interface is explicitly deferred until a second runtime consumer exists.

### Process authority

- [ ] Zed execution uses `src/effects/process-runner.ts#runProcess`.
- [ ] `processGroup: true` is used.
- [ ] No new direct `spawn`, `spawnSync`, `exec`, or alternate supervisor is added in Zed files.
- [ ] Prompt-bearing command arguments are redacted from returned command/error diagnostics.
- [ ] Outer supervisor timeout is greater than the upstream timeout by a named/tested grace period.
- [ ] Outer supervisor timeout is distinguishable from upstream `status: "timeout"`.

### Admission and safety

- [ ] Read-only mode is the default.
- [ ] Every read-only run sets the exact explicit disable list for known mutation, network, terminal, and subagent tools.
- [ ] Read-only output does not claim native sandboxing or a pre-tool guard.
- [ ] Writable mode requires explicit opt-in.
- [ ] Writable mode rejects the primary/source worktree.
- [ ] Writable mode rejects a non-linked or dirty worktree.
- [ ] Writable mode creates and uses a fresh run-scoped HOME distinct from the operator HOME.
- [ ] Subagent tools are disabled in writable mode.
- [ ] Admission failures occur before process launch and identify the failed invariant.

### Output and schema

- [ ] Every run receives a unique output path under `.ai/harness/runs/zed-eval/`.
- [ ] The exact path passed as `--output-dir` does not exist before launch.
- [ ] Existing output paths and path/symlink escapes are rejected.
- [ ] Missing `result.json` is an adapter failure even when the process exits `0`.
- [ ] Invalid JSON or invalid fields fail closed.
- [ ] `status` accepts only `completed`, `error`, `timeout`, or `interrupted`.
- [ ] Required strings are non-empty where applicable.
- [ ] Durations are finite and non-negative.
- [ ] Optional token, step, and tool counts are non-negative integers when present.
- [ ] Optional fields remain absent when upstream omits them; absence is never converted to zero.
- [ ] Exit/status pairs are enforced exactly: `0/completed`, `1/error`, `2/timeout`, `3/interrupted`.
- [ ] Unknown exit codes and all mismatches are adapter failures.
- [ ] `thread.md` and `thread.json` are retained as opaque artifacts and never used to infer status.
- [ ] stderr is retained only as bounded/redacted diagnostic text and is not parsed into structured events.

### CLI integration

- [ ] `src/cli/index.ts` imports the command builder.
- [ ] `zed-eval` is present in `SUBCOMMANDS`.
- [ ] `buildProgram` calls `addCommand` for the builder.
- [ ] Instruction option and stdin behavior are mutually exclusive and tested.
- [ ] `--thinking` preserves omitted, true, and false states.
- [ ] Text and JSON outputs identify status, exit classification, model, duration, and artifact directory without dumping transcript contents.
- [ ] CLI help states the pinned-contract limitation and writable-mode risk.

### Explicit non-changes

- [ ] `.ai/harness/workflow-contract.json#compatibility.agents` is unchanged.
- [ ] `assets/workflow-contract.v1.json#compatibility.agents` is unchanged.
- [ ] Hook registration and hook routing are unchanged.
- [ ] Review-provider routing and AcceptanceReceipt semantics are unchanged.
- [ ] Agent Fleet installation, projection, and policy are unchanged.
- [ ] No Zed installer/updater/downloader is added.

### Validation commands for the future implementation

Focused checks should run first:

```bash
bun test tests/zed-eval-result-schema.test.ts
bun test tests/zed-eval-admission.test.ts
bun test tests/zed-eval-runner.test.ts
bun test tests/cli/zed-eval.test.ts
bun test tests/process-runner.test.ts
bun run check:type
```

Then run the repository-required checks:

```bash
bun test
bash scripts/check-deploy-sql-order.sh
bash scripts/check-architecture-sync.sh
bash scripts/check-task-sync.sh
repo-harness run check-task-workflow --strict
bun scripts/inspect-project-state.ts --repo . --format text
bun src/cli/index.ts init --repo . --dry-run
```

No live Zed/model test is required for default CI. A separately authorized manual smoke test may be added later, but it must use disposable state and must not become a hidden prerequisite for unit acceptance.

## 12. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Upstream result shape changes without a version field | Valid runs fail or are misread | Pin the audited commit contract; validate strictly; fail closed and revise the adapter deliberately. |
| Binary does not match the audited commit | Behavior differs from plan | Require explicit path; record provenance separately; never claim verification without build evidence. |
| Default allow profile mutates a real checkout | Source loss or unintended changes | Read-only default; explicit disable list; writable linked-worktree gate. |
| Writable terminal accesses host/network outside worktree | Effects exceed disposable repo/HOME | State clearly that the gate is not a sandbox; require explicit operator opt-in; stop if stronger containment is a product requirement. |
| Context-server tools bypass assumptions about built-in tools | “Read-only” claim is overstated | Use an isolated environment where required; describe the mode as built-in-tool restriction, not native sandboxing. |
| Outer timeout kills Zed before artifact flush | Missing or contradictory result | Add flush grace; classify outer timeout separately; never synthesize upstream status. |
| Stale output is mistaken for current output | False result attribution | Unique absent output directory; reject reuse and escapes. |
| Transcript contains secrets or proprietary content | Local data exposure | Keep under ignored runs; print sensitivity warning; never auto-promote or print transcripts. |
| stdout/stderr truncation hides diagnostics | Harder debugging | Preserve upstream artifacts; expose truncation marker from `runProcess`; do not raise output limits without evidence. |
| Optional usage fields are treated as authoritative zeros | Incorrect metrics | Preserve absence and validate only present values. |
| Generic architecture is frozen around one runtime | Long-term coupling | Defer interface and registry until a second concrete consumer demonstrates common behavior. |
| Command name confuses runtime execution with installed Agent Fleet | Product/API ambiguity | Reserve `fleet` for the existing roster concept; use `zed-eval`. |

## 13. Stop conditions

Implementation must stop and return to planning if any of the following occurs:

1. The target Zed source is no longer commit `24e25552b1259d56a6fdd7956a419ed9e8a1a25e`, or the executable’s contract differs from the cited source.
2. Product requirements demand a native sandbox, pre-tool guard, complete host-filesystem containment, or network isolation. The pinned `eval-cli` contract does not provide these.
3. Writable mode cannot prove a non-primary linked worktree, clean initial state, and fresh isolated HOME.
4. The read-only disable list cannot be applied exactly or upstream tool names no longer match the pinned list.
5. The unique output directory already exists, resolves outside `.ai/harness/runs/zed-eval/`, or traverses an untrusted symlink.
6. `runProcess` cannot provide the required process-group and timeout behavior without a broad shared-runner redesign.
7. `result.json` is missing, malformed, fails schema validation, or disagrees with the process exit code.
8. A requirement appears for structured live events, async handles, detached runs, queues, leases, concurrency, or cross-process cancellation.
9. A second runtime consumer appears. At that point, compare both concrete implementations before proposing a shared interface or registry; do not retrofit the speculative one automatically.
10. Implementation requires changing `compatibility.agents`, hook routing, review routing, AcceptanceReceipt, or Agent Fleet semantics. Those changes require a separate approved work package.
11. Tests require real credentials or a live paid model to prove ordinary acceptance. Replace them with deterministic fake-executable fixtures and keep live testing separately authorized.
12. Any proposed source path reintroduces `fleet` terminology for the Zed-only slice.

## 14. Approval recommendation

Approve MVP2 only after the proposal is rewritten to the boundary in this document:

- domain and command: `zed-eval`;
- one synchronous operation;
- existing `runProcess` authority;
- explicit Zed result-schema validation;
- unique non-existing output directory under `.ai/harness/runs/zed-eval/`;
- read-only built-in tool restriction by default;
- explicit disposable linked-worktree and isolated-HOME gate for writable mode;
- no generic interface or registry before a second runtime consumer;
- no compatibility, hook, review-routing, or Agent Fleet changes.

Until those corrections are accepted, the verdict remains **REVISE BEFORE APPROVAL**.

## 15. Citation index

### Local repository

- Process options/result contract: `src/effects/process-runner.ts:7-36`
- Supervised process-group execution: `src/effects/process-runner.ts:126-217`
- Exported synchronous runner, timeout, redaction, and output cap: `src/effects/process-runner.ts:220-260`
- Process-runner tests: `tests/process-runner.test.ts:1-51`
- CLI builder imports: `src/cli/index.ts:9-32`
- Public `SUBCOMMANDS`: `src/cli/index.ts:73-95`
- `buildProgram`: `src/cli/index.ts:334-340`
- Builder registration pattern: `src/cli/index.ts:716-724`
- Existing Agent Fleet definition: `docs/reference-configs/external-tooling.md:444-458`
- Existing Agent Fleet policy: `.ai/harness/policy.json:376-393`
- Canonical runs directory: `.ai/harness/policy.json:106-115`
- Runtime-evidence lifecycle: `.ai/harness/policy.json:149-162`
- Existing host compatibility: `.ai/harness/workflow-contract.json:4-9`
- Broader speculative fleet interface: `docs/researches/20260808-repo-harness-in-opencode.md:365-408`
- Broader fleet phase ordering: `docs/researches/20260808-repo-harness-in-opencode.md:1171-1199`, `docs/researches/20260808-repo-harness-in-opencode.md:1286-1307`

### Upstream Zed, pinned commit

- [CLI options: `main.rs` lines 61-107](https://github.com/zed-industries/zed/blob/24e25552b1259d56a6fdd7956a419ed9e8a1a25e/crates/eval_cli/src/main.rs#L61-L107)
- [Output and exit-code documentation: `main.rs` lines 15-30](https://github.com/zed-industries/zed/blob/24e25552b1259d56a6fdd7956a419ed9e8a1a25e/crates/eval_cli/src/main.rs#L15-L30)
- [Result fields: `main.rs` lines 116-142](https://github.com/zed-industries/zed/blob/24e25552b1259d56a6fdd7956a419ed9e8a1a25e/crates/eval_cli/src/main.rs#L116-L142)
- [Exit constants: `main.rs` lines 155-158](https://github.com/zed-industries/zed/blob/24e25552b1259d56a6fdd7956a419ed9e8a1a25e/crates/eval_cli/src/main.rs#L155-L158)
- [Status/result/exit mapping: `main.rs` lines 284-333](https://github.com/zed-industries/zed/blob/24e25552b1259d56a6fdd7956a419ed9e8a1a25e/crates/eval_cli/src/main.rs#L284-L333)
- [Tool disable list and subagent entries: `main.rs` lines 661-715](https://github.com/zed-industries/zed/blob/24e25552b1259d56a6fdd7956a419ed9e8a1a25e/crates/eval_cli/src/main.rs#L661-L715)
- [Default allow permissions: `main.rs` lines 716-735](https://github.com/zed-industries/zed/blob/24e25552b1259d56a6fdd7956a419ed9e8a1a25e/crates/eval_cli/src/main.rs#L716-L735)
- [Worktree/session setup: `main.rs` lines 745-827](https://github.com/zed-industries/zed/blob/24e25552b1259d56a6fdd7956a419ed9e8a1a25e/crates/eval_cli/src/main.rs#L745-L827)
- [Transcript writes: `main.rs` lines 934-950](https://github.com/zed-industries/zed/blob/24e25552b1259d56a6fdd7956a419ed9e8a1a25e/crates/eval_cli/src/main.rs#L934-L950)
- [Human-readable event logging: `main.rs` lines 963-1020](https://github.com/zed-industries/zed/blob/24e25552b1259d56a6fdd7956a419ed9e8a1a25e/crates/eval_cli/src/main.rs#L963-L1020)
