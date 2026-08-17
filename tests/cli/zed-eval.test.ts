import { afterEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'child_process';
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const CLI = resolve(import.meta.dir, '..', '..', 'src', 'cli', 'index.ts');
const roots: string[] = [];

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

function git(cwd: string, args: string[]): void {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'repo-harness-zed-eval-cli-'));
  roots.push(root);
  const repo = join(root, 'repo');
  mkdirSync(repo);
  git(root, ['init', repo]);
  git(repo, ['config', 'user.name', 'Zed Eval CLI Fixture']);
  git(repo, ['config', 'user.email', 'zed-eval-cli@example.invalid']);
  writeFileSync(join(repo, '.gitignore'), '.ai/harness/runs/\n');
  writeFileSync(join(repo, 'README.md'), '# fixture\n');
  git(repo, ['add', '.gitignore', 'README.md']);
  git(repo, ['commit', '-m', 'fixture']);

  const binary = join(root, 'eval-cli');
  writeFileSync(binary, `#!/usr/bin/env bun
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
function flag(name) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; }
const outputDir = flag('--output-dir');
const instruction = flag('--instruction');
const model = flag('--model');
if (!outputDir || !instruction || !model) process.exit(90);
mkdirSync(outputDir, { recursive: false });
writeFileSync(join(outputDir, 'capture.json'), JSON.stringify({
  instructionMatches: instruction === (process.env.TEST_EXPECTED_INSTRUCTION ?? ''),
  disabledTools: process.env.ZED_EVAL_DISABLE_TOOLS ?? null,
}));
const mode = process.env.TEST_ZED_EVAL_CLI_MODE ?? 'completed';
if (mode === 'malformed') {
  writeFileSync(join(outputDir, 'result.json'), '{bad json');
  process.exit(0);
}
const status = mode === 'timeout' ? 'timeout' : 'completed';
writeFileSync(join(outputDir, 'result.json'), JSON.stringify({
  status,
  duration_secs: 0.01,
  model,
  tool_call_count: 0,
  tool_calls: {},
}));
process.exit(mode === 'timeout' ? 2 : 0);
`, { mode: 0o755 });
  chmodSync(binary, 0o755);
  return { root, repo, binary };
}

function runCli(
  args: string[],
  input?: string,
  extraEnv: NodeJS.ProcessEnv = {},
) {
  return spawnSync('bun', [CLI, ...args], {
    encoding: 'utf8',
    input,
    env: { ...process.env, ...extraEnv },
  });
}

function baseArgs(f: ReturnType<typeof fixture>): string[] {
  return [
    'zed-eval',
    '--binary', f.binary,
    '--workdir', f.repo,
    '--model', 'anthropic/test-model',
    '--timeout', '5',
    '--json',
  ];
}

describe('zed-eval CLI', () => {
  test('top-level help registers one first-class zed-eval command with the narrow safety boundary', () => {
    const help = runCli(['--help']);
    expect(help.status).toBe(0);
    expect((help.stdout.match(/zed-eval/g) ?? []).length).toBe(1);

    const commandHelp = runCli(['zed-eval', '--help']);
    expect(commandHelp.status).toBe(0);
    expect(commandHelp.stdout).toContain('read-only restricts the pinned built-in');
    expect(commandHelp.stdout).toContain('not an OS sandbox');
    expect(commandHelp.stdout).toContain('24e25552b1259d56a6fdd7956a419ed9e8a1a25e');
    expect(commandHelp.stdout).not.toContain('--output-dir');
    expect(commandHelp.stdout).not.toContain('--printenv');
    expect(commandHelp.stdout).not.toMatch(/\bcancel\b/);
  });

  test('runs an explicit instruction without treating empty piped stdin as a conflict', () => {
    const f = fixture();
    const result = runCli(
      [...baseArgs(f), '--instruction', 'CLI_PROMPT_SENTINEL', '--thinking', 'false'],
      undefined,
      { TEST_EXPECTED_INSTRUCTION: 'CLI_PROMPT_SENTINEL' },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain('CLI_PROMPT_SENTINEL');
    expect(result.stderr).not.toContain('CLI_PROMPT_SENTINEL');
    const receipt = JSON.parse(result.stdout) as {
      mode: string;
      command: string[];
      result: { status: string };
      artifacts: { outputDir: string };
    };
    expect(receipt.mode).toBe('read-only');
    expect(receipt.result.status).toBe('completed');
    expect(receipt.command.join(' ')).toContain('[instruction redacted]');
    const capture = JSON.parse(
      readFileSync(join(receipt.artifacts.outputDir, 'capture.json'), 'utf8'),
    ) as { instructionMatches: boolean };
    expect(capture.instructionMatches).toBe(true);
  });

  test('accepts non-empty stdin and rejects conflicting instruction sources before launch', () => {
    const f = fixture();
    const stdin = runCli(
      baseArgs(f),
      'STDIN_PROMPT_SENTINEL\n',
      { TEST_EXPECTED_INSTRUCTION: 'STDIN_PROMPT_SENTINEL' },
    );
    expect(stdin.status).toBe(0);
    expect(stdin.stdout).not.toContain('STDIN_PROMPT_SENTINEL');

    const conflict = runCli(
      [...baseArgs(f), '--instruction', 'argument prompt'],
      'stdin prompt\n',
    );
    expect(conflict.status).toBe(4);
    expect(conflict.stderr).toContain('exactly one instruction source');
  });

  test('preserves validated upstream timeout exit and reserves exit 4 for wrapper failures', () => {
    const f = fixture();
    const timeout = runCli(
      [...baseArgs(f), '--instruction', 'timeout prompt'],
      undefined,
      { TEST_ZED_EVAL_CLI_MODE: 'timeout' },
    );
    expect(timeout.status).toBe(2);
    expect(JSON.parse(timeout.stdout).result.status).toBe('timeout');

    const malformed = runCli(
      [...baseArgs(f), '--instruction', 'malformed prompt'],
      undefined,
      { TEST_ZED_EVAL_CLI_MODE: 'malformed' },
    );
    expect(malformed.status).toBe(4);
    expect(JSON.parse(malformed.stdout).failure.kind).toBe('schema');
  });
});
