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

const REPORT_COUNT_FIELDS = [
  'n_trials',
  'n_scored',
  'n_passed',
  'n_failed',
  'n_errored',
  'n_attempts',
] as const;

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

function assertOptionalString(object: Record<string, unknown>, field: string): void {
  const value = object[field];
  if (value !== undefined && typeof value !== 'string') {
    throw new ZedBenchmarkSchemaError(`${field} must be a string when present`);
  }
}

function assertRequiredString(object: Record<string, unknown>, field: string): void {
  const value = object[field];
  if (typeof value !== 'string' || value.length === 0) {
    throw new ZedBenchmarkSchemaError(`${field} must be a non-empty string`);
  }
}

function assertRequiredNonNegativeInteger(object: Record<string, unknown>, field: string): void {
  const value = object[field];
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new ZedBenchmarkSchemaError(`${field} must be a non-negative integer`);
  }
}

function assertNullableFiniteNumber(
  object: Record<string, unknown>,
  field: string,
  options: { min?: number; max?: number } = {},
): void {
  const value = object[field];
  if (value === null) return;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ZedBenchmarkSchemaError(`${field} must be a finite number or null`);
  }
  if (options.min !== undefined && value < options.min) {
    throw new ZedBenchmarkSchemaError(`${field} must be at least ${options.min}`);
  }
  if (options.max !== undefined && value > options.max) {
    throw new ZedBenchmarkSchemaError(`${field} must be at most ${options.max}`);
  }
}

function assertPlainObject(object: Record<string, unknown>, field: string): void {
  const value = object[field];
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    throw new ZedBenchmarkSchemaError(`${field} must be a JSON object`);
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

/** Validate the pinned report.py top-level JSON contract. */
export function parseZedBenchmarkReport(text: string): ZedBenchmarkReport {
  const raw = parseObject('zed-eval report', text);
  assertRequiredString(raw, 'label');
  assertRequiredString(raw, 'job_dir');
  for (const field of REPORT_COUNT_FIELDS) assertRequiredNonNegativeInteger(raw, field);
  assertNullableFiniteNumber(raw, 'pass_rate', { min: 0, max: 1 });
  assertNullableFiniteNumber(raw, 'pass_sem', { min: 0 });
  assertPlainObject(raw, 'resolved_models');
  assertPlainObject(raw, 'agent_statuses');
  assertPlainObject(raw, 'on_success');
  assertPlainObject(raw, 'overall');
  if (!Array.isArray(raw.errored_trials)) {
    throw new ZedBenchmarkSchemaError('errored_trials must be an array');
  }

  const nTrials = raw.n_trials as number;
  const nScored = raw.n_scored as number;
  const nPassed = raw.n_passed as number;
  const nFailed = raw.n_failed as number;
  const nErrored = raw.n_errored as number;
  if (nScored > nTrials || nPassed + nFailed !== nScored || nScored + nErrored !== nTrials) {
    throw new ZedBenchmarkSchemaError('zed-eval report count fields are inconsistent');
  }

  return { raw: Object.freeze({ ...raw }) };
}
