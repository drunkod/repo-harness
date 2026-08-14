import { isAbsolute } from 'path';
import { randomUUID } from 'crypto';
import {
  ZED_BENCHMARK_SELECTORS,
  type ZedBenchmarkResourcePolicy,
  type ZedBenchmarkSelector,
  type ZedBenchmarkSubmitRequest,
} from './types';

export { ZED_BENCHMARK_SELECTORS } from './types';

export const PINNED_ZED_EVAL_COMMIT =
  '24e25552b1259d56a6fdd7956a419ed9e8a1a25e';

export const ZED_BENCHMARK_POLICY: ZedBenchmarkResourcePolicy = Object.freeze({
  overrideCpus: 4,
  overrideMemoryMb: 16_384,
  sandboxTimeoutSecs: 3_600,
  sandboxIdleTimeoutSecs: 900,
});

export const ZED_BENCHMARK_MAX_TASKS = 10;
export const ZED_BENCHMARK_MAX_CONCURRENT = 2;

const FULL_SHA = /^[0-9a-f]{40}$/;
const NAMESPACE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;
const RUN_ID = /^rh-zb-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export class ZedBenchmarkAdmissionError extends Error {
  readonly code = 'ZED_BENCHMARK_ADMISSION';
}

function assertPositiveBoundedInteger(
  name: string,
  value: number,
  maximum: number,
): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new ZedBenchmarkAdmissionError(
      `${name} must be an integer between 1 and ${maximum}`,
    );
  }
}

export function isZedBenchmarkSelector(
  value: string,
): value is ZedBenchmarkSelector {
  return (ZED_BENCHMARK_SELECTORS as readonly string[]).includes(value);
}

export function assertZedBenchmarkRunId(runId: string): void {
  if (!RUN_ID.test(runId)) {
    throw new ZedBenchmarkAdmissionError('invalid repo-harness Zed benchmark run id');
  }
}

export function createZedBenchmarkRunId(): string {
  const runId = `rh-zb-${randomUUID()}`;
  assertZedBenchmarkRunId(runId);
  return runId;
}

export function admitZedBenchmarkSubmit(
  request: ZedBenchmarkSubmitRequest,
): void {
  if (!isAbsolute(request.repoRoot)) {
    throw new ZedBenchmarkAdmissionError('repoRoot must be absolute');
  }
  if (!isAbsolute(request.zedCheckout)) {
    throw new ZedBenchmarkAdmissionError('zedCheckout must be absolute');
  }
  if (request.integrationPin !== PINNED_ZED_EVAL_COMMIT) {
    throw new ZedBenchmarkAdmissionError(
      `integration pin must equal ${PINNED_ZED_EVAL_COMMIT}`,
    );
  }
  if (!FULL_SHA.test(request.sourceSha)) {
    throw new ZedBenchmarkAdmissionError(
      'sourceSha must be a full lowercase 40-hex Zed commit SHA',
    );
  }
  if (!isZedBenchmarkSelector(request.benchmark)) {
    throw new ZedBenchmarkAdmissionError('unsupported Zed benchmark selector');
  }
  if (!NAMESPACE.test(request.namespace)) {
    throw new ZedBenchmarkAdmissionError('namespace must be a constrained lowercase slug');
  }
  if (!MODEL.test(request.model)) {
    throw new ZedBenchmarkAdmissionError('model has invalid syntax');
  }
  assertPositiveBoundedInteger(
    'nTasks',
    request.nTasks,
    ZED_BENCHMARK_MAX_TASKS,
  );
  assertPositiveBoundedInteger(
    'nConcurrent',
    request.nConcurrent,
    ZED_BENCHMARK_MAX_CONCURRENT,
  );
  if (request.nConcurrent > request.nTasks) {
    throw new ZedBenchmarkAdmissionError('nConcurrent cannot exceed nTasks');
  }
  if (request.acknowledgeRemoteCostAndData !== true) {
    throw new ZedBenchmarkAdmissionError(
      'remote cost/data acknowledgement is required',
    );
  }
}
