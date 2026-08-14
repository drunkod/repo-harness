export const ZED_EVAL_PINNED_COMMIT =
  '24e25552b1259d56a6fdd7956a419ed9e8a1a25e' as const;

export const ZED_EVAL_RECEIPT_SCHEMA = 'repo-harness.zed-eval/v1' as const;

export type ZedEvalMode = 'read-only' | 'writable';
export type ZedEvalStatus = 'completed' | 'error' | 'timeout' | 'interrupted';
export type ZedEvalReasoningEffort = 'low' | 'medium' | 'high';

export interface ZedEvalRequest {
  readonly binary: string;
  readonly workdir: string;
  readonly instruction: string;
  readonly instructionSuffixFile?: string;
  readonly model: string;
  readonly timeoutSeconds: number;
  readonly noStaff?: boolean;
  readonly reasoningEffort?: ZedEvalReasoningEffort;
  readonly thinking?: boolean;
  readonly mode: ZedEvalMode;
  readonly disposableWorktree: boolean;
}

export interface ZedEvalWorktreeFacts {
  readonly insideWorkTree: boolean;
  readonly worktreeRoot: string;
  readonly gitDir: string;
  readonly gitCommonDir: string;
  readonly clean: boolean;
}

export interface ZedEvalUpstreamResult {
  readonly status: ZedEvalStatus;
  readonly error?: string;
  readonly duration_secs: number;
  readonly timeout_secs?: number;
  readonly model: string;
  readonly input_tokens?: number;
  readonly output_tokens?: number;
  readonly cache_creation_input_tokens?: number;
  readonly cache_read_input_tokens?: number;
  readonly step_count?: number;
  readonly tool_call_count?: number;
  readonly tool_calls?: Readonly<Record<string, number>>;
}

export interface ZedEvalArtifactPaths {
  readonly runRoot: string;
  readonly outputDir: string;
  readonly resultJson: string;
  readonly threadMarkdown?: string;
  readonly threadJson?: string;
  readonly home?: string;
}

export interface ZedEvalAdmission {
  readonly mode: ZedEvalMode;
  readonly disabledTools: readonly string[];
}

export type ZedEvalWrapperFailureKind =
  | 'spawn'
  | 'supervisor_timeout'
  | 'artifact'
  | 'schema'
  | 'coherence';

export interface ZedEvalReceipt {
  readonly schemaVersion: typeof ZED_EVAL_RECEIPT_SCHEMA;
  readonly runId: string;
  readonly sourceContract: {
    readonly expectedZedCommit: typeof ZED_EVAL_PINNED_COMMIT;
    readonly binaryProvenance: 'unverified';
  };
  readonly mode: ZedEvalMode;
  readonly workdir: string;
  readonly command: readonly string[];
  readonly process: {
    readonly status: number;
    readonly signal: NodeJS.Signals | null;
    readonly timedOut: boolean;
  };
  readonly result?: ZedEvalUpstreamResult;
  readonly artifacts: ZedEvalArtifactPaths;
  readonly failure?: {
    readonly kind: ZedEvalWrapperFailureKind;
    readonly message: string;
  };
  readonly warning: string;
}
