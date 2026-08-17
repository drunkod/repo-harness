/**
 * `repo-harness zed-agent [prompt...]`
 *
 * Asks the local Zed CLI to hand a prompt to Zed. The user must check Zed and,
 * if the prompt appears, review and submit it there. This command does not
 * observe editor state, an Agent turn, or an Agent result.
 */

import { Command } from 'commander';
import {
  launchZedAgent,
  type ZedAgentLaunchInput,
  type ZedAgentLaunchResult,
} from '../../effects/zed-agent-launcher';

export interface ZedAgentCommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface ZedAgentCommandDependencies {
  readonly cwd?: string;
  readonly launch?: (input: ZedAgentLaunchInput) => ZedAgentLaunchResult;
}

const SUCCESS_MESSAGE = [
  'repo-harness zed-agent: the Zed CLI accepted the Agent Panel prompt hand-off.',
  'Check Zed. If the prompt appears, review and submit it there; repo-harness does not observe, submit, or track the Agent turn.',
  '',
].join('\n');

export function runZedAgent(
  prompt: string,
  deps: ZedAgentCommandDependencies = {},
): ZedAgentCommandResult {
  if (prompt.trim() === '') {
    return {
      exitCode: 2,
      stdout: '',
      stderr: 'repo-harness zed-agent: provide a non-empty prompt\n',
    };
  }

  let result: ZedAgentLaunchResult;
  try {
    result = (deps.launch ?? launchZedAgent)({
      prompt,
      cwd: deps.cwd ?? process.cwd(),
    });
  } catch {
    return {
      exitCode: 1,
      stdout: '',
      stderr: 'repo-harness zed-agent: Zed could not be opened\n',
    };
  }

  if (result.ok) {
    return {
      exitCode: 0,
      stdout: SUCCESS_MESSAGE,
      stderr: '',
    };
  }

  if (result.outcome === 'not-found') {
    return {
      exitCode: 1,
      stdout: '',
      stderr: [
        'repo-harness zed-agent: the `zed` CLI was not found on PATH.',
        'Install Zed and enable its CLI, then retry.',
        '',
      ].join('\n'),
    };
  }

  return {
    exitCode: 1,
    stdout: '',
    stderr: 'repo-harness zed-agent: Zed could not be opened\n',
  };
}

export function buildZedAgentCommand(): Command {
  return new Command('zed-agent')
    .description('Ask the local Zed CLI to open an interactive Agent Panel prompt')
    .argument('[prompt...]', 'Prompt to hand off; manual submission in Zed is required')
    .allowUnknownOption(true)
    .addHelpText(
      'after',
      '\nInteractive only: this command does not submit the prompt, wait for completion, or return an Agent result.\n',
    )
    .action((promptParts: string[] = []) => {
      const result = runZedAgent(promptParts.join(' '));
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
      process.exit(result.exitCode);
    });
}
