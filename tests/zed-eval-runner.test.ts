import { afterEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'child_process';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { homedir, tmpdir } from 'os';
import { join } from 'path';
import {
  ZED_EVAL_READ_ONLY_DISABLED_TOOLS,
  ZED_EVAL_WRITABLE_DISABLED_TOOLS,
} from '../src/core/zed-eval/admission';
import type { ZedEvalRequest } from '../src/core/zed-eval/types';
import { runProcess, type ProcessRunResult } from '../src/effects/process-runner';
import { runZedEval } from '../src/effects/zed-eval/run-zed-eval';

const roots: string[] = [];

afterEach(() => {
  delete process.env.TEST_ZED_EVAL_FIXTURE_MODE;
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

function git(cwd: string, args: string[]): string {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'repo-harness-zed-eval-'));
  roots.push(root);
  const repo = join(root, 'repo');
  mkdirSync(repo);
  git(root, ['init', repo]);
  git(repo, ['config', 'user.name', 'Zed Eval Fixture']);
  git(repo, ['config', 'user.email', 'zed-eval@example.invalid']);
  writeFileSync(join(repo, '.gitignore'), '.ai/harness/runs/\n');
  writeFileSync(join(repo, 'README.md'), '# fixture\n');
  git(repo, ['add', '.gitignore', 'README.md']);
  git(repo, ['commit', '-m', 'fixture']);

  const binary = join(root, 'eval-cli');
  writeFileSync(binary, `#!/usr/bin/env bun
import { existsSync, mkdirSync, symlinkSync, writeFileSync } from 'fs';
import { join } from 'path';

const valueFlags = new Set([
  '--workdir',
  '--instruction',
  '--model',
  '--timeout',
  '--output-dir',
  '--instruction-suffix-file',
  '--reasoning-effort',
  '--thinking',
]);
const booleanFlags = new Set(['--no-staff']);
const seen = new Set();
for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (valueFlags.has(arg)) {
    if (seen.has(arg)) process.exit(94);
    seen.add(arg);
    const value = process.argv[index + 1];
    if (value === undefined || value.startsWith('--')) process.exit(95);
    index += 1;
  } else if (booleanFlags.has(arg)) {
    if (seen.has(arg)) process.exit(94);
    seen.add(arg);
  } else {
    process.exit(96);
  }
}

function flag(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const outputDir = flag('--output-dir');
const model = flag('--model');
const instruction = flag('--instruction');
if (!outputDir || !model || !instruction) process.exit(92);
const outputDirWasAbsent = !existsSync(outputDir);
if (!outputDirWasAbsent) process.exit(93);
mkdirSync(outputDir, { recursive: false });
writeFileSync(join(outputDir, 'fixture.json'), JSON.stringify({
  outputDirWasAbsent,
  instructionPresent: instruction === 'PROMPT_SENTINEL',
  disabledTools: process.env.ZED_EVAL_DISABLE_TOOLS ?? null,
  home: process.env.HOME ?? null,
  workdir: flag('--workdir') ?? null,
  thinking: flag('--thinking') ?? null,
  reasoningEffort: flag('--reasoning-effort') ?? null,
}));

const mode = process.env.TEST_ZED_EVAL_FIXTURE_MODE ?? 'completed';
if (mode === 'sleep') {
  await Bun.sleep(60_000);
  process.exit(0);
}
if (mode === 'secret-output') {
  console.log('PROMPT_SENTINEL authorization=Bearer test-secret');
  console.error('token=test-provider-key');
}

const selected = {
  completed: { status: 'completed', exit: 0 },
  error: { status: 'error', exit: 1 },
  'error-pre-thread': { status: 'error', exit: 1 },
  'error-with-thread': { status: 'error', exit: 1 },
  timeout: { status: 'timeout', exit: 2 },
  interrupted: { status: 'interrupted', exit: 3 },
  'status-mismatch': { status: 'error', exit: 0 },
  'unknown-exit': { status: 'completed', exit: 9 },
}[mode] ?? { status: 'completed', exit: 0 };

if (mode !== 'missing-result') {
  if (mode === 'malformed-result') {
    writeFileSync(join(outputDir, 'result.json'), '{not json');
  } else if (mode === 'oversized-result') {
    writeFileSync(join(outputDir, 'result.json'), JSON.stringify({
      status: 'completed',
      duration_secs: 0.01,
      model,
      padding: 'x'.repeat(300_000),
    }));
  } else {
    const toolCalls = mode === 'forbidden-tool' ? { terminal: 1 } : {};
    const toolCallCount = mode === 'bad-counts' ? 2 : Object.values(toolCalls).reduce((a, b) => a + b, 0);
    writeFileSync(join(outputDir, 'result.json'), JSON.stringify({
      status: selected.status,
      ...(selected.status === 'error' ? { error: 'fixture PROMPT_SENTINEL token=hidden' } : {}),
      duration_secs: 0.01,
      model: mode === 'bad-model' ? 'openai/other' : model,
      tool_call_count: toolCallCount,
      tool_calls: mode === 'bad-counts' ? { read_file: 1 } : toolCalls,
    }));
  }
}

if (!['missing-result', 'malformed-result', 'error-pre-thread'].includes(mode)) {
  if (mode === 'symlink-thread') {
    const outside = join(outputDir, '..', 'outside-thread.md');
    writeFileSync(outside, 'outside');
    symlinkSync(outside, join(outputDir, 'thread.md'));
  } else {
    writeFileSync(join(outputDir, 'thread.md'), '# fixture\\n');
  }
  writeFileSync(join(outputDir, 'thread.json'), '{}\\n');
}

process.exit(selected.exit);
`, { mode: 0o755 });
  chmodSync(binary, 0o755);
  return { root, repo, binary };
}

function request(
  f: ReturnType<typeof fixture>,
  overrides: Partial<ZedEvalRequest> = {},
): ZedEvalRequest {
  return {
    binary: f.binary,
    workdir: f.repo,
    instruction: 'PROMPT_SENTINEL',
    model: 'anthropic/test-model',
    timeoutSeconds: 5,
    noStaff: true,
    reasoningEffort: 'low',
    thinking: false,
    mode: 'read-only',
    disposableWorktree: false,
    ...overrides,
  };
}

function withMode<T>(mode: string, fn: () => T): T {
  process.env.TEST_ZED_EVAL_FIXTURE_MODE = mode;
  try {
    return fn();
  } finally {
    delete process.env.TEST_ZED_EVAL_FIXTURE_MODE;
  }
}

describe('zed eval runner', () => {
  test('runs one read-only eval with exact tool restrictions and redacted prompt metadata', () => {
    const f = fixture();
    const receipt = withMode('completed', () => runZedEval(request(f)));

    expect(receipt.failure).toBeUndefined();
    expect(receipt.result?.status).toBe('completed');
    expect(receipt.command.join(' ')).toContain('[instruction redacted]');
    expect(receipt.command.join(' ')).not.toContain('PROMPT_SENTINEL');
    expect(receipt.artifacts.home).toBeUndefined();
    expect(existsSync(receipt.artifacts.resultJson)).toBe(true);
    expect(existsSync(receipt.artifacts.threadMarkdown!)).toBe(true);

    const captured = JSON.parse(
      readFileSync(join(receipt.artifacts.outputDir, 'fixture.json'), 'utf8'),
    ) as {
      outputDirWasAbsent: boolean;
      instructionPresent: boolean;
      disabledTools: string;
      thinking: string;
      reasoningEffort: string;
    };
    expect(captured.outputDirWasAbsent).toBe(true);
    expect(captured.instructionPresent).toBe(true);
    expect(captured.disabledTools).toBe(ZED_EVAL_READ_ONLY_DISABLED_TOOLS.join(','));
    expect(captured.thinking).toBe('false');
    expect(captured.reasoningEffort).toBe('low');
  });

  test('preserves all four validated upstream terminal exit/status pairs', () => {
    const f = fixture();
    for (const [mode, exit] of [
      ['completed', 0],
      ['error', 1],
      ['timeout', 2],
      ['interrupted', 3],
    ] as const) {
      const receipt = withMode(mode, () => runZedEval(request(f)));
      expect(receipt.failure).toBeUndefined();
      expect(receipt.process.status).toBe(exit);
      expect(receipt.result?.status).toBe(mode);
      if (mode === 'error') {
        expect(receipt.result?.error).not.toContain('PROMPT_SENTINEL');
        expect(receipt.result?.error).not.toContain('hidden');
        expect(receipt.result?.error).toContain('token=[redacted]');
      }
    }
  });

  test('accepts error results both before thread creation and with thread evidence', () => {
    const preThreadFixture = fixture();
    const preThread = withMode('error-pre-thread', () => runZedEval(request(preThreadFixture)));
    expect(preThread.failure).toBeUndefined();
    expect(preThread.result?.status).toBe('error');
    expect(preThread.artifacts.threadMarkdown).toBeUndefined();
    expect(preThread.artifacts.threadJson).toBeUndefined();

    const withThreadFixture = fixture();
    const withThread = withMode('error-with-thread', () => runZedEval(request(withThreadFixture)));
    expect(withThread.failure).toBeUndefined();
    expect(withThread.result?.status).toBe('error');
    expect(withThread.artifacts.threadMarkdown).toBeDefined();
    expect(withThread.artifacts.threadJson).toBeDefined();
  });

  test('fails closed on exit, schema, artifact, and disabled-tool contract violations', () => {
    const cases = [
      ['status-mismatch', 'coherence'],
      ['unknown-exit', 'coherence'],
      ['malformed-result', 'schema'],
      ['missing-result', 'artifact'],
      ['oversized-result', 'artifact'],
      ['bad-model', 'schema'],
      ['bad-counts', 'schema'],
      ['forbidden-tool', 'coherence'],
      ['symlink-thread', 'artifact'],
    ] as const;

    for (const [mode, kind] of cases) {
      const f = fixture();
      const receipt = withMode(mode, () => runZedEval(request(f)));
      expect(receipt.failure?.kind).toBe(kind);
      expect(receipt.result).toBeUndefined();
    }
  });

  test('composes instruction and shared secret redactions for child diagnostics', () => {
    const f = fixture();
    let capturedResult: ProcessRunResult | undefined;
    const receipt = withMode('secret-output', () => runZedEval(request(f), {
      run: (command, args, options) => {
        if (command === f.binary) expect(options.inheritEnv).toBe(true);
        const result = runProcess(command, args, options);
        capturedResult = result;
        return result;
      },
    }));

    expect(receipt.failure).toBeUndefined();
    const processResult = capturedResult;
    if (processResult === undefined) throw new Error('expected captured process result');
    expect(processResult.command.join(' ')).not.toContain('PROMPT_SENTINEL');
    expect(processResult.stdout).not.toContain('PROMPT_SENTINEL');
    expect(processResult.stdout).not.toContain('test-secret');
    expect(processResult.stderr).not.toContain('test-provider-key');
    expect(processResult.stdout).toContain('[instruction redacted]');
  });

  test('fake executable rejects unknown and duplicate singleton flags', () => {
    const f = fixture();
    const args = [
      '--workdir', f.repo,
      '--instruction', 'PROMPT_SENTINEL',
      '--model', 'anthropic/test-model',
      '--timeout', '5',
      '--output-dir', join(f.root, 'manual-artifacts'),
    ];

    const unknown = spawnSync(f.binary, [...args, '--bogus'], { encoding: 'utf8' });
    expect(unknown.status).toBe(96);

    const duplicate = spawnSync(
      f.binary,
      [...args, '--model', 'anthropic/other'],
      { encoding: 'utf8' },
    );
    expect(duplicate.status).toBe(94);
  });

  test('outer supervisor timeout remains distinct from upstream timeout', () => {
    const f = fixture();
    const receipt = withMode('sleep', () => runZedEval(
      request(f, { timeoutSeconds: 1 }),
      { flushGraceMs: 10 },
    ));
    expect(receipt.failure?.kind).toBe('supervisor_timeout');
    expect(receipt.result).toBeUndefined();
    expect(receipt.process.timedOut).toBe(true);
  });

  test('writable mode rejects primary/dirty state and uses a fresh run-scoped HOME in a clean linked worktree', () => {
    const f = fixture();
    expect(() => runZedEval(request(f, {
      mode: 'writable',
      disposableWorktree: true,
    }))).toThrow(/linked non-primary/);

    const linked = join(f.root, 'linked-worktree');
    git(f.repo, ['worktree', 'add', '--detach', linked, 'HEAD']);
    writeFileSync(join(linked, 'DIRTY.txt'), 'dirty');
    expect(() => runZedEval(request(f, {
      workdir: linked,
      mode: 'writable',
      disposableWorktree: true,
    }))).toThrow(/clean/);
    rmSync(join(linked, 'DIRTY.txt'));

    const receipt = withMode('completed', () => runZedEval(request(f, {
      workdir: linked,
      mode: 'writable',
      disposableWorktree: true,
    })));
    expect(receipt.failure).toBeUndefined();
    const runHome = receipt.artifacts.home;
    expect(runHome).toBeDefined();
    if (runHome === undefined) throw new Error('expected writable run HOME');
    expect(runHome).not.toBe(homedir());

    const captured = JSON.parse(
      readFileSync(join(receipt.artifacts.outputDir, 'fixture.json'), 'utf8'),
    ) as { home: string; disabledTools: string; workdir: string };
    expect(captured.home).toBe(runHome);
    expect(captured.disabledTools).toBe(ZED_EVAL_WRITABLE_DISABLED_TOOLS.join(','));
    expect(captured.workdir).toBe(linked);
  });
});
