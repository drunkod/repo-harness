/**
 * Interactive Zed Agent hand-off.
 *
 * This effect asks the local Zed CLI to open a prompt URI. A successful process
 * result means only that the CLI accepted the launch request. The prompt remains
 * human-gated in Zed: repo-harness does not submit it, wait for an Agent turn,
 * or collect a result.
 *
 * Privacy boundary: the URI contains the prompt and is necessarily passed as a
 * process argument. Never return or log that URI from the launch operation.
 */

import { spawnSync } from 'child_process';

export const ZED_AGENT_LAUNCH_TIMEOUT_MS = 10_000;

export interface ZedLaunchProcessOptions {
  readonly cwd?: string;
  readonly stdio: 'ignore';
  readonly timeout: number;
  readonly windowsHide: boolean;
}

export interface ZedLaunchProcessResult {
  readonly status: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly error?: NodeJS.ErrnoException;
}

export type RunZedLaunchProcess = (
  command: string,
  args: readonly string[],
  options: ZedLaunchProcessOptions,
) => ZedLaunchProcessResult;

export interface ZedAgentLaunchInput {
  readonly prompt: string;
  readonly cwd?: string;
}

export interface ZedAgentLaunchDependencies {
  readonly run?: RunZedLaunchProcess;
}

export type ZedAgentLaunchResult =
  | { readonly ok: true; readonly outcome: 'handed-off' }
  | {
      readonly ok: false;
      readonly outcome: 'not-found' | 'launch-failed';
      readonly processStatus: number | null;
      readonly signal: NodeJS.Signals | null;
    };

const DEFAULT_RUN_ZED_PROCESS: RunZedLaunchProcess = (command, args, options) => {
  const result = spawnSync(command, [...args], {
    cwd: options.cwd,
    stdio: options.stdio,
    timeout: options.timeout,
    windowsHide: options.windowsHide,
  });

  return {
    status: result.status,
    signal: result.signal,
    error: result.error as NodeJS.ErrnoException | undefined,
  };
};

/** Build the Zed Agent deep link without opening Zed. */
export function buildZedAgentUri(prompt: string): string {
  const query = new URLSearchParams({ prompt }).toString().replace(/\+/g, '%20');
  return `zed://agent?${query}`;
}

/**
 * Ask the local Zed CLI to hand a prompt to the Zed Agent URI handler.
 *
 * The returned result deliberately excludes the prompt and URI so callers
 * cannot accidentally echo prompt-bearing data.
 */
export function launchZedAgent(
  input: ZedAgentLaunchInput,
  deps: ZedAgentLaunchDependencies = {},
): ZedAgentLaunchResult {
  const run = deps.run ?? DEFAULT_RUN_ZED_PROCESS;
  const uri = buildZedAgentUri(input.prompt);
  const result = run('zed', [uri], {
    cwd: input.cwd,
    stdio: 'ignore',
    timeout: ZED_AGENT_LAUNCH_TIMEOUT_MS,
    windowsHide: true,
  });

  if (result.error?.code === 'ENOENT') {
    return {
      ok: false,
      outcome: 'not-found',
      processStatus: result.status,
      signal: result.signal,
    };
  }

  if (result.error || result.status !== 0 || result.signal !== null) {
    return {
      ok: false,
      outcome: 'launch-failed',
      processStatus: result.status,
      signal: result.signal,
    };
  }

  return { ok: true, outcome: 'handed-off' };
}
