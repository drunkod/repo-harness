import { describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';

const ROOT = join(import.meta.dir, '../..');
const CLI = join(ROOT, 'src/cli/index.ts');

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

function writeFakeOracle(dir: string, opts: { appPreselect: boolean; output?: string }): string {
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
    "if (process.argv.includes('--version')) { console.log('0.16.1'); process.exit(0); }",
    "if (process.argv.includes('--help') || process.argv.includes('--debug-help')) { console.log(HELP); process.exit(0); }",
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
    '--base', 'main',
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
      repository: 'drunkod/repo-harness',
      baseCommit: '1111111111111111111111111111111111111111',
      branch: 'agent/create-x',
      commitSha: '2222222222222222222222222222222222222222',
      pullRequest: { number: 12, url: 'https://github.com/drunkod/repo-harness/pull/12', draft: true },
      changedFiles: ['docs/example.md'],
      toolEvents: ['create_branch', 'create_commit', 'update_ref', 'create_pull_request'],
      ...overrides,
    }, null, 2),
    '```',
  ].join('\n');
}

describe('chatgpt browser-create', () => {
  test('exposes the first-class Create command and required flags', () => {
    const root = runChatgpt(['--help']);
    expect(root.status).toBe(0);
    expect(root.stdout).toContain('browser-create');

    const help = runChatgpt(['browser-create', '--help']);
    expect(help.status).toBe(0);
    for (const flag of ['--repo', '--chatgpt-app', '--base', '--branch', '--plan', '--contract']) {
      expect(help.stdout).toContain(flag);
    }
    expect(help.stdout).toContain('Create always requires secret scanning');
  });

  test('rejects default branches and missing plan or contract before provider activity', () => {
    withRepo((repoRoot) => {
      const defaultBranch = runChatgpt([
        ...baseArgs(repoRoot),
        '--branch', 'main',
        '--dry-run',
      ]);
      expect(defaultBranch.status).toBe(2);
      expect(defaultBranch.stderr).toContain('CREATE_DEFAULT_BRANCH_REJECTED');
      expect(existsSync(join(repoRoot, '.ai/harness/chatgpt/sessions'))).toBe(false);

      const missingPlan = runChatgpt([
        ...baseArgs(repoRoot),
        '--plan', 'plans/missing.md',
        '--dry-run',
      ]);
      expect(missingPlan.status).toBe(2);
      expect(missingPlan.stderr).toContain('CREATE_PLAN_NOT_FOUND');
      expect(existsSync(join(repoRoot, '.ai/harness/chatgpt/sessions'))).toBe(false);
    });
  });

  test('dry run builds the bounded prompt, scans it, passes --browser-app, and records mode=create', () => {
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
          baseRef: 'main',
          targetBranch: 'agent/create-x',
          planPath: 'plans/plan-x.md',
          contractPath: 'tasks/contracts/x.contract.md',
          requestedApp: 'GitHub',
          outcome: 'dry_run',
        });
        expect(payload.create.creationReportPath).toContain('.ai/harness/handoff/chatgpt/create-');
        expect(payload.dryRun.command).toContain('--browser-app');
        expect(payload.dryRun.command).toContain('GitHub');
        expect(payload.dryRun.secretScan.status).toBe('passed');
        const prompt = readFileSync(payload.paths.prompt, 'utf-8');
        expect(prompt).toContain('repo-harness-create-result');
        expect(prompt).toContain('Do not write to the default branch or force-update a ref.');

        const listed = runChatgpt(['browser-list', '--repo', repoRoot, '--mode', 'create', '--json']);
        expect(listed.status).toBe(0);
        const sessions = JSON.parse(listed.stdout).sessions;
        expect(sessions).toHaveLength(1);
        expect(sessions[0]).toMatchObject({ mode: 'create', status: 'dry_run', createOutcome: 'dry_run' });
      } finally {
        rmSync(binDir, { recursive: true, force: true });
      }
    });
  });

  test('fails before browser launch when Oracle lacks --browser-app', () => {
    withRepo((repoRoot) => {
      const binDir = mkdtempSync(join(tmpdir(), 'repo-harness-create-no-app-'));
      try {
        const gitleaks = writeFakeGitleaks(binDir);
        const oracle = writeFakeOracle(binDir, { appPreselect: false });
        const result = runChatgpt([
          ...baseArgs(repoRoot),
          '--gitleaks-bin', gitleaks,
          '--oracle-bin', oracle,
        ]);
        expect(result.status).toBe(2);
        expect(result.stderr).toContain('ORACLE_APP_PRESELECT_UNSUPPORTED');
        expect(existsSync(join(repoRoot, '.ai/harness/chatgpt/sessions'))).toBe(false);
      } finally {
        rmSync(binDir, { recursive: true, force: true });
      }
    });
  });

  test('records assistant-reported GitHub identifiers separately from the provider output', () => {
    withRepo((repoRoot) => {
      const binDir = mkdtempSync(join(tmpdir(), 'repo-harness-create-reported-'));
      try {
        const gitleaks = writeFakeGitleaks(binDir);
        const oracle = writeFakeOracle(binDir, { appPreselect: true, output: createEnvelope() });
        const result = runChatgpt([
          ...baseArgs(repoRoot),
          '--draft-pr',
          '--gitleaks-bin', gitleaks,
          '--oracle-bin', oracle,
        ]);
        expect(result.status).toBe(0);
        const payload = JSON.parse(result.stdout);
        expect(payload.status).toBe('completed');
        expect(payload.mode).toBe('create');
        expect(payload.create.outcome).toBe('reported');
        expect(payload.create.appSelection).toEqual({
          requestedApp: 'GitHub',
          reportedSelectedApp: 'GitHub',
          verified: false,
          source: 'oracle_request_only',
        });
        expect(payload.create.reportedGitHub).toMatchObject({
          trust: 'assistant_reported',
          repository: 'drunkod/repo-harness',
          branch: 'agent/create-x',
          commitSha: '2222222222222222222222222222222222222222',
          pullRequest: { number: 12, draft: true },
          toolEvents: ['create_branch', 'create_commit', 'update_ref', 'create_pull_request'],
        });
        const meta = JSON.parse(readFileSync(join(payload.paths.sessionDir, 'meta.json'), 'utf-8'));
        expect(meta.mode).toBe('create');
        expect(meta.create.reportedGitHub.trust).toBe('assistant_reported');
      } finally {
        rmSync(binDir, { recursive: true, force: true });
      }
    });
  });

  test('classifies completed browser output without usable GitHub evidence as surface_blocked', () => {
    withRepo((repoRoot) => {
      const binDir = mkdtempSync(join(tmpdir(), 'repo-harness-create-blocked-'));
      try {
        const gitleaks = writeFakeGitleaks(binDir);
        const oracle = writeFakeOracle(binDir, { appPreselect: true, output: 'Done, files created.' });
        const result = runChatgpt([
          ...baseArgs(repoRoot),
          '--gitleaks-bin', gitleaks,
          '--oracle-bin', oracle,
        ]);
        expect(result.status).toBe(2);
        const payload = JSON.parse(result.stdout);
        expect(payload.status).toBe('surface_blocked');
        expect(payload.create.outcome).toBe('surface_blocked');
        expect(payload.error.code).toBe('CREATE_SURFACE_BLOCKED');
        const meta = JSON.parse(readFileSync(join(payload.paths.sessionDir, 'meta.json'), 'utf-8'));
        expect(meta.status).toBe('surface_blocked');
        expect(meta.error.code).toBe('CREATE_SURFACE_BLOCKED');
      } finally {
        rmSync(binDir, { recursive: true, force: true });
      }
    });
  });

  test('rejects a reported branch mismatch as surface_blocked', () => {
    withRepo((repoRoot) => {
      const binDir = mkdtempSync(join(tmpdir(), 'repo-harness-create-mismatch-'));
      try {
        const gitleaks = writeFakeGitleaks(binDir);
        const oracle = writeFakeOracle(binDir, {
          appPreselect: true,
          output: createEnvelope({ branch: 'main' }),
        });
        const result = runChatgpt([
          ...baseArgs(repoRoot),
          '--gitleaks-bin', gitleaks,
          '--oracle-bin', oracle,
        ]);
        expect(result.status).toBe(2);
        const payload = JSON.parse(result.stdout);
        expect(payload.status).toBe('surface_blocked');
        expect(payload.error.message).toContain('does not match agent/create-x');
      } finally {
        rmSync(binDir, { recursive: true, force: true });
      }
    });
  });
});
