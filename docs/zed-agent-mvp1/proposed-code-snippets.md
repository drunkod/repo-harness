# Proposed Code Snippets: Zed Interactive Hand-off MVP 1

> **Important:** these are complete proposed future changes. They are stored as
> documentation only and have not been written to production/source paths.

The snippets implement the launcher-only decision. They intentionally omit all
installer, hook, compatibility, fleet, reviewer, and provider changes.

## 1. `src/effects/zed-agent-launcher.ts` (new)

```ts
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
```

### Design notes

- `buildZedAgentUri` is public for pure tests, not for command output.
- Form-encoded separator spaces are normalized to `%20`; literal plus signs are
  already encoded as `%2B` by `URLSearchParams`.
- The runner seam is narrower than the repository-wide process result because
  this effect needs only launch status, signal, and error code.
- `spawnSync` is bounded and ignores child output.
- No raw error message is returned because it may contain environment-specific
  detail and should not become a prompt-leak path.
- `cwd` is process context only. It does not guarantee Zed workspace selection.

## 2. `src/cli/commands/zed-agent.ts` (new)

```ts
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
```

### Design notes

- The optional variadic argument lets the command domain return exit `2` for
  missing input rather than relying on Commander's required-argument behavior.
- `.allowUnknownOption(true)` prevents unknown option-like prompts from being
  echoed by Commander before the action. Known options such as `--help` remain
  options; pass them literally after `--`.
- The success message does not contain the prompt or URI and states only the
  observable CLI acceptance, not editor display state.
- Failure messages do not interpolate raw process errors.
- `launch` injection keeps validation and output tests in-process.

## 3. `src/cli/index.ts` (edit)

Apply exactly three focused edits.

### 3.1 Import the builder

Add with the other public command builders:

```ts
import { buildZedAgentCommand } from './commands/zed-agent';
```

For example, the nearby section becomes:

```ts
import { buildDocsCommand } from './commands/docs';
import { buildMcpCommand } from './commands/mcp';
import { buildChatgptCommand } from './commands/chatgpt';
import { buildZedAgentCommand } from './commands/zed-agent';
import { buildRunCommand } from './commands/run';
```

### 3.2 Add the public subcommand id

Add one item to `SUBCOMMANDS`:

```ts
export const SUBCOMMANDS = [
  'init',
  'init-hook',
  'install',
  'uninstall',
  'hook',
  'status',
  'doctor',
  'migrate',
  'security',
  'update',
  'run',
  'setup',
  'tools',
  'brain',
  'capability-context',
  'docs',
  'mcp',
  'chatgpt',
  'zed-agent',
  'state',
  'architecture-projection',
] as const;
```

### 3.3 Register the builder

Add it with the other public command builders:

```ts
program.addCommand(buildToolsCommand());
program.addCommand(buildBrainCommand());
program.addCommand(buildCapabilityContextCommand());
program.addCommand(buildDocsCommand());
program.addCommand(buildMcpCommand());
program.addCommand(buildChatgptCommand());
program.addCommand(buildZedAgentCommand());
program.addCommand(buildRunCommand());
program.addCommand(buildStateCommand());
program.addCommand(buildArchitectureProjectionCommand());
```

### Intentionally unchanged

Do not change:

```ts
const TARGET_HELP = 'codex|claude|both';
```

Do not add Zed to the install command, target union, registry, or top-level
runtime compatibility description.

## 3A. `.archcontext/model/nodes/capability.runtime-harness.global-runtime-reconciliation.yaml` (edit)

Update the existing capability authority rather than leaving the new paths
unmatched/root. Preserve the rest of the node and make these focused changes:

```yaml
summary: Reconciles the installed repo-harness runtime, its mandatory ArchContext closure, profile-owned external tooling, and explicit non-installing editor hand-offs.
responsibilities:
  - Install and read back the exact repo-harness, archctx, archctx-contracts, and package-local CodeGraph versions.
  - Require a compatible ArchContext Node runtime and a successful package-local capability handshake.
  - Refresh mutable Waza and Mermaid skills only when explicitly requested, plus the exact global CodeGraph CLI and MCP registration.
  - Expose explicit editor hand-offs without admitting those editors as hook-runtime compatibility targets.
  - Fail closed before later host mutations when the mandatory runtime closure cannot be reconciled.
source:
  include:
    - "package.json"
    - "bun.lock"
    - "src/cli/index.ts"
    - "src/cli/commands/global-runtime.ts"
    - "src/cli/commands/zed-agent.ts"
    - "scripts/check-managed-runtime.ts"
    - "scripts/sync-codex-installed-copies.sh"
    - "src/effects/architecture/**"
    - "src/effects/zed-agent-launcher.ts"
    - "tests/cli/global-runtime-init.test.ts"
    - "tests/cli/global-runtime.test.ts"
    - "tests/cli/zed-agent.test.ts"
    - "tests/effects/zed-agent-launcher.test.ts"
    - "tests/architecture-projection-provider.test.ts"
    - "tests/architecture-projection-orchestration.test.ts"
    - "assets/reference-configs/external-tooling.md"
    - "docs/reference-configs/external-tooling.md"
    - "docs/reference-configs/install-profiles.md"
```

Add focused verification while preserving current verification commands:

```yaml
extensions:
  verification:
    - "bun test tests/cli/global-runtime-init.test.ts tests/cli/global-runtime.test.ts"
    - "bun test tests/effects/zed-agent-launcher.test.ts tests/cli/zed-agent.test.ts"
    - "bun test tests/architecture-projection-provider.test.ts tests/architecture-projection-orchestration.test.ts"
    - "bun run check:release"
```

Then run:

```bash
archctx docs plan --json
```

Apply only the generated outputs reported by the configured architecture
projection. Do not hand-edit
`docs/architecture/modules/runtime-harness/global-runtime-reconciliation.md`.

## 4. `tests/effects/zed-agent-launcher.test.ts` (new)

```ts
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

    expect(uri).toStartWith('zed://agent?prompt=');
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
```

### Test notes

- These tests never open a real Zed process.
- The sentinel appears only in test input and is asserted absent from the public
  launch result.
- URI content is observed through the injected process call, not command output.

## 5. `tests/cli/zed-agent.test.ts` (new)

```ts
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
```

### Test notes

- The end-to-end prompt is non-sensitive.
- The fake executable captures the URI only inside an isolated test directory.
- Output privacy is asserted on success, usage failure, missing binary,
  ordinary failure, injected exception, and pre-action option-parsing paths.
- If a target CI platform does not support POSIX shell fixtures, replace only
  the fake-executable construction with the repository's established
  cross-platform fixture pattern; do not weaken the assertions.

## 6. External-tooling documentation (edit)

Add the following section only to the canonical source:

- `assets/reference-configs/external-tooling.md`

A reasonable location is after the install/uninstall boundary and before
detailed third-party tool installation instructions. Then generate and verify
the tracked docs projection:

```bash
bun run sync:reference-configs
bun run check:reference-configs
```

This deterministically updates
`docs/reference-configs/external-tooling.md`; do not hand-edit that target.

```md
## Zed Interactive Agent Hand-off

`repo-harness zed-agent "<prompt>"` is an optional local convenience command.
It asks the local `zed` CLI to open a `zed://agent?prompt=...` URI. On the
manually verified supported Zed release, that route is expected to prefill the
Agent Panel composer; repo-harness cannot observe whether the editor displayed
it.

This path is **interactive only**:

- the user must check Zed and, if the prompt appears, review and submit it;
- repo-harness does not observe editor state or start, wait for, or observe the
  Agent turn;
- no structured result or completion status is returned;
- Zed is not a `repo-harness install --target` host;
- Zed is not added to workflow `compatibility.agents`; and
- the command is not a fleet writer, hook host, benchmark provider, or reviewer.

The prompt is embedded in a URI process argument. URL encoding is not
encryption: process listings, endpoint telemetry, URI-handler logs, or Zed
application diagnostics may observe it. Do not pass credentials, secrets,
personal data, or sensitive source text through this command.

For first-class Zed thread and external-agent integration, use Zed's documented
[Agent Client Protocol External Agent path](https://zed.dev/docs/ai/external-agents.md)
rather than extending this interactive hand-off.
```

## 7. Files intentionally not changed

The complete proposal contains no snippet for these files because changing them
would violate MVP 1's execution boundary:

```text
src/cli/installer/types.ts
src/cli/installer/targets/registry.ts
src/cli/installer/targets/zed.ts
src/cli/commands/install.ts
src/cli/hook/route-registry.ts
src/cli/installer/managed-entries.ts
src/core/skill-surface/catalog.ts
src/core/review/cross-review.ts
src/effects/review/cross-review-runner.ts
src/cli/mcp/types.ts
src/cli/tools/codegraph.ts
scripts/install-agent-fleet.sh
assets/templates/helpers/install-agent-fleet.sh
assets/workflow-contract.v1.json
.ai/harness/workflow-contract.json
assets/skill-commands/manifest.json
```

## 8. Expected command examples

### Help

```text
$ repo-harness zed-agent --help
Usage: repo-harness zed-agent [options] [prompt...]

Open an interactive, prefilled prompt in the Zed Agent Panel

Arguments:
  prompt      Prompt to prefill; manual submission in Zed is required

Interactive only: this command does not submit the prompt, wait for completion, or return an Agent result.
```

### Success

```text
$ repo-harness zed-agent "test prompt"
repo-harness zed-agent: the Zed CLI accepted the Agent Panel prompt hand-off.
Check Zed. If the prompt appears, review and submit it there; repo-harness does not observe, submit, or track the Agent turn.
```

The terminal output intentionally does not show `test prompt` or the URI.

### Missing prompt

```text
$ repo-harness zed-agent
repo-harness zed-agent: provide a non-empty prompt
```

Exit code: `2`.

### Missing CLI

```text
$ repo-harness zed-agent "test prompt"
repo-harness zed-agent: the `zed` CLI was not found on PATH.
Install Zed and enable its CLI, then retry.
```

Exit code: `1`.

## 9. Review warnings for implementers

1. Do not “improve” discoverability by adding `zed` to installer target help.
2. Do not return `{ uri }` from the launcher.
3. Do not interpolate caught error messages into command output.
4. Do not remove `.allowUnknownOption(true)` without an equally private parser
   design and pre-action leakage tests.
5. Do not claim `cwd` selects a Zed workspace.
6. Do not add automatic submission.
7. Do not add an arbitrary prompt-length limit without a tested support
   contract; document the unknown instead.
8. Do not add a dependency for this small effect.
9. Do not broaden the feature into ACP or headless execution in the same work
   package.
