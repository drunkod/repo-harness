export const ZED_BENCHMARK_SELECTORS = [
  'qna',
  'rf',
  'tw',
  'terminal-bench-2.1',
  'deepswe',
] as const;

export type ZedBenchmarkSelector = (typeof ZED_BENCHMARK_SELECTORS)[number];

/** Exact remote values documented by the pinned state.json producer. */
export type ZedBenchmarkRemotePhase =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed';

/**
 * Local submission states are kept separate from remote state.
 * `submission-uncertain` means the controller may have accepted the known run
 * ID before the local wrapper timed out or lost the response. It must be
 * reconciled with status, never retried automatically.
 */
export type ZedBenchmarkReceiptPhase =
  | 'submitting'
  | 'submission-uncertain'
  | ZedBenchmarkRemotePhase;

export interface ZedBenchmarkSubmitRequest {
  readonly repoRoot: string;
  readonly zedCheckout: string;
  /** Commit containing the reviewed zed-eval implementation. */
  readonly integrationPin: string;
  /** Clean Zed source commit to build into eval-cli for this benchmark. */
  readonly sourceSha: string;
  readonly namespace: string;
  readonly benchmark: ZedBenchmarkSelector;
  readonly model: string;
  readonly nTasks: number;
  readonly nConcurrent: number;
  readonly acknowledgeRemoteCostAndData: boolean;
}

export interface ZedBenchmarkResourcePolicy {
  readonly overrideCpus: number;
  readonly overrideMemoryMb: number;
  readonly sandboxTimeoutSecs: number;
  readonly sandboxIdleTimeoutSecs: number;
}

export interface ZedBenchmarkReceipt {
  readonly schema: 'repo-harness-zed-benchmark-run.v1';
  readonly runId: string;
  readonly phase: ZedBenchmarkReceiptPhase;
  readonly namespace: string;
  readonly experimentName: ZedBenchmarkSelector;
  readonly benchmark: ZedBenchmarkSelector;
  readonly zedCheckout: string;
  readonly integrationPin: string;
  readonly sourceSha: string;
  readonly model: string;
  readonly nTasks: number;
  readonly nConcurrent: number;
  readonly resourcePolicy: ZedBenchmarkResourcePolicy;
  /** Repository-relative ignored evidence paths. */
  readonly runDir: string;
  readonly jobsDir: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastFailureKind?: 'transport' | 'timeout' | 'exit' | 'schema';
}

export interface ZedBenchmarkRemoteState {
  readonly status: ZedBenchmarkRemotePhase;
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface ZedBenchmarkReport {
  readonly raw: Readonly<Record<string, unknown>>;
}

export type ZedBenchmarkSubmitOutcome =
  | {
      readonly kind: 'submitted';
      readonly receipt: ZedBenchmarkReceipt;
    }
  | {
      readonly kind: 'submission-uncertain';
      readonly receipt: ZedBenchmarkReceipt;
      readonly diagnostic: string;
    };
