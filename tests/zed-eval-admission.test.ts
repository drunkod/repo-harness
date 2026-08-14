import { describe, expect, test } from 'bun:test';
import { resolve } from 'path';
import {
  ZED_EVAL_READ_ONLY_DISABLED_TOOLS,
  ZED_EVAL_WRITABLE_DISABLED_TOOLS,
  admitZedEvalRequest,
  validateZedEvalRequest,
} from '../src/core/zed-eval/admission';
import type {
  ZedEvalRequest,
  ZedEvalWorktreeFacts,
} from '../src/core/zed-eval/types';

function request(overrides: Partial<ZedEvalRequest> = {}): ZedEvalRequest {
  return {
    binary: resolve('fixtures/eval-cli'),
    workdir: resolve('fixtures/repo'),
    instruction: 'inspect the repository',
    model: 'anthropic/test-model',
    timeoutSeconds: 30,
    mode: 'read-only',
    disposableWorktree: false,
    ...overrides,
  };
}

function worktree(overrides: Partial<ZedEvalWorktreeFacts> = {}): ZedEvalWorktreeFacts {
  const root = resolve('fixtures/repo');
  const common = resolve('fixtures/repo/.git');
  return {
    insideWorkTree: true,
    worktreeRoot: root,
    gitDir: common,
    gitCommonDir: common,
    clean: true,
    ...overrides,
  };
}

describe('zed eval admission', () => {
  test('read-only is admitted with the exact pinned built-in-tool restrictions', () => {
    const admission = admitZedEvalRequest(request(), worktree());
    expect(admission.mode).toBe('read-only');
    expect(admission.disabledTools).toEqual(ZED_EVAL_READ_ONLY_DISABLED_TOOLS);
    expect(admission.disabledTools).toContain('terminal');
    expect(admission.disabledTools).toContain('search_web');
    expect(admission.disabledTools).toContain('spawn_agent');
  });

  test('writable requires disposable acknowledgement, linked worktree proof, and cleanliness', () => {
    expect(() => validateZedEvalRequest(request({
      mode: 'writable',
      disposableWorktree: false,
    }))).toThrow(/disposable-worktree/);

    expect(() => admitZedEvalRequest(request({
      mode: 'writable',
      disposableWorktree: true,
    }), worktree())).toThrow(/linked non-primary/);

    const common = resolve('fixtures/repo/.git');
    const linkedFacts = worktree({
      gitCommonDir: common,
      gitDir: resolve('fixtures/repo/.git/worktrees/zed-eval-fixture'),
    });
    const admitted = admitZedEvalRequest(request({
      mode: 'writable',
      disposableWorktree: true,
    }), linkedFacts);
    expect(admitted.disabledTools).toEqual(ZED_EVAL_WRITABLE_DISABLED_TOOLS);

    expect(() => admitZedEvalRequest(request({
      mode: 'writable',
      disposableWorktree: true,
    }), { ...linkedFacts, clean: false })).toThrow(/clean/);
  });

  test('rejects disposable acknowledgement in read-only mode', () => {
    expect(() => validateZedEvalRequest(request({ disposableWorktree: true })))
      .toThrow(/invalid in read-only/);
  });

  test('rejects invalid instruction, model, timeout, and relative paths', () => {
    expect(() => validateZedEvalRequest(request({ instruction: '   ' }))).toThrow(/instruction/);
    expect(() => validateZedEvalRequest(request({ model: 'bare-model' }))).toThrow(/provider\/model/);
    expect(() => validateZedEvalRequest(request({ timeoutSeconds: 0 }))).toThrow(/positive safe integer/);
    expect(() => validateZedEvalRequest(request({ binary: 'eval-cli' }))).toThrow(/absolute path/);
    expect(() => validateZedEvalRequest(request({ workdir: 'repo' }))).toThrow(/absolute path/);
  });

  test('rejects non-worktree facts before mode-specific launch rules', () => {
    expect(() => admitZedEvalRequest(request(), worktree({ insideWorkTree: false })))
      .toThrow(/Git worktree/);
  });
});
