import { isAbsolute, relative, sep } from 'path';
import type {
  ZedEvalAdmission,
  ZedEvalRequest,
  ZedEvalWorktreeFacts,
} from './types';

export const ZED_EVAL_READ_ONLY_DISABLED_TOOLS = [
  'copy_path',
  'create_directory',
  'create_thread',
  'delete_path',
  'apply_code_action',
  'edit_file',
  'write_file',
  'fetch',
  'move_path',
  'rename_symbol',
  'spawn_agent',
  'terminal',
  'search_web',
] as const;

export const ZED_EVAL_WRITABLE_DISABLED_TOOLS = [
  'create_thread',
  'spawn_agent',
] as const;

export class ZedEvalAdmissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZedEvalAdmissionError';
  }
}

function requiredAbsolutePath(value: string, label: string): void {
  if (value.trim() === '' || !isAbsolute(value)) {
    throw new ZedEvalAdmissionError(`${label} must be an absolute path`);
  }
}

function validateModel(model: string): void {
  if (!/^[^\s/]+\/[^\s]+$/.test(model)) {
    throw new ZedEvalAdmissionError('--model must use provider/model form');
  }
}

function isStrictlyContained(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel !== ''
    && rel !== '..'
    && !rel.startsWith(`..${sep}`)
    && !isAbsolute(rel);
}

export function validateZedEvalRequest(request: ZedEvalRequest): void {
  requiredAbsolutePath(request.binary, '--binary');
  requiredAbsolutePath(request.workdir, '--workdir');
  if (request.instructionSuffixFile !== undefined) {
    requiredAbsolutePath(request.instructionSuffixFile, '--instruction-suffix-file');
  }
  if (request.instruction.trim() === '') {
    throw new ZedEvalAdmissionError('instruction is required');
  }
  validateModel(request.model);
  if (!Number.isSafeInteger(request.timeoutSeconds) || request.timeoutSeconds < 1) {
    throw new ZedEvalAdmissionError('--timeout must be a positive safe integer');
  }
  if (
    request.reasoningEffort !== undefined
    && !['low', 'medium', 'high'].includes(request.reasoningEffort)
  ) {
    throw new ZedEvalAdmissionError('unsupported --reasoning-effort');
  }
  if (request.mode === 'read-only' && request.disposableWorktree) {
    throw new ZedEvalAdmissionError('--disposable-worktree is invalid in read-only mode');
  }
  if (request.mode === 'writable' && !request.disposableWorktree) {
    throw new ZedEvalAdmissionError('writable mode requires --disposable-worktree');
  }
}

export function admitZedEvalRequest(
  request: ZedEvalRequest,
  worktree: ZedEvalWorktreeFacts,
): ZedEvalAdmission {
  validateZedEvalRequest(request);

  if (!worktree.insideWorkTree) {
    throw new ZedEvalAdmissionError('--workdir must be inside a Git worktree');
  }
  for (const [label, value] of [
    ['worktree root', worktree.worktreeRoot],
    ['git dir', worktree.gitDir],
    ['git common dir', worktree.gitCommonDir],
  ] as const) {
    requiredAbsolutePath(value, label);
  }

  if (request.mode === 'writable') {
    if (
      worktree.gitDir === worktree.gitCommonDir
      || !isStrictlyContained(worktree.gitCommonDir, worktree.gitDir)
    ) {
      throw new ZedEvalAdmissionError(
        'writable mode requires a linked non-primary Git worktree',
      );
    }
    if (!worktree.clean) {
      throw new ZedEvalAdmissionError(
        'writable linked worktree must be clean including untracked files',
      );
    }
  }

  return {
    mode: request.mode,
    disabledTools: request.mode === 'read-only'
      ? ZED_EVAL_READ_ONLY_DISABLED_TOOLS
      : ZED_EVAL_WRITABLE_DISABLED_TOOLS,
  };
}
