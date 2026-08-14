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
  expect(submitted.status).toBe(0);
  const submitPayload = JSON.parse(submitted.stdout) as { runId: string; outcome: string };
  expect(submitPayload.outcome).toBe('submitted');
  const runId = submitPayload.runId;

  let phase = 'pending';
  const deadline = Date.now() + 45 * 60_000;
  while (Date.now() < deadline) {
    const status = cli(['zed-benchmark', '--repo', repo, 'status', '--run-id', runId, '--json']);
    expect(status.status).toBe(0);
    const state = JSON.parse(status.stdout) as { status: string };
    phase = state.status;
    if (phase === 'completed' || phase === 'failed') break;
    expect(['pending', 'running']).toContain(phase);
    await Bun.sleep(15_000);
  }
  expect(['completed', 'failed']).toContain(phase);

  // Logs are intentionally requested only here; the test does not persist them.
  const logs = cli(['zed-benchmark', '--repo', repo, 'logs', '--run-id', runId]);
  expect(logs.status).toBe(0);

  const fetched = cli(['zed-benchmark', '--repo', repo, 'fetch', '--run-id', runId]);
  expect(fetched.status).toBe(0);
  const report = cli(['zed-benchmark', '--repo', repo, 'report', '--run-id', runId, '--json']);
  expect(report.status).toBe(0);
  const metrics = JSON.parse(report.stdout) as { n_trials?: unknown; n_scored?: unknown };
  expect(typeof metrics.n_trials).toBe('number');
  expect(typeof metrics.n_scored).toBe('number');
}

if (enabled) {
  test('runs the explicitly acknowledged one-task paid Zed benchmark canary', runPaidCanary, 50 * 60_000);
} else {
  test.skip('runs the explicitly acknowledged one-task paid Zed benchmark canary', runPaidCanary, 50 * 60_000);
}
