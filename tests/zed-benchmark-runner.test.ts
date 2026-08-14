import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  PINNED_ZED_EVAL_COMMIT,
  ZED_BENCHMARK_POLICY,
} from '../src/core/zed-benchmark/admission';
import type { ZedBenchmarkSubmitRequest } from '../src/core/zed-benchmark/types';
import {
  fetchZedBenchmark,
  reportZedBenchmark,
  statusZedBenchmark,
  submitZedBenchmark,
  type RunZedBenchmarkProcess,
} from '../src/effects/zed-benchmark/run-zed-benchmark';
import {
  loadZedBenchmarkReceipt,
  zedBenchmarkReceiptPath,
} from '../src/effects/zed-benchmark/receipt-store';
import type { ProcessRunResult, RunProcessOptions } from '../src/effects/process-runner';

const RUN_ID = 'rh-zb-12345678-1234-4123-8123-123456789abc';
const SOURCE_SHA = '0123456789abcdef0123456789abcdef01234567';
const NOW = '2026-08-14T12:00:00.000Z';

interface Invocation {
  command: string;
  args: readonly string[];
  options: RunProcessOptions;
}

const roots: string[] = [];
afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

function fixture(): { repoRoot: string; zedCheckout: string; request: ZedBenchmarkSubmitRequest } {
  const root = mkdtempSync(join(tmpdir(), 'repo-harness-zb-runner-'));
  roots.push(root);
  const repoRoot = join(root, 'repo');
  const zedCheckout = join(root, 'zed');
  mkdirSync(repoRoot, { recursive: true });
  const script = join(zedCheckout, 'crates', 'eval_cli', 'script', 'zed-eval');
  mkdirSync(join(zedCheckout, 'crates', 'eval_cli', 'script'), { recursive: true });
  writeFileSync(script, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  return {
    repoRoot,
    zedCheckout,
    request: {
      repoRoot,
      zedCheckout,
      integrationPin: PINNED_ZED_EVAL_COMMIT,
      sourceSha: SOURCE_SHA,
      namespace: 'repo-harness-evals',
      benchmark: 'rf',
      model: 'sonnet-4.6',
      nTasks: 2,
      nConcurrent: 1,
      acknowledgeRemoteCostAndData: true,
    },
  };
}

function result(overrides: Partial<ProcessRunResult> = {}): ProcessRunResult {
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

function pinAwareRun(
  repoRoot: string,
  invocations: Invocation[],
  zedResult: (command: string, args: readonly string[], options: RunProcessOptions) => ProcessRunResult,
): RunZedBenchmarkProcess {
  return (command, args, options) => {
    invocations.push({ command, args, options });
    if (command === 'git') return result({ stdout: args.includes('rev-parse') ? `${PINNED_ZED_EVAL_COMMIT}\n` : '' });
    const receipt = loadZedBenchmarkReceipt(repoRoot, RUN_ID);
    expect(receipt.phase).toBe('submitting');
    return zedResult(command, args, options);
  };
}

function submitDeps(run: RunZedBenchmarkProcess) {
  let tick = 0;
  return {
    run,
    createRunId: () => RUN_ID,
    now: () => `${NOW.slice(0, 20)}${String(tick++).padStart(3, '0')}Z`,
  };
}

function expectSubmitArgv(invocation: Invocation): void {
  expect(invocation.args).toEqual([
    '--namespace', 'repo-harness-evals',
    '--volume', 'agent-evals',
    'run', 'rf',
    '--run-id', RUN_ID,
    '--from', SOURCE_SHA,
    '--require-clean',
    '--model', 'sonnet-4.6',
    '--n-tasks', '2',
    '--n-concurrent', '1',
    '--override-cpus', String(ZED_BENCHMARK_POLICY.overrideCpus),
    '--override-memory-mb', String(ZED_BENCHMARK_POLICY.overrideMemoryMb),
    '--sandbox-timeout-secs', String(ZED_BENCHMARK_POLICY.sandboxTimeoutSecs),
    '--sandbox-idle-timeout-secs', String(ZED_BENCHMARK_POLICY.sandboxIdleTimeoutSecs),
  ]);
  const joined = invocation.args.join(' ');
  for (const forbidden of [
    'local', 'main', '--allow-untracked', '--patch-path', '--repo-url',
    '--extra-harbor-arg', '--staff', 'deploy', 'cancel', 'cleanup', 'rejudge', 'baseline', 'suite',
  ]) {
    expect(joined.includes(forbidden)).toBe(false);
  }
  expect(invocation.options.processGroup).toBe(true);
  expect(invocation.options.stdio).toBe('pipe');
}

describe('zed benchmark runner', () => {
  test('persists submitting before exactly one upstream launch and transitions to pending', () => {
    const { repoRoot, request } = fixture();
    const invocations: Invocation[] = [];
    const run = pinAwareRun(repoRoot, invocations, () => result());

    const outcome = submitZedBenchmark(request, submitDeps(run));

    expect(outcome.kind).toBe('submitted');
    expect(outcome.receipt.phase).toBe('pending');
    expect(invocations).toHaveLength(3); // git pin, clean-check, and one zed-eval launch
    expect(invocations[0]!.command).toBe('git');
    expectSubmitArgv(invocations.find((item) => item.command !== 'git' && item.args.includes('run'))!);
    expect(JSON.parse(readFileSync(zedBenchmarkReceiptPath(repoRoot, RUN_ID), 'utf8')).phase).toBe('pending');
  });

  for (const [name, failure] of [
    ['timeout', result({ ok: false, status: 1, timedOut: true, error: 'timed out' })],
    ['signal', result({ ok: false, status: 1, signal: 'SIGTERM', error: 'signal' })],
    ['nonzero', result({ ok: false, status: 7, stderr: 'remote acceptance unclear' })],
  ] as const) {
    test(`${name} submission becomes uncertain and is never retried`, () => {
      const { repoRoot, request } = fixture();
      const invocations: Invocation[] = [];
      const run = pinAwareRun(repoRoot, invocations, () => failure);
      const outcome = submitZedBenchmark(request, submitDeps(run));
      expect(outcome.kind).toBe('submission-uncertain');
      expect(outcome.receipt.phase).toBe('submission-uncertain');
      expect(invocations.filter((item) => item.command !== 'git')).toHaveLength(1);
    });
  }

  test('thrown wrapper error after receipt preserves the known id as uncertain', () => {
    const { repoRoot, request } = fixture();
    let zedCalls = 0;
    const run: RunZedBenchmarkProcess = (command, args) => {
      if (command === 'git') return result({ stdout: args.includes('rev-parse') ? `${PINNED_ZED_EVAL_COMMIT}\n` : '' });
      zedCalls += 1;
      expect(loadZedBenchmarkReceipt(repoRoot, RUN_ID).phase).toBe('submitting');
      throw new Error('local wrapper lost the child result');
    };
    const outcome = submitZedBenchmark(request, submitDeps(run));
    expect(outcome.kind).toBe('submission-uncertain');
    expect(outcome.receipt.runId).toBe(RUN_ID);
    expect(outcome.receipt.phase).toBe('submission-uncertain');
    expect(zedCalls).toBe(1);
  });

  test('status reconciles an uncertain receipt with exact JSON and the same id', () => {
    const { repoRoot, request } = fixture();
    const firstRun: RunZedBenchmarkProcess = (command, args) => command === 'git'
      ? result({ stdout: args.includes('rev-parse') ? `${PINNED_ZED_EVAL_COMMIT}\n` : '' })
      : result({ ok: false, status: 1, timedOut: true });
    submitZedBenchmark(request, submitDeps(firstRun));

    const calls: Invocation[] = [];
    const stateRun: RunZedBenchmarkProcess = (command, args, options) => {
      calls.push({ command, args, options });
      if (command === 'git') return result({ stdout: args.includes('rev-parse') ? `${PINNED_ZED_EVAL_COMMIT}\n` : '' });
      return result({ stdout: JSON.stringify({
        status: 'running',
        run_id: RUN_ID,
        namespace: 'repo-harness-evals',
        experiment_name: 'rf',
      }) });
    };
    const state = statusZedBenchmark(repoRoot, RUN_ID, { run: stateRun, now: () => NOW });
    expect(state.status).toBe('running');
    expect(loadZedBenchmarkReceipt(repoRoot, RUN_ID).phase).toBe('running');
    expect(calls.filter((item) => item.command !== 'git')).toHaveLength(1);
    expect(calls.at(-1)!.args).toEqual([
      '--namespace', 'repo-harness-evals', '--volume', 'agent-evals',
      'status', RUN_ID, '--experiment-name', 'rf',
    ]);
  });

  test('fetch confines the jobs directory and report uses local job-dir JSON without --fetch', () => {
    const { repoRoot, request } = fixture();
    const submitRun: RunZedBenchmarkProcess = (command, args) => command === 'git'
      ? result({ stdout: args.includes('rev-parse') ? `${PINNED_ZED_EVAL_COMMIT}\n` : '' })
      : result();
    submitZedBenchmark(request, submitDeps(submitRun));

    const calls: Invocation[] = [];
    const ioRun: RunZedBenchmarkProcess = (command, args, options) => {
      calls.push({ command, args, options });
      if (command === 'git') return result({ stdout: args.includes('rev-parse') ? `${PINNED_ZED_EVAL_COMMIT}\n` : '' });
      const subcommand = args.find((arg) => arg === 'fetch' || arg === 'report');
      if (subcommand === 'fetch') {
        const jobsIndex = args.indexOf('--jobs-dir');
        expect(jobsIndex).toBeGreaterThan(-1);
        const jobsDir = String(args[jobsIndex + 1]);
        mkdirSync(join(jobsDir, RUN_ID), { recursive: true });
        return result({ stdout: 'fetched\n' });
      }
      if (subcommand === 'report') {
        const requestedJobDir = String(args[args.indexOf('--job-dir') + 1]);
        return result({ stdout: JSON.stringify({
          label: RUN_ID,
          job_dir: requestedJobDir,
          n_trials: 1,
          n_scored: 1,
          n_passed: 1,
          n_failed: 0,
          n_errored: 0,
          n_attempts: 1,
          pass_rate: 1,
          pass_sem: null,
          resolved_models: { 'sonnet-4.6': 1 },
          agent_statuses: { completed: 1 },
          on_success: {},
          overall: {},
          errored_trials: [],
        }) });
      }
      throw new Error(`unexpected call: ${args.join(' ')}`);
    };

    const jobDir = fetchZedBenchmark(repoRoot, RUN_ID, { run: ioRun });
    expect(jobDir).toContain(join('.ai', 'harness', 'runs', 'zed-benchmark', RUN_ID, 'artifacts', RUN_ID));
    const report = reportZedBenchmark(repoRoot, RUN_ID, { run: ioRun });
    expect(report.raw.n_passed).toBe(1);

    const zedCalls = calls.filter((item) => item.command !== 'git');
    expect(zedCalls).toHaveLength(2);
    const fetchArgs = zedCalls[0]!.args;
    expect(fetchArgs).toContain('--jobs-dir');
    expect(String(fetchArgs[fetchArgs.indexOf('--jobs-dir') + 1])).toContain(join(repoRoot, '.ai', 'harness', 'runs', 'zed-benchmark'));
    const reportArgs = zedCalls[1]!.args;
    expect(reportArgs).toContain('--job-dir');
    expect(reportArgs).toContain('--json');
    expect(reportArgs).not.toContain('--fetch');
  });

  test('pin mismatch stops before any remote invocation or receipt', () => {
    const { repoRoot, request } = fixture();
    let remoteCalls = 0;
    const run: RunZedBenchmarkProcess = (command) => {
      if (command === 'git') return result({ stdout: `${'f'.repeat(40)}\n` });
      remoteCalls += 1;
      return result();
    };
    expect(() => submitZedBenchmark(request, submitDeps(run))).toThrow(/integration pin/);
    expect(remoteCalls).toBe(0);
    expect(() => loadZedBenchmarkReceipt(repoRoot, RUN_ID)).toThrow();
  });
});
