import { existsSync } from 'fs';
import { isAbsolute, relative, resolve } from 'path';
import { runBrowserConsult } from './engine';
import { probeOracle, resolveOracleBin, supportsBrowserAppPreselect } from './oracle-provider';
import { readBrowserSession, updateBrowserSessionMeta } from './session-store';
import type {
  BrowserConsultInput,
  BrowserConsultResult,
  BrowserCreateInput,
  BrowserCreateReportedGitHubEvidence,
  BrowserCreateSessionContext,
} from './types';

const DEFAULT_BRANCH_NAMES = new Set(['main', 'master']);
const CREATE_RESULT_FENCE = 'repo-harness-create-result';
const WRITE_TOOL_EVENTS = new Set([
  'create_branch',
  'create_file',
  'update_file',
  'delete_file',
  'create_blob',
  'create_tree',
  'create_commit',
  'update_ref',
  'create_pull_request',
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

export function defaultCreateReportPath(targetBranch: string, date = new Date()): string {
  const stamp = date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const slug = targetBranch
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'create';
  return `.ai/harness/handoff/chatgpt/create-${stamp}-${slug}.md`;
}

export function assertCreatePreconditions(input: BrowserCreateInput): BrowserCreateSessionContext {
  const requestedApp = requiredText('CREATE_APP_REQUIRED', '--chatgpt-app', input.chatgptApp);
  const baseRef = requiredText('CREATE_BASE_REF_REQUIRED', '--base', input.baseRef);
  const targetBranch = requiredText('CREATE_BRANCH_REQUIRED', '--branch', input.targetBranch);
  const planPath = requiredText('CREATE_PLAN_REQUIRED', '--plan', input.planPath);
  const contractPath = requiredText('CREATE_CONTRACT_REQUIRED', '--contract', input.contractPath);

  if (DEFAULT_BRANCH_NAMES.has(targetBranch) || targetBranch === baseRef) {
    throw new CreatePreconditionError(
      'CREATE_DEFAULT_BRANCH_REJECTED',
      `target branch "${targetBranch}" is not a dedicated Create branch`,
      'Pass a non-default branch name that differs from --base.',
    );
  }
  assertRepoRelativeInput('CREATE_PLAN_NOT_FOUND', '--plan', input.repoRoot, planPath);
  assertRepoRelativeInput('CREATE_CONTRACT_NOT_FOUND', '--contract', input.repoRoot, contractPath);

  return {
    baseRef,
    targetBranch,
    planPath,
    contractPath,
    draftPr: input.draftPr === true,
    requestedApp,
    creationReportPath: input.writeOutput ?? defaultCreateReportPath(targetBranch),
  };
}

export function assertOracleAppPreselectCapability(input: BrowserCreateInput): void {
  if ((input.provider ?? 'oracle') !== 'oracle') {
    throw new CreatePreconditionError(
      'CREATE_PROVIDER_UNSUPPORTED',
      'browser-create requires the oracle provider',
      'Use the dedicated browser-create command without overriding its provider.',
    );
  }
  if (input.dryRun === true) return;
  const resolution = resolveOracleBin({ repoRoot: input.repoRoot, oracleBin: input.oracleBin });
  if (!resolution.binary) {
    throw new CreatePreconditionError(
      'CREATE_ORACLE_NOT_INSTALLED',
      'oracle binary not found; browser-create cannot verify --browser-app support',
      'Run `repo-harness chatgpt browser-doctor --provider oracle --json` and resolve Oracle first.',
    );
  }
  const probe = probeOracle(resolution.binary);
  if (!supportsBrowserAppPreselect(probe.helpText)) {
    throw new CreatePreconditionError(
      'ORACLE_APP_PRESELECT_UNSUPPORTED',
      'resolved oracle binary does not advertise --browser-app support',
      'Upgrade Oracle or pass --oracle-bin for a version that supports --browser-app.',
    );
  }
}

export function buildCreatePrompt(input: BrowserCreateInput, context: BrowserCreateSessionContext): string {
  return [
    `Use the selected ChatGPT app "${context.requestedApp}" as the Create entity.`,
    '',
    'The approved task contract is authoritative.',
    'Read every existing target file before writing.',
    `Create and work only on branch "${context.targetBranch}" from base "${context.baseRef}".`,
    `Read the approved plan at "${context.planPath}" and contract at "${context.contractPath}".`,
    'Do not modify the plan or contract.',
    'Do not write to the default branch or force-update a ref.',
    'Do not add unrelated cleanup, dependencies, fallbacks, or refactors.',
    'Do not merge, enable auto-merge, mark the PR ready, resolve review threads,',
    'rerun CI, or claim checks ran without direct evidence.',
    context.draftPr
      ? 'Open a draft pull request when the bounded change is ready.'
      : 'Do not open a pull request.',
    '',
    'At the end, return a human-readable Creation Report and exactly one fenced',
    `JSON block named ${CREATE_RESULT_FENCE} with this shape:`,
    '',
    `\`\`\`${CREATE_RESULT_FENCE}`,
    '{',
    '  "selectedApp": "<app name visible in ChatGPT>",',
    '  "repository": "owner/name",',
    '  "baseCommit": "<full commit SHA>",',
    `  "branch": "${context.targetBranch}",`,
    '  "commitSha": "<full commit SHA>",',
    '  "pullRequest": { "number": 123, "url": "https://github.com/...", "draft": true },',
    '  "changedFiles": ["path/to/file"],',
    '  "toolEvents": ["create_branch", "create_commit", "update_ref"]',
    '}',
    '\`\`\`',
    '',
    'Use null for pullRequest when no PR was requested. The JSON block is a',
    'reported evidence envelope, not proof that repo-harness observed the tool calls.',
    '',
    '--- User task ---',
    '',
    input.prompt.trim(),
  ].join('\n');
}

interface ParsedCreateEnvelope {
  selectedApp: string;
  repository: string;
  baseCommit: string;
  branch: string;
  commitSha: string;
  pullRequest?: {
    number?: number;
    url?: string;
    draft?: boolean;
  };
  changedFiles: string[];
  toolEvents: string[];
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

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error(`${field} must be an array of non-empty strings`);
  }
  return value.map((item) => item.trim());
}

export function parseCreateResult(output: string): ParsedCreateEnvelope {
  const pattern = new RegExp('```' + CREATE_RESULT_FENCE + '\\s*([\\s\\S]*?)```', 'gi');
  const matches = [...output.matchAll(pattern)];
  if (matches.length !== 1) {
    throw new Error(`expected exactly one ${CREATE_RESULT_FENCE} fenced JSON block`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(matches[0]?.[1] ?? '');
  } catch (error) {
    throw new Error(`invalid ${CREATE_RESULT_FENCE} JSON: ${(error as Error).message}`);
  }
  if (!isRecord(parsed)) throw new Error(`${CREATE_RESULT_FENCE} must contain a JSON object`);
  const pullRequestValue = parsed.pullRequest;
  let pullRequest: ParsedCreateEnvelope['pullRequest'];
  if (pullRequestValue !== null && pullRequestValue !== undefined) {
    if (!isRecord(pullRequestValue)) throw new Error('pullRequest must be an object or null');
    const number = typeof pullRequestValue.number === 'number' && Number.isInteger(pullRequestValue.number)
      ? pullRequestValue.number
      : undefined;
    const url = optionalString(pullRequestValue.url);
    const draft = typeof pullRequestValue.draft === 'boolean' ? pullRequestValue.draft : undefined;
    pullRequest = { number, url, draft };
  }
  return {
    selectedApp: requiredString(parsed.selectedApp, 'selectedApp'),
    repository: requiredString(parsed.repository, 'repository'),
    baseCommit: requiredString(parsed.baseCommit, 'baseCommit'),
    branch: requiredString(parsed.branch, 'branch'),
    commitSha: requiredString(parsed.commitSha, 'commitSha'),
    pullRequest,
    changedFiles: stringArray(parsed.changedFiles, 'changedFiles'),
    toolEvents: stringArray(parsed.toolEvents, 'toolEvents'),
  };
}

function assertFullCommitSha(value: string, field: string): void {
  if (!/^[0-9a-f]{40}$/i.test(value)) throw new Error(`${field} must be a full 40-character commit SHA`);
}

function assertRepositoryName(value: string): void {
  if (!/^[^/\s]+\/[^/\s]+$/.test(value)) throw new Error('repository must use owner/name form');
}

function assertChangedFiles(paths: string[]): void {
  for (const path of paths) {
    if (isAbsolute(path) || path === '..' || path.startsWith('../') || path.includes('/../')) {
      throw new Error(`changedFiles contains an unsafe path: ${path}`);
    }
  }
}

function assertCreateEnvelope(
  envelope: ParsedCreateEnvelope,
  context: BrowserCreateSessionContext,
): void {
  if (envelope.branch !== context.targetBranch) {
    throw new Error(`reported branch ${envelope.branch} does not match ${context.targetBranch}`);
  }
  if (envelope.selectedApp !== context.requestedApp) {
    throw new Error(`reported selectedApp ${envelope.selectedApp} does not match ${context.requestedApp}`);
  }
  assertRepositoryName(envelope.repository);
  assertFullCommitSha(envelope.baseCommit, 'baseCommit');
  assertFullCommitSha(envelope.commitSha, 'commitSha');
  assertChangedFiles(envelope.changedFiles);
  if (!envelope.toolEvents.some((event) => WRITE_TOOL_EVENTS.has(event))) {
    throw new Error('reported toolEvents contain no GitHub write action');
  }
  if (context.draftPr) {
    if (!envelope.pullRequest?.number || !envelope.pullRequest.url || envelope.pullRequest.draft !== true) {
      throw new Error('a requested draft pull request was not fully reported as draft');
    }
  } else if (envelope.pullRequest !== undefined) {
    throw new Error('a pull request was reported although --draft-pr was not requested');
  }
}

function toReportedEvidence(envelope: ParsedCreateEnvelope): BrowserCreateReportedGitHubEvidence {
  return {
    trust: 'assistant_reported',
    repository: envelope.repository,
    baseCommit: envelope.baseCommit,
    branch: envelope.branch,
    commitSha: envelope.commitSha,
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
  assertOracleAppPreselectCapability(input);
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
    chatgptApp: context.requestedApp,
    provider: 'oracle',
    requireSecretScan: true,
    writeOutput: context.creationReportPath,
    sessionMode: 'create',
    createContext: context,
  });
  return finalizeCreateResult(input, context, result);
}

const CREATE_FOLLOWUP_RESUMABLE_STATUSES = new Set([
  'completed',
  'recoverable',
  'incomplete_capture',
  'dry_run',
  'surface_blocked',
]);

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
  if (input.dryRun !== true && !CREATE_FOLLOWUP_RESUMABLE_STATUSES.has(existing.meta.status)) {
    throw new CreatePreconditionError(
      'CREATE_FOLLOWUP_STATUS_UNSUPPORTED',
      `cannot follow up from Create session ${input.sessionId} with status "${existing.meta.status}"`,
    );
  }
  return runBrowserConsult({
    ...input,
    title: input.title ?? `followup ${input.sessionId}`,
    sourceSessionId: input.sessionId,
    requireSecretScan: input.requireSecretScan === true || Boolean(existing.meta.security?.promptSecretScan),
    providerSessionId: input.providerSessionId ?? existing.meta.providerSessionId,
    parentProviderSessionId: existing.meta.providerSessionId,
    model: input.model ?? existing.meta.model.requested,
    thinking: input.thinking ?? existing.meta.model.thinking,
    provider: 'oracle',
    chatgptUrl: input.chatgptUrl ?? existing.meta.browser.conversationUrl ?? existing.meta.browser.chatgptUrl,
    chatgptApp: input.chatgptApp ?? existing.meta.browser.chatgptApp,
    profileDir: input.profileDir ?? existing.meta.browser.profileDir,
    profileDirectory: input.profileDirectory ?? existing.meta.browser.profileDirectory,
    browserChannel: input.browserChannel ?? existing.meta.browser.channel,
  });
}
