import type { ZedEvalStatus, ZedEvalUpstreamResult } from './types';

const ZED_EVAL_STATUSES = new Set<ZedEvalStatus>([
  'completed',
  'error',
  'timeout',
  'interrupted',
]);

const EXPECTED_STATUS_BY_EXIT = new Map<number, ZedEvalStatus>([
  [0, 'completed'],
  [1, 'error'],
  [2, 'timeout'],
  [3, 'interrupted'],
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNonNegative(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a finite non-negative number`);
  }
  return value;
}

function optionalSafeCount(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative safe integer`);
  }
  return value;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error(`${field} must be a string`);
  return value;
}

export function parseZedEvalResult(
  value: unknown,
  expectedModel: string,
): ZedEvalUpstreamResult {
  if (!isRecord(value)) throw new Error('result root must be an object');

  if (
    typeof value.status !== 'string'
    || !ZED_EVAL_STATUSES.has(value.status as ZedEvalStatus)
  ) {
    throw new Error('unsupported result status');
  }
  const status = value.status as ZedEvalStatus;

  if (typeof value.model !== 'string' || value.model.trim() === '') {
    throw new Error('model must be a non-empty string');
  }
  if (value.model !== expectedModel) {
    throw new Error(`result model mismatch: expected ${expectedModel}`);
  }

  const error = optionalString(value.error, 'error');
  if (status === 'error' && (!error || error.trim() === '')) {
    throw new Error('error status requires a non-empty error');
  }
  if (status !== 'error' && error && error.trim() !== '') {
    throw new Error(`${status} must not carry a non-empty error`);
  }

  let toolCalls: Record<string, number> | undefined;
  if (value.tool_calls !== undefined) {
    if (!isRecord(value.tool_calls)) {
      throw new Error('tool_calls must be an object');
    }
    toolCalls = {};
    for (const [name, count] of Object.entries(value.tool_calls)) {
      if (name.trim() === '') throw new Error('tool_calls contains an empty name');
      toolCalls[name] = optionalSafeCount(count, `tool_calls.${name}`)!;
    }
  }

  const toolCallCount = optionalSafeCount(value.tool_call_count, 'tool_call_count');
  if (toolCalls && toolCallCount !== undefined) {
    const sum = Object.values(toolCalls).reduce((total, count) => total + count, 0);
    if (!Number.isSafeInteger(sum)) {
      throw new Error('tool_calls total exceeds the safe integer range');
    }
    if (sum !== toolCallCount) {
      throw new Error(`tool call total mismatch: ${sum} != ${toolCallCount}`);
    }
  }

  return {
    status,
    error,
    duration_secs: finiteNonNegative(value.duration_secs, 'duration_secs'),
    timeout_secs: optionalSafeCount(value.timeout_secs, 'timeout_secs'),
    model: value.model,
    input_tokens: optionalSafeCount(value.input_tokens, 'input_tokens'),
    output_tokens: optionalSafeCount(value.output_tokens, 'output_tokens'),
    cache_creation_input_tokens: optionalSafeCount(
      value.cache_creation_input_tokens,
      'cache_creation_input_tokens',
    ),
    cache_read_input_tokens: optionalSafeCount(
      value.cache_read_input_tokens,
      'cache_read_input_tokens',
    ),
    step_count: optionalSafeCount(value.step_count, 'step_count'),
    tool_call_count: toolCallCount,
    tool_calls: toolCalls,
  };
}

export function assertZedEvalExitStatusCoherence(
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
