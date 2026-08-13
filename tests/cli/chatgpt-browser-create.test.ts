import { describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';

const ROOT = join(import.meta.dir, '../..');
const CLI = join(ROOT, 'src/cli/index.ts');
const REPOSITORY = 'drunkod/repo-harness';
const DEFAULT_BRANCH = 'main';
const BASE_COMMIT = '1111111111111111111111111111111111111111';
const CREATE_COMMIT = '2222222222222222222222222222222222222222';

function runChatgpt(args: string[], cwd = ROOT, env: NodeJS.ProcessEnv = process.env) {
  return spawnSync('bun', [CLI, 'chatgpt', ...args], {
    cwd,
    encoding: 'utf-8',
    env,
  });
}

function withRepo<T>(fn: (repoRoot: string) => T): T {
  const repoRoot = mkdtempSync(join(tmpdir(), 'repo-harness-chatgpt-create-'));
  try {
    mkdirSync(join(repoRoot, 'plans'), { recursive: true });
    mkdirSync(join(repoRoot, 'tasks', 'contracts'), { recursive: true });
    writeFileSync(join(repoRoot, 'plans', 'plan-x.md'), '# Plan\n');
    writeFileSync(join(repoRoot, 'tasks', 'contracts', 'x.contract.md'), '# Contract\n');
    return fn(repoRoot);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
}

function writeFakeGitleaks(dir: string): string {
  const path = join(dir, 'gitleaks');
  writeFileSync(path, [
    '#!/usr/bin/env bun',
    "if (process.argv.includes('version')) { console.log('8.30.0'); process.exit(0); }",
    'await Bun.stdin.text();',
    'process.exit(0);',
  ].join('\n') + '\n');
  chmodSync(path, 0o755);
  return path;
}

function writeFakeOracle(dir: string, opts: { appPreselect: boolean; output?: string; argsPath?: string }): string {
  const path = join(dir, 'oracle');
  const flags = [
    '--engine',
    '--write-output',
    '--browser-follow-up',
    '--followup',
    '--browser-archive',
    '--browser-model-strategy',
    '--browser-cookie-path',
    '--browser-thinking-time',
    '--chatgpt-url',
    '--heartbeat',
    ...(opts.appPreselect ? ['--browser-app'] : []),
  ].join(' ');
  writeFileSync(path, [
    '#!/usr/bin/env bun',
    `const HELP = ${JSON.stringify(flags)};`,
    `const OUTPUT = ${JSON.stringify(opts.output ?? '')};`,
    `const ARGS_PATH = ${JSON.stringify(opts.argsPath ?? '')};`,
    "if (process.argv.includes('--version')) { console.log('0.16.1'); process.exit(0); }",
    "if (process.argv.includes('--help') || process.argv.includes('--debug-help')) { console.log(HELP); process.exit(0); }",
    "if (ARGS_PATH) await Bun.write(ARGS_PATH, process.argv.slice(2).join('\\n') + '\\n');",
    "const index = process.argv.indexOf('--write-output');",
    'if (index >= 0) await Bun.write(process.argv[index + 1], OUTPUT);',
    "console.log('Session: fake-create-session');",
    'process.exit(0);',
  ].join('\n') + '\n');
  chmodSync(path, 0o755);
  return path;
}

function baseArgs(repoRoot: string): string[] {
  return [
    'browser-create',
    '--repo', repoRoot,
    '--chatgpt-app', 'GitHub',
    '--repository', REPOSITORY,
    '--default-branch', DEFAULT_BRANCH,
    '--base-commit', BASE_COMMIT,
    '--branch', 'agent/create-x',
    '--plan', 'plans/plan-x.md',
    '--contract', 'tasks/contracts/x.contract.md',
    '--prompt', 'Create the bounded change.',
  ];
}

function createEnvelope(overrides: Record<string, unknown> = {}): string {
  return [
    '# Creation Report',
    '',
    '```repo-harness-create-result',
    JSON.stringify({
      selectedApp: 'GitHub',
      repository: REPOSITORY,
      defaultBranch: DEFAULT_BRANCH,
      baseCommit: BASE_COMMIT,
      branch: 'agent/create-x',
      targetBranchExisted: false,
      commitSha: CREATE_COMMIT,
      pullRequest: {
        number: 12,
        url: `https://github.com/${REPOSITORY}/pull/12`,
        draft: true,
        baseBranch: DEFAULT_BRANCH,
        headBranch: 'agent/create-x',
        headSha: CREATE_COMMIT,
      },
      changedFiles: ['docs/example.md'],
      toolEvents: ['get_repo', 'fetch_commit', 'get_branch', 'create_branch', 'create_commit', 'update_ref', 'create_pull_request'],
      ...overrides,
    }, null, 2),
    '```',
  ].join('\n');
}

function readBackEnvelope(overrides: Record<string, unknown> = {}): string {
  return [
    '# Independent GitHub Read-back',
    '',
    '```repo-harness-create-readback-result',
    JSON.stringify({
      selectedApp: 'GitHub',
      repository: REPOSITORY,
      defaultBranch: DEFAULT_BRANCH,
      baseCommit: BASE_COMMIT,
      branch: 'agent/create-x',
      branchHead: CREATE_COMMIT,
      commitSha: CREATE_COMMIT,
      commitExists: true,
      pullRequest: {
        number: 12,
        url: `https://github.com/${REPOSITORY}/pull/12`,
        draft: true,
        baseBranch: DEFAULT_BRANCH,
        headBranch: 'agent/create-x',
        headSha: CREATE_COMMIT,
      },
      changedFiles: ['docs/example.md'],
      comparison: {
        baseCommit: BASE_COMMIT,
        headCommit: CREATE_COMMIT,
        status: 'ahead',
        aheadBy: 1,
        behindBy: 0,
      },
      readActions: ['get_repo', 'fetch_commit', 'get_branch', 'compare_commits', 'list_changed_files', 'get_pr_info'],
      ...overrides,
    }, null, 2),
    '```',
  ].join('\n');
}

describe('chatgpt browser-create', () => {
  test('exposes strict Create and independent read-back commands', () => {
    const root = runChatgpt(['--help']);
    expect(root.status).toBe(0);
    expect(root.stdout).toContain('browser-create');
    expect(root.stdout).toContain('browser-create-readback');

    const help = runChatgpt(['browser-create', '--help']);
    expect(help.status).toBe(0);
    for (const flag of [
      '--repo',
      '--chatgpt-app',
      '--repository',
      '--default-branch',
      '--base-commit',
      '--branch',
      '--plan',
      '--contract',
    ]) {
      expect(help.stdout).toContain(flag);
    }
    expect(help.stdout).not.toContain('--base <ref>');
    expect(help.stdout.replace(/\s+/g, ' ')).toContain('Create always requires secret scanning');

    const readBackHelp = runChatgpt(['browser-create-readback', '--help']);
    expect(readBackHelp.status).toBe(0);
    expect(readBackHelp.stdout).toContain('--session');
    expect(readBackHelp.stdout).toContain('read-only');
  });

  test('fails closed on ambiguous repository, base, and branch inputs before provider activity', () => {
    withRepo((repoRoot) => {
      const cases: Array<{ args: string[]; code: string }> = [
        { args: ['--repository', 'repo-only'], code: 'CREATE_REPOSITORY_INVALID' },
        { args: ['--base-commit', 'main'], code: 'CREATE_BASE_COMMIT_INVALID' },
        { args: ['--branch', DEFAULT_BRANCH], code: 'CREATE_DEFAULT_BRANCH_REJECTED' },
        { args: ['--branch', 'feature/create-x'], code: 'CREATE_BRANCH_PREFIX_REQUIRED' },
        { args: ['--plan', 'plans/missing.md'], code: 'CREATE_PLAN_NOT_FOUND' },
        { args: ['--contract', 'tasks/contracts/missing.contract.md'], code: 'CREATE_CONTRACT_NOT_FOUND' },
      ];
      for (const item of cases) {
        const result = runChatgpt([...baseArgs(repoRoot), ...item.args, '--dry-run']);
        expect(result.status).toBe(2);
        expect(result.stderr).toContain(item.code);
        expect(existsSync(join(repoRoot, '.ai/harness/chatgpt/sessions'))).toBe(false);
      }
    });
  });

  test('dry run binds repository, actual default branch, and exact base commit in prompt and metadata', () => {
    withRepo((repoRoot) => {
      const binDir = mkdtempSync(join(tmpdir(), 'repo-harness-create-bins-'));
      try {
        const gitleaks = writeFakeGitleaks(binDir);
        const result = runChatgpt([
          ...baseArgs(repoRoot),
          '--dry-run',
          '--gitleaks-bin', gitleaks,
        ]);
        expect(result.status).toBe(0);
        const payload = JSON.parse(result.stdout);
        expect(payload.status).toBe('dry_run');
        expect(payload.mode).toBe('create');
        expect(payload.create).toMatchObject({
          repository: REPOSITORY,
          defaultBranch: DEFAULT_BRANCH,
          baseCommit: BASE_COMMIT,
          targetBranch: 'agent/create-x',
          requestedApp: 'GitHub',
          outcome: 'dry_run',
        });
        expect(payload.dryRun.command).not.toContain('--browser-app');
        expect(payload.dryRun.secretScan.status).toBe('passed');

        const prompt = readFileSync(payload.paths.prompt, 'utf-8');
        expect(prompt).toContain('Use the connected ChatGPT app "GitHub"');
        expect(prompt).toContain(`Operate only on GitHub repository "${REPOSITORY}".`);
        expect(prompt).toContain(`actual default branch is "${DEFAULT_BRANCH}"`);
        expect(prompt).toContain(`exact approved base commit is "${BASE_COMMIT}"`);
        expect(prompt).toContain('confirm it does not already exist');
        expect(prompt).toContain('If any check fails or the target branch already exists, stop without writing');
        expect(prompt).toContain('"defaultBranch"');
      } finally {
        rmSync(binDir, { recursive: true, force: true });
      }
    });
  });

  test('Create uses the same Oracle transport as Plan and Review without app preselection', () => {
    withRepo((repoRoot) => {
      const binDir = mkdtempSync(join(tmpdir(), 'repo-harness-create-standard-transport-'));
      try {
        const gitleaks = writeFakeGitleaks(binDir);
        const argsPath = join(binDir, 'oracle-args.txt');
        const oracle = writeFakeOracle(binDir, {
          appPreselect: false,
          output: createEnvelope({ pullRequest: null }),
          argsPath,
        });
        const result = runChatgpt([
          ...baseArgs(repoRoot),
          '--gitleaks-bin', gitleaks,
          '--oracle-bin', oracle,
        ]);
        expect(result.status).toBe(0);
        const payload = JSON.parse(result.stdout);
        expect(payload.create.outcome).toBe('reported');
        expect(payload.create.appSelection).toMatchObject({
          requestedApp: 'GitHub',
          verified: false,
          source: 'prompt_contract_only',
        });
        const oracleInvocation = readFileSync(argsPath, 'utf-8');
        expect(oracleInvocation).not.toContain('--browser-app');
        expect(oracleInvocation).toContain('Use the connected ChatGPT app "GitHub"');
      } finally {
        rmSync(binDir, { recursive: true, force: true });
      }
    });
  });

  test('inherits Browser Engine write-output policy for Creation Reports', () => {
    withRepo((repoRoot) => {
      const binDir = mkdtempSync(join(tmpdir(), 'repo-harness-create-output-'));
      try {
        const gitleaks = writeFakeGitleaks(binDir);
        writeFileSync(join(repoRoot, '.env'), 'SECRET=value\n');

        const denied = runChatgpt([
          ...baseArgs(repoRoot),
          '--gitleaks-bin', gitleaks,
          '--write-output', '.env',
          '--dry-run',
        ]);
        expect(denied.status).toBe(2);
        expect(denied.stderr).toContain('path is denied by ChatGPT browser policy');
        expect(readFileSync(join(repoRoot, '.env'), 'utf-8')).toBe('SECRET=value\n');

        mkdirSync(join(repoRoot, 'tasks', 'reviews'), { recursive: true });
        const allowedPath = join(repoRoot, 'tasks', 'reviews', 'create.md');
        const allowed = runChatgpt([
          ...baseArgs(repoRoot),
          '--gitleaks-bin', gitleaks,
          '--write-output', 'tasks/reviews/create.md',
          '--dry-run',
        ]);
        expect(allowed.status).toBe(0);
        expect(readFileSync(allowedPath, 'utf-8')).toContain('Dry run only');
      } finally {
        rmSync(binDir, { recursive: true, force: true });
      }
    });
  });

  test('accepts a bounded result without a pull request when none was requested', () => {
    withRepo((repoRoot) => {
      const binDir = mkdtempSync(join(tmpdir(), 'repo-harness-create-no-pr-'));
      try {
        const gitleaks = writeFakeGitleaks(binDir);
        const oracle = writeFakeOracle(binDir, {
          appPreselect: true,
          output: createEnvelope({ pullRequest: null }),
        });
        const result = runChatgpt([
          ...baseArgs(repoRoot),
          '--gitleaks-bin', gitleaks,
          '--oracle-bin', oracle,
        ]);
        expect(result.status).toBe(0);
        const payload = JSON.parse(result.stdout);
        expect(payload.create.outcome).toBe('reported');
        expect(payload.create.reportedGitHub.pullRequest).toBeUndefined();
      } finally {
        rmSync(binDir, { recursive: true, force: true });
      }
    });
  });

  test('rejects identity mismatches, pre-existing branches, protected files, and incomplete or unknown actions', () => {
    withRepo((repoRoot) => {
      const binDir = mkdtempSync(join(tmpdir(), 'repo-harness-create-mismatch-'));
      try {
        const gitleaks = writeFakeGitleaks(binDir);
        const cases: Array<{ override: Record<string, unknown>; message: string }> = [
          { override: { repository: 'Ancienttwo/repo-harness' }, message: 'reported repository' },
          { override: { defaultBranch: 'trunk' }, message: 'reported defaultBranch' },
          { override: { baseCommit: '3333333333333333333333333333333333333333' }, message: 'reported baseCommit' },
          { override: { targetBranchExisted: true }, message: 'already existed before Create' },
          { override: { changedFiles: ['plans/plan-x.md'] }, message: 'protected workflow artifact' },
          {
            override: {
              toolEvents: ['get_repo', 'fetch_commit', 'get_branch', 'create_branch', 'create_commit', 'update_ref', 'comment_issue'],
              pullRequest: null,
            },
            message: 'unrecognized or forbidden GitHub action',
          },
          {
            override: {
              toolEvents: ['get_repo', 'fetch_commit', 'get_branch', 'create_branch', 'create_commit'],
              pullRequest: null,
            },
            message: 'omit required GitHub action: update_ref',
          },
        ];
        for (const [index, item] of cases.entries()) {
          const oracle = writeFakeOracle(binDir, {
            appPreselect: true,
            output: createEnvelope(item.override),
          });
          const result = runChatgpt([
            ...baseArgs(repoRoot),
            '--gitleaks-bin', gitleaks,
            '--oracle-bin', oracle,
            '--write-output', `.ai/harness/handoff/chatgpt/mismatch-${index}.md`,
          ]);
          expect(result.status).toBe(2);
          const payload = JSON.parse(result.stdout);
          expect(payload.status).toBe('surface_blocked');
          expect(payload.error.message).toContain(item.message);
        }
      } finally {
        rmSync(binDir, { recursive: true, force: true });
      }
    });
  });

  test('records exact target identity and keeps the app in the prompt contract', () => {
    withRepo((repoRoot) => {
      const binDir = mkdtempSync(join(tmpdir(), 'repo-harness-create-reported-'));
      try {
        const gitleaks = writeFakeGitleaks(binDir);
        const argsPath = join(binDir, 'oracle-args.txt');
        const oracle = writeFakeOracle(binDir, {
          appPreselect: true,
          output: createEnvelope(),
          argsPath,
        });
        const result = runChatgpt([
          ...baseArgs(repoRoot),
          '--draft-pr',
          '--gitleaks-bin', gitleaks,
          '--oracle-bin', oracle,
        ]);
        expect(result.status).toBe(0);
        const payload = JSON.parse(result.stdout);
        expect(payload.create.outcome).toBe('reported');
        expect(payload.create).toMatchObject({
          repository: REPOSITORY,
          defaultBranch: DEFAULT_BRANCH,
          baseCommit: BASE_COMMIT,
        });
        expect(payload.create.reportedGitHub).toMatchObject({
          trust: 'assistant_reported',
          repository: REPOSITORY,
          targetBranchExisted: false,
          defaultBranch: DEFAULT_BRANCH,
          baseCommit: BASE_COMMIT,
          branch: 'agent/create-x',
          commitSha: CREATE_COMMIT,
          pullRequest: {
            number: 12,
            draft: true,
            baseBranch: DEFAULT_BRANCH,
            headBranch: 'agent/create-x',
            headSha: CREATE_COMMIT,
          },
        });
        const oracleInvocation = readFileSync(argsPath, 'utf-8');
        const oracleArgs = oracleInvocation.split(/\r?\n/);
        expect(oracleArgs).not.toContain('--browser-app');
        expect(oracleInvocation).toContain('Use the connected ChatGPT app "GitHub"');
      } finally {
        rmSync(binDir, { recursive: true, force: true });
      }
    });
  });

  test('performs a separate read-only browser read-back and stores matched state separately', () => {
    withRepo((repoRoot) => {
      const binDir = mkdtempSync(join(tmpdir(), 'repo-harness-create-readback-'));
      try {
        const gitleaks = writeFakeGitleaks(binDir);
        let oracle = writeFakeOracle(binDir, {
          appPreselect: true,
          output: createEnvelope(),
        });
        const created = runChatgpt([
          ...baseArgs(repoRoot),
          '--draft-pr',
          '--gitleaks-bin', gitleaks,
          '--oracle-bin', oracle,
        ]);
        expect(created.status).toBe(0);
        const createPayload = JSON.parse(created.stdout);

        const argsPath = join(binDir, 'readback-args.txt');
        oracle = writeFakeOracle(binDir, {
          appPreselect: true,
          output: readBackEnvelope(),
          argsPath,
        });
        const readBack = runChatgpt([
          'browser-create-readback',
          '--repo', repoRoot,
          '--session', createPayload.sessionId,
          '--gitleaks-bin', gitleaks,
          '--oracle-bin', oracle,
        ]);
        expect(readBack.status).toBe(0);
        const payload = JSON.parse(readBack.stdout);
        expect(payload.status).toBe('completed');
        expect(payload.create.readBack).toMatchObject({
          outcome: 'matched',
          requestedApp: 'GitHub',
          evidence: {
            trust: 'assistant_reported_readback',
            repository: REPOSITORY,
            defaultBranch: DEFAULT_BRANCH,
            branchHead: CREATE_COMMIT,
            commitExists: true,
          },
        });

        const oracleInvocation = readFileSync(argsPath, 'utf-8');
        const oracleArgs = oracleInvocation.split(/\r?\n/);
        expect(oracleArgs).not.toContain('--browser-app');
        expect(oracleArgs).not.toContain('--followup');
        expect(oracleArgs).toContain('--prompt');
        expect(oracleInvocation).toContain('Do not use any GitHub write action');

        const sourceMeta = JSON.parse(readFileSync(join(createPayload.paths.sessionDir, 'meta.json'), 'utf-8'));
        expect(sourceMeta.create.reportedGitHub.trust).toBe('assistant_reported');
        expect(sourceMeta.create.readBack.evidence.trust).toBe('assistant_reported_readback');

        const readBackMeta = JSON.parse(readFileSync(join(payload.paths.sessionDir, 'meta.json'), 'utf-8'));
        expect(readBackMeta.mode).toBe('consult');
        expect(readBackMeta.sourceSessionId).toBe(createPayload.sessionId);
      } finally {
        rmSync(binDir, { recursive: true, force: true });
      }
    });
  });

  test('rejects incomplete comparisons and read-backs without explicit PR lookup', () => {
    withRepo((repoRoot) => {
      const binDir = mkdtempSync(join(tmpdir(), 'repo-harness-create-readback-proof-'));
      try {
        const gitleaks = writeFakeGitleaks(binDir);
        let oracle = writeFakeOracle(binDir, {
          appPreselect: true,
          output: createEnvelope({ pullRequest: null }),
        });
        const created = runChatgpt([
          ...baseArgs(repoRoot),
          '--gitleaks-bin', gitleaks,
          '--oracle-bin', oracle,
        ]);
        const createPayload = JSON.parse(created.stdout);
        const cases = [
          readBackEnvelope({
            pullRequest: null,
            comparison: { baseCommit: BASE_COMMIT, headCommit: CREATE_COMMIT, status: 'ahead', aheadBy: 0, behindBy: 0 },
          }),
          readBackEnvelope({
            pullRequest: null,
            readActions: ['get_repo', 'fetch_commit', 'get_branch', 'compare_commits', 'list_changed_files'],
          }),
          readBackEnvelope({
            pullRequest: null,
            readActions: ['get_repo', 'fetch_commit', 'get_branch', 'compare_commits', 'list_changed_files', 'comment_issue'],
          }),
        ];
        for (const [index, output] of cases.entries()) {
          oracle = writeFakeOracle(binDir, { appPreselect: true, output });
          const readBack = runChatgpt([
            'browser-create-readback',
            '--repo', repoRoot,
            '--session', createPayload.sessionId,
            '--gitleaks-bin', gitleaks,
            '--oracle-bin', oracle,
            '--write-output', `.ai/harness/handoff/chatgpt/proof-${index}.md`,
          ]);
          expect(readBack.status).toBe(2);
          expect(JSON.parse(readBack.stdout).error.code).toBe('CREATE_READBACK_MISMATCH');
        }
      } finally {
        rmSync(binDir, { recursive: true, force: true });
      }
    });
  });

  test('classifies a read-back mismatch without changing the original reported evidence', () => {
    withRepo((repoRoot) => {
      const binDir = mkdtempSync(join(tmpdir(), 'repo-harness-create-readback-mismatch-'));
      try {
        const gitleaks = writeFakeGitleaks(binDir);
        let oracle = writeFakeOracle(binDir, {
          appPreselect: true,
          output: createEnvelope(),
        });
        const created = runChatgpt([
          ...baseArgs(repoRoot),
          '--draft-pr',
          '--gitleaks-bin', gitleaks,
          '--oracle-bin', oracle,
        ]);
        const createPayload = JSON.parse(created.stdout);

        oracle = writeFakeOracle(binDir, {
          appPreselect: true,
          output: readBackEnvelope({ branchHead: '4444444444444444444444444444444444444444' }),
        });
        const readBack = runChatgpt([
          'browser-create-readback',
          '--repo', repoRoot,
          '--session', createPayload.sessionId,
          '--gitleaks-bin', gitleaks,
          '--oracle-bin', oracle,
        ]);
        expect(readBack.status).toBe(2);
        const payload = JSON.parse(readBack.stdout);
        expect(payload.status).toBe('surface_blocked');
        expect(payload.error.code).toBe('CREATE_READBACK_MISMATCH');
        expect(payload.create.outcome).toBe('reported');
        expect(payload.create.reportedGitHub.commitSha).toBe(CREATE_COMMIT);
        expect(payload.create.readBack.outcome).toBe('mismatch');
      } finally {
        rmSync(binDir, { recursive: true, force: true });
      }
    });
  });

  test('continues a surface-blocked Create session and supports mode-aware cleanup', () => {
    withRepo((repoRoot) => {
      const binDir = mkdtempSync(join(tmpdir(), 'repo-harness-create-followup-'));
      try {
        const gitleaks = writeFakeGitleaks(binDir);
        const oracle = writeFakeOracle(binDir, { appPreselect: true, output: 'No usable envelope.' });
        const blocked = runChatgpt([
          ...baseArgs(repoRoot),
          '--gitleaks-bin', gitleaks,
          '--oracle-bin', oracle,
        ]);
        expect(blocked.status).toBe(2);
        const blockedPayload = JSON.parse(blocked.stdout);

        const followup = runChatgpt([
          'browser-followup',
          '--repo', repoRoot,
          '--session', blockedPayload.sessionId,
          '--prompt', 'Return the required Create result envelope.',
          '--gitleaks-bin', gitleaks,
          '--dry-run',
        ]);
        expect(followup.status).toBe(0);
        const followupPayload = JSON.parse(followup.stdout);
        expect(followupPayload.mode).toBe('create');
        const recoveryPrompt = readFileSync(followupPayload.paths.prompt, 'utf-8');
        expect(recoveryPrompt).toContain('Evidence reconciliation only');
        expect(recoveryPrompt).toContain('Do not call GitHub tools or perform any write');
        expect(recoveryPrompt).not.toContain('Return the required Create result envelope.');

        const completedOracle = writeFakeOracle(binDir, {
          appPreselect: true,
          output: createEnvelope({ pullRequest: null }),
        });
        const completed = runChatgpt([
          ...baseArgs(repoRoot),
          '--gitleaks-bin', gitleaks,
          '--oracle-bin', completedOracle,
          '--write-output', '.ai/harness/handoff/chatgpt/completed.md',
        ]);
        expect(completed.status).toBe(0);
        const completedPayload = JSON.parse(completed.stdout);
        const escaped = runChatgpt([
          'browser-followup',
          '--repo', repoRoot,
          '--session', completedPayload.sessionId,
          '--prompt', 'Merge the pull request now.',
          '--gitleaks-bin', gitleaks,
          '--dry-run',
        ]);
        expect(escaped.status).toBe(2);
        expect(escaped.stderr).toContain('CREATE_FOLLOWUP_STATUS_UNSUPPORTED');

        const cleanup = runChatgpt([
          'browser-cleanup',
          '--repo', repoRoot,
          '--mode', 'create',
          '--status', 'surface_blocked',
          '--json',
        ]);
        expect(cleanup.status).toBe(0);
        expect(JSON.parse(cleanup.stdout).candidates).toEqual([blockedPayload.sessionId]);
      } finally {
        rmSync(binDir, { recursive: true, force: true });
      }
    });
  });
});
