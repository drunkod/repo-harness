import { describe, expect, test } from 'bun:test';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';

const ROOT = join(import.meta.dir, '../..');
const CLI = join(ROOT, 'src/cli/index.ts');
const REPOSITORY = 'owner/repository';
const DEFAULT_BRANCH = 'main';
const BASE_COMMIT = '1111111111111111111111111111111111111111';
const CREATE_COMMIT = '2222222222222222222222222222222222222222';

function runChatgpt(args: string[], cwd = ROOT) {
  return spawnSync('bun', [CLI, 'chatgpt', ...args], {
    cwd,
    encoding: 'utf-8',
    env: process.env,
  });
}

function withRepo<T>(fn: (repoRoot: string) => T): T {
  const repoRoot = mkdtempSync(join(tmpdir(), 'repo-harness-create-readback-'));
  try {
    mkdirSync(join(repoRoot, 'plans'), { recursive: true });
    mkdirSync(join(repoRoot, 'tasks', 'contracts'), { recursive: true });
    writeFileSync(join(repoRoot, 'plans', 'plan.md'), '# Plan\n');
    writeFileSync(join(repoRoot, 'tasks', 'contracts', 'task.contract.md'), '# Contract\n');
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

function writeFakeOracle(dir: string, output: string): string {
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
    '--browser-app',
  ].join(' ');
  writeFileSync(path, [
    '#!/usr/bin/env bun',
    `const HELP = ${JSON.stringify(flags)};`,
    `const OUTPUT = ${JSON.stringify(output)};`,
    "if (process.argv.includes('--version')) { console.log('0.16.1'); process.exit(0); }",
    "if (process.argv.includes('--help') || process.argv.includes('--debug-help')) { console.log(HELP); process.exit(0); }",
    "const index = process.argv.indexOf('--write-output');",
    'if (index >= 0) await Bun.write(process.argv[index + 1], OUTPUT);',
    "console.log('Session: fake-readback-session');",
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
    '--branch', 'agent/create-readback-test',
    '--plan', 'plans/plan.md',
    '--contract', 'tasks/contracts/task.contract.md',
    '--prompt', 'Create the bounded test change.',
  ];
}

function createEnvelope(): string {
  return [
    '```repo-harness-create-result',
    JSON.stringify({
      selectedApp: 'GitHub',
      repository: REPOSITORY,
      defaultBranch: DEFAULT_BRANCH,
      baseCommit: BASE_COMMIT,
      branch: 'agent/create-readback-test',
      targetBranchExisted: false,
      commitSha: CREATE_COMMIT,
      pullRequest: {
        number: 12,
        url: `https://github.com/${REPOSITORY}/pull/12`,
        draft: true,
        baseBranch: DEFAULT_BRANCH,
        headBranch: 'agent/create-readback-test',
        headSha: CREATE_COMMIT,
      },
      changedFiles: ['docs/example.md'],
      toolEvents: ['get_repo', 'fetch_commit', 'get_branch', 'create_branch', 'create_commit', 'update_ref', 'create_pull_request'],
    }, null, 2),
    '```',
  ].join('\n');
}

function readBackEnvelope(): string {
  return [
    '```repo-harness-create-readback-result',
    JSON.stringify({
      selectedApp: 'GitHub',
      repository: REPOSITORY,
      defaultBranch: DEFAULT_BRANCH,
      baseCommit: BASE_COMMIT,
      branch: 'agent/create-readback-test',
      branchHead: CREATE_COMMIT,
      commitSha: CREATE_COMMIT,
      commitExists: true,
      pullRequest: {
        number: 12,
        url: `https://github.com/${REPOSITORY}/pull/12`,
        draft: true,
        baseBranch: DEFAULT_BRANCH,
        headBranch: 'agent/create-readback-test',
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
    }, null, 2),
    '```',
  ].join('\n');
}

function createReportedSession(repoRoot: string, binDir: string) {
  const gitleaks = writeFakeGitleaks(binDir);
  const oracle = writeFakeOracle(binDir, createEnvelope());
  const result = runChatgpt([
    ...baseArgs(repoRoot),
    '--draft-pr',
    '--gitleaks-bin', gitleaks,
    '--oracle-bin', oracle,
  ]);
  expect(result.status).toBe(0);
  return {
    payload: JSON.parse(result.stdout),
    gitleaks,
  };
}

describe('chatgpt browser-create read-back contract', () => {
  test('returns and persists a distinct readBackSessionId', () => {
    withRepo((repoRoot) => {
      const binDir = mkdtempSync(join(tmpdir(), 'repo-harness-readback-bins-'));
      try {
        const { payload: created, gitleaks } = createReportedSession(repoRoot, binDir);
        const oracle = writeFakeOracle(binDir, readBackEnvelope());
        const result = runChatgpt([
          'browser-create-readback',
          '--repo', repoRoot,
          '--session', created.sessionId,
          '--gitleaks-bin', gitleaks,
          '--oracle-bin', oracle,
        ]);
        expect(result.status).toBe(0);
        const verified = JSON.parse(result.stdout);
        expect(verified.createSessionId).toBe(created.sessionId);
        expect(verified.readBackSessionId).not.toBe(created.sessionId);
        expect(verified.create.readBack.sessionId).toBe(verified.readBackSessionId);
        expect(verified.create.readBack.outcome).toBe('matched');

        const sourceMeta = JSON.parse(readFileSync(join(created.paths.sessionDir, 'meta.json'), 'utf-8'));
        expect(sourceMeta.create.readBack.sessionId).toBe(verified.readBackSessionId);
        expect(sourceMeta.create.reportedGitHub.commitSha).toBe(CREATE_COMMIT);
      } finally {
        rmSync(binDir, { recursive: true, force: true });
      }
    });
  });

  test('requires a validated Create result before allocating read-back state', () => {
    withRepo((repoRoot) => {
      const binDir = mkdtempSync(join(tmpdir(), 'repo-harness-readback-required-'));
      try {
        const gitleaks = writeFakeGitleaks(binDir);
        const created = runChatgpt([
          ...baseArgs(repoRoot),
          '--gitleaks-bin', gitleaks,
          '--dry-run',
        ]);
        expect(created.status).toBe(0);
        const payload = JSON.parse(created.stdout);
        const sessionRoot = join(repoRoot, '.ai', 'harness', 'chatgpt', 'sessions');
        expect(readdirSync(sessionRoot)).toEqual([payload.sessionId]);

        const readBack = runChatgpt([
          'browser-create-readback',
          '--repo', repoRoot,
          '--session', payload.sessionId,
          '--dry-run',
        ]);
        expect(readBack.status).toBe(2);
        expect(readBack.stderr).toContain('CREATE_READBACK_RESULT_REQUIRED');
        expect(readdirSync(sessionRoot)).toEqual([payload.sessionId]);
      } finally {
        rmSync(binDir, { recursive: true, force: true });
      }
    });
  });

  test('classifies malformed independent output without overwriting Create evidence', () => {
    withRepo((repoRoot) => {
      const binDir = mkdtempSync(join(tmpdir(), 'repo-harness-readback-blocked-'));
      try {
        const { payload: created, gitleaks } = createReportedSession(repoRoot, binDir);
        const oracle = writeFakeOracle(binDir, 'Read-back completed without the required envelope.');
        const result = runChatgpt([
          'browser-create-readback',
          '--repo', repoRoot,
          '--session', created.sessionId,
          '--gitleaks-bin', gitleaks,
          '--oracle-bin', oracle,
        ]);
        expect(result.status).toBe(2);
        const blocked = JSON.parse(result.stdout);
        expect(blocked.error.code).toBe('CREATE_READBACK_SURFACE_BLOCKED');
        expect(blocked.readBackSessionId).not.toBe(created.sessionId);
        expect(blocked.create.outcome).toBe('reported');
        expect(blocked.create.reportedGitHub.commitSha).toBe(CREATE_COMMIT);
        expect(blocked.create.readBack.outcome).toBe('surface_blocked');
      } finally {
        rmSync(binDir, { recursive: true, force: true });
      }
    });
  });
});
