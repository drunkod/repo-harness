import { expect, test } from 'bun:test';
import { spawnSync, type SpawnSyncReturns } from 'child_process';
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

function runChatgpt(args: string[], cwd: string): SpawnSyncReturns<string> {
  return spawnSync('bun', [CLI, 'chatgpt', ...args], {
    cwd,
    encoding: 'utf-8',
    env: process.env,
    timeout: 60 * 60 * 1000,
    maxBuffer: 16 * 1024 * 1024,
  });
}

function parseSuccessfulJson(result: SpawnSyncReturns<string>, label: string): Record<string, any> {
  if (result.status !== 0) {
    throw new Error([
      `${label} exited ${result.status ?? 'without a status'}`,
      result.error ? `spawn error: ${result.error.message}` : '',
      result.stderr.trim() ? `stderr:\n${result.stderr.trim()}` : '',
      result.stdout.trim() ? `stdout:\n${result.stdout.trim()}` : '',
    ].filter(Boolean).join('\n\n'));
  }
  try {
    return JSON.parse(result.stdout) as Record<string, any>;
  } catch (error) {
    throw new Error(`${label} returned non-JSON stdout: ${(error as Error).message}\n${result.stdout}`);
  }
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

  if (!/^[^/\s]+\/[^/\s]+$/.test(repository)) {
    throw new Error('REPO_HARNESS_LIVE_CREATE_REPOSITORY must use owner/name form');
  }
  if (!branch.startsWith('agent/')) {
    throw new Error('REPO_HARNESS_LIVE_CREATE_BRANCH must use agent/*');
  }
  if (branch === defaultBranch) {
    throw new Error('live Create branch must differ from the default branch');
  }
  if (!/^[0-9a-f]{40}$/i.test(baseCommit)) {
    throw new Error('REPO_HARNESS_LIVE_CREATE_BASE_COMMIT must be a full SHA');
  }
  if (targetFile === plan || targetFile === contract) {
    throw new Error('REPO_HARNESS_LIVE_CREATE_FILE must differ from the plan and contract');
  }

  const prompt = [
    `Create only "${targetFile}".`,
    'Write a short marker stating that this is the repo-harness live ChatGPT GitHub-app Create smoke test.',
    'Do not change any other file.',
    'Commit the change and open a draft pull request.',
  ].join(' ');

  const create = parseSuccessfulJson(runChatgpt([
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
  ], repoRoot), 'browser-create');

  expect(create.status).toBe('completed');
  expect(create.create.outcome).toBe('reported');
  expect(create.create.reportedGitHub).toMatchObject({
    trust: 'assistant_reported',
    repository,
    defaultBranch,
    baseCommit: baseCommit.toLowerCase(),
    branch,
    pullRequest: { draft: true, baseBranch: defaultBranch, headBranch: branch },
  });
  expect(create.create.reportedGitHub.changedFiles).toEqual([targetFile]);

  const reported = create.create.reportedGitHub;
  const readBack = parseSuccessfulJson(runChatgpt([
    'browser-create-readback',
    '--repo', repoRoot,
    '--session', create.sessionId,
  ], repoRoot), 'browser-create-readback');

  expect(readBack.status).toBe('completed');
  expect(readBack.createSessionId).toBe(create.sessionId);
  expect(readBack.readBackSessionId).not.toBe(create.sessionId);
  expect(readBack.create.readBack.sessionId).toBe(readBack.readBackSessionId);
  expect(readBack.create.readBack).toMatchObject({
    outcome: 'matched',
    requestedApp: app,
    evidence: {
      trust: 'assistant_reported_readback',
      repository,
      defaultBranch,
      baseCommit: baseCommit.toLowerCase(),
      branch,
      branchHead: reported.commitSha,
      commitSha: reported.commitSha,
      commitExists: true,
      changedFiles: [targetFile],
      comparison: {
        baseCommit: baseCommit.toLowerCase(),
        headCommit: reported.commitSha,
        status: 'ahead',
      },
      pullRequest: {
        number: reported.pullRequest.number,
        url: reported.pullRequest.url,
        draft: true,
        baseBranch: defaultBranch,
        headBranch: branch,
        headSha: reported.commitSha,
      },
    },
  });
});
