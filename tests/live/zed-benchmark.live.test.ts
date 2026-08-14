import { expect, test } from 'bun:test';
import { spawnSync } from 'child_process';
import { resolve } from 'path';

const CLI = resolve(import.meta.dir, '..', '..', 'src', 'cli', 'index.ts');
const LIVE_ACK = 'I_ACKNOWLEDGE_REMOTE_COST_AND_DATA';
const enabled = process.env.REPO_HARNESS_LIVE_ZED_BENCHMARK_PAID_CANARY === LIVE_ACK;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for the opt-in paid Zed benchmark canary`);
  return value;
}

function parseJson<T>(label: string, text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${label} did not emit valid JSON`);
  }
}

function cli(args: string[]): { status: number; stdout: string; stderr: string } {
  const result = spawnSync('bun', [CLI, ...args], {
    encoding: 'utf8',
    env: process.env,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

async function runPaidCanary(): Promise<void> {
  const repo = resolve(process.env.REPO_HARNESS_LIVE_ZED_BENCHMARK_REPO ?? process.cwd());
  const checkout = requiredEnv('REPO_HARNESS_LIVE_ZED_CHECKOUT');
  const sourceSha = requiredEnv('REPO_HARNESS_LIVE_ZED_SOURCE_SHA');
  const model = requiredEnv('REPO_HARNESS_LIVE_ZED_MODEL');
  const namespace = requiredEnv('REPO_HARNESS_LIVE_ZED_NAMESPACE');
  const benchmark = process.env.REPO_HARNESS_LIVE_ZED_BENCHMARK ?? 'rf';

  const submitted = cli([
    'zed-benchmark', '--repo', repo, 'submit',
    '--zed-checkout', checkout,
    '--source-sha', sourceSha,
    '--namespace', namespace,
    '--benchmark', benchmark,
    '--model', model,
    '--n-tasks', '1',
    '--n-concurrent', '1',
    '--acknowledge-remote-cost-and-data',
    '--json',
  ]);
  const submitPayload = parseJson<{ runId: string; outcome: string }>('zed-benchmark submit', submitted.stdout);
  expect(['submitted', 'submission-uncertain']).toContain(submitPayload.outcome);
  expect(typeof submitPayload.runId).toBe('string');
  const runId = submitPayload.runId;
  if (submitPayload.outcome === 'submission-uncertain') {
    expect(submitted.status).not.toBe(0);
    // Reconcile the known ID; never submit again after an ambiguous result.
  } else {
    expect(submitted.status).toBe(0);
  }

  let phase = 'pending';
  let observedState = false;
  const deadline = Date.now() + 45 * 60_000;
  while (Date.now() < deadline) {
    const status = cli(['zed-benchmark', '--repo', repo, 'status', '--run-id', runId, '--json']);
    if (status.status !== 0) {
      await Bun.sleep(15_000);
      continue;
    }
    const state = parseJson<{ status: string; run_id?: string }>('zed-benchmark status', status.stdout);
    observedState = true;
    expect(['pending', 'running', 'completed', 'failed']).toContain(state.status);
    if (state.run_id !== undefined) expect(state.run_id).toBe(runId);
    phase = state.status;
    if (phase === 'completed' || phase === 'failed') break;
    expect(['pending', 'running']).toContain(phase);
    await Bun.sleep(15_000);
  }
  if (!observedState || !['completed', 'failed'].includes(phase)) {
    throw new Error(`paid canary ${runId} did not reach a terminal state; do not resubmit it`);
  }

  // Logs are intentionally requested only here; the test does not persist them.
  const logs = cli(['zed-benchmark', '--repo', repo, 'logs', '--run-id', runId]);
  expect(logs.status).toBe(0);

  if (phase === 'failed') {
    throw new Error(`paid canary ${runId} reached remote failed state; inspect evidence and do not resubmit automatically`);
  }

  const fetched = cli(['zed-benchmark', '--repo', repo, 'fetch', '--run-id', runId]);
  expect(fetched.status).toBe(0);
  const report = cli(['zed-benchmark', '--repo', repo, 'report', '--run-id', runId, '--json']);
  expect(report.status).toBe(0);
  const metrics = parseJson<{ n_trials?: unknown; n_scored?: unknown; job_dir?: unknown }>('zed-benchmark report', report.stdout);
  expect(typeof metrics.n_trials).toBe('number');
  expect(typeof metrics.n_scored).toBe('number');
  expect(typeof metrics.job_dir).toBe('string');
}

if (enabled) {
  test('runs the explicitly acknowledged one-task paid Zed benchmark canary', runPaidCanary, 50 * 60_000);
} else {
  test.skip('runs the explicitly acknowledged one-task paid Zed benchmark canary', runPaidCanary, 50 * 60_000);
}
