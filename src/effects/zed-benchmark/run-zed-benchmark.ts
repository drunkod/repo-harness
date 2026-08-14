import { chmodSync, existsSync, lstatSync, mkdirSync } from 'fs';
import { isAbsolute, join, relative, resolve } from 'path';
import {
  PINNED_ZED_EVAL_COMMIT,
  ZED_BENCHMARK_POLICY,
  admitZedBenchmarkSubmit,
  assertZedBenchmarkRunId,
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
const PIN_CHECK_TIMEOUT_MS = 15_000;
const MAX_OUTPUT_BYTES = 64 * 1024;
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

function runOrDefault(deps: ZedBenchmarkDependencies): RunZedBenchmarkProcess {
  return deps.run ?? runProcess;
}

function zedEvalScript(checkout: string): string {
  if (!isAbsolute(checkout)) throw new Error('Zed checkout must be absolute');
  const path = join(checkout, 'crates', 'eval_cli', 'script', 'zed-eval');
  if (!existsSync(path) || lstatSync(path).isSymbolicLink() || !lstatSync(path).isFile()) {
    throw new Error('pinned Zed checkout does not contain a regular zed-eval script');
  }
  return path;
}

function diagnostic(result: ProcessRunResult): string {
  return (result.stderr || result.error || `exit status ${result.status}`)
    .slice(0, MAX_DIAGNOSTIC_CHARS);
}

function uniqueLaunchField(
  stdout: string,
  label: string,
): string | null {
  const prefix = `${label}:`;

  const values = stdout
    .split(/\r?\n/)
    .filter((line) => line.startsWith(prefix))
    .map((line) => line.slice(prefix.length).trim())
    .filter((value) => value.length > 0);

  return values.length === 1
    ? values[0]!
    : null;
}

/**
 * Validate only launch identity/evidence from the pinned upstream prose.
 *
 * Remote lifecycle is NOT parsed from this output. Lifecycle continues to come
 * exclusively from the JSON returned by `zed-eval status`.
 */
function launchAcceptanceIssue(
  stdout: string,
  request: ZedBenchmarkSubmitRequest,
  runId: string,
): string | null {
  const namespace = uniqueLaunchField(
    stdout,
    'Namespace',
  );

  if (namespace !== request.namespace) {
    return 'zed-eval successful exit did not prove the expected namespace';
  }

  const experiment = uniqueLaunchField(
    stdout,
    'Experiment',
  );

  if (experiment !== request.benchmark) {
    return 'zed-eval successful exit did not prove the expected experiment';
  }

  const acceptedRunId = uniqueLaunchField(
    stdout,
    'Run id',
  );

  if (acceptedRunId !== runId) {
    return 'zed-eval successful exit did not prove the generated run id';
  }

  const controller = uniqueLaunchField(
    stdout,
    'Spawned controller',
  );

  if (controller === null) {
    return 'zed-eval successful exit did not prove controller spawn';
  }

  return null;
}

function uncertainFromSchema(
  repoRoot: string,
  runId: string,
  diagnosticText: string,
  deps: ZedBenchmarkDependencies,
): ZedBenchmarkSubmitOutcome {
  return {
    kind: 'submission-uncertain',
    receipt: transitionZedBenchmarkReceipt(
      repoRoot,
      runId,
      'submission-uncertain',
      now(deps),
      'schema',
    ),
    diagnostic: diagnosticText.slice(
      0,
      MAX_DIAGNOSTIC_CHARS,
    ),
  };
}

function verifyCheckoutPin(
  repoRoot: string,
  checkout: string,
  integrationPin: string,
  deps: ZedBenchmarkDependencies,
): void {
  const result = runOrDefault(deps)(
    'git',
    ['-C', checkout, 'rev-parse', 'HEAD'],
    {
      cwd: repoRoot,
      stdio: 'pipe',
      timeoutMs: PIN_CHECK_TIMEOUT_MS,
      processGroup: true,
      maxOutputBytes: 4 * 1024,
    },
  );
  if (!result.ok || result.stdout.trim() !== integrationPin) {
    throw new Error('Zed checkout does not match the approved zed-eval integration pin');
  }
  const cleanliness = runOrDefault(deps)('git', ['-C', checkout, 'status', '--porcelain=v1', '--untracked-files=all'], {
    cwd: repoRoot,
    stdio: 'pipe',
    timeoutMs: PIN_CHECK_TIMEOUT_MS,
    processGroup: true,
    maxOutputBytes: 4 * 1024,
  });
  if (!cleanliness.ok || cleanliness.stdout.trim() !== '') {
    throw new Error('approved Zed checkout must have no tracked changes or non-ignored untracked files');
  }
}

function commonLocatorArgs(receipt: ZedBenchmarkReceipt): string[] {
  return ['--namespace', receipt.namespace, '--volume', 'agent-evals'];
}

function createInitialReceipt(
  request: ZedBenchmarkSubmitRequest,
  runId: string,
  timestamp: string,
): ZedBenchmarkReceipt {
  const runDir = relative(request.repoRoot, zedBenchmarkRunDir(request.repoRoot, runId));
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

function uncertainFromResult(
  repoRoot: string,
  runId: string,
  result: ProcessRunResult,
  deps: ZedBenchmarkDependencies,
): ZedBenchmarkSubmitOutcome {
  const failureKind = result.timedOut
    ? 'timeout'
    : result.signal
      ? 'transport'
      : 'exit';
  return {
    kind: 'submission-uncertain',
    receipt: transitionZedBenchmarkReceipt(
      repoRoot,
      runId,
      'submission-uncertain',
      now(deps),
      failureKind,
    ),
    diagnostic: diagnostic(result),
  };
}

export function submitZedBenchmark(
  request: ZedBenchmarkSubmitRequest,
  deps: ZedBenchmarkDependencies = {},
): ZedBenchmarkSubmitOutcome {
  admitZedBenchmarkSubmit(request);
  const script = zedEvalScript(request.zedCheckout);
  verifyCheckoutPin(request.repoRoot, request.zedCheckout, request.integrationPin, deps);

  const runId = (deps.createRunId ?? createZedBenchmarkRunId)();
  assertZedBenchmarkRunId(runId);
  const timestamp = now(deps);
  createZedBenchmarkReceipt(
    request.repoRoot,
    createInitialReceipt(request, runId, timestamp),
  );

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
    '--sandbox-idle-timeout-secs', String(ZED_BENCHMARK_POLICY.sandboxIdleTimeoutSecs),
  ];

  let result: ProcessRunResult;
  try {
    result = runOrDefault(deps)(script, args, {
      cwd: request.zedCheckout,
      stdio: 'pipe',
      timeoutMs: SUBMIT_TIMEOUT_MS,
      processGroup: true,
      maxOutputBytes: MAX_OUTPUT_BYTES,
    });
  } catch (error) {
    const diagnosticText = error instanceof Error ? error.message : String(error);
    const receipt = transitionZedBenchmarkReceipt(
      request.repoRoot,
      runId,
      'submission-uncertain',
      now(deps),
      'transport',
    );
    return {
      kind: 'submission-uncertain',
      receipt,
      diagnostic: diagnosticText.slice(0, MAX_DIAGNOSTIC_CHARS),
    };
  }

  if (!result.ok) {
    return uncertainFromResult(
      request.repoRoot,
      runId,
      result,
      deps,
    );
  }

  const acceptanceIssue = launchAcceptanceIssue(
    result.stdout,
    request,
    runId,
  );

  if (acceptanceIssue !== null) {
    /*
     * A clean local exit with malformed/mismatched acceptance evidence is
     * ambiguous. The remote record may exist, so preserve the known ID and
     * reconcile with status. Never submit another run automatically.
     */
    return uncertainFromSchema(
      request.repoRoot,
      runId,
      acceptanceIssue,
      deps,
    );
  }

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

function loadVerifiedReceipt(
  repoRoot: string,
  runId: string,
  deps: ZedBenchmarkDependencies,
): { receipt: ZedBenchmarkReceipt; script: string } {
  assertZedBenchmarkRunId(runId);
  const receipt = loadZedBenchmarkReceipt(repoRoot, runId);
  if (receipt.integrationPin !== PINNED_ZED_EVAL_COMMIT) {
    throw new Error('receipt integration pin is no longer supported');
  }
  const script = zedEvalScript(receipt.zedCheckout);
  verifyCheckoutPin(repoRoot, receipt.zedCheckout, receipt.integrationPin, deps);
  return { receipt, script };
}

function runForReceipt(
  repoRoot: string,
  runId: string,
  argsAfterCommon: readonly string[],
  deps: ZedBenchmarkDependencies,
  timeoutMs = QUERY_TIMEOUT_MS,
): { receipt: ZedBenchmarkReceipt; result: ProcessRunResult } {
  const { receipt, script } = loadVerifiedReceipt(repoRoot, runId, deps);
  const result = runOrDefault(deps)(
    script,
    [...commonLocatorArgs(receipt), ...argsAfterCommon],
    {
      cwd: receipt.zedCheckout,
      stdio: 'pipe',
      timeoutMs,
      processGroup: true,
      maxOutputBytes: MAX_OUTPUT_BYTES,
    },
  );
  return { receipt, result };
}

export function statusZedBenchmark(
  repoRoot: string,
  runId: string,
  deps: ZedBenchmarkDependencies = {},
): ZedBenchmarkRemoteState {
  const receipt = loadZedBenchmarkReceipt(repoRoot, runId);
  const verified = runForReceipt(
    repoRoot,
    runId,
    ['status', runId, '--experiment-name', receipt.experimentName],
    deps,
  );
  if (!verified.result.ok) {
    throw new Error(`zed-eval status failed: ${diagnostic(verified.result)}`);
  }
  const state = parseZedBenchmarkState(verified.result.stdout);
  if (state.raw.run_id !== undefined && state.raw.run_id !== runId) {
    throw new Error('remote state run id does not match the receipt');
  }
  if (state.raw.namespace !== undefined && state.raw.namespace !== verified.receipt.namespace) {
    throw new Error('remote state namespace does not match the receipt');
  }
  if (
    state.raw.experiment_name !== undefined
    && state.raw.experiment_name !== verified.receipt.experimentName
  ) {
    throw new Error('remote state experiment does not match the receipt');
  }
  if (verified.receipt.phase !== state.status) {
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

function assertSafeArtifactDirectory(repoRoot: string, receipt: ZedBenchmarkReceipt): string {
  const runDir = resolve(repoRoot, receipt.runDir);
  const jobsDir = resolve(repoRoot, receipt.jobsDir);
  const rel = relative(runDir, jobsDir);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error('jobs directory must be a child of the run directory');
  }
  if (existsSync(jobsDir) && lstatSync(jobsDir).isSymbolicLink()) {
    throw new Error('jobs directory cannot be a symlink');
  }
  mkdirSync(jobsDir, { recursive: true, mode: 0o700 });
  chmodSync(jobsDir, 0o700);
  return jobsDir;
}

export function fetchZedBenchmark(
  repoRoot: string,
  runId: string,
  deps: ZedBenchmarkDependencies = {},
): string {
  const receipt = loadZedBenchmarkReceipt(repoRoot, runId);
  const jobsDir = assertSafeArtifactDirectory(repoRoot, receipt);
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
  if (!existsSync(jobDir) || lstatSync(jobDir).isSymbolicLink() || !lstatSync(jobDir).isDirectory()) {
    throw new Error('zed-eval fetch did not create the expected regular job directory');
  }
  return jobDir;
}

export function reportZedBenchmark(
  repoRoot: string,
  runId: string,
  deps: ZedBenchmarkDependencies = {},
): ZedBenchmarkReport {
  const receipt = loadZedBenchmarkReceipt(repoRoot, runId);
  const jobsDir = resolve(repoRoot, receipt.jobsDir);
  const jobDir = resolve(jobsDir, runId);
  const rel = relative(jobsDir, jobDir);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error('job directory escapes the jobs directory');
  }
  if (!existsSync(jobDir) || lstatSync(jobDir).isSymbolicLink() || !lstatSync(jobDir).isDirectory()) {
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
  const report = parseZedBenchmarkReport(result.stdout);
  const reportedJobDir = report.raw.job_dir;
  if (reportedJobDir !== undefined && resolve(String(reportedJobDir)) !== jobDir) {
    throw new Error('remote report job_dir does not match the requested confined job directory');
  }
  return report;
}
