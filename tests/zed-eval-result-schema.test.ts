import { describe, expect, test } from 'bun:test';
import {
  assertZedEvalExitStatusCoherence,
  parseZedEvalResult,
} from '../src/core/zed-eval/result-schema';

const MODEL = 'anthropic/test-model';

describe('zed eval result schema', () => {
  test('accepts each pinned terminal status with exact required semantics', () => {
    const cases = [
      { exit: 0, status: 'completed' as const },
      { exit: 1, status: 'error' as const, error: 'fixture error' },
      { exit: 2, status: 'timeout' as const },
      { exit: 3, status: 'interrupted' as const },
    ];

    for (const item of cases) {
      const result = parseZedEvalResult({
        status: item.status,
        ...(item.error ? { error: item.error } : {}),
        duration_secs: 1.25,
        model: MODEL,
        tool_call_count: 1,
        tool_calls: { read_file: 1 },
      }, MODEL);
      expect(result.status).toBe(item.status);
      assertZedEvalExitStatusCoherence(item.exit, result.status);
    }
  });

  test('preserves absent optional metrics as absent', () => {
    const result = parseZedEvalResult({
      status: 'completed',
      duration_secs: 0,
      model: MODEL,
    }, MODEL);

    expect(result.input_tokens).toBeUndefined();
    expect(result.tool_call_count).toBeUndefined();
    expect(result.tool_calls).toBeUndefined();
  });

  test('rejects malformed roots, statuses, models, and numbers', () => {
    expect(() => parseZedEvalResult([], MODEL)).toThrow(/root/);
    expect(() => parseZedEvalResult({
      status: 'running',
      duration_secs: 0,
      model: MODEL,
    }, MODEL)).toThrow(/status/);
    expect(() => parseZedEvalResult({
      status: 'completed',
      duration_secs: -1,
      model: MODEL,
    }, MODEL)).toThrow(/duration_secs/);
    expect(() => parseZedEvalResult({
      status: 'completed',
      duration_secs: 0,
      model: 'openai/other',
    }, MODEL)).toThrow(/model mismatch/);
    expect(() => parseZedEvalResult({
      status: 'completed',
      duration_secs: 0,
      model: MODEL,
      input_tokens: Number.MAX_SAFE_INTEGER + 1,
    }, MODEL)).toThrow(/safe integer/);
  });

  test('enforces error and tool-count invariants', () => {
    expect(() => parseZedEvalResult({
      status: 'error',
      duration_secs: 0,
      model: MODEL,
    }, MODEL)).toThrow(/non-empty error/);
    expect(() => parseZedEvalResult({
      status: 'completed',
      error: 'contradiction',
      duration_secs: 0,
      model: MODEL,
    }, MODEL)).toThrow(/must not carry/);
    expect(() => parseZedEvalResult({
      status: 'completed',
      duration_secs: 0,
      model: MODEL,
      tool_call_count: 2,
      tool_calls: { read_file: 1 },
    }, MODEL)).toThrow(/tool call total mismatch/);
  });

  test('rejects unknown and mismatched exit/status pairs', () => {
    expect(() => assertZedEvalExitStatusCoherence(9, 'completed')).toThrow(/unsupported/);
    expect(() => assertZedEvalExitStatusCoherence(0, 'error')).toThrow(/mismatch/);
    expect(() => assertZedEvalExitStatusCoherence(2, 'interrupted')).toThrow(/mismatch/);
  });
});
