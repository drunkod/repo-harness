import { existsSync } from 'fs';
import { isAbsolute, posix, relative, resolve } from 'path';
import { runBrowserConsult } from './engine';
import { readBrowserSession, updateBrowserSessionMeta } from './session-store';
import type {
  BrowserConsultInput,
  BrowserConsultResult,
  BrowserCreateInput,
  BrowserCreatePullRequestEvidence,
  BrowserCreateReadBackEvidence,
  BrowserCreateReadBackInput,
  BrowserCreateReadBackMeta,
  BrowserCreateReadBackResult,
  BrowserCreateReportedGitHubEvidence,
  BrowserCreateSessionContext,
} from './types';

const CREATE_RESULT_FENCE = 'repo-harness-create-result';
const CREATE_READBACK_RESULT_FENCE = 'repo-harness-create-readback-result';
const REQUIRED_BRANCH_PREFIX = 'agent/';

const CREATE_REQUIRED_ACTIONS = new Set([
  'get_repo',
  'fetch_commit',
  'get_branch',
  'create_branch',
  'create_commit',
  'update_ref',
]);

const CREATE_ALLOWED_ACTIONS = new Set([
  ...CREATE_REQUIRED_ACTIONS,
  'get_file',
  'create_file',
  'update_file',
  'delete_file',
  'create_blob',
  'create_tree',
  'create_pull_request',
]);

const READBACK_REQUIRED_ACTIONS = new Set([
  'get_repo',
  'fetch_commit',
  'get_branch',
  'compare_commits',
  'list_changed_files',
]);

const READBACK_ALLOWED_ACTIONS = new Set([
  ...READBACK_REQUIRED_ACTIONS,
  'get_pr_info',
  'fetch_pr',
  'list_pull_requests',
  'search_pull_requests',
]);

const PR_READ_ACTIONS = new Set([
  'get_pr_info',
  'fetch_pr',
  'list_pull_requests',
  'search_pull_requests',
]);

export class CreatePreconditionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly recovery?: string,
  ) {
    super(`${code}: ${message}`);
    this.name = 'CreatePreconditionError';
  }
}

class CreateReadBackMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CreateReadBackMismatchError';
  }
}

function requiredText(code: string, label: string, value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new CreatePreconditionError(code, `${label} is required for browser-create`);
  return trimmed;
}

function assertRepoRelativeInput(code: string, label: string, repoRoot: string, path: string): void {
  if (isAbsolute(path)) {
    throw new CreatePreconditionError(code, `${label} must be repo-relative: ${path}`);
  }
  const absolute = resolve(repoRoot, path);
  const relativePath = relative(resolve(repoRoot), absolute);
  if (relativePath === '..' || relativePath.startsWith('../') || isAbsolute(relativePath)) {
    throw new CreatePreconditionError(code, `${label} escapes the repository: ${path}`);
  }
  if (!existsSync(absolute)) {
    throw new CreatePreconditionError(code, `${label} does not exist: ${path}`);
  }
}

function assertRepositoryName(value: string, errorFactory: (message: string) => Error = (message) => new Error(message)): void {
  if (!/^[^/\s]+\/[^/\s]+$/.test(value)) throw errorFactory('repository must use owner/name form');
}

function assertFullCommitSha(value: string, field: string, errorFactory: (message: string) => Error = (message) => new Error(message)): void {
  if (!/^[0-9a-f]{40}$/i.test(value)) throw errorFactory(`${field} must be a full 40-character commit SHA`);
}

function assertBranchName(value: string, label: string, errorFactory: (message: string) => Error): void {
  const invalid =
    !/^[A-Za-z0-9._/-]+$/.test(value)
    || value.startsWith('/')
    || value.endsWith('/')
    || value.includes('//')
    || value.includes('..')
    || value.includes('@{')
    || value.endsWith('.lock');
  if (invalid) throw errorFactory(`${label} is not a safe Git branch name: ${value}`);
}

function sameRepository(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function sameSha(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function sameStringSet(left: string[], right: string[]): boolean {
  const a = sortedUnique(left);
  const b = sortedUnique(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function defaultCreateReportPath(targetBranch: string, date = new Date()): string {
  const stamp = date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const slug = targetBranch
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'create';
  return `.ai/harness/handoff/chatgpt/create-${stamp}-${slug}.md`;
}

export function defaultCreateReadBackReportPath(targetBranch: string, date = new Date()): string {
  const stamp = date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const slug = targetBranch
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'create';
  return `.ai/harness/handoff/chatgpt/readback-${stamp}-${slug}.md`;
}

export function assertCreatePreconditions(input: BrowserCreateInput): BrowserCreateSessionContext {
  const requestedApp = requiredText('CREATE_APP_REQUIRED', '--chatgpt-app', input.chatgptApp);
  const repository = requiredText('CREATE_REPOSITORY_REQUIRED', '--repository', input.repository);
  const defaultBranch = requiredText('CREATE_DEFAULT_BRANCH_REQUIRED', '--default-branch', input.defaultBranch);
  const baseCommit = requiredText('CREATE_BASE_COMMIT_REQUIRED', '--base-commit', input.baseCommit);
  const targetBranch = requiredText('CREATE_BRANCH_REQUIRED', '--branch', input.targetBranch);
  const planPath = requiredText('CREATE_PLAN_REQUIRED', '--plan', input.planPath);
  const contractPath = requiredText('CREATE_CONTRACT_REQUIRED', '--contract', input.contractPath);

  assertRepositoryName(repository, (message) => new CreatePreconditionError('CREATE_REPOSITORY_INVALID', message));
  assertFullCommitSha(baseCommit, '--base-commit', (message) => new CreatePreconditionError('CREATE_BASE_COMMIT_INVALID', message));
  assertBranchName(defaultBranch, '--default-branch', (message) => new CreatePreconditionError('CREATE_DEFAULT_BRANCH_INVALID', message));
  assertBranchName(targetBranch, '--branch', (message) => new CreatePreconditionError('CREATE_BRANCH_INVALID', message));

  if (targetBranch === defaultBranch) {
    throw new CreatePreconditionError(
      'CREATE_DEFAULT_BRANCH_REJECTED',
      `target branch "${targetBranch}" is the declared default branch`,
      'Pass a dedicated agent/* branch and the repository actual default branch.',
    );
  }
  if (!targetBranch.startsWith(REQUIRED_BRANCH_PREFIX)) {
    throw new CreatePreconditionError(
      'CREATE_BRANCH_PREFIX_REQUIRED',
      `target branch "${targetBranch}" must start with "${REQUIRED_BRANCH_PREFIX}"`,
      'Use a disposable agent/<description> branch.',
    );
  }

  assertRepoRelativeInput('CREATE_PLAN_NOT_FOUND', '--plan', input.repoRoot, planPath);
  assertRepoRelativeInput('CREATE_CONTRACT_NOT_FOUND', '--contract', input.repoRoot, contractPath);

  return {
    repository,
    defaultBranch,
    baseCommit: baseCommit.toLowerCase(),
    targetBranch,
    planPath,
    contractPath,
    draftPr: input.draftPr === true,
    requestedApp,
    creationReportPath: input.writeOutput ?? defaultCreateReportPath(targetBranch),
  };
}

export function assertCreateProvider(
  input: Pick<BrowserConsultInput, 'provider'>,
): void {
  if ((input.provider ?? 'oracle') !== 'oracle') {
    throw new CreatePreconditionError(
      'CREATE_PROVIDER_UNSUPPORTED',
      'browser-create requires the oracle provider',
      'Use the dedicated browser-create command without overriding its provider.',
    );
  }
}

export function buildCreatePrompt(input: BrowserCreateInput, context: BrowserCreateSessionContext): string {
  return [
    `Use the connected ChatGPT app "${context.requestedApp}" as the Create entity.`,
    'If that app or its GitHub tools are unavailable in this conversation, stop without writing and explain the missing capability.',
    'Do not claim the app is selected or that a tool ran without direct evidence.',
    '',
    `Operate only on GitHub repository "${context.repository}".`,
    `The expected default branch is "${context.defaultBranch}".`,
    `The exact approved base commit is "${context.baseCommit}".`,
    `Create and work only on branch "${context.targetBranch}".`,
    '',
    'Before any write, use GitHub read actions to:',
    `1. fetch repository "${context.repository}" and confirm its actual default branch is "${context.defaultBranch}";`,
    `2. fetch commit "${context.baseCommit}" in that repository;`,
    `3. fetch branch "${context.targetBranch}" and confirm it does not already exist.`,
    'If any check fails or the target branch already exists, stop without writing and explain the mismatch.',
    '',
    'The approved task contract is authoritative.',
    'Read every existing target file before writing.',
    `Create "${context.targetBranch}" directly from exact commit "${context.baseCommit}".`,
    `Read the approved plan at "${context.planPath}" and contract at "${context.contractPath}".`,
    'Do not modify the plan or contract.',
    `Do not write to "${context.defaultBranch}" or any other branch.`,
    'Do not force-update a ref.',
    'Do not add unrelated cleanup, dependencies, fallbacks, or refactors.',
    'Do not merge, enable auto-merge, mark the PR ready, resolve review threads,',
    'rerun CI, or claim checks ran without direct evidence.',
    context.draftPr
      ? `Open one draft pull request from "${context.targetBranch}" to "${context.defaultBranch}".`
      : 'Do not open a pull request.',
    '',
    'At the end, return a human-readable Creation Report and exactly one fenced',
    `JSON block named ${CREATE_RESULT_FENCE} with this shape:`,
    '',
    `\`\`\`${CREATE_RESULT_FENCE}`,
    '{',
    `  "selectedApp": "${context.requestedApp}",`,
    `  "repository": "${context.repository}",`,
    `  "defaultBranch": "${context.defaultBranch}",`,
    `  "baseCommit": "${context.baseCommit}",`,
    `  "branch": "${context.targetBranch}",`,
    '  "targetBranchExisted": false,',
    '  "commitSha": "<full commit SHA>",',
    context.draftPr
      ? `  "pullRequest": { "number": 123, "url": "https://github.com/${context.repository}/pull/123", "draft": true, "baseBranch": "${context.defaultBranch}", "headBranch": "${context.targetBranch}", "headSha": "<full commit SHA>" },`
      : '  "pullRequest": null,',
    '  "changedFiles": ["path/to/file"],',
    '  "toolEvents": ["get_repo", "fetch_commit", "get_branch", "create_branch", "create_commit", "update_ref"]',
    '}',
    '\`\`\`',
    '',
    'The JSON block is reported evidence, not proof that repo-harness observed',
    'the remote tool calls. Report only actions that actually completed.',
    '',
    '--- User task ---',
    '',
    input.prompt.trim(),
  ].join('\n');
}

interface ParsedCreateEnvelope {
  selectedApp: string;
  repository: string;
  defaultBranch: string;
  baseCommit: string;
  branch: string;
  targetBranchExisted: boolean;
  commitSha: string;
  pullRequest?: BrowserCreatePullRequestEvidence;
  changedFiles: string[];
  toolEvents: string[];
}

interface ParsedReadBackEnvelope {
  selectedApp: string;
  repository: string;
  defaultBranch: string;
  baseCommit: string;
  branch: string;
  branchHead: string;
  commitSha: string;
  commitExists: boolean;
  pullRequest?: BrowserCreatePullRequestEvidence;
  changedFiles: string[];
  comparison: {
    baseCommit: string;
    headCommit: string;
    status: 'ahead' | 'identical' | 'diverged';
    aheadBy?: number;
    behindBy?: number;
  };
  readActions: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function requiredString(value: unknown, field: string): string {
  const parsed = optionalString(value);
  if (!parsed) throw new Error(`${field} must be a non-empty string`);
  return parsed;
}

function optionalInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${field} must be a boolean`);
  return value;
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error(`${field} must be an array of non-empty strings`);
  }
  return value.map((item) => item.trim());
}

function parsePullRequest(value: unknown): BrowserCreatePullRequestEvidence | undefined {
  if (value === null || value === undefined) return undefined;
  if (!isRecord(value)) throw new Error('pullRequest must be an object or null');
  return {
    number: optionalInteger(value.number),
    url: optionalString(value.url),
    draft: typeof value.draft === 'boolean' ? value.draft : undefined,
    baseBranch: optionalString(value.baseBranch),
    headBranch: optionalString(value.headBranch),
    headSha: optionalString(value.headSha),
  };
}

function parseFencedJson(output: string, fence: string): Record<string, unknown> {
  const pattern = new RegExp('```' + fence + '\\s*([\\s\\S]*?)```', 'gi');
  const matches = [...output.matchAll(pattern)];
  if (matches.length !== 1) throw new Error(`expected exactly one ${fence} fenced JSON block`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(matches[0]?.[1] ?? '');
  } catch (error) {
    throw new Error(`invalid ${fence} JSON: ${(error as Error).message}`);
  }
  if (!isRecord(parsed)) throw new Error(`${fence} must contain a JSON object`);
  return parsed;
}

export function parseCreateResult(output: string): ParsedCreateEnvelope {
  const parsed = parseFencedJson(output, CREATE_RESULT_FENCE);
  return {
    selectedApp: requiredString(parsed.selectedApp, 'selectedApp'),
    repository: requiredString(parsed.repository, 'repository'),
    defaultBranch: requiredString(parsed.defaultBranch, 'defaultBranch'),
    baseCommit: requiredString(parsed.baseCommit, 'baseCommit'),
    branch: requiredString(parsed.branch, 'branch'),
    targetBranchExisted: requiredBoolean(parsed.targetBranchExisted, 'targetBranchExisted'),
    commitSha: requiredString(parsed.commitSha, 'commitSha'),
    pullRequest: parsePullRequest(parsed.pullRequest),
    changedFiles: stringArray(parsed.changedFiles, 'changedFiles'),
    toolEvents: stringArray(parsed.toolEvents, 'toolEvents'),
  };
}

export function parseCreateReadBackResult(output: string): ParsedReadBackEnvelope {
  const parsed = parseFencedJson(output, CREATE_READBACK_RESULT_FENCE);
  if (!isRecord(parsed.comparison)) throw new Error('comparison must be an object');
  const status = requiredString(parsed.comparison.status, 'comparison.status');
  if (status !== 'ahead' && status !== 'identical' && status !== 'diverged') {
    throw new Error('comparison.status must be ahead, identical, or diverged');
  }
  return {
    selectedApp: requiredString(parsed.selectedApp, 'selectedApp'),
    repository: requiredString(parsed.repository, 'repository'),
    defaultBranch: requiredString(parsed.defaultBranch, 'defaultBranch'),
    baseCommit: requiredString(parsed.baseCommit, 'baseCommit'),
    branch: requiredString(parsed.branch, 'branch'),
    branchHead: requiredString(parsed.branchHead, 'branchHead'),
    commitSha: requiredString(parsed.commitSha, 'commitSha'),
    commitExists: requiredBoolean(parsed.commitExists, 'commitExists'),
    pullRequest: parsePullRequest(parsed.pullRequest),
    changedFiles: stringArray(parsed.changedFiles, 'changedFiles'),
    comparison: {
      baseCommit: requiredString(parsed.comparison.baseCommit, 'comparison.baseCommit'),
      headCommit: requiredString(parsed.comparison.headCommit, 'comparison.headCommit'),
      status,
      aheadBy: optionalInteger(parsed.comparison.aheadBy),
      behindBy: optionalInteger(parsed.comparison.behindBy),
    },
    readActions: stringArray(parsed.readActions, 'readActions'),
  };
}

function assertChangedFiles(paths: string[], protectedPaths: string[] = []): void {
  if (paths.length === 0) throw new Error('changedFiles must contain at least one path');
  const protectedSet = new Set(protectedPaths.map((path) => posix.normalize(path)));
  for (const path of paths) {
    const normalized = posix.normalize(path);
    if (isAbsolute(path) || path.includes('\\') || normalized === '..' || normalized.startsWith('../')) {
      throw new Error(`changedFiles contains an unsafe path: ${path}`);
    }
    if (protectedSet.has(normalized)) {
      throw new Error(`changedFiles contains protected workflow artifact: ${normalized}`);
    }
  }
}

function assertPullRequestUrl(repository: string, pullRequest: BrowserCreatePullRequestEvidence): void {
  if (!pullRequest.number || !pullRequest.url) throw new Error('pullRequest number and URL are required');
  const expected = `https://github.com/${repository}/pull/${pullRequest.number}`.toLowerCase();
  if (pullRequest.url.toLowerCase() !== expected) {
    throw new Error(`pullRequest URL must target ${expected}`);
  }
}

function assertCreateEnvelope(envelope: ParsedCreateEnvelope, context: BrowserCreateSessionContext): void {
  assertRepositoryName(envelope.repository);
  assertFullCommitSha(envelope.baseCommit, 'baseCommit');
  assertFullCommitSha(envelope.commitSha, 'commitSha');
  if (!sameRepository(envelope.repository, context.repository)) {
    throw new Error(`reported repository ${envelope.repository} does not match ${context.repository}`);
  }
  if (envelope.defaultBranch !== context.defaultBranch) {
    throw new Error(`reported defaultBranch ${envelope.defaultBranch} does not match ${context.defaultBranch}`);
  }
  if (!sameSha(envelope.baseCommit, context.baseCommit)) {
    throw new Error(`reported baseCommit ${envelope.baseCommit} does not match ${context.baseCommit}`);
  }
  if (envelope.branch !== context.targetBranch) {
    throw new Error(`reported branch ${envelope.branch} does not match ${context.targetBranch}`);
  }
  if (envelope.targetBranchExisted) {
    throw new Error(`target branch ${context.targetBranch} already existed before Create`);
  }
  if (envelope.selectedApp !== context.requestedApp) {
    throw new Error(`reported selectedApp ${envelope.selectedApp} does not match ${context.requestedApp}`);
  }
  if (sameSha(envelope.commitSha, context.baseCommit)) {
    throw new Error('reported commitSha must differ from the base commit');
  }
  assertChangedFiles(envelope.changedFiles, [context.planPath, context.contractPath]);
  const unknownAction = envelope.toolEvents.find((event) => !CREATE_ALLOWED_ACTIONS.has(event));
  if (unknownAction) throw new Error(`reported unrecognized or forbidden GitHub action: ${unknownAction}`);
  for (const action of CREATE_REQUIRED_ACTIONS) {
    if (!envelope.toolEvents.includes(action)) {
      throw new Error(`reported toolEvents omit required GitHub action: ${action}`);
    }
  }

  if (context.draftPr) {
    if (!envelope.pullRequest || envelope.pullRequest.draft !== true) {
      throw new Error('a requested draft pull request was not fully reported as draft');
    }
    if (!envelope.toolEvents.includes('create_pull_request')) {
      throw new Error('reported toolEvents omit required GitHub action: create_pull_request');
    }
    assertPullRequestUrl(context.repository, envelope.pullRequest);
    if (envelope.pullRequest.baseBranch !== context.defaultBranch) {
      throw new Error(`reported PR base ${envelope.pullRequest.baseBranch ?? '(missing)'} does not match ${context.defaultBranch}`);
    }
    if (envelope.pullRequest.headBranch !== context.targetBranch) {
      throw new Error(`reported PR head ${envelope.pullRequest.headBranch ?? '(missing)'} does not match ${context.targetBranch}`);
    }
    if (!envelope.pullRequest.headSha || !sameSha(envelope.pullRequest.headSha, envelope.commitSha)) {
      throw new Error('reported PR headSha does not match commitSha');
    }
  } else if (envelope.pullRequest !== undefined) {
    throw new Error('a pull request was reported although --draft-pr was not requested');
  }
}

function toReportedEvidence(envelope: ParsedCreateEnvelope): BrowserCreateReportedGitHubEvidence {
  return {
    trust: 'assistant_reported',
    repository: envelope.repository,
    defaultBranch: envelope.defaultBranch,
    baseCommit: envelope.baseCommit.toLowerCase(),
    branch: envelope.branch,
    targetBranchExisted: envelope.targetBranchExisted,
    commitSha: envelope.commitSha.toLowerCase(),
    pullRequest: envelope.pullRequest,
    changedFiles: envelope.changedFiles,
    toolEvents: envelope.toolEvents,
  };
}

function finalizeCreateResult(
  input: BrowserCreateInput,
  context: BrowserCreateSessionContext,
  result: BrowserConsultResult,
): BrowserConsultResult {
  if (result.status === 'dry_run') return result;

  if (result.status !== 'completed') {
    const outcome = result.status === 'recoverable' || result.status === 'incomplete_capture'
      ? 'recoverable'
      : 'provider_failed';
    const meta = updateBrowserSessionMeta(input.repoRoot, result.sessionId, (current) => ({
      ...current,
      create: current.create ? { ...current.create, outcome } : current.create,
    }), input.sessionRoot);
    return { ...result, meta };
  }

  try {
    const envelope = parseCreateResult(result.output ?? '');
    assertCreateEnvelope(envelope, context);
    const reportedGitHub = toReportedEvidence(envelope);
    const meta = updateBrowserSessionMeta(input.repoRoot, result.sessionId, (current) => ({
      ...current,
      create: current.create ? {
        ...current.create,
        outcome: 'reported',
        appSelection: {
          ...current.create.appSelection,
          reportedSelectedApp: envelope.selectedApp,
        },
        reportedGitHub,
      } : current.create,
    }), input.sessionRoot);
    return { ...result, meta };
  } catch (error) {
    const message = `Create completed without usable GitHub evidence: ${(error as Error).message}`;
    const createError = {
      code: 'CREATE_SURFACE_BLOCKED',
      message,
      recovery: 'Inspect the saved ChatGPT conversation and GitHub state, then continue the same session or rerun only after confirming no write already occurred.',
    };
    const meta = updateBrowserSessionMeta(input.repoRoot, result.sessionId, (current) => ({
      ...current,
      status: 'surface_blocked',
      error: createError,
      create: current.create ? { ...current.create, outcome: 'surface_blocked' } : current.create,
    }), input.sessionRoot);
    return {
      ...result,
      status: 'surface_blocked',
      meta,
      error: createError,
    };
  }
}

export async function runBrowserCreate(input: BrowserCreateInput): Promise<BrowserConsultResult> {
  const context = assertCreatePreconditions(input);
  assertCreateProvider(input);
  const files = [
    { path: context.planPath },
    { path: context.contractPath },
    ...(input.files ?? []),
  ].filter((file, index, all) => all.findIndex((candidate) => candidate.path === file.path) === index);

  const result = await runBrowserConsult({
    ...input,
    title: input.title ?? `create ${context.targetBranch}`,
    prompt: buildCreatePrompt(input, context),
    files,
    // Plan, Create, and Review use the same Oracle transport. The expected
    // app is enforced by the fixed prompt and result contract, not by an
    // Oracle CLI flag (published Oracle has no --browser-app option).
    chatgptApp: undefined,
    provider: 'oracle',
    requireSecretScan: true,
    writeOutput: context.creationReportPath,
    sessionMode: 'create',
    createContext: context,
  });
  return finalizeCreateResult(input, context, result);
}

function buildReadBackPrompt(
  createSessionId: string,
  context: BrowserCreateSessionContext,
  reported: BrowserCreateReportedGitHubEvidence,
): string {
  return [
    `Use the connected ChatGPT app "${context.requestedApp}" for an independent read-only GitHub read-back.`,
    'If that app or its GitHub read tools are unavailable in this conversation, stop and report the missing capability.',
    'Do not claim the app is selected or that a tool ran without direct evidence.',
    `This is a new browser session, not a continuation of Create session "${createSessionId}".`,
    '',
    'Do not use any GitHub write action. Do not create, update, delete, comment,',
    'review, rerun CI, change refs, or open/modify a pull request.',
    '',
    `Read only repository "${context.repository}" and verify:`,
    `- actual default branch equals "${context.defaultBranch}";`,
    `- exact base commit "${context.baseCommit}" exists;`,
    `- branch "${context.targetBranch}" exists;`,
    `- branch head equals reported commit "${reported.commitSha}";`,
    `- commit "${reported.commitSha}" exists;`,
    '- compare base commit to branch head and list every changed file;',
    ...(reported.pullRequest
      ? [`- pull request #${reported.pullRequest.number} exists, remains draft, targets "${context.defaultBranch}", and uses head "${context.targetBranch}".`]
      : ['- no pull request exists for this Create result.']),
    '',
    'Use repository metadata, commit, branch/ref, compare, changed-file, and PR',
    'read actions as needed. Return exactly one fenced JSON block:',
    '',
    `\`\`\`${CREATE_READBACK_RESULT_FENCE}`,
    '{',
    `  "selectedApp": "${context.requestedApp}",`,
    `  "repository": "${context.repository}",`,
    `  "defaultBranch": "${context.defaultBranch}",`,
    `  "baseCommit": "${context.baseCommit}",`,
    `  "branch": "${context.targetBranch}",`,
    `  "branchHead": "${reported.commitSha}",`,
    `  "commitSha": "${reported.commitSha}",`,
    '  "commitExists": true,',
    reported.pullRequest
      ? `  "pullRequest": { "number": ${reported.pullRequest.number}, "url": "${reported.pullRequest.url}", "draft": true, "baseBranch": "${context.defaultBranch}", "headBranch": "${context.targetBranch}", "headSha": "${reported.commitSha}" },`
      : '  "pullRequest": null,',
    '  "changedFiles": ["path/to/file"],',
    `  "comparison": { "baseCommit": "${context.baseCommit}", "headCommit": "${reported.commitSha}", "status": "ahead", "aheadBy": 1, "behindBy": 0 },`,
    '  "readActions": ["get_repo", "fetch_commit", "get_branch", "compare_commits", "list_changed_files", "list_pull_requests"]',
    '}',
    '\`\`\`',
    '',
    'Report only state returned by the GitHub app. If any expected object is',
    'missing or mismatched, report the actual value; do not repair it.',
  ].join('\n');
}

function assertReadBackEnvelope(
  envelope: ParsedReadBackEnvelope,
  context: BrowserCreateSessionContext,
  reported: BrowserCreateReportedGitHubEvidence,
): void {
  assertRepositoryName(envelope.repository, (message) => new CreateReadBackMismatchError(message));
  assertFullCommitSha(envelope.baseCommit, 'baseCommit', (message) => new CreateReadBackMismatchError(message));
  assertFullCommitSha(envelope.branchHead, 'branchHead', (message) => new CreateReadBackMismatchError(message));
  assertFullCommitSha(envelope.commitSha, 'commitSha', (message) => new CreateReadBackMismatchError(message));

  if (envelope.selectedApp !== context.requestedApp) {
    throw new CreateReadBackMismatchError(`read-back selectedApp ${envelope.selectedApp} does not match ${context.requestedApp}`);
  }
  if (!sameRepository(envelope.repository, context.repository)) {
    throw new CreateReadBackMismatchError(`read-back repository ${envelope.repository} does not match ${context.repository}`);
  }
  if (envelope.defaultBranch !== context.defaultBranch) {
    throw new CreateReadBackMismatchError(`read-back defaultBranch ${envelope.defaultBranch} does not match ${context.defaultBranch}`);
  }
  if (!sameSha(envelope.baseCommit, context.baseCommit)) {
    throw new CreateReadBackMismatchError(`read-back baseCommit ${envelope.baseCommit} does not match ${context.baseCommit}`);
  }
  if (envelope.branch !== context.targetBranch) {
    throw new CreateReadBackMismatchError(`read-back branch ${envelope.branch} does not match ${context.targetBranch}`);
  }
  if (!envelope.commitExists) throw new CreateReadBackMismatchError('read-back says the implementation commit does not exist');
  if (!sameSha(envelope.branchHead, reported.commitSha) || !sameSha(envelope.commitSha, reported.commitSha)) {
    throw new CreateReadBackMismatchError(`read-back head/commit does not match ${reported.commitSha}`);
  }
  if (!sameSha(envelope.comparison.baseCommit, context.baseCommit)
    || !sameSha(envelope.comparison.headCommit, reported.commitSha)
    || envelope.comparison.status !== 'ahead'
    || envelope.comparison.aheadBy === undefined
    || envelope.comparison.aheadBy < 1
    || envelope.comparison.behindBy !== 0) {
    throw new CreateReadBackMismatchError('read-back comparison does not prove the implementation is strictly ahead of the exact base');
  }
  assertChangedFiles(envelope.changedFiles, [context.planPath, context.contractPath]);
  if (!sameStringSet(envelope.changedFiles, reported.changedFiles)) {
    throw new CreateReadBackMismatchError('read-back changedFiles do not match the Create result');
  }
  for (const action of READBACK_REQUIRED_ACTIONS) {
    if (!envelope.readActions.includes(action)) {
      throw new CreateReadBackMismatchError(`read-back did not report required read action ${action}`);
    }
  }
  const unknownAction = envelope.readActions.find((action) => !READBACK_ALLOWED_ACTIONS.has(action));
  if (unknownAction) throw new CreateReadBackMismatchError(`read-back reported an unrecognized or forbidden action: ${unknownAction}`);
  if (!envelope.readActions.some((action) => PR_READ_ACTIONS.has(action))) {
    throw new CreateReadBackMismatchError('read-back did not report a pull-request lookup action');
  }

  if (reported.pullRequest) {
    if (!envelope.pullRequest) throw new CreateReadBackMismatchError('read-back did not find the reported pull request');
    if (envelope.pullRequest.number !== reported.pullRequest.number
      || envelope.pullRequest.url?.toLowerCase() !== reported.pullRequest.url?.toLowerCase()
      || envelope.pullRequest.draft !== true
      || envelope.pullRequest.baseBranch !== context.defaultBranch
      || envelope.pullRequest.headBranch !== context.targetBranch
      || !envelope.pullRequest.headSha
      || !sameSha(envelope.pullRequest.headSha, reported.commitSha)) {
      throw new CreateReadBackMismatchError('read-back pull request state does not match the Create result');
    }
  } else if (envelope.pullRequest !== undefined) {
    throw new CreateReadBackMismatchError('read-back found a pull request although Create reported none');
  }
}

function toReadBackEvidence(envelope: ParsedReadBackEnvelope): BrowserCreateReadBackEvidence {
  return {
    trust: 'assistant_reported_readback',
    repository: envelope.repository,
    defaultBranch: envelope.defaultBranch,
    baseCommit: envelope.baseCommit.toLowerCase(),
    branch: envelope.branch,
    branchHead: envelope.branchHead.toLowerCase(),
    commitSha: envelope.commitSha.toLowerCase(),
    commitExists: envelope.commitExists,
    pullRequest: envelope.pullRequest,
    changedFiles: envelope.changedFiles,
    comparison: {
      ...envelope.comparison,
      baseCommit: envelope.comparison.baseCommit.toLowerCase(),
      headCommit: envelope.comparison.headCommit.toLowerCase(),
    },
    readActions: envelope.readActions,
  };
}

function readBackMeta(
  sessionId: string,
  requestedApp: string,
  outcome: BrowserCreateReadBackMeta['outcome'],
  evidence?: BrowserCreateReadBackEvidence,
  error?: BrowserCreateReadBackMeta['error'],
): BrowserCreateReadBackMeta {
  return { sessionId, requestedApp, outcome, evidence, error };
}

function updateSourceReadBack(
  repoRoot: string,
  sourceSessionId: string,
  next: BrowserCreateReadBackMeta,
  sessionRoot?: string,
) {
  return updateBrowserSessionMeta(repoRoot, sourceSessionId, (current) => ({
    ...current,
    create: current.create ? { ...current.create, readBack: next } : current.create,
  }), sessionRoot);
}

function updateReadBackSession(
  input: BrowserCreateReadBackInput,
  result: BrowserConsultResult,
  status: BrowserConsultResult['status'],
  error?: BrowserConsultResult['error'],
) {
  return updateBrowserSessionMeta(input.repoRoot, result.sessionId, (current) => ({
    ...current,
    sourceSessionId: input.sessionId,
    status,
    error,
  }), input.sessionRoot);
}

export async function runBrowserCreateReadBack(input: BrowserCreateReadBackInput): Promise<BrowserCreateReadBackResult> {
  const source = readBrowserSession(input.repoRoot, input.sessionId, input.sessionRoot);
  const create = source.meta.create;
  if (source.meta.mode !== 'create' || !create) {
    throw new CreatePreconditionError(
      'CREATE_READBACK_MODE_MISMATCH',
      `session ${input.sessionId} is not a Create session`,
    );
  }
  if (!create.reportedGitHub || create.outcome !== 'reported') {
    throw new CreatePreconditionError(
      'CREATE_READBACK_RESULT_REQUIRED',
      `session ${input.sessionId} has no validated Create result to read back`,
      'Complete or recover the Create result envelope first.',
    );
  }
  const requestedApp = input.chatgptApp ?? create.requestedApp;
  if (requestedApp !== create.requestedApp) {
    throw new CreatePreconditionError(
      'CREATE_READBACK_APP_MISMATCH',
      `read-back app ${requestedApp} does not match Create app ${create.requestedApp}`,
    );
  }
  assertCreateProvider({ ...input, provider: 'oracle' });

  const result = await runBrowserConsult({
    ...input,
    title: input.title ?? `readback ${create.targetBranch}`,
    prompt: buildReadBackPrompt(input.sessionId, create, create.reportedGitHub),
    files: [],
    chatgptApp: undefined,
    provider: 'oracle',
    requireSecretScan: true,
    writeOutput: input.writeOutput ?? defaultCreateReadBackReportPath(create.targetBranch),
    sessionMode: 'consult',
  });

  if (result.status === 'dry_run') {
    const meta = updateReadBackSession(input, result, 'dry_run');
    return {
      createSessionId: input.sessionId,
      readBackSessionId: result.sessionId,
      status: 'dry_run',
      paths: result.paths,
      meta,
      create: {
        ...create,
        readBack: readBackMeta(result.sessionId, requestedApp, 'dry_run'),
      },
      dryRun: result.dryRun,
    };
  }

  if (result.status !== 'completed') {
    const outcome = result.status === 'recoverable' || result.status === 'incomplete_capture'
      ? 'recoverable'
      : 'provider_failed';
    const next = readBackMeta(result.sessionId, requestedApp, outcome, undefined, result.error);
    const sourceMeta = updateSourceReadBack(input.repoRoot, input.sessionId, next, input.sessionRoot);
    const meta = updateReadBackSession(input, result, result.status, result.error);
    return {
      createSessionId: input.sessionId,
      readBackSessionId: result.sessionId,
      status: result.status,
      paths: result.paths,
      meta,
      create: sourceMeta.create!,
      error: result.error,
    };
  }

  try {
    const envelope = parseCreateReadBackResult(result.output ?? '');
    assertReadBackEnvelope(envelope, create, create.reportedGitHub);
    const evidence = toReadBackEvidence(envelope);
    const next = readBackMeta(result.sessionId, requestedApp, 'matched', evidence);
    const sourceMeta = updateSourceReadBack(input.repoRoot, input.sessionId, next, input.sessionRoot);
    const meta = updateReadBackSession(input, result, 'completed');
    return {
      createSessionId: input.sessionId,
      readBackSessionId: result.sessionId,
      status: 'completed',
      paths: result.paths,
      meta,
      create: sourceMeta.create!,
    };
  } catch (error) {
    const mismatch = error instanceof CreateReadBackMismatchError;
    const code = mismatch ? 'CREATE_READBACK_MISMATCH' : 'CREATE_READBACK_SURFACE_BLOCKED';
    const message = `Create read-back failed: ${(error as Error).message}`;
    const readBackError = {
      code,
      message,
      recovery: 'Inspect the independent read-back conversation and actual GitHub state. Do not merge or retry Create until the discrepancy is understood.',
    };
    const next = readBackMeta(
      result.sessionId,
      requestedApp,
      mismatch ? 'mismatch' : 'surface_blocked',
      undefined,
      readBackError,
    );
    const sourceMeta = updateSourceReadBack(input.repoRoot, input.sessionId, next, input.sessionRoot);
    const meta = updateReadBackSession(input, result, 'surface_blocked', readBackError);
    return {
      createSessionId: input.sessionId,
      readBackSessionId: result.sessionId,
      status: 'surface_blocked',
      paths: result.paths,
      meta,
      create: sourceMeta.create!,
      error: readBackError,
    };
  }
}

const CREATE_FOLLOWUP_RESUMABLE_STATUSES = new Set([
  'recoverable',
  'incomplete_capture',
  'surface_blocked',
]);

function buildCreateRecoveryPrompt(context: BrowserCreateSessionContext): string {
  return [
    'Evidence reconciliation only. Do not call GitHub tools or perform any write.',
    'Do not continue implementation, change refs, modify files, open or update a pull request, or rerun CI.',
    `Using only results already present in this conversation, return exactly one ${CREATE_RESULT_FENCE} JSON block`,
    `for repository "${context.repository}", base "${context.baseCommit}", and branch "${context.targetBranch}".`,
    'If the required evidence is not already present, stop and say that independent human inspection is required.',
  ].join('\n');
}

export async function runBrowserCreateFollowup(
  input: Omit<BrowserConsultInput, 'sourceSessionId'> & { sessionId: string },
): Promise<BrowserConsultResult> {
  const existing = readBrowserSession(input.repoRoot, input.sessionId);
  if (existing.meta.mode !== 'create') {
    throw new CreatePreconditionError(
      'CREATE_FOLLOWUP_MODE_MISMATCH',
      `session ${input.sessionId} is not a Create session`,
    );
  }
  const provider = input.provider ?? existing.meta.provider;
  if (provider !== 'oracle') {
    throw new CreatePreconditionError(
      'CREATE_PROVIDER_UNSUPPORTED',
      'Create follow-up requires the oracle provider',
    );
  }
  if (!CREATE_FOLLOWUP_RESUMABLE_STATUSES.has(existing.meta.status)) {
    throw new CreatePreconditionError(
      'CREATE_FOLLOWUP_STATUS_UNSUPPORTED',
      `cannot follow up from Create session ${input.sessionId} with status "${existing.meta.status}"`,
    );
  }
  const context = existing.meta.create;
  if (!context) {
    throw new CreatePreconditionError('CREATE_FOLLOWUP_CONTEXT_MISSING', `session ${input.sessionId} has no Create context`);
  }
  const result = await runBrowserConsult({
    ...input,
    title: input.title ?? `reconcile ${input.sessionId}`,
    prompt: buildCreateRecoveryPrompt(context),
    followups: [],
    sourceSessionId: input.sessionId,
    requireSecretScan: input.requireSecretScan === true || Boolean(existing.meta.security?.promptSecretScan),
    providerSessionId: input.providerSessionId ?? existing.meta.providerSessionId,
    parentProviderSessionId: existing.meta.providerSessionId,
    model: input.model ?? existing.meta.model.requested,
    thinking: input.thinking ?? existing.meta.model.thinking,
    provider: 'oracle',
    chatgptUrl: input.chatgptUrl ?? existing.meta.browser.conversationUrl ?? existing.meta.browser.chatgptUrl,
    chatgptApp: undefined,
    profileDir: input.profileDir ?? existing.meta.browser.profileDir,
    profileDirectory: input.profileDirectory ?? existing.meta.browser.profileDirectory,
    browserChannel: input.browserChannel ?? existing.meta.browser.channel,
  });
  const finalized = finalizeCreateResult({
    ...input,
    chatgptApp: context.requestedApp,
    repository: context.repository,
    defaultBranch: context.defaultBranch,
    baseCommit: context.baseCommit,
    targetBranch: context.targetBranch,
    planPath: context.planPath,
    contractPath: context.contractPath,
    draftPr: context.draftPr,
    provider: 'oracle',
  }, context, result);
  if (!finalized.meta.create?.readBack) return finalized;
  const meta = updateBrowserSessionMeta(input.repoRoot, finalized.sessionId, (current) => ({
    ...current,
    create: current.create ? { ...current.create, readBack: undefined } : current.create,
  }), input.sessionRoot);
  return { ...finalized, meta };
}
