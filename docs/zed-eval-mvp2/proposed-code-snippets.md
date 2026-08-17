# Zed Eval MVP 2 — Proposed Code Snippets

> These are **implementation sketches**, not source authority. Reconcile them with the approved audit, current repository code, current ArchContext ownership, and the pinned Zed source before implementation.
>
> The examples intentionally stay Zed-specific. They do not define a generic runtime adapter, registry, scheduler, or live-handle API.

## 1. `src/core/zed-eval/types.ts`

```ts
export const ZED_EVAL_PINNED_COMMIT =
  "24e25552b1259d56a6fdd7956a419ed9e8a1a25e" as const;

export type ZedEvalMode = "read-only" | "writable";
export type ZedEvalStatus = "completed" | "error" | "timeout" | "interrupted";
export type ZedEvalReasoningEffort = "low" | "medium" | "high";

export interface ZedEvalRequest {
  readonly binary: string;
  readonly workdir: string;
  readonly instruction: string;
  readonly instructionSuffixFile?: string;
  readonly model: string;
  readonly timeoutSeconds: number;
  readonly noStaff?: boolean;
  readonly reasoningEffort?: ZedEvalReasoningEffort;
  readonly thinking?: boolean;
  readonly mode: ZedEvalMode;
  readonly disposableWorktree: boolean;
}

export interface ZedEvalUpstreamResult {
  readonly status: ZedEvalStatus;
  readonly error?: string;
  readonly duration_secs: number;
  readonly timeout_secs?: number;
  readonly model: string;
  readonly input_tokens?: number;
  readonly output_tokens?: number;
  readonly cache_creation_input_tokens?: number;
  readonly cache_read_input_tokens?: number;
  readonly step_count?: number;
  readonly tool_call_count?: number;
  readonly tool_calls?: Readonly<Record<string, number>>;
}

export interface ZedEvalArtifactPaths {
  readonly runRoot: string;
  readonly outputDir: string;
  readonly resultJson: string;
  readonly threadMarkdown?: string;
  readonly threadJson?: string;
  readonly home?: string;
}

export interface ZedEvalAdmission {
  readonly binary: string;
  readonly workdir: string;
  readonly mode: ZedEvalMode;
  readonly disabledTools: readonly string[];
  readonly artifacts: ZedEvalArtifactPaths;
}

export type ZedEvalWrapperFailureKind =
  | "admission"
  | "spawn"
  | "supervisor_timeout"
  | "artifact"
  | "schema"
  | "coherence";

export interface ZedEvalReceipt {
  readonly schemaVersion: "repo-harness.zed-eval/v1";
  readonly runId: string;
  readonly sourceContract: {
    readonly expectedZedCommit: typeof ZED_EVAL_PINNED_COMMIT;
    readonly binaryProvenance: "verified" | "unverified";
  };
  readonly mode: ZedEvalMode;
  readonly workdir: string;
  readonly command: readonly string[]; // already redacted by process runner
  readonly process: {
    readonly status: number;
    readonly signal: NodeJS.Signals | null;
    readonly timedOut: boolean;
  };
  readonly result?: ZedEvalUpstreamResult;
  readonly artifacts: ZedEvalArtifactPaths;
  readonly failure?: {
    readonly kind: ZedEvalWrapperFailureKind;
    readonly message: string;
  };
}
```

## 2. `src/core/zed-eval/result-schema.ts`

A dependency-free validator is sufficient for this small pinned wire contract.

```ts
import type { ZedEvalStatus, ZedEvalUpstreamResult } from "./types";

const STATUS = new Set<ZedEvalStatus>([
  "completed",
  "error",
  "timeout",
  "interrupted",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNonNegative(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a finite non-negative number`);
  }
  return value;
}

function optionalSafeCount(
  value: unknown,
  field: string,
): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${field} must be a non-negative safe integer`);
  }
  return value as number;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  return value;
}

export function parseZedEvalResult(
  value: unknown,
  expectedModel: string,
): ZedEvalUpstreamResult {
  if (!isRecord(value)) throw new Error("result root must be an object");

  if (typeof value.status !== "string" || !STATUS.has(value.status as ZedEvalStatus)) {
    throw new Error("unsupported result status");
  }
  const status = value.status as ZedEvalStatus;

  if (typeof value.model !== "string" || value.model.trim() === "") {
    throw new Error("model must be a non-empty string");
  }
  if (value.model !== expectedModel) {
    throw new Error(`result model mismatch: expected ${expectedModel}`);
  }

  const error = optionalString(value.error, "error");
  if (status === "error" && (!error || error.trim() === "")) {
    throw new Error("error status requires a non-empty error");
  }
  if (status !== "error" && error && error.trim() !== "") {
    throw new Error(`${status} must not carry a non-empty error`);
  }

  let tool_calls: Record<string, number> | undefined;
  if (value.tool_calls !== undefined) {
    if (!isRecord(value.tool_calls)) {
      throw new Error("tool_calls must be an object");
    }
    tool_calls = {};
    for (const [name, count] of Object.entries(value.tool_calls)) {
      if (name.trim() === "") throw new Error("tool_calls contains an empty name");
      tool_calls[name] = optionalSafeCount(count, `tool_calls.${name}`)!;
    }
  }

  const tool_call_count = optionalSafeCount(value.tool_call_count, "tool_call_count");
  if (tool_calls && tool_call_count !== undefined) {
    const sum = Object.values(tool_calls).reduce((a, b) => a + b, 0);
    if (sum !== tool_call_count) {
      throw new Error(`tool call total mismatch: ${sum} != ${tool_call_count}`);
    }
  }

  return {
    status,
    error,
    duration_secs: finiteNonNegative(value.duration_secs, "duration_secs"),
    timeout_secs: optionalSafeCount(value.timeout_secs, "timeout_secs"),
    model: value.model,
    input_tokens: optionalSafeCount(value.input_tokens, "input_tokens"),
    output_tokens: optionalSafeCount(value.output_tokens, "output_tokens"),
    cache_creation_input_tokens: optionalSafeCount(
      value.cache_creation_input_tokens,
      "cache_creation_input_tokens",
    ),
    cache_read_input_tokens: optionalSafeCount(
      value.cache_read_input_tokens,
      "cache_read_input_tokens",
    ),
    step_count: optionalSafeCount(value.step_count, "step_count"),
    tool_call_count,
    tool_calls,
  };
}

const EXPECTED_STATUS_BY_EXIT = new Map<number, ZedEvalStatus>([
  [0, "completed"],
  [1, "error"],
  [2, "timeout"],
  [3, "interrupted"],
]);

export function assertExitStatusCoherence(
  exitCode: number,
  status: ZedEvalStatus,
): void {
  const expected = EXPECTED_STATUS_BY_EXIT.get(exitCode);
  if (!expected) throw new Error(`unsupported eval-cli exit code: ${exitCode}`);
  if (expected !== status) {
    throw new Error(
      `eval-cli exit/status mismatch: exit=${exitCode} status=${status} expected=${expected}`,
    );
  }
}
```

## 3. Read-only tool profile

```ts
export const ZED_EVAL_READ_ONLY_DISABLED_TOOLS = [
  "copy_path",
  "create_directory",
  "create_thread",
  "delete_path",
  "apply_code_action",
  "edit_file",
  "write_file",
  "fetch",
  "move_path",
  "rename_symbol",
  "spawn_agent",
  "terminal",
  "search_web",
] as const;

export const ZED_EVAL_WRITABLE_DISABLED_TOOLS = [
  "create_thread",
  "spawn_agent",
] as const;

export function disabledToolsForMode(mode: "read-only" | "writable") {
  return mode === "read-only"
    ? ZED_EVAL_READ_ONLY_DISABLED_TOOLS
    : ZED_EVAL_WRITABLE_DISABLED_TOOLS;
}
```

Do not call the first list a sandbox policy. It is a pinned built-in-tool restriction.

## 4. Shared additive-redaction sketch

This belongs in the shared process runner only if approved.

```ts
export interface RunProcessOptions {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly inheritEnv?: boolean;
  readonly stdio?: "pipe" | "inherit" | "ignore";
  readonly timeoutMs?: number;
  readonly maxOutputBytes?: number;

  // Existing replacement behavior, if backward compatibility requires it.
  readonly redactions?: readonly ProcessOutputRedaction[];

  // New safe extension: compose with shared defaults.
  readonly additionalRedactions?: readonly ProcessOutputRedaction[];

  readonly processGroup?: boolean;
  // ...
}

function resolveRedactions(
  opts: RunProcessOptions,
): readonly ProcessOutputRedaction[] {
  if (opts.redactions) {
    // Preserve existing explicit replacement semantics for old callers.
    // New Zed code must not use this field.
    return opts.redactions;
  }
  return [
    ...DEFAULT_REDACTIONS,
    ...(opts.additionalRedactions ?? []),
  ];
}

export function runProcess(
  command: string,
  args: readonly string[],
  opts: RunProcessOptions = {},
): ProcessRunResult {
  const redactions = resolveRedactions(opts);
  // existing execution path unchanged
  // ...
}
```

Focused test:

```ts
test("additional redactions preserve shared defaults", () => {
  const result = runProcess(
    process.execPath,
    ["-e", "console.error(process.argv.slice(1).join(' '))",
      "authorization=secret-token",
      "PROMPT_SENTINEL"],
    {
      additionalRedactions: [
        { pattern: /PROMPT_SENTINEL/g, replacement: "[prompt redacted]" },
      ],
    },
  );

  expect(result.command.join(" ")).not.toContain("PROMPT_SENTINEL");
  expect(result.command.join(" ")).not.toContain("secret-token");
  expect(result.stderr).not.toContain("secret-token");
});
```

## 5. Prompt-specific redaction helper

Prefer exact-string matching, escaped for regex.

```ts
import type { ProcessOutputRedaction } from "../process-runner";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function instructionRedaction(
  instruction: string,
): ProcessOutputRedaction {
  return {
    pattern: new RegExp(escapeRegExp(instruction), "g"),
    replacement: "[instruction redacted]",
  };
}
```

If very large instructions make exact regex impractical, revisit the transport design in planning rather than logging the prompt.

## 6. `src/core/zed-eval/admission.ts` shape

```ts
import {
  chmodSync,
  existsSync,
  mkdirSync,
  realpathSync,
  statSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";
import type { ZedEvalAdmission, ZedEvalRequest } from "./types";
import {
  ZED_EVAL_READ_ONLY_DISABLED_TOOLS,
  ZED_EVAL_WRITABLE_DISABLED_TOOLS,
} from "./tool-profile";

function git(cwd: string, args: readonly string[]): string {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function ensureContained(parent: string, child: string): void {
  const rel = relative(parent, child);
  if (rel === "" || rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel)) {
    throw new Error(`path escapes parent: ${child}`);
  }
}

function makeRunId(now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:.TZ]/g, "");
  return `${stamp}-${randomBytes(8).toString("hex")}`;
}

function assertExecutable(path: string): string {
  if (!isAbsolute(path)) throw new Error("--binary must be absolute");
  const canonical = realpathSync(path);
  const stat = statSync(canonical);
  if (!stat.isFile()) throw new Error("--binary must resolve to a regular file");
  // On POSIX, add an access(X_OK) check in the real implementation.
  return canonical;
}

function assertClean(workdir: string): void {
  const status = git(workdir, [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ]);
  if (status !== "") throw new Error("writable worktree must be clean");
}

function assertLinkedNonPrimaryWorktree(workdir: string): void {
  const commonDir = realpathSync(
    resolve(workdir, git(workdir, ["rev-parse", "--git-common-dir"])),
  );
  const gitDir = realpathSync(
    resolve(workdir, git(workdir, ["rev-parse", "--git-dir"])),
  );

  // The final implementation should compare against `git worktree list --porcelain`
  // or another approved Git-native proof of the primary worktree.
  if (gitDir === commonDir || gitDir === join(commonDir, ".git")) {
    throw new Error("writable mode requires a linked non-primary worktree");
  }
}

export function admitZedEval(
  repoRoot: string,
  request: ZedEvalRequest,
): ZedEvalAdmission {
  const binary = assertExecutable(request.binary);
  const workdir = realpathSync(request.workdir);

  git(workdir, ["rev-parse", "--is-inside-work-tree"]);

  if (request.mode === "read-only" && request.disposableWorktree) {
    throw new Error("--disposable-worktree is invalid in read-only mode");
  }
  if (request.mode === "writable" && !request.disposableWorktree) {
    throw new Error("writable mode requires --disposable-worktree");
  }

  const runsRootPath = join(repoRoot, ".ai", "harness", "runs", "zed-eval");
  mkdirSync(runsRootPath, { recursive: true });
  const runsRoot = realpathSync(runsRootPath);

  const runId = makeRunId();
  const runRoot = join(runsRoot, runId);
  mkdirSync(runRoot, { recursive: false, mode: 0o700 });
  ensureContained(runsRoot, realpathSync(runRoot));

  const outputDir = join(runRoot, "artifacts");
  if (existsSync(outputDir)) throw new Error("artifacts path must be absent");

  let home: string | undefined;
  let disabledTools: readonly string[];

  if (request.mode === "writable") {
    assertLinkedNonPrimaryWorktree(workdir);
    assertClean(workdir);

    home = join(runRoot, "home");
    mkdirSync(home, { recursive: false, mode: 0o700 });
    chmodSync(home, 0o700);
    if (realpathSync(home) === realpathSync(homedir())) {
      throw new Error("run HOME must differ from operator HOME");
    }
    disabledTools = ZED_EVAL_WRITABLE_DISABLED_TOOLS;
  } else {
    disabledTools = ZED_EVAL_READ_ONLY_DISABLED_TOOLS;
  }

  return {
    binary,
    workdir,
    mode: request.mode,
    disabledTools,
    artifacts: {
      runRoot,
      outputDir,
      resultJson: join(outputDir, "result.json"),
      home,
    },
  };
}
```

**Important:** the linked-worktree proof above is intentionally incomplete. The real implementation must use the repository-approved Git worktree proof and tests. Do not paste this helper blindly.

## 7. Argument construction

```ts
import type { ZedEvalRequest } from "../../core/zed-eval/types";

export function buildEvalCliArgs(
  request: ZedEvalRequest,
  workdir: string,
  outputDir: string,
): string[] {
  const args = [
    "--workdir", workdir,
    "--instruction", request.instruction,
    "--model", request.model,
    "--timeout", String(request.timeoutSeconds),
    "--output-dir", outputDir,
  ];

  if (request.instructionSuffixFile) {
    args.push("--instruction-suffix-file", request.instructionSuffixFile);
  }
  if (request.noStaff) args.push("--no-staff");
  if (request.reasoningEffort) {
    args.push("--reasoning-effort", request.reasoningEffort);
  }
  if (request.thinking !== undefined) {
    args.push("--thinking", request.thinking ? "true" : "false");
  }

  return args;
}
```

Never append arbitrary extra args.

## 8. `src/effects/zed-eval/run-zed-eval.ts` skeleton

```ts
import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { join, relative, sep } from "node:path";
import { runProcess } from "../process-runner";
import { admitZedEval } from "../../core/zed-eval/admission";
import {
  assertExitStatusCoherence,
  parseZedEvalResult,
} from "../../core/zed-eval/result-schema";
import type {
  ZedEvalReceipt,
  ZedEvalRequest,
} from "../../core/zed-eval/types";
import { instructionRedaction } from "./redaction";

const ARTIFACT_FLUSH_GRACE_MS = 15_000;
const MAX_RESULT_BYTES = 256 * 1024;
const MAX_DIAGNOSTIC_BYTES = 64 * 1024;

function assertRegularContainedFile(
  outputDir: string,
  path: string,
  maxBytes?: number,
): string {
  if (!existsSync(path)) throw new Error(`missing artifact: ${path}`);
  const lstat = lstatSync(path);
  if (lstat.isSymbolicLink()) throw new Error(`artifact is a symlink: ${path}`);
  if (!lstat.isFile()) throw new Error(`artifact is not a regular file: ${path}`);

  const canonicalOutput = realpathSync(outputDir);
  const canonical = realpathSync(path);
  const rel = relative(canonicalOutput, canonical);
  if (rel === ".." || rel.startsWith(`..${sep}`)) {
    throw new Error(`artifact escaped output dir: ${path}`);
  }

  if (maxBytes !== undefined && statSync(canonical).size > maxBytes) {
    throw new Error(`artifact exceeds ${maxBytes} bytes: ${path}`);
  }
  return canonical;
}

export function runZedEval(
  repoRoot: string,
  request: ZedEvalRequest,
): ZedEvalReceipt {
  const admission = admitZedEval(repoRoot, request);

  const args = buildEvalCliArgs(
    request,
    admission.workdir,
    admission.artifacts.outputDir,
  );

  const env: NodeJS.ProcessEnv = {
    ZED_EVAL_DISABLE_TOOLS: admission.disabledTools.join(","),
  };
  if (admission.artifacts.home) {
    env.HOME = admission.artifacts.home;
  }

  const outerTimeoutMs =
    request.timeoutSeconds * 1000 + ARTIFACT_FLUSH_GRACE_MS;

  const processResult = runProcess(admission.binary, args, {
    cwd: admission.workdir,
    env,
    processGroup: true,
    timeoutMs: outerTimeoutMs,
    maxOutputBytes: MAX_DIAGNOSTIC_BYTES,
    additionalRedactions: [
      instructionRedaction(request.instruction),
    ],
  });

  const baseReceipt = {
    schemaVersion: "repo-harness.zed-eval/v1" as const,
    runId: admission.artifacts.runRoot.split(/[\\/]/).at(-1)!,
    sourceContract: {
      expectedZedCommit:
        "24e25552b1259d56a6fdd7956a419ed9e8a1a25e" as const,
      binaryProvenance: "unverified" as const,
    },
    mode: admission.mode,
    workdir: admission.workdir,
    command: processResult.command,
    process: {
      status: processResult.status,
      signal: processResult.signal,
      timedOut: processResult.timedOut,
    },
    artifacts: admission.artifacts,
  };

  if (processResult.timedOut) {
    return {
      ...baseReceipt,
      failure: {
        kind: "supervisor_timeout",
        message: processResult.error || "outer process timeout",
      },
    };
  }

  if (![0, 1, 2, 3].includes(processResult.status)) {
    return {
      ...baseReceipt,
      failure: {
        kind: "coherence",
        message: `unexpected eval-cli exit code ${processResult.status}`,
      },
    };
  }

  try {
    const resultPath = assertRegularContainedFile(
      admission.artifacts.outputDir,
      admission.artifacts.resultJson,
      MAX_RESULT_BYTES,
    );

    const parsed = JSON.parse(readFileSync(resultPath, "utf8"));
    const result = parseZedEvalResult(parsed, request.model);
    assertExitStatusCoherence(processResult.status, result.status);

    const threadMarkdownCandidate = join(
      admission.artifacts.outputDir,
      "thread.md",
    );
    const threadJsonCandidate = join(
      admission.artifacts.outputDir,
      "thread.json",
    );

    const threadMarkdown = existsSync(threadMarkdownCandidate)
      ? assertRegularContainedFile(
          admission.artifacts.outputDir,
          threadMarkdownCandidate,
        )
      : undefined;
    const threadJson = existsSync(threadJsonCandidate)
      ? assertRegularContainedFile(
          admission.artifacts.outputDir,
          threadJsonCandidate,
        )
      : undefined;

    const forbidden = new Set(admission.disabledTools);
    for (const tool of Object.keys(result.tool_calls ?? {})) {
      if (forbidden.has(tool)) {
        throw new Error(`disabled tool reported by result: ${tool}`);
      }
    }

    return {
      ...baseReceipt,
      result,
      artifacts: {
        ...admission.artifacts,
        threadMarkdown,
        threadJson,
      },
    };
  } catch (error) {
    return {
      ...baseReceipt,
      failure: {
        kind: "schema",
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
```

The production version should preserve finer failure kinds (`artifact`, `schema`, `coherence`) rather than folding them all into `schema` as this compact skeleton does.

## 9. CLI option parsing

```ts
import { Command, Option } from "commander";
import { runZedEval } from "../../effects/zed-eval/run-zed-eval";

function parsePositiveInt(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("timeout must be a positive integer");
  }
  return parsed;
}

function parseBoolean(value: string): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error("thinking must be true or false");
}

async function readStdinIfPiped(): Promise<string | undefined> {
  if (process.stdin.isTTY) return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function buildZedEvalCommand(): Command {
  const command = new Command("zed-eval")
    .description(
      "Run one local Zed eval-cli session; read-only restricts pinned built-in tools but is not an OS sandbox",
    )
    .requiredOption("--binary <path>", "absolute caller-built eval-cli path")
    .requiredOption("--workdir <path>", "repository or linked-worktree path")
    .option("--instruction <text>", "instruction; mutually exclusive with piped stdin")
    .option("--instruction-suffix-file <path>")
    .option("--model <provider/model>", "model id")
    .option("--timeout <seconds>", "upstream timeout", parsePositiveInt, 120)
    .option("--no-staff", "disable Zed staff mode")
    .addOption(
      new Option("--reasoning-effort <level>")
        .choices(["low", "medium", "high"]),
    )
    .option("--thinking <bool>", "true|false", parseBoolean)
    .addOption(
      new Option("--mode <mode>")
        .choices(["read-only", "writable"])
        .default("read-only"),
    )
    .option("--disposable-worktree", "required acknowledgement for writable mode")
    .option("--json", "emit JSON receipt");

  command.action(async (opts) => {
    const stdin = await readStdinIfPiped();
    if (opts.instruction && stdin !== undefined) {
      throw new Error("use exactly one instruction source");
    }
    const instruction = (opts.instruction ?? stdin ?? "").trim();
    if (!instruction) throw new Error("instruction is required");

    const receipt = runZedEval(process.cwd(), {
      binary: opts.binary,
      workdir: opts.workdir,
      instruction,
      instructionSuffixFile: opts.instructionSuffixFile,
      model: opts.model,
      timeoutSeconds: opts.timeout,
      noStaff: Boolean(opts.noStaff),
      reasoningEffort: opts.reasoningEffort,
      thinking: opts.thinking,
      mode: opts.mode,
      disposableWorktree: Boolean(opts.disposableWorktree),
    });

    if (opts.json) {
      process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
    } else {
      const status = receipt.result?.status ?? receipt.failure?.kind ?? "unknown";
      process.stdout.write(
        [
          `zed-eval: ${status}`,
          `mode: ${receipt.mode}`,
          `run: ${receipt.runId}`,
          `artifacts: ${receipt.artifacts.outputDir}`,
          "warning: artifacts may contain sensitive prompt/model/tool content",
        ].join("\n") + "\n",
      );
    }

    if (receipt.failure) {
      process.exitCode = 4;
    } else {
      process.exitCode = receipt.process.status;
    }
  });

  return command;
}
```

## 10. `src/cli/index.ts` wiring

Three touchpoints are required.

```ts
import { buildZedEvalCommand } from "./commands/zed-eval";
```

```ts
const SUBCOMMANDS = new Set([
  // ...
  "zed-eval",
]);
```

```ts
program.addCommand(buildZedEvalCommand());
```

Do not add `"fleet"` or a compatibility alias.

## 11. Fake eval executable

A test can create this script in a temporary directory and `chmod +x` it.

```ts
#!/usr/bin/env bun
import {
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const outputDir = flag("--output-dir");
const model = flag("--model");
if (!outputDir || !model) {
  console.error("missing required args");
  process.exit(9);
}

mkdirSync(outputDir, { recursive: false });

const mode = process.env.TEST_ZED_EVAL_FIXTURE_MODE ?? "completed";

const statusByMode: Record<string, {
  status: string;
  exit: number;
}> = {
  completed: { status: "completed", exit: 0 },
  error: { status: "error", exit: 1 },
  timeout: { status: "timeout", exit: 2 },
  interrupted: { status: "interrupted", exit: 3 },
  "status-mismatch": { status: "error", exit: 0 },
};

if (mode === "sleep") {
  await Bun.sleep(60_000);
  process.exit(0);
}

if (mode !== "missing-result") {
  if (mode === "malformed-result") {
    writeFileSync(join(outputDir, "result.json"), "{not json");
  } else {
    const selected = statusByMode[mode] ?? statusByMode.completed;
    writeFileSync(
      join(outputDir, "result.json"),
      JSON.stringify({
        status: selected.status,
        ...(selected.status === "error"
          ? { error: "fixture error" }
          : {}),
        duration_secs: 0.01,
        model,
        tool_call_count: 0,
        tool_calls: {},
      }),
    );
  }
}

if (!["missing-result", "error-pre-thread"].includes(mode)) {
  writeFileSync(join(outputDir, "thread.md"), "# fixture\n");
  writeFileSync(join(outputDir, "thread.json"), "{}\n");
}

const selected = statusByMode[mode] ?? statusByMode.completed;
process.exit(selected.exit);
```

The production command must not expose `TEST_ZED_EVAL_FIXTURE_MODE`; tests inject it directly into the child environment or wrapper dependency.

## 12. Result-schema tests

```ts
import { describe, expect, test } from "bun:test";
import {
  assertExitStatusCoherence,
  parseZedEvalResult,
} from "../src/core/zed-eval/result-schema";

describe("zed eval result schema", () => {
  test("accepts completed result", () => {
    const result = parseZedEvalResult({
      status: "completed",
      duration_secs: 1.25,
      model: "anthropic/test",
      tool_call_count: 1,
      tool_calls: { read_file: 1 },
    }, "anthropic/test");

    expect(result.status).toBe("completed");
    assertExitStatusCoherence(0, result.status);
  });

  test("rejects mismatch", () => {
    expect(() => assertExitStatusCoherence(0, "error")).toThrow();
  });

  test("keeps optional metrics absent", () => {
    const result = parseZedEvalResult({
      status: "completed",
      duration_secs: 0,
      model: "anthropic/test",
    }, "anthropic/test");

    expect(result.input_tokens).toBeUndefined();
    expect(result.tool_call_count).toBeUndefined();
  });

  test("rejects inconsistent tool totals", () => {
    expect(() => parseZedEvalResult({
      status: "completed",
      duration_secs: 0,
      model: "anthropic/test",
      tool_call_count: 2,
      tool_calls: { read_file: 1 },
    }, "anthropic/test")).toThrow();
  });
});
```

## 13. Admission test: writable mode must reject primary worktree

```ts
test("writable mode rejects primary worktree", () => {
  const repo = makeCommittedFixtureRepo();

  expect(() => admitZedEval(repo, {
    binary: fakeBinary,
    workdir: repo,
    instruction: "write a file",
    model: "anthropic/test",
    timeoutSeconds: 10,
    mode: "writable",
    disposableWorktree: true,
  })).toThrow(/linked|primary/i);
});
```

## 14. Runner test: outer timeout is not upstream timeout

```ts
test("supervisor timeout is a wrapper failure", () => {
  const receipt = runZedEval(repo, requestForFixture("sleep", {
    timeoutSeconds: 1,
  }));

  expect(receipt.failure?.kind).toBe("supervisor_timeout");
  expect(receipt.result).toBeUndefined();
});
```

## 15. Runner test: disabled tool postcondition

```ts
test("read-only result cannot report disabled tool", () => {
  const receipt = runZedEval(repo, requestForFixture("forbidden-tool"));

  expect(receipt.failure).toBeDefined();
  expect(receipt.failure?.message).toMatch(/disabled tool/i);
});
```

## 16. CLI output contract example

Suggested JSON shape:

```json
{
  "schemaVersion": "repo-harness.zed-eval/v1",
  "runId": "20260814T181500000-1a2b3c4d5e6f7788",
  "sourceContract": {
    "expectedZedCommit": "24e25552b1259d56a6fdd7956a419ed9e8a1a25e",
    "binaryProvenance": "unverified"
  },
  "mode": "read-only",
  "workdir": "/repo",
  "command": [
    "/path/to/eval-cli",
    "--workdir",
    "/repo",
    "--instruction",
    "[instruction redacted]",
    "--model",
    "anthropic/...",
    "--timeout",
    "120",
    "--output-dir",
    "/repo/.ai/harness/runs/zed-eval/.../artifacts"
  ],
  "process": {
    "status": 0,
    "signal": null,
    "timedOut": false
  },
  "result": {
    "status": "completed",
    "duration_secs": 17.2,
    "model": "anthropic/..."
  },
  "artifacts": {
    "runRoot": "/repo/.ai/harness/runs/zed-eval/...",
    "outputDir": "/repo/.ai/harness/runs/zed-eval/.../artifacts",
    "resultJson": "/repo/.ai/harness/runs/zed-eval/.../artifacts/result.json",
    "threadMarkdown": "/repo/.ai/harness/runs/zed-eval/.../artifacts/thread.md",
    "threadJson": "/repo/.ai/harness/runs/zed-eval/.../artifacts/thread.json"
  }
}
```

Do not include:

- raw instruction;
- API keys;
- full environment;
- transcript content;
- provider secret values.

## 17. Architecture ownership sketch

Do not copy YAML blindly. The point is the ownership split.

Verification/evals-checks source include may need entries like:

```yaml
source:
  include:
    - src/core/zed-eval/**
    - src/effects/zed-eval/**
    - src/cli/commands/zed-eval.ts
    - tests/zed-eval-*.test.ts
    - tests/cli/zed-eval.test.ts
```

`src/cli/index.ts` should remain with its existing global runtime owner if the resolver confirms that ownership.

If `process-runner.ts` changes for additive redaction, keep it with its current owner rather than moving it into the Zed capability.

## 18. Manual read-only canary example

```bash
repo-harness zed-eval \
  --binary /absolute/path/to/zed/target/release/eval-cli \
  --workdir /tmp/zed-eval-canary \
  --instruction "Read README.md and return only its heading." \
  --model anthropic/claude-sonnet-4-6-latest \
  --timeout 120 \
  --no-staff \
  --json
```

Verify:

```bash
git -C /tmp/zed-eval-canary status --porcelain=v1 --untracked-files=all
```

and inspect only the new run directory.

## 19. Manual writable canary example

```bash
git -C /tmp/zed-eval-canary worktree add \
  --detach /tmp/zed-eval-canary-write HEAD

repo-harness zed-eval \
  --binary /absolute/path/to/zed/target/release/eval-cli \
  --workdir /tmp/zed-eval-canary-write \
  --mode writable \
  --disposable-worktree \
  --instruction "Create CANARY.txt containing only isolated." \
  --model anthropic/claude-sonnet-4-6-latest \
  --timeout 180 \
  --no-staff \
  --json
```

Then verify the primary worktree did not receive the file and manually remove the disposable worktree after review.

## 20. Forbidden implementation patterns

### Do not invent a generic adapter

```ts
// NO
interface FleetRuntimeAdapter {
  probe(): Promise<unknown>;
  prepare(): Promise<unknown>;
  start(): Promise<unknown>;
  events(handle: unknown): AsyncIterable<unknown>;
  cancel(handle: unknown): Promise<void>;
  collect(handle: unknown): Promise<unknown>;
}
```

### Do not parse human stderr into events

```ts
// NO
if (line.startsWith("[tool]")) {
  events.push(parseToolEvent(line));
}
```

### Do not replace default redactions with a Zed-local list

```ts
// NO
runProcess(binary, args, {
  redactions: [
    { pattern: /my prompt/g, replacement: "[redacted]" },
  ],
});
```

### Do not invoke a shell

```ts
// NO
execSync(`${binary} --instruction "${instruction}"`);
```

### Do not reuse output directories

```ts
// NO
const outputDir = join(repo, ".ai/harness/runs/zed-eval/latest");
```

## 21. Implementation review checklist

Before converting any snippet into production code, verify:

- [ ] type names are Zed-specific;
- [ ] no generic runtime lifecycle was added;
- [ ] `runProcess` is the only process authority;
- [ ] prompt redaction preserves default secret redactions;
- [ ] `read-only` wording does not claim host containment;
- [ ] writable mode cannot touch primary worktree;
- [ ] run HOME cannot fall back to operator HOME;
- [ ] output directory is unique and absent before launch;
- [ ] all external JSON is runtime-validated;
- [ ] exit/status pair is exact;
- [ ] transcripts remain opaque;
- [ ] no prompt/key/transcript body is emitted in receipts;
- [ ] no remote benchmark lifecycle was copied from MVP3;
- [ ] architecture ownership matches resolver output.
