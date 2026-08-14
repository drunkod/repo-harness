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
  PINNED_ZED_EVAL_COMMIT,
  ZED_BENCHMARK_MAX_CONCURRENT,
  ZED_BENCHMARK_MAX_TASKS,
  assertZedBenchmarkRunId,
  isExactZedBenchmarkResourcePolicy,
  isFullLowercaseGitSha,
  isZedBenchmarkModel,
  isZedBenchmarkNamespace,
  isZedBenchmarkSelector,
} from '../../core/zed-benchmark/admission';
import type {
  ZedBenchmarkReceipt,
  ZedBenchmarkReceiptPhase,
} from '../../core/zed-benchmark/types';

const SCHEMA = 'repo-harness-zed-benchmark-run.v1' as const;

const FAILURE_KINDS = new Set(['transport', 'timeout', 'exit', 'schema']);

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

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isCanonicalTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
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
  try {
    assertZedBenchmarkRunId(receipt.runId);
  } catch {
    throw new ZedBenchmarkReceiptError('corrupt', 'receipt runId is invalid');
  }
  const validFailureKind = receipt.lastFailureKind === undefined
    || (typeof receipt.lastFailureKind === 'string' && FAILURE_KINDS.has(receipt.lastFailureKind));
  if (
    typeof receipt.phase !== 'string'
    || !Object.hasOwn(LEGAL_TRANSITIONS, receipt.phase)
    || typeof receipt.namespace !== 'string'
    || !isZedBenchmarkNamespace(receipt.namespace)
    || typeof receipt.experimentName !== 'string'
    || !isZedBenchmarkSelector(receipt.experimentName)
    || receipt.benchmark !== receipt.experimentName
    || typeof receipt.zedCheckout !== 'string'
    || !isAbsolute(receipt.zedCheckout)
    || typeof receipt.integrationPin !== 'string'
    || receipt.integrationPin !== PINNED_ZED_EVAL_COMMIT
    || typeof receipt.sourceSha !== 'string'
    || !isFullLowercaseGitSha(receipt.sourceSha)
    || typeof receipt.model !== 'string'
    || !isZedBenchmarkModel(receipt.model)
    || !isPositiveSafeInteger(receipt.nTasks)
    || receipt.nTasks > ZED_BENCHMARK_MAX_TASKS
    || !isPositiveSafeInteger(receipt.nConcurrent)
    || receipt.nConcurrent > ZED_BENCHMARK_MAX_CONCURRENT
    || receipt.nConcurrent > receipt.nTasks
    || typeof receipt.runDir !== 'string'
    || isAbsolute(receipt.runDir)
    || typeof receipt.jobsDir !== 'string'
    || isAbsolute(receipt.jobsDir)
    || typeof receipt.createdAt !== 'string'
    || receipt.createdAt.length === 0
    || typeof receipt.updatedAt !== 'string'
    || receipt.updatedAt.length === 0
    || !isExactZedBenchmarkResourcePolicy(receipt.resourcePolicy)
    || !validFailureKind
  ) {
    throw new ZedBenchmarkReceiptError('corrupt', 'receipt fields are invalid');
  }
  if (!isCanonicalTimestamp(receipt.createdAt) || !isCanonicalTimestamp(receipt.updatedAt)) {
    throw new ZedBenchmarkReceiptError('corrupt', 'receipt timestamps are invalid');
  }
  if (Date.parse(receipt.updatedAt) < Date.parse(receipt.createdAt)) {
    throw new ZedBenchmarkReceiptError('corrupt', 'receipt updatedAt precedes createdAt');
  }
  return receipt as ZedBenchmarkReceipt;
}

function atomicReplace(path: string, payload: string): void {
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
  const validated = parseReceipt(JSON.stringify(receipt));
  if (validated.runId !== receipt.runId) {
    throw new ZedBenchmarkReceiptError('corrupt', 'receipt run id mismatch');
  }
  const root = resolve(repoRoot);
  const store = zedBenchmarkStoreRoot(root);
  const runDir = zedBenchmarkRunDir(root, receipt.runId);
  assertExistingComponentsAreNotSymlinks(root, store);
  mkdirSync(store, { recursive: true, mode: 0o700 });
  assertExistingComponentsAreNotSymlinks(root, store);
  try {
    mkdirSync(runDir, { recursive: false, mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new ZedBenchmarkReceiptError('conflict', 'run directory already exists');
    }
    throw error;
  }
  chmodSync(runDir, 0o700);
  const expectedRunDir = relative(root, runDir);
  const expectedJobsDir = join(expectedRunDir, 'artifacts');
  if (receipt.runDir !== expectedRunDir || receipt.jobsDir !== expectedJobsDir) {
    rmSync(runDir, { recursive: true, force: true });
    throw new ZedBenchmarkReceiptError('path', 'receipt evidence paths are not canonical');
  }
  atomicReplace(
    zedBenchmarkReceiptPath(root, receipt.runId),
    `${JSON.stringify(receipt, null, 2)}\n`,
  );
}

export function loadZedBenchmarkReceipt(
  repoRoot: string,
  runId: string,
): ZedBenchmarkReceipt {
  const root = resolve(repoRoot);
  const runDir = zedBenchmarkRunDir(root, runId);
  const path = zedBenchmarkReceiptPath(root, runId);
  assertExistingComponentsAreNotSymlinks(root, runDir);
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
  const expectedRunDir = relative(root, runDir);
  const expectedJobsDir = join(expectedRunDir, 'artifacts');
  if (receipt.runDir !== expectedRunDir || receipt.jobsDir !== expectedJobsDir) {
    throw new ZedBenchmarkReceiptError('corrupt', 'receipt evidence path mismatch');
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
  const root = resolve(repoRoot);
  const lock = join(dirname(zedBenchmarkReceiptPath(root, runId)), '.transition.lock');
  let acquired = false;
  for (let attempt = 0; attempt < 100 && !acquired; attempt += 1) {
    try {
      mkdirSync(lock);
      acquired = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
    }
  }
  if (!acquired) throw new ZedBenchmarkReceiptError('conflict', 'receipt transition is busy');
  try {
    const current = loadZedBenchmarkReceipt(root, runId);
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

    /*
     * A transition must never write a receipt that the normal read path would
     * subsequently reject.
     */
    const validated = parseReceipt(
      JSON.stringify(updated),
    );

    const path = zedBenchmarkReceiptPath(
      repoRoot,
      runId,
    );

    assertExistingComponentsAreNotSymlinks(
      resolve(repoRoot),
      dirname(path),
    );

    atomicReplace(
      path,
      `${JSON.stringify(validated, null, 2)}\n`,
    );

    return validated;
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}
