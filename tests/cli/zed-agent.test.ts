import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  runZedAgent,
  type ZedAgentCommandDependencies,
} from '../../src/cli/commands/zed-agent';

const ROOT = join(import.meta.dir, '../..');
const CLI = join(ROOT, 'src/cli/index.ts');

function writeExecutable(path: string, content: string): void {
  writeFileSync(path, content);
  chmodSync(path, 0o755);
}

describe('runZedAgent', () => {
  test('rejects a blank prompt with exit 2 without launching', () => {
    let launches = 0;
    const result = runZedAgent('   ', {
      launch: () => {
        launches += 1;
        return { ok: true, outcome: 'handed-off' };
      },
    });

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('provide a non-empty prompt');
    expect(launches).toBe(0);
  });

  test('reports a truthful interactive hand-off without prompt leakage', () => {
    const secret = 'SENTINEL_DO_NOT_LOG_7f4c2f';
    const result = runZedAgent(secret, {
      cwd: '/tmp/example-repo',
      launch: (input) => {
        expect(input).toEqual({
          prompt: secret,
          cwd: '/tmp/example-repo',
        });
        return { ok: true, outcome: 'handed-off' };
      },
    });

    const output = `${result.stdout}\n${result.stderr}`;
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('accepted');
    expect(result.stdout).toContain('Check Zed');
    expect(result.stdout).toContain('review and submit it there');
    expect(result.stdout).toContain('does not observe, submit, or track');
    expect(output).not.toContain(secret);
    expect(output).not.toContain('zed://agent');
  });

  test('returns actionable not-found guidance without prompt leakage', () => {
    const secret = 'SENTINEL_NOT_FOUND_DO_NOT_LOG';
    const result = runZedAgent(secret, {
      launch: () => ({
        ok: false,
        outcome: 'not-found',
        processStatus: null,
        signal: null,
      }),
    });

    const output = `${result.stdout}\n${result.stderr}`;
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('not found on PATH');
    expect(output).not.toContain(secret);
    expect(output).not.toContain('zed://agent');
  });

  test('reports ordinary launch failure without prompt leakage', () => {
    const secret = 'SENTINEL_LAUNCH_FAILURE_DO_NOT_LOG';
    const result = runZedAgent(secret, {
      launch: () => ({
        ok: false,
        outcome: 'launch-failed',
        processStatus: 9,
        signal: null,
      }),
    });
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('could not be opened');
    expect(output).not.toContain(secret);
    expect(output).not.toContain('zed://agent');
  });

  test('does not expose unexpected error messages', () => {
    const secret = 'SENTINEL_THROWN_DO_NOT_LOG';
    const deps: ZedAgentCommandDependencies = {
      launch: () => {
        throw new Error(`failure containing ${secret}`);
      },
    };

    const result = runZedAgent(secret, deps);
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('could not be opened');
    expect(output).not.toContain(secret);
    expect(output).not.toContain('zed://agent');
  });
});

describe('zed-agent CLI', () => {
  test('is registered in top-level and command help', () => {
    const topLevel = spawnSync(process.execPath, [CLI, '--help'], {
      cwd: ROOT,
      encoding: 'utf-8',
    });
    expect(topLevel.status).toBe(0);
    expect(topLevel.stdout).toContain('zed-agent');

    const command = spawnSync(process.execPath, [CLI, 'zed-agent', '--help'], {
      cwd: ROOT,
      encoding: 'utf-8',
    });
    expect(command.status).toBe(0);
    expect(command.stdout).toContain('interactive');
    expect(command.stdout).toContain('manual submission');
    expect(command.stdout).toContain('does not submit');
  }, 30_000);

  test('passes the encoded URI to a fake zed while keeping output private', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'repo-harness-zed-agent-'));
    const fakeBin = join(fixtureRoot, 'bin');
    const capturePath = join(fixtureRoot, 'zed-argument.txt');
    const prompt = 'test prompt + symbols & Unicode 你好';

    try {
      mkdirSync(fakeBin, { recursive: true });
      writeExecutable(
        join(fakeBin, 'zed'),
        [
          '#!/bin/sh',
          'set -eu',
          'printf "%s\\n" "$1" > "$ZED_CAPTURE"',
          '',
        ].join('\n'),
      );

      const result = spawnSync(process.execPath, [CLI, 'zed-agent', prompt], {
        cwd: ROOT,
        encoding: 'utf-8',
        env: {
          ...process.env,
          PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
          ZED_CAPTURE: capturePath,
        },
      });

      const output = `${result.stdout}\n${result.stderr}`;
      expect(result.status).toBe(0);
      expect(readFileSync(capturePath, 'utf-8').trim()).toBe(
        'zed://agent?prompt=test%20prompt%20%2B%20symbols%20%26%20Unicode%20%E4%BD%A0%E5%A5%BD',
      );
      expect(result.stdout).toContain('accepted');
      expect(output).not.toContain(prompt);
      expect(output).not.toContain('zed://agent');
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  }, 30_000);

  test('does not echo option-like prompts during Commander parsing', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'repo-harness-zed-options-'));
    const fakeBin = join(fixtureRoot, 'bin');
    const capturePath = join(fixtureRoot, 'zed-argument.txt');
    const optionLike = '--SENTINEL_OPTION_LIKE_DO_NOT_LOG';

    try {
      mkdirSync(fakeBin, { recursive: true });
      writeExecutable(
        join(fakeBin, 'zed'),
        [
          '#!/bin/sh',
          'set -eu',
          'printf "%s\\n" "$1" > "$ZED_CAPTURE"',
          '',
        ].join('\n'),
      );
      const env = {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
        ZED_CAPTURE: capturePath,
      };

      const unknownOption = spawnSync(
        process.execPath,
        [CLI, 'zed-agent', optionLike],
        { cwd: ROOT, encoding: 'utf-8', env },
      );
      const unknownOutput = `${unknownOption.stdout}\n${unknownOption.stderr}`;
      expect(unknownOption.status).toBe(0);
      expect(new URL(readFileSync(capturePath, 'utf-8').trim()).searchParams.get('prompt')).toBe(optionLike);
      expect(unknownOutput).not.toContain(optionLike);
      expect(unknownOutput).not.toContain('zed://agent');

      const knownOptionLiteral = spawnSync(
        process.execPath,
        [CLI, 'zed-agent', '--', '--help'],
        { cwd: ROOT, encoding: 'utf-8', env },
      );
      const literalOutput = `${knownOptionLiteral.stdout}\n${knownOptionLiteral.stderr}`;
      expect(knownOptionLiteral.status).toBe(0);
      expect(new URL(readFileSync(capturePath, 'utf-8').trim()).searchParams.get('prompt')).toBe('--help');
      expect(literalOutput).not.toContain('--help');
      expect(literalOutput).not.toContain('zed://agent');
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  }, 30_000);

  test('returns exit 2 when the prompt is missing', () => {
    const result = spawnSync(process.execPath, [CLI, 'zed-agent'], {
      cwd: ROOT,
      encoding: 'utf-8',
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('provide a non-empty prompt');
  }, 30_000);

  test('returns exit 1 when zed cannot be resolved', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'repo-harness-zed-missing-'));
    const secret = 'SENTINEL_MISSING_BINARY_DO_NOT_LOG';

    try {
      const result = spawnSync(process.execPath, [CLI, 'zed-agent', secret], {
        cwd: ROOT,
        encoding: 'utf-8',
        env: {
          ...process.env,
          PATH: fixtureRoot,
        },
      });

      const output = `${result.stdout}\n${result.stderr}`;
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('not found on PATH');
      expect(output).not.toContain(secret);
      expect(output).not.toContain('zed://agent');
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  }, 30_000);
});
