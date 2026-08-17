import { describe, expect, test } from 'bun:test';
import {
  ZED_AGENT_LAUNCH_TIMEOUT_MS,
  buildZedAgentUri,
  launchZedAgent,
  type RunZedLaunchProcess,
  type ZedLaunchProcessOptions,
} from '../../src/effects/zed-agent-launcher';

describe('Zed Agent URI', () => {
  test('uses canonical percent encoding for spaces', () => {
    expect(buildZedAgentUri('test prompt')).toBe(
      'zed://agent?prompt=test%20prompt',
    );
  });

  test('round-trips query delimiters, newline, percent, plus, and Unicode', () => {
    const prompt = 'a+b & c=d\n100% 你好 👋';
    const uri = buildZedAgentUri(prompt);

    expect(uri.startsWith('zed://agent?prompt=')).toBe(true);
    expect(uri).toContain('a%2Bb%20%26%20c%3Dd%0A100%25%20');
    expect(uri).not.toContain('+');
    expect(new URL(uri).searchParams.get('prompt')).toBe(prompt);
  });
});

describe('launchZedAgent', () => {
  test('invokes zed once with one URI argument and private launch output', () => {
    const calls: Array<{
      command: string;
      args: readonly string[];
      options: ZedLaunchProcessOptions;
    }> = [];
    const run: RunZedLaunchProcess = (command, args, options) => {
      calls.push({ command, args, options });
      return { status: 0, signal: null };
    };

    const result = launchZedAgent(
      { prompt: 'test prompt', cwd: '/tmp/example-repo' },
      { run },
    );

    expect(result).toEqual({ ok: true, outcome: 'handed-off' });
    expect(Object.hasOwn(result, 'uri')).toBe(false);
    expect(Object.hasOwn(result, 'prompt')).toBe(false);
    expect(calls).toEqual([
      {
        command: 'zed',
        args: ['zed://agent?prompt=test%20prompt'],
        options: {
          cwd: '/tmp/example-repo',
          stdio: 'ignore',
          timeout: ZED_AGENT_LAUNCH_TIMEOUT_MS,
          windowsHide: true,
        },
      },
    ]);
  });

  test('classifies a missing zed executable without returning prompt data', () => {
    const run: RunZedLaunchProcess = () => ({
      status: null,
      signal: null,
      error: Object.assign(new Error('spawnSync zed ENOENT'), { code: 'ENOENT' }),
    });

    const result = launchZedAgent({ prompt: 'SENTINEL_DO_NOT_LOG' }, { run });

    expect(result).toEqual({
      ok: false,
      outcome: 'not-found',
      processStatus: null,
      signal: null,
    });
    expect(JSON.stringify(result)).not.toContain('SENTINEL_DO_NOT_LOG');
    expect(JSON.stringify(result)).not.toContain('zed://agent');
  });

  test('classifies non-zero exit status as launch failure', () => {
    const run: RunZedLaunchProcess = () => ({ status: 9, signal: null });

    expect(launchZedAgent({ prompt: 'test' }, { run })).toEqual({
      ok: false,
      outcome: 'launch-failed',
      processStatus: 9,
      signal: null,
    });
  });

  test('classifies a signal as launch failure', () => {
    const run: RunZedLaunchProcess = () => ({
      status: null,
      signal: 'SIGTERM',
    });

    expect(launchZedAgent({ prompt: 'test' }, { run })).toEqual({
      ok: false,
      outcome: 'launch-failed',
      processStatus: null,
      signal: 'SIGTERM',
    });
  });
});
