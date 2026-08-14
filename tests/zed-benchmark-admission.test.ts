import { describe, expect, test } from 'bun:test';
import { resolve } from 'path';
import {
  PINNED_ZED_EVAL_COMMIT,
  ZED_BENCHMARK_MAX_CONCURRENT,
  ZED_BENCHMARK_MAX_TASKS,
  ZED_BENCHMARK_SELECTORS,
  admitZedBenchmarkSubmit,
  assertZedBenchmarkRunId,
  createZedBenchmarkRunId,
  isZedBenchmarkSelector,
} from '../src/core/zed-benchmark/admission';
import type { ZedBenchmarkSubmitRequest } from '../src/core/zed-benchmark/types';

const SOURCE_SHA = '0123456789abcdef0123456789abcdef01234567';

function request(overrides: Partial<ZedBenchmarkSubmitRequest> = {}): ZedBenchmarkSubmitRequest {
  return {
    repoRoot: resolve('/tmp/repo-harness-zed-test-repo'),
    zedCheckout: resolve('/tmp/repo-harness-zed-test-checkout'),
    integrationPin: PINNED_ZED_EVAL_COMMIT,
    sourceSha: SOURCE_SHA,
    namespace: 'repo-harness-evals',
    benchmark: 'rf',
    model: 'sonnet-4.6',
    nTasks: 2,
    nConcurrent: 1,
    acknowledgeRemoteCostAndData: true,
    ...overrides,
  };
}

describe('zed benchmark admission', () => {
  for (const selector of ZED_BENCHMARK_SELECTORS) {
    test(`accepts selector ${selector}`, () => {
      expect(isZedBenchmarkSelector(selector)).toBe(true);
      expect(() => admitZedBenchmarkSubmit(request({ benchmark: selector }))).not.toThrow();
    });
  }

  for (const sourceSha of [
    'local',
    'main',
    'v1.2.3',
    '01234567',
    '0123456789ABCDEF0123456789ABCDEF01234567',
    '../zed',
    '/tmp/zed',
  ]) {
    test(`rejects non-immutable source ${sourceSha}`, () => {
      expect(() => admitZedBenchmarkSubmit(request({ sourceSha }))).toThrow();
    });
  }

  for (const nTasks of [1, ZED_BENCHMARK_MAX_TASKS]) {
    test(`accepts nTasks=${nTasks}`, () => {
      expect(() => admitZedBenchmarkSubmit(request({ nTasks, nConcurrent: 1 }))).not.toThrow();
    });
  }

  for (const nTasks of [0, ZED_BENCHMARK_MAX_TASKS + 1, NaN, Infinity, 1.5]) {
    test(`rejects nTasks=${String(nTasks)}`, () => {
      expect(() => admitZedBenchmarkSubmit(request({ nTasks }))).toThrow();
    });
  }

  for (const nConcurrent of [1, ZED_BENCHMARK_MAX_CONCURRENT]) {
    test(`accepts nConcurrent=${nConcurrent}`, () => {
      expect(() => admitZedBenchmarkSubmit(request({ nTasks: 2, nConcurrent }))).not.toThrow();
    });
  }

  for (const nConcurrent of [0, ZED_BENCHMARK_MAX_CONCURRENT + 1, NaN, Infinity, 1.5]) {
    test(`rejects nConcurrent=${String(nConcurrent)}`, () => {
      expect(() => admitZedBenchmarkSubmit(request({ nConcurrent }))).toThrow();
    });
  }

  test('rejects concurrency greater than task count', () => {
    expect(() => admitZedBenchmarkSubmit(request({ nTasks: 1, nConcurrent: 2 }))).toThrow();
  });

  test('requires explicit remote cost/data acknowledgement', () => {
    expect(() => admitZedBenchmarkSubmit(request({ acknowledgeRemoteCostAndData: false }))).toThrow();
  });

  test('rejects relative checkout and repo roots', () => {
    expect(() => admitZedBenchmarkSubmit(request({ zedCheckout: 'zed' }))).toThrow();
    expect(() => admitZedBenchmarkSubmit(request({ repoRoot: '.' }))).toThrow();
  });

  test('rejects an integration pin other than the reviewed pin', () => {
    expect(() => admitZedBenchmarkSubmit(request({ integrationPin: SOURCE_SHA }))).toThrow();
  });

  test('generates constrained UUID run IDs and rejects path-bearing IDs', () => {
    const runId = createZedBenchmarkRunId();
    expect(runId).toMatch(/^rh-zb-/);
    expect(() => assertZedBenchmarkRunId(runId)).not.toThrow();
    for (const invalid of ['../escape', 'rh-zb-../../escape', 'run', '', 'RH-ZB-00000000-0000-4000-8000-000000000000']) {
      expect(() => assertZedBenchmarkRunId(invalid)).toThrow();
    }
  });
});
