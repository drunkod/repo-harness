import { expect, test } from 'bun:test';
import { spawnSync } from 'child_process';
import { join } from 'path';

const ROOT = join(import.meta.dir, '../..');
const CLI = join(ROOT, 'src/cli/index.ts');
const enabled = process.env.REPO_HARNESS_LIVE_CHATGPT_CREATE === '1';
const liveTest = enabled ? test : test.skip;

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required when REPO_HARNESS_LIVE_CHATGPT_CREATE=1`);
  return value;
}

function runChatgpt(args: string[], cwd: string) {
  return spawnSync('bun', [CLI, 'chatgpt', ...args], {
    cwd,
    encoding: 'utf-8',
    env: process.env,
    timeout: 60 * 60 * 1000,
    maxBuffer: 16 * 1024 * 1024,
  });
}

liveTest('opens ChatGPT Web, writes through the GitHub app, and reads the result back in a new browser session', () => {
  const repoRoot = requiredEnv('REPO_HARNESS_LIVE_CREATE_REPO_ROOT');
  const repository = requiredEnv('REPO_HARNESS_LIVE_CREATE_REPOSITORY');
  const defaultBranch = requiredEnv('REPO_HARNESS_LIVE_CREATE_DEFAULT_BRANCH');
  const baseCommit = requiredEnv('REPO_HARNESS_LIVE_CREATE_BASE_COMMIT');
  const branch = requiredEnv('REPO_HARNESS_LIVE_CREATE_BRANCH');
  const plan = requiredEnv('REPO_HARNESS_LIVE_CREATE_PLAN');
  const contract = requiredEnv('REPO_HARNESS_LIVE_CREATE_CONTRACT');
  const targetFile = requiredEnv('REPO_HARNESS_LIVE_CREATE_FILE');
  const app = process.env.REPO_HARNESS_LIVE_CREATE_APP?.trim() || 'GitHub';

  if (!branch.startsWith('agent/')) throw new Error('REPO_HARNESS_LIVE_CREATE_BRANCH must use agent/*');
  if (branch === defaultBranch) throw new Error('live Create branch must differ from the default branch');
  if (!/^[0-9a-f]{40}$/i.test(baseCommit)) throw new Error('REPO_HARNESS_LIVE_CREATE_BASE_COMMIT must be a full SHA');

  const prompt = [
    `Create only "${targetFile}".`,
    'Write a short marker stating that this is the repo-harness live ChatGPT GitHub-app Create smoke test.',
    'Do not change any other file.',
    'Commit the change and open a draft pull request.',
  ].join(' ');

  const create = runChatgpt([
    'browser-create',
    '--repo', repoRoot,
    '--chatgpt-app', app,
    '--repository', repository,
    '--default-branch', defaultBranch,
    '--base-commit', baseCommit,
    '--branch', branch,
    '--plan', plan,
    '--contract', contract,
    '--prompt', prompt,
    '--draft-pr',
  ], repoRoot);

  expect(create.status).toBe(0);
  const created = JSON.parse(create.stdout);
  expect(created.status).toBe('completed');
  expect(created.create.outcome).toBe('reported');
  expect(created.create.reportedGitHub).toMatchObject({
    repository,
    defaultBranch,
    baseCommit: baseCommit.toLowerCase(),
    branch,
    pullRequest: { draft: true, baseBranch: defaultBranch, headBranch: branch },
  });
  expect(created.create.reportedGitHub.changedFiles).toEqual([targetFile]);

  const readBack = runChatgpt([
    'browser-create-readback',
    '--repo', repoRoot,
    '--session', created.sessionId,
  ], repoRoot);

  expect(readBack.status).toBe(0);
  const verified = JSON.parse(readBack.stdout);
  expect(verified.status).toBe('completed');
  expect(verified.readBackSessionId).not.toBe(created.sessionId);
  expect(verified.create.readBack).toMatchObject({
    outcome: 'matched',
    evidence: {
      trust: 'assistant_reported_readback',
      repository,
      defaultBranch,
      branch,
      commitExists: true,
      changedFiles: [targetFile],
      comparison: { baseCommit: baseCommit.toLowerCase(), status: 'ahead' },
    },
  });
});
