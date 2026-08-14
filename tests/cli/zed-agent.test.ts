import { describe, expect, test } from 'bun:test';
import {
  runZedAgent,
  type ZedAgentCommandDependencies,
} from '../../src/cli/commands/zed-agent';

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
