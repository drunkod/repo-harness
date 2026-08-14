import { afterEach, describe, expect, test } from 'bun:test';
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join, relative } from 'path';
import {
  PINNED_ZED_EVAL_COMMIT,
  ZED_BENCHMARK_POLICY,
} from '../src/core/zed-benchmark/admission';
import type { ZedBenchmarkReceipt } from '../src/core/zed-benchmark/types';
import {
  ZedBenchmarkReceiptError,
  createZedBenchmarkReceipt,
  loadZedBenchmarkReceipt,
  transitionZedBenchmarkReceipt,
  zedBenchmarkReceiptPath,
  zedBenchmarkRunDir,
  zedBenchmarkStoreRoot,
} from '../src/effects/zed-benchmark/receipt-store';

const RUN_ID = 'rh-zb-00000000-0000-4000-8000-000000000000';
const SOURCE_SHA = '0123456789abcdef0123456789abcdef01234567';
const roots: string[] = [];

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

function repoRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'rh-zb-store-'));
  roots.push(root);
  return root;
}

function receipt(root: string, overrides: Partial<ZedBenchmarkReceipt> = {}): ZedBenchmarkReceipt {
  const runDir = relative(root, zedBenchmarkRunDir(root, RUN_ID));
  return {
    schema: 'repo-harness-zed-benchmark-run.v1',
    runId: RUN_ID,
    phase: 'submitting',
    namespace: 'repo-harness-evals',
    experimentName: 'rf',
    benchmark: 'rf',
    zedCheckout: join(root, 'zed'),
    integrationPin: PINNED_ZED_EVAL_COMMIT,
    sourceSha: SOURCE_SHA,
    model: 'sonnet-4.6',
    nTasks: 2,
    nConcurrent: 1,
    resourcePolicy: ZED_BENCHMARK_POLICY,
    runDir,
    jobsDir: join(runDir, 'artifacts'),
    createdAt: '2026-08-14T12:00:00.000Z',
    updatedAt: '2026-08-14T12:00:00.000Z',
    ...overrides,
  };
}

describe('zed benchmark receipt store', () => {
  test('creates, loads, and atomically transitions a receipt', () => {
    const root = repoRoot();
    const initial = receipt(root);
    createZedBenchmarkReceipt(root, initial);
    expect(loadZedBenchmarkReceipt(root, RUN_ID)).toEqual(initial);

    const pending = transitionZedBenchmarkReceipt(
      root,
      RUN_ID,
      'pending',
      '2026-08-14T12:00:01.000Z',
    );
    expect(pending.phase).toBe('pending');
    expect(pending.sourceSha).toBe(initial.sourceSha);
    expect(pending.model).toBe(initial.model);
    expect(loadZedBenchmarkReceipt(root, RUN_ID).phase).toBe('pending');
  });

  test('distinguishes duplicate, missing, corrupt, and truncated receipts', () => {
    const root = repoRoot();
    createZedBenchmarkReceipt(root, receipt(root));
    expect(() => createZedBenchmarkReceipt(root, receipt(root))).toThrow(ZedBenchmarkReceiptError);

    const missing = 'rh-zb-00000000-0000-4000-8000-000000000001';
    try {
      loadZedBenchmarkReceipt(root, missing);
      throw new Error('expected missing receipt failure');
    } catch (error) {
      expect(error).toBeInstanceOf(ZedBenchmarkReceiptError);
      expect((error as ZedBenchmarkReceiptError).kind).toBe('missing');
    }

    writeFileSync(zedBenchmarkReceiptPath(root, RUN_ID), '{"schema":', 'utf8');
    try {
      loadZedBenchmarkReceipt(root, RUN_ID);
      throw new Error('expected corrupt receipt failure');
    } catch (error) {
      expect(error).toBeInstanceOf(ZedBenchmarkReceiptError);
      expect((error as ZedBenchmarkReceiptError).kind).toBe('corrupt');
    }
  });

  test('rejects path mismatch and illegal phase regression', () => {
    const root = repoRoot();
    createZedBenchmarkReceipt(root, receipt(root));
    transitionZedBenchmarkReceipt(root, RUN_ID, 'pending', '2026-08-14T12:00:01.000Z');
    transitionZedBenchmarkReceipt(root, RUN_ID, 'completed', '2026-08-14T12:00:02.000Z');
    expect(() => transitionZedBenchmarkReceipt(
      root,
      RUN_ID,
      'running',
      '2026-08-14T12:00:03.000Z',
    )).toThrow();

    const raw = JSON.parse(readFileSync(zedBenchmarkReceiptPath(root, RUN_ID), 'utf8'));
    raw.jobsDir = '../escape';
    writeFileSync(zedBenchmarkReceiptPath(root, RUN_ID), JSON.stringify(raw), 'utf8');
    expect(() => loadZedBenchmarkReceipt(root, RUN_ID)).toThrow();
  });

  test('rejects a symlinked receipt component', () => {
    const root = repoRoot();
    const target = join(root, 'external');
    mkdirSync(target, { recursive: true });
    mkdirSync(join(root, '.ai', 'harness', 'runs'), { recursive: true });
    symlinkSync(target, zedBenchmarkStoreRoot(root), 'dir');
    expect(() => createZedBenchmarkReceipt(root, receipt(root))).toThrow();
  });

  test('rejects prototype phases and tampered admission policy on read', () => {
    const mutations: Array<
      (raw: Record<string, unknown>) => void
    > = [
      (raw) => {
        raw.phase = 'constructor';
      },

      (raw) => {
        raw.namespace = 'INVALID NAMESPACE';
      },

      (raw) => {
        raw.model = 'bad model';
      },

      (raw) => {
        raw.integrationPin = 'f'.repeat(40);
      },

      (raw) => {
        raw.sourceSha = 'main';
      },

      (raw) => {
        raw.sourceSha =
          '0123456789ABCDEF0123456789ABCDEF01234567';
      },

      (raw) => {
        raw.nTasks = 11;
      },

      (raw) => {
        raw.nConcurrent = 3;
      },

      (raw) => {
        raw.benchmark = 'qna';
        // experimentName remains rf.
      },

      (raw) => {
        raw.resourcePolicy = {
          ...ZED_BENCHMARK_POLICY,
          extra: true,
        };
      },

      (raw) => {
        raw.resourcePolicy = {
          ...ZED_BENCHMARK_POLICY,
          overrideCpus:
            ZED_BENCHMARK_POLICY.overrideCpus + 1,
        };
      },

      (raw) => {
        raw.createdAt = 'not-a-timestamp';
      },

      (raw) => {
        raw.updatedAt = '2026-08-14';
      },

      (raw) => {
        raw.createdAt =
          '2026-08-14T12:00:05.000Z';

        raw.updatedAt =
          '2026-08-14T12:00:04.000Z';
      },
    ];
    for (const mutate of mutations) {
      const root = repoRoot();
      createZedBenchmarkReceipt(root, receipt(root));
      const path = zedBenchmarkReceiptPath(root, RUN_ID);
      const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
      mutate(raw);
      writeFileSync(path, `${JSON.stringify(raw)}\n`, 'utf8');
      expect(() => loadZedBenchmarkReceipt(root, RUN_ID)).toThrow(ZedBenchmarkReceiptError);
    }
  });

  test('rejects a noncanonical transition timestamp without corrupting the receipt', () => {
    const root = repoRoot();

    createZedBenchmarkReceipt(
      root,
      receipt(root),
    );

    expect(() =>
      transitionZedBenchmarkReceipt(
        root,
        RUN_ID,
        'pending',
        'not-a-timestamp',
      ),
    ).toThrow(ZedBenchmarkReceiptError);

    const stored = loadZedBenchmarkReceipt(
      root,
      RUN_ID,
    );

    expect(stored.phase).toBe('submitting');

    expect(stored.updatedAt)
      .toBe('2026-08-14T12:00:00.000Z');
  });

  test('fails closed when a receipt transition lock is held', () => {
    const root = repoRoot();
    createZedBenchmarkReceipt(root, receipt(root));
    const lock = join(zedBenchmarkRunDir(root, RUN_ID), '.transition.lock');
    mkdirSync(lock);
    try {
      expect(() => transitionZedBenchmarkReceipt(root, RUN_ID, 'pending', '2026-08-14T12:00:01.000Z'))
        .toThrow(ZedBenchmarkReceiptError);
    } finally {
      rmSync(lock, { recursive: true, force: true });
    }
  });

  test('uses restrictive permissions where POSIX mode bits are available', () => {
    const root = repoRoot();
    createZedBenchmarkReceipt(root, receipt(root));
    if (process.platform !== 'win32') {
      const dirMode = lstatSync(zedBenchmarkRunDir(root, RUN_ID)).mode & 0o777;
      const fileMode = lstatSync(zedBenchmarkReceiptPath(root, RUN_ID)).mode & 0o777;
      expect(dirMode).toBe(0o700);
      expect(fileMode).toBe(0o600);
      chmodSync(zedBenchmarkReceiptPath(root, RUN_ID), 0o600);
    }
  });
});
