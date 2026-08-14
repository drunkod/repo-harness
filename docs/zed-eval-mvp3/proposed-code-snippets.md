# Proposed Code Snippets: Zed Eval MVP 3

> **Documentation only.** These are detailed future implementation sketches,
> not files in `src/`, `tests/`, `.archcontext/`, or `assets/`. They have not
> been compiled or executed. Repin upstream, approve policy constants, reconcile
> with then-current repository code, and capture an execution contract before
> using them.

The snippets intentionally implement a narrow benchmark wrapper. They do not
create a fleet abstraction, generic runtime registry, writable worker,
cancellation API, installer target, hook host, provider, or reviewer.

## 1. `src/core/zed-benchmark/types.ts` (new)

```ts
export const ZED_BENCHMARK_SELECTORS = [
  'qna',
  'rf',
  'tw',
  'terminal-bench-2.1',
  'deepswe',
] as const;

export type ZedBenchmarkSelector = (typeof ZED_BENCHMARK_SELECTORS)[number];

/** Exact remote values documented by the pinned state.json producer. */
export type ZedBenchmarkRemotePhase =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed';

/**
 * Local submission states are kept separate from remote state.
 * `submission-uncertain` means the controller may have accepted the known run
 * ID before the local wrapper timed out or lost the response. It must be
 * reconciled with status, never retried automatically.
 */
export type ZedBenchmarkReceiptPhase =
  | 'submitting'
  | 'submission-uncertain'
  | ZedBenchmarkRemotePhase;

export interface ZedBenchmarkSubmitRequest {
  readonly repoRoot: string;
  readonly zedCheckout: string;
  /** Commit containing the reviewed zed-eval implementation. */
  readonly integrationPin: string;
  /** Clean Zed source commit to build into eval-cli for this benchmark. */
  readonly sourceSha: string;
  readonly namespace: string;
  readonly benchmark: ZedBenchmarkSelector;
  readonly model: string;
  readonly nTasks: number;
  readonly nConcurrent: number;
  readonly acknowledgeRemoteCostAndData: boolean;
}

export interface ZedBenchmarkResourcePolicy {
  readonly overrideCpus: number;
  readonly overrideMemoryMb: number;
  readonly sandboxTimeoutSecs: number;
  readonly sandboxIdleTimeoutSecs: number;
}

export interface ZedBenchmarkReceipt {
  readonly schema: 'repo-harness-zed-benchmark-run.v1';
  readonly runId: string;
  readonly phase: ZedBenchmarkReceiptPhase;
  readonly namespace: string;
  readonly experimentName: ZedBenchmarkSelector;
  readonly benchmark: ZedBenchmarkSelector;
  readonly zedCheckout: string;
  readonly integrationPin: string;
  readonly sourceSha: string;
  readonly model: string;
  readonly nTasks: number;
  readonly nConcurrent: number;
  readonly resourcePolicy: ZedBenchmarkResourcePolicy;
  /** Repository-relative ignored evidence paths. */
  readonly runDir: string;
  readonly jobsDir: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastFailureKind?: 'transport' | 'timeout' | 'exit' | 'schema';
}

export interface ZedBenchmarkRemoteState {
  readonly status: ZedBenchmarkRemotePhase;
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface ZedBenchmarkReport {
  readonly raw: Readonly<Record<string, unknown>>;
}

export type ZedBenchmarkSubmitOutcome =
  | {
      readonly kind: 'submitted';
      readonly receipt: ZedBenchmarkReceipt;
    }
  | {
      readonly kind: 'submission-uncertain';
      readonly receipt: ZedBenchmarkReceipt;
      readonly diagnostic: string;
    };
```

### Design notes

- There is no `writable` field. Benchmark harnesses own their internal mutation
  behavior; repo-harness does not expose that as a writer capability.
- There is no `cancelled` phase because the pinned CLI has no cancel command.
- `integrationPin` identifies the reviewed orchestrator implementation;
  `sourceSha` identifies the Zed source build being benchmarked. They may differ.
- The receipt contains relative evidence paths so moving the checkout does not
  silently turn an old absolute path into current authority.

## 2. `src/core/zed-benchmark/admission.ts` (new)

```ts
import { isAbsolute } from 'path';
import { randomUUID } from 'crypto';
import {
  ZED_BENCHMARK_SELECTORS,
  type ZedBenchmarkResourcePolicy,
  type ZedBenchmarkSelector,
  type ZedBenchmarkSubmitRequest,
} from './types';

export const PINNED_ZED_EVAL_COMMIT =
  '24e25552b1259d56a6fdd7956a419ed9e8a1a25e';

export const ZED_BENCHMARK_POLICY: ZedBenchmarkResourcePolicy = Object.freeze({
  overrideCpus: 4,
  overrideMemoryMb: 16_384,
  sandboxTimeoutSecs: 3_600,
  sandboxIdleTimeoutSecs: 900,
});

export const ZED_BENCHMARK_MAX_TASKS = 10;
export const ZED_BENCHMARK_MAX_CONCURRENT = 2;

const FULL_SHA = /^[0-9a-f]{40}$/;
const NAMESPACE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;
const RUN_ID = /^rh-zb-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export class ZedBenchmarkAdmissionError extends Error {
  readonly code = 'ZED_BENCHMARK_ADMISSION';
}

function assertPositiveBoundedInteger(
  name: string,
  value: number,
  maximum: number,
): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new ZedBenchmarkAdmissionError(
      `${name} must be an integer between 1 and ${maximum}`,
    );
  }
}

export function isZedBenchmarkSelector(
  value: string,
): value is ZedBenchmarkSelector {
  return (ZED_BENCHMARK_SELECTORS as readonly string[]).includes(value);
}

export function assertZedBenchmarkRunId(runId: string): void {
  if (!RUN_ID.test(runId)) {
    throw new ZedBenchmarkAdmissionError('invalid repo-harness Zed benchmark run id');
  }
}

export function createZedBenchmarkRunId(): string {
  const runId = `rh-zb-${randomUUID()}`;
  assertZedBenchmarkRunId(runId);
  return runId;
}

export function admitZedBenchmarkSubmit(
  request: ZedBenchmarkSubmitRequest,
): void {
  if (!isAbsolute(request.repoRoot)) {
    throw new ZedBenchmarkAdmissionError('repoRoot must be absolute');
  }
  if (!isAbsolute(request.zedCheckout)) {
    throw new ZedBenchmarkAdmissionError('zedCheckout must be absolute');
  }
  if (request.integrationPin !== PINNED_ZED_EVAL_COMMIT) {
    throw new ZedBenchmarkAdmissionError(
      `integration pin must equal ${PINNED_ZED_EVAL_COMMIT}`,
    );
  }
  if (!FULL_SHA.test(request.sourceSha)) {
    throw new ZedBenchmarkAdmissionError(
      'sourceSha must be a full lowercase 40-hex Zed commit SHA',
    );
  }
  if (!isZedBenchmarkSelector(request.benchmark)) {
    throw new ZedBenchmarkAdmissionError('unsupported Zed benchmark selector');
  }
  if (!NAMESPACE.test(request.namespace)) {
    throw new ZedBenchmarkAdmissionError('namespace must be a constrained lowercase slug');
  }
  if (!MODEL.test(request.model)) {
    throw new ZedBenchmarkAdmissionError('model has invalid syntax');
  }
  assertPositiveBoundedInteger(
    'nTasks',
    request.nTasks,
    ZED_BENCHMARK_MAX_TASKS,
  );
  assertPositiveBoundedInteger(
    'nConcurrent',
    request.nConcurrent,
    ZED_BENCHMARK_MAX_CONCURRENT,
  );
  if (request.nConcurrent > request.nTasks) {
    throw new ZedBenchmarkAdmissionError('nConcurrent cannot exceed nTasks');
  }
  if (request.acknowledgeRemoteCostAndData !== true) {
    throw new ZedBenchmarkAdmissionError(
      'remote cost/data acknowledgement is required',
    );
  }
}
```

### Policy note

The CPU/memory/time values are proposed initial bounds, not upstream defaults.
They require explicit approval. If changed, update tests and the approved plan;
do not make them hidden environment fallbacks.

## 3. `src/core/zed-benchmark/state-schema.ts` (new)

```ts
import type {
  ZedBenchmarkRemotePhase,
  ZedBenchmarkRemoteState,
  ZedBenchmarkReport,
} from './types';

const REMOTE_PHASES = new Set<ZedBenchmarkRemotePhase>([
  'pending',
  'running',
  'completed',
  'failed',
]);

export class ZedBenchmarkSchemaError extends Error {
  readonly code = 'ZED_BENCHMARK_SCHEMA';
}

function parseObject(label: string, text: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ZedBenchmarkSchemaError(`${label} is not valid JSON`);
  }
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    throw new ZedBenchmarkSchemaError(`${label} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

function assertOptionalString(
  object: Record<string, unknown>,
  field: string,
): void {
  const value = object[field];
  if (value !== undefined && typeof value !== 'string') {
    throw new ZedBenchmarkSchemaError(`${field} must be a string when present`);
  }
}

function assertOptionalFiniteNonNegativeNumber(
  object: Record<string, unknown>,
  field: string,
): void {
  const value = object[field];
  if (
    value !== undefined
    && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
  ) {
    throw new ZedBenchmarkSchemaError(
      `${field} must be a finite non-negative number when present`,
    );
  }
}

export function parseZedBenchmarkState(text: string): ZedBenchmarkRemoteState {
  const raw = parseObject('zed-eval state', text);
  const status = raw.status;
  if (typeof status !== 'string' || !REMOTE_PHASES.has(status as ZedBenchmarkRemotePhase)) {
    throw new ZedBenchmarkSchemaError(
      `zed-eval state has unsupported status ${JSON.stringify(status)}`,
    );
  }
  for (const field of [
    'run_id',
    'namespace',
    'experiment_name',
    'created_at',
    'updated_at',
  ]) {
    assertOptionalString(raw, field);
  }
  return {
    status: status as ZedBenchmarkRemotePhase,
    raw: Object.freeze({ ...raw }),
  };
}

export function parseZedBenchmarkReport(text: string): ZedBenchmarkReport {
  const raw = parseObject('zed-eval report', text);
  for (const field of [
    'n_trials',
    'n_scored',
    'n_passed',
    'n_failed',
    'n_errored',
    'n_attempts',
    'pass_rate',
    'pass_sem',
  ]) {
    assertOptionalFiniteNonNegativeNumber(raw, field);
  }
  if (raw.label !== undefined && typeof raw.label !== 'string') {
    throw new ZedBenchmarkSchemaError('report label must be a string when present');
  }
  if (raw.job_dir !== undefined && typeof raw.job_dir !== 'string') {
    throw new ZedBenchmarkSchemaError('report job_dir must be a string when present');
  }
  return { raw: Object.freeze({ ...raw }) };
}
```

### Validation note

The final validator must be reconciled with exact fixtures from the chosen
upstream pin. Do not loosen unknown status handling into an `unknown` phase. A
new status is contract drift that requires review.

## 4. `src/effects/zed-benchmark/receipt-store.ts` (new)

```ts
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { dirname, isAbsolute, join, relative, resolve } from 'path';
import {
  assertZedBenchmarkRunId,
  isZedBenchmarkSelector,
} from '../../core/zed-benchmark/admission';
import type {
  ZedBenchmarkReceipt,
  ZedBenchmarkReceiptPhase,
} from '../../core/zed-benchmark/types';

const SCHEMA = 'repo-harness-zed-benchmark-run.v1' as const;

const LEGAL_TRANSITIONS: Readonly<Record<ZedBenchmarkReceiptPhase, readonly ZedBenchmarkReceiptPhase[]>> = {
  submitting: ['pending', 'submission-uncertain'],
  'submission-uncertain': ['pending', 'running', 'completed', 'failed'],
  pending: ['running', 'completed', 'failed'],
  running: ['completed', 'failed'],
  completed: [],
  failed: [],
};

export class ZedBenchmarkReceiptError extends Error {
  constructor(
    readonly kind: 'missing' | 'corrupt' | 'conflict' | 'path' | 'transition',
    message: string,
  ) {
    super(message);
  }
}

function assertContained(root: string, candidate: string): void {
  const rel = relative(root, candidate);
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) return;
  throw new ZedBenchmarkReceiptError('path', 'receipt path escapes repository root');
}

function assertExistingComponentsAreNotSymlinks(root: string, candidate: string): void {
  const rel = relative(root, candidate);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new ZedBenchmarkReceiptError('path', 'candidate escapes repository root');
  }
  let cursor = root;
  for (const part of rel.split(/[\\/]+/).filter(Boolean)) {
    cursor = join(cursor, part);
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) {
      throw new ZedBenchmarkReceiptError('path', `symlinked receipt component: ${cursor}`);
    }
  }
}

export function zedBenchmarkStoreRoot(repoRoot: string): string {
  const root = resolve(repoRoot);
  const store = join(root, '.ai', 'harness', 'runs', 'zed-benchmark');
  assertContained(root, store);
  return store;
}

export function zedBenchmarkRunDir(repoRoot: string, runId: string): string {
  assertZedBenchmarkRunId(runId);
  return join(zedBenchmarkStoreRoot(repoRoot), runId);
}

export function zedBenchmarkReceiptPath(repoRoot: string, runId: string): string {
  return join(zedBenchmarkRunDir(repoRoot, runId), 'receipt.json');
}

function parseReceipt(text: string): ZedBenchmarkReceipt {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ZedBenchmarkReceiptError('corrupt', 'receipt is not valid JSON');
  }
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    throw new ZedBenchmarkReceiptError('corrupt', 'receipt must be an object');
  }
  const receipt = value as Partial<ZedBenchmarkReceipt>;
  if (receipt.schema !== SCHEMA || typeof receipt.runId !== 'string') {
    throw new ZedBenchmarkReceiptError('corrupt', 'receipt schema/runId is invalid');
  }
  assertZedBenchmarkRunId(receipt.runId);
  if (
    typeof receipt.phase !== 'string'
    || !(receipt.phase in LEGAL_TRANSITIONS)
    || typeof receipt.namespace !== 'string'
    || typeof receipt.experimentName !== 'string'
    || !isZedBenchmarkSelector(receipt.experimentName)
    || receipt.benchmark !== receipt.experimentName
    || typeof receipt.zedCheckout !== 'string'
    || typeof receipt.integrationPin !== 'string'
    || typeof receipt.sourceSha !== 'string'
    || typeof receipt.model !== 'string'
    || !Number.isSafeInteger(receipt.nTasks)
    || !Number.isSafeInteger(receipt.nConcurrent)
    || typeof receipt.runDir !== 'string'
    || typeof receipt.jobsDir !== 'string'
    || typeof receipt.createdAt !== 'string'
    || typeof receipt.updatedAt !== 'string'
    || receipt.resourcePolicy === null
    || typeof receipt.resourcePolicy !== 'object'
  ) {
    throw new ZedBenchmarkReceiptError('corrupt', 'receipt fields are invalid');
  }
  return receipt as ZedBenchmarkReceipt;
}

function atomicWrite(path: string, payload: string, exclusive: boolean): void {
  const temporary = join(
    dirname(path),
    `.receipt.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`,
  );
  let fd: number | undefined;
  try {
    fd = openSync(temporary, 'wx', 0o600);
    writeFileSync(fd, payload, 'utf8');
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    if (exclusive && existsSync(path)) {
      throw new ZedBenchmarkReceiptError('conflict', 'receipt already exists');
    }
    renameSync(temporary, path);
    chmodSync(path, 0o600);
  } finally {
    if (fd !== undefined) closeSync(fd);
    rmSync(temporary, { force: true });
  }
}

export function createZedBenchmarkReceipt(
  repoRoot: string,
  receipt: ZedBenchmarkReceipt,
): void {
  const root = resolve(repoRoot);
  const store = zedBenchmarkStoreRoot(root);
  const runDir = zedBenchmarkRunDir(root, receipt.runId);
  assertExistingComponentsAreNotSymlinks(root, store);
  mkdirSync(store, { recursive: true, mode: 0o700 });
  assertExistingComponentsAreNotSymlinks(root, store);
  if (existsSync(runDir)) {
    throw new ZedBenchmarkReceiptError('conflict', 'run directory already exists');
  }
  mkdirSync(runDir, { recursive: false, mode: 0o700 });
  chmodSync(runDir, 0o700);
  atomicWrite(
    zedBenchmarkReceiptPath(root, receipt.runId),
    `${JSON.stringify(receipt, null, 2)}\n`,
    true,
  );
}

export function loadZedBenchmarkReceipt(
  repoRoot: string,
  runId: string,
): ZedBenchmarkReceipt {
  const path = zedBenchmarkReceiptPath(repoRoot, runId);
  if (!existsSync(path)) {
    throw new ZedBenchmarkReceiptError('missing', `unknown run id ${runId}`);
  }
  if (lstatSync(path).isSymbolicLink()) {
    throw new ZedBenchmarkReceiptError('path', 'receipt cannot be a symlink');
  }
  const receipt = parseReceipt(readFileSync(path, 'utf8'));
  if (receipt.runId !== runId) {
    throw new ZedBenchmarkReceiptError('corrupt', 'receipt run id mismatch');
  }
  return receipt;
}

export function transitionZedBenchmarkReceipt(
  repoRoot: string,
  runId: string,
  next: ZedBenchmarkReceiptPhase,
  now: string,
  lastFailureKind?: ZedBenchmarkReceipt['lastFailureKind'],
): ZedBenchmarkReceipt {
  const current = loadZedBenchmarkReceipt(repoRoot, runId);
  if (!LEGAL_TRANSITIONS[current.phase].includes(next)) {
    throw new ZedBenchmarkReceiptError(
      'transition',
      `illegal receipt transition ${current.phase} -> ${next}`,
    );
  }
  const updated: ZedBenchmarkReceipt = {
    ...current,
    phase: next,
    updatedAt: now,
    ...(lastFailureKind ? { lastFailureKind } : {}),
  };
  atomicWrite(
    zedBenchmarkReceiptPath(repoRoot, runId),
    `${JSON.stringify(updated, null, 2)}\n`,
    false,
  );
  return updated;
}
```

### Hardening note

The implementation review must check race resistance and reuse any then-current
repository filesystem transaction helper that provides stronger same-directory
atomicity/symlink guarantees. Do not weaken this to direct `writeFileSync`.

## 5. `src/effects/zed-benchmark/run-zed-benchmark.ts` (new)

```ts
import { existsSync, lstatSync, mkdirSync } from 'fs';
import { join, relative, resolve } from 'path';
import {
  PINNED_ZED_EVAL_COMMIT,
  ZED_BENCHMARK_POLICY,
  admitZedBenchmarkSubmit,
  createZedBenchmarkRunId,
} from '../../core/zed-benchmark/admission';
import {
  parseZedBenchmarkReport,
  parseZedBenchmarkState,
} from '../../core/zed-benchmark/state-schema';
import type {
  ZedBenchmarkReceipt,
  ZedBenchmarkRemoteState,
  ZedBenchmarkReport,
  ZedBenchmarkSubmitOutcome,
  ZedBenchmarkSubmitRequest,
} from '../../core/zed-benchmark/types';
import {
  createZedBenchmarkReceipt,
  loadZedBenchmarkReceipt,
  transitionZedBenchmarkReceipt,
  zedBenchmarkRunDir,
} from './receipt-store';
import {
  runProcess,
  type ProcessRunResult,
  type RunProcessOptions,
} from '../process-runner';

const SUBMIT_TIMEOUT_MS = 5 * 60_000;
const QUERY_TIMEOUT_MS = 60_000;
const FETCH_TIMEOUT_MS = 10 * 60_000;
const MAX_DIAGNOSTIC_CHARS = 4_000;

export type RunZedBenchmarkProcess = (
  command: string,
  args: readonly string[],
  options: RunProcessOptions,
) => ProcessRunResult;

export interface ZedBenchmarkDependencies {
  readonly run?: RunZedBenchmarkProcess;
  readonly now?: () => string;
  readonly createRunId?: () => string;
}

function now(deps: ZedBenchmarkDependencies): string {
  return (deps.now ?? (() => new Date().toISOString()))();
}

function zedEvalScript(checkout: string): string {
  const path = join(checkout, 'crates', 'eval_cli', 'script', 'zed-eval');
  if (!existsSync(path) || !lstatSync(path).isFile()) {
    throw new Error('pinned Zed checkout does not contain the zed-eval script');
  }
  return path;
}

function diagnostic(result: ProcessRunResult): string {
  return (result.stderr || result.error || `exit status ${result.status}`)
    .slice(0, MAX_DIAGNOSTIC_CHARS);
}

function runOrDefault(deps: ZedBenchmarkDependencies): RunZedBenchmarkProcess {
  return deps.run ?? runProcess;
}

function verifyCheckoutPin(
  request: ZedBenchmarkSubmitRequest,
  deps: ZedBenchmarkDependencies,
): void {
  const result = runOrDefault(deps)(
    'git',
    ['-C', request.zedCheckout, 'rev-parse', 'HEAD'],
    {
      cwd: request.repoRoot,
      stdio: 'pipe',
      timeoutMs: 15_000,
      processGroup: true,
    },
  );
  if (!result.ok || result.stdout.trim() !== request.integrationPin) {
    throw new Error('Zed checkout does not match the approved zed-eval integration pin');
  }
}

function commonLocatorArgs(receipt: ZedBenchmarkReceipt): string[] {
  return [
    '--namespace',
    receipt.namespace,
    '--volume',
    'agent-evals',
  ];
}

function createInitialReceipt(
  request: ZedBenchmarkSubmitRequest,
  runId: string,
  timestamp: string,
): ZedBenchmarkReceipt {
  const runDir = relative(
    request.repoRoot,
    zedBenchmarkRunDir(request.repoRoot, runId),
  );
  return {
    schema: 'repo-harness-zed-benchmark-run.v1',
    runId,
    phase: 'submitting',
    namespace: request.namespace,
    experimentName: request.benchmark,
    benchmark: request.benchmark,
    zedCheckout: request.zedCheckout,
    integrationPin: request.integrationPin,
    sourceSha: request.sourceSha,
    model: request.model,
    nTasks: request.nTasks,
    nConcurrent: request.nConcurrent,
    resourcePolicy: ZED_BENCHMARK_POLICY,
    runDir,
    jobsDir: join(runDir, 'artifacts'),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function submitZedBenchmark(
  request: ZedBenchmarkSubmitRequest,
  deps: ZedBenchmarkDependencies = {},
): ZedBenchmarkSubmitOutcome {
  admitZedBenchmarkSubmit(request);
  verifyCheckoutPin(request, deps);

  const runId = (deps.createRunId ?? createZedBenchmarkRunId)();
  const timestamp = now(deps);
  const initial = createInitialReceipt(request, runId, timestamp);
  createZedBenchmarkReceipt(request.repoRoot, initial);

  const args = [
    '--namespace', request.namespace,
    '--volume', 'agent-evals',
    'run', request.benchmark,
    '--run-id', runId,
    '--from', request.sourceSha,
    '--require-clean',
    '--model', request.model,
    '--n-tasks', String(request.nTasks),
    '--n-concurrent', String(request.nConcurrent),
    '--override-cpus', String(ZED_BENCHMARK_POLICY.overrideCpus),
    '--override-memory-mb', String(ZED_BENCHMARK_POLICY.overrideMemoryMb),
    '--sandbox-timeout-secs', String(ZED_BENCHMARK_POLICY.sandboxTimeoutSecs),
    '--sandbox-idle-timeout-secs',
    String(ZED_BENCHMARK_POLICY.sandboxIdleTimeoutSecs),
  ];

  const result = runOrDefault(deps)(zedEvalScript(request.zedCheckout), args, {
    cwd: request.zedCheckout,
    stdio: 'pipe',
    timeoutMs: SUBMIT_TIMEOUT_MS,
    processGroup: true,
    maxOutputBytes: 64 * 1024,
  });

  if (result.ok) {
    return {
      kind: 'submitted',
      receipt: transitionZedBenchmarkReceipt(
        request.repoRoot,
        runId,
        'pending',
        now(deps),
      ),
    };
  }

  const failureKind = result.timedOut
    ? 'timeout'
    : result.signal
      ? 'transport'
      : 'exit';
  return {
    kind: 'submission-uncertain',
    receipt: transitionZedBenchmarkReceipt(
      request.repoRoot,
      runId,
      'submission-uncertain',
      now(deps),
      failureKind,
    ),
    diagnostic: diagnostic(result),
  };
}

function runForReceipt(
  repoRoot: string,
  runId: string,
  argsAfterCommand: readonly string[],
  deps: ZedBenchmarkDependencies,
  timeoutMs = QUERY_TIMEOUT_MS,
): { receipt: ZedBenchmarkReceipt; result: ProcessRunResult } {
  const receipt = loadZedBenchmarkReceipt(repoRoot, runId);
  if (receipt.integrationPin !== PINNED_ZED_EVAL_COMMIT) {
    throw new Error('receipt integration pin is no longer supported');
  }
  const result = runOrDefault(deps)(
    zedEvalScript(receipt.zedCheckout),
    [...commonLocatorArgs(receipt), ...argsAfterCommand],
    {
      cwd: receipt.zedCheckout,
      stdio: 'pipe',
      timeoutMs,
      processGroup: true,
      maxOutputBytes: 64 * 1024,
    },
  );
  return { receipt, result };
}

export function statusZedBenchmark(
  repoRoot: string,
  runId: string,
  deps: ZedBenchmarkDependencies = {},
): ZedBenchmarkRemoteState {
  const { receipt, result } = runForReceipt(
    repoRoot,
    runId,
    ['status', runId, '--experiment-name', loadZedBenchmarkReceipt(repoRoot, runId).experimentName],
    deps,
  );
  if (!result.ok) throw new Error(`zed-eval status failed: ${diagnostic(result)}`);
  const state = parseZedBenchmarkState(result.stdout);
  if (state.raw.run_id !== undefined && state.raw.run_id !== runId) {
    throw new Error('remote state run id does not match the receipt');
  }
  if (receipt.phase !== state.status) {
    transitionZedBenchmarkReceipt(repoRoot, runId, state.status, now(deps));
  }
  return state;
}

export function logsZedBenchmark(
  repoRoot: string,
  runId: string,
  deps: ZedBenchmarkDependencies = {},
): string {
  const receipt = loadZedBenchmarkReceipt(repoRoot, runId);
  const { result } = runForReceipt(
    repoRoot,
    runId,
    ['logs', runId, '--experiment-name', receipt.experimentName],
    deps,
  );
  if (!result.ok) throw new Error(`zed-eval logs failed: ${diagnostic(result)}`);
  return result.stdout;
}

export function fetchZedBenchmark(
  repoRoot: string,
  runId: string,
  deps: ZedBenchmarkDependencies = {},
): string {
  const receipt = loadZedBenchmarkReceipt(repoRoot, runId);
  const jobsDir = resolve(repoRoot, receipt.jobsDir);
  const runDir = resolve(repoRoot, receipt.runDir);
  if (relative(runDir, jobsDir).startsWith('..')) {
    throw new Error('jobs directory escapes the run directory');
  }
  mkdirSync(jobsDir, { recursive: true, mode: 0o700 });
  const { result } = runForReceipt(
    repoRoot,
    runId,
    [
      'fetch', runId,
      '--experiment-name', receipt.experimentName,
      '--jobs-dir', jobsDir,
    ],
    deps,
    FETCH_TIMEOUT_MS,
  );
  if (!result.ok) throw new Error(`zed-eval fetch failed: ${diagnostic(result)}`);
  const jobDir = join(jobsDir, runId);
  if (!existsSync(jobDir) || !lstatSync(jobDir).isDirectory()) {
    throw new Error('zed-eval fetch did not create the expected job directory');
  }
  return jobDir;
}

export function reportZedBenchmark(
  repoRoot: string,
  runId: string,
  deps: ZedBenchmarkDependencies = {},
): ZedBenchmarkReport {
  const receipt = loadZedBenchmarkReceipt(repoRoot, runId);
  const jobDir = resolve(repoRoot, receipt.jobsDir, runId);
  if (!existsSync(jobDir) || !lstatSync(jobDir).isDirectory()) {
    throw new Error('fetch the benchmark artifacts before requesting a report');
  }
  const { result } = runForReceipt(
    repoRoot,
    runId,
    [
      'report', runId,
      '--experiment-name', receipt.experimentName,
      '--job-dir', jobDir,
      '--json',
    ],
    deps,
    FETCH_TIMEOUT_MS,
  );
  if (!result.ok) throw new Error(`zed-eval report failed: ${diagnostic(result)}`);
  return parseZedBenchmarkReport(result.stdout);
}
```

### Important implementation review items

- The status helper above deliberately illustrates exact locator arguments, but
  the final code should load the receipt once and pass it into a private helper
  to avoid duplicate reads.
- Before `status`, `logs`, `fetch`, and `report`, verify the checkout pin again;
  do not only trust the stored path/pin. The final code should centralize that
  check in `runForReceipt`.
- Submission failure is “uncertain” even for many nonzero exits because remote
  acceptance may precede local failure. Live evidence may justify narrowing
  particular pre-spawn failures later; MVP fails closed.
- Never parse run IDs from stdout. The exact ID is already passed via `--run-id`.
- Never combine `report --fetch --json`; fetch progress makes stdout unsuitable
  for direct JSON parsing.
- Never invoke `deploy` or synthesize cancellation.

## 6. `src/cli/commands/zed-benchmark.ts` (new)

```ts
import { Command } from 'commander';
import { resolve } from 'path';
import {
  PINNED_ZED_EVAL_COMMIT,
  ZED_BENCHMARK_MAX_CONCURRENT,
  ZED_BENCHMARK_MAX_TASKS,
  isZedBenchmarkSelector,
} from '../../core/zed-benchmark/admission';
import type { ZedBenchmarkSubmitRequest } from '../../core/zed-benchmark/types';
import {
  fetchZedBenchmark,
  logsZedBenchmark,
  reportZedBenchmark,
  statusZedBenchmark,
  submitZedBenchmark,
} from '../../effects/zed-benchmark/run-zed-benchmark';

function fail(error: unknown, exitCode = 1): never {
  const message = error instanceof Error ? error.message : 'unknown failure';
  process.stderr.write(`zed-benchmark: ${message}\n`);
  process.exit(exitCode);
}

function positiveInteger(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function rootOption(command: Command): string {
  return resolve(command.optsWithGlobals<{ repo?: string }>().repo ?? process.cwd());
}

export function buildZedBenchmarkCommand(): Command {
  const command = new Command('zed-benchmark')
    .description('Launch and inspect pinned remote Zed benchmark runs')
    .option('--repo <path>', 'Repository root used only for local ignored receipts', '.')
    .addHelpText(
      'after',
      [
        '',
        'Benchmark-only: this does not run a free-form task against the current repository.',
        'Remote Modal/model execution can incur cost and share logs, patches, tasks, and artifacts.',
        'MVP 3 has no cancellation command. Never use deploy as cancellation.',
        '',
      ].join('\n'),
    );

  command
    .command('submit')
    .description('Submit one pinned remote benchmark; never auto-retries')
    .requiredOption('--zed-checkout <absolute-path>', 'Pinned Zed source checkout')
    .requiredOption('--source-sha <40-hex-sha>', 'Clean Zed source commit to benchmark')
    .requiredOption('--namespace <slug>', 'Explicit remote volume namespace')
    .requiredOption('--benchmark <selector>', 'qna|rf|tw|terminal-bench-2.1|deepswe')
    .requiredOption('--model <id>', 'Upstream Zed model preset or provider/model id')
    .requiredOption('--n-tasks <count>', `Task count, maximum ${ZED_BENCHMARK_MAX_TASKS}`)
    .requiredOption('--n-concurrent <count>', `Concurrency, maximum ${ZED_BENCHMARK_MAX_CONCURRENT}`)
    .requiredOption(
      '--acknowledge-remote-cost-and-data',
      'Acknowledge remote cost and data/artifact sharing',
    )
    .option('--json', 'Emit a machine-readable local outcome')
    .action((options: Record<string, string | boolean>, actionCommand: Command) => {
      try {
        if (!isZedBenchmarkSelector(String(options.benchmark))) {
          throw new Error('unsupported benchmark selector');
        }
        const request: ZedBenchmarkSubmitRequest = {
          repoRoot: rootOption(actionCommand),
          zedCheckout: resolve(String(options.zedCheckout)),
          integrationPin: PINNED_ZED_EVAL_COMMIT,
          sourceSha: String(options.sourceSha),
          namespace: String(options.namespace),
          benchmark: options.benchmark,
          model: String(options.model),
          nTasks: positiveInteger(String(options.nTasks), 'n-tasks'),
          nConcurrent: positiveInteger(String(options.nConcurrent), 'n-concurrent'),
          acknowledgeRemoteCostAndData:
            options.acknowledgeRemoteCostAndData === true,
        };
        const outcome = submitZedBenchmark(request);
        const payload = {
          outcome: outcome.kind,
          runId: outcome.receipt.runId,
          phase: outcome.receipt.phase,
          receipt: outcome.receipt.runDir,
        };
        if (options.json === true) {
          process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
        } else if (outcome.kind === 'submitted') {
          process.stdout.write(
            `submitted ${payload.runId}; use zed-benchmark status --run-id ${payload.runId}\n`,
          );
        } else {
          process.stderr.write(
            `submission status is uncertain for ${payload.runId}; do not retry submit. Reconcile with status.\n`,
          );
        }
        process.exit(outcome.kind === 'submitted' ? 0 : 1);
      } catch (error) {
        fail(error, 2);
      }
    });

  command
    .command('status')
    .requiredOption('--run-id <id>')
    .option('--json')
    .action((options: { runId: string; json?: boolean }, actionCommand: Command) => {
      try {
        const state = statusZedBenchmark(rootOption(actionCommand), options.runId);
        process.stdout.write(
          options.json === true
            ? `${JSON.stringify(state.raw, null, 2)}\n`
            : `${state.status}\n`,
        );
      } catch (error) {
        fail(error);
      }
    });

  command
    .command('logs')
    .description('Print potentially sensitive bounded/redacted controller logs once')
    .requiredOption('--run-id <id>')
    .action((options: { runId: string }, actionCommand: Command) => {
      try {
        process.stdout.write(logsZedBenchmark(rootOption(actionCommand), options.runId));
      } catch (error) {
        fail(error);
      }
    });

  command
    .command('fetch')
    .requiredOption('--run-id <id>')
    .action((options: { runId: string }, actionCommand: Command) => {
      try {
        const jobDir = fetchZedBenchmark(rootOption(actionCommand), options.runId);
        process.stdout.write(`fetched ${options.runId} into ignored run evidence\n`);
        // Do not print the absolute jobDir; keep machine-specific paths out of logs.
        void jobDir;
      } catch (error) {
        fail(error);
      }
    });

  command
    .command('report')
    .requiredOption('--run-id <id>')
    .option('--json')
    .action((options: { runId: string; json?: boolean }, actionCommand: Command) => {
      try {
        const report = reportZedBenchmark(rootOption(actionCommand), options.runId);
        if (options.json === true) {
          process.stdout.write(`${JSON.stringify(report.raw, null, 2)}\n`);
        } else {
          const passed = report.raw.n_passed ?? 'n/a';
          const scored = report.raw.n_scored ?? 'n/a';
          process.stdout.write(`benchmark report: ${passed}/${scored} scored passed\n`);
        }
      } catch (error) {
        fail(error);
      }
    });

  return command;
}
```

### CLI review notes

- Commander option adaptation must be fixture-tested against Commander 15.
- The final implementation should distinguish usage/admission errors from remote
  errors without exposing raw sensitive details.
- `--json` uncertain submission must remain valid JSON on stdout with diagnostics
  on stderr.
- The command intentionally has no generic `run`, `cancel`, `deploy`, or
  passthrough argument.

## 7. `src/cli/index.ts` (three focused edits)

### Import

```ts
import { buildZedBenchmarkCommand } from './commands/zed-benchmark';
```

### `SUBCOMMANDS`

```ts
export const SUBCOMMANDS = [
  // existing entries...
  'zed-benchmark',
] as const;
```

### Registration

```ts
program.addCommand(buildZedBenchmarkCommand());
```

### Intentionally unchanged

```ts
const TARGET_HELP = 'codex|claude|both';
```

Do not change installer unions/registries, route hosts, review providers,
workflow compatibility metadata, or top-level claims of agent parity.

## 8. ArchContext capability update (future focused fragment)

The exact generated change must come from the then-current ArchContext model.
A likely source-of-truth update is to extend
`.archcontext/model/nodes/capability.verification.evals-checks.yaml`:

```yaml
responsibilities:
  - Own machine-verifiable checks, bounded verifier execution, and evaluation evidence.
  - Orchestrate explicitly invoked, pinned remote benchmark runs without exposing them as repository writers or generic fleet runtimes.
source:
  include:
    - "tests/**"
    - "evals/**"
    - "src/core/zed-benchmark/**"
    - "src/effects/zed-benchmark/**"
    - "src/cli/commands/zed-benchmark.ts"
    - "docs/reference-configs/external-tooling.md"
    - "assets/reference-configs/external-tooling.md"
    # preserve every existing include
extensions:
  verification:
    - "bun test tests/zed-benchmark-admission.test.ts tests/zed-benchmark-state-schema.test.ts"
    - "bun test tests/zed-benchmark-receipt-store.test.ts tests/zed-benchmark-runner.test.ts tests/cli/zed-benchmark.test.ts"
    # preserve existing verification commands
```

Run `archctx docs plan --json`, apply exactly its projection, and keep
`src/cli/index.ts` under its existing owner.

## 9. Test fixture pattern

### Fake process injection

```ts
import { describe, expect, test } from 'bun:test';
import type { RunZedBenchmarkProcess } from '../src/effects/zed-benchmark/run-zed-benchmark';

function processResult(overrides: Partial<ReturnType<RunZedBenchmarkProcess>> = {}) {
  return {
    ok: true,
    status: 0,
    signal: null,
    timedOut: false,
    command: [],
    stdout: '',
    stderr: '',
    error: '',
    ...overrides,
  };
}

test('passes the generated upstream run id instead of parsing stdout', () => {
  const calls: Array<{ command: string; args: readonly string[] }> = [];
  const run: RunZedBenchmarkProcess = (command, args) => {
    calls.push({ command, args });
    if (command === 'git') {
      return processResult({
        stdout: '24e25552b1259d56a6fdd7956a419ed9e8a1a25e\n',
      });
    }
    return processResult({ stdout: 'human wording may change\n' });
  };

  // Build a temporary repo and pinned-checkout fixture, then call submit with:
  // createRunId: () => 'rh-zb-00000000-0000-4000-8000-000000000000'
  // Assert argv contains exactly:
  expect(calls.at(-1)?.args).toContain('rh-zb-00000000-0000-4000-8000-000000000000');
  // Assert no stdout parser is needed for the receipt id.
});
```

### State fixture matrix

```ts
import { expect, test } from 'bun:test';
import { parseZedBenchmarkState } from '../src/core/zed-benchmark/state-schema';

for (const status of ['pending', 'running', 'completed', 'failed'] as const) {
  test(`accepts pinned state ${status}`, () => {
    expect(parseZedBenchmarkState(JSON.stringify({ status })).status).toBe(status);
  });
}

for (const invalid of [
  '',
  'running',
  'prefix {"status":"running"}',
  '[]',
  'null',
  '{"status":"cancelled"}',
  '{"status":"unknown"}',
  '{"status":1}',
]) {
  test(`rejects malformed state ${JSON.stringify(invalid)}`, () => {
    expect(() => parseZedBenchmarkState(invalid)).toThrow();
  });
}
```

### Required runner assertions

The complete test file must also assert:

- submit receipt exists before the first `zed-eval` call;
- only one `zed-eval run` call occurs;
- `--from` is a full SHA and `--require-clean` is present;
- `--run-id`, namespace, benchmark, model, task/concurrency, and resource limits
  match the receipt;
- `local`, `main`, `--allow-untracked`, `--patch-path`, `--repo-url`,
  `--extra-harbor-arg`, `--staff`, `deploy`, and `cancel` are absent;
- timeout/nonzero/signal writes `submission-uncertain`;
- status reconciles the same run ID without submit retry;
- fetch passes exact `--jobs-dir` below the run directory;
- report passes exact `--job-dir` and `--json` without `--fetch`;
- corrupt state/report/receipt data fails distinctly; and
- test fixtures never open network connections or run real `modal`/`harbor`.

## 10. Reference documentation fragment

Apply the same substantive text to the packaged and repository reference files:

```md
### Zed remote benchmarks

`repo-harness zed-benchmark` is an opt-in wrapper around a separately installed,
pinned Zed checkout's Python `zed-eval` benchmark controller. It launches only
supported benchmark datasets. It is not a free-form remote agent, repository
writer, hook host, provider, reviewer, or generic fleet runtime.

Remote runs can incur Modal and model-provider cost. Manifests, source patches,
tasks, logs, model/tool output, and fetched archives may be visible to members
with access to the configured Modal workspace/volume and to configured model
providers. Volume namespaces prevent collisions; they are not access control.

The command never deploys the Modal app and has no cancellation operation.
Submission timeout is ambiguous: do not resubmit. Use the printed run ID with
`status` to reconcile.
```

Then run the repository's reference-config synchronization check.
