import { describe, expect, test } from 'bun:test';
import {
  parseZedBenchmarkReport,
  parseZedBenchmarkState,
} from '../src/core/zed-benchmark/state-schema';

function report(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    label: 'rh-zb-test',
    job_dir: '/tmp/jobs/rh-zb-test',
    n_trials: 2,
    n_scored: 2,
    n_passed: 1,
    n_failed: 1,
    n_errored: 0,
    n_attempts: 1,
    pass_rate: 0.5,
    pass_sem: null,
    resolved_models: { 'sonnet-4.6': 2 },
    agent_statuses: { completed: 2 },
    on_success: { n: 1 },
    overall: { n: 2 },
    errored_trials: [],
    ...overrides,
  };
}

describe('zed benchmark state schema', () => {
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
    '{"status":"running","run_id":1}',
  ]) {
    test(`rejects malformed state ${JSON.stringify(invalid)}`, () => {
      expect(() => parseZedBenchmarkState(invalid)).toThrow();
    });
  }
});

describe('zed benchmark report schema', () => {
  test('accepts the pinned top-level report shape including nullable SEM', () => {
    const parsed = parseZedBenchmarkReport(JSON.stringify(report()));
    expect(parsed.raw.n_passed).toBe(1);
    expect(parsed.raw.pass_sem).toBeNull();
  });

  test('accepts nullable pass rate for an unscored report', () => {
    const parsed = parseZedBenchmarkReport(JSON.stringify(report({
      n_trials: 1,
      n_scored: 0,
      n_passed: 0,
      n_failed: 0,
      n_errored: 1,
      n_attempts: 0,
      pass_rate: null,
      pass_sem: null,
      errored_trials: [{ task_name: 'x', reason: 'exception' }],
    })));
    expect(parsed.raw.pass_rate).toBeNull();
  });

  for (const bad of [
    {},
    report({ n_trials: -1 }),
    report({ n_scored: 1.5 }),
    report({ pass_rate: 1.1 }),
    report({ pass_sem: -0.1 }),
    report({ resolved_models: [] }),
    report({ errored_trials: {} }),
    report({ n_trials: 2, n_scored: 2, n_passed: 2, n_failed: 1, n_errored: 0 }),
    report({ n_trials: 3, n_scored: 2, n_passed: 1, n_failed: 1, n_errored: 0 }),
  ]) {
    test(`rejects invalid report ${JSON.stringify(bad)}`, () => {
      expect(() => parseZedBenchmarkReport(JSON.stringify(bad))).toThrow();
    });
  }

  test('rejects prose before or after report JSON', () => {
    const json = JSON.stringify(report());
    expect(() => parseZedBenchmarkReport(`fetching...\n${json}`)).toThrow();
    expect(() => parseZedBenchmarkReport(`${json}\ndone`)).toThrow();
  });
});
