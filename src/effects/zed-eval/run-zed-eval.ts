import { randomBytes as nodeRandomBytes } from 'crypto';
import {
  accessSync,
  chmodSync,
  constants,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from 'fs';
import { homedir } from 'os';
import { isAbsolute, join, relative, resolve, sep } from 'path';
import {
  ZedEvalAdmissionError,
  admitZedEvalRequest,
  validateZedEvalRequest,
} from '../../core/zed-eval/admission';
import {
  assertZedEvalExitStatusCoherence,
  parseZedEvalResult,
} from '../../core/zed-eval/result-schema';
import {
  ZED_EVAL_PINNED_COMMIT,
  ZED_EVAL_RECEIPT_SCHEMA,
  type ZedEvalArtifactPaths,
  type ZedEvalReceipt,
  type ZedEvalRequest,
  type ZedEvalUpstreamResult,
  type ZedEvalWorktreeFacts,
  type ZedEvalWrapperFailureKind,
} from '../../core/zed-eval/types';
import {
  redactProcessOutput,
  runProcess,
  type ProcessOutputRedaction,
  type ProcessRunResult,
  type RunProcessOptions,
} from '../process-runner';

const GIT_PROBE_TIMEOUT_MS = 10_000;
const ARTIFACT_FLUSH_GRACE_MS = 15_000;
const MAX_DIAGNOSTIC_BYTES = 64 * 1024;
const MAX_RESULT_BYTES = 256 * 1024;
const MAX_TRANSCRIPT_BYTES = 16 * 1024 * 1024;
const ARTIFACT_WARNING =
  'Artifacts are ignored raw evidence and may contain sensitive prompt, model, path, and tool content.';

export type RunZedEvalProcess = (
  command: string,
  args: readonly string[],
  options: RunProcessOptions,
) => ProcessRunResult;

export interface ZedEvalDependencies {
  readonly run?: RunZedEvalProcess;
  readonly now?: () => Date;
  readonly randomBytes?: (size: number) => Buffer;
  /** Test seam only; production uses the fixed artifact flush grace. */
  readonly flushGraceMs?: number;
}

interface PreparedZedEvalRun {
  readonly request: ZedEvalRequest;
  readonly binary: string;
  readonly workdir: string;
  readonly runId: string;
  readonly disabledTools: readonly string[];
  readonly artifacts: ZedEvalArtifactPaths;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? 'unknown failure');
}

function runOrDefault(deps: ZedEvalDependencies): RunZedEvalProcess {
  return deps.run ?? runProcess;
}

function isContained(parent: string, child: string, allowEqual = false): boolean {
  const rel = relative(parent, child);
  if (rel === '') return allowEqual;
  return rel !== '..'
    && !rel.startsWith(`..${sep}`)
    && !isAbsolute(rel);
}

function assertNoSymlinkAncestors(parent: string, child: string): void {
  if (!isContained(parent, child)) {
    throw new ZedEvalAdmissionError(`run path escapes repository root: ${child}`);
  }
  const rel = relative(parent, child);
  let current = parent;
  for (const segment of rel.split(sep)) {
    current = join(current, segment);
    if (!existsSync(current)) break;
    if (lstatSync(current).isSymbolicLink()) {
      throw new ZedEvalAdmissionError(`run path traverses symlink: ${current}`);
    }
  }
}

function canonicalDirectory(path: string, label: string): string {
  let canonical: string;
  try {
    canonical = realpathSync(path);
  } catch (error) {
    throw new ZedEvalAdmissionError(`${label} cannot be resolved: ${errorMessage(error)}`);
  }
  if (!statSync(canonical).isDirectory()) {
    throw new ZedEvalAdmissionError(`${label} must resolve to a directory`);
  }
  return canonical;
}

function canonicalExecutable(path: string): string {
  let canonical: string;
  try {
    canonical = realpathSync(path);
  } catch (error) {
    throw new ZedEvalAdmissionError(`--binary cannot be resolved: ${errorMessage(error)}`);
  }
  if (!statSync(canonical).isFile()) {
    throw new ZedEvalAdmissionError('--binary must resolve to a regular file');
  }
  try {
    accessSync(canonical, constants.X_OK);
  } catch {
    throw new ZedEvalAdmissionError('--binary must be executable');
  }
  return canonical;
}

function canonicalSuffixFile(path: string | undefined): string | undefined {
  if (path === undefined) return undefined;
  let canonical: string;
  try {
    canonical = realpathSync(path);
  } catch (error) {
    throw new ZedEvalAdmissionError(
      `--instruction-suffix-file cannot be resolved: ${errorMessage(error)}`,
    );
  }
  const stat = statSync(canonical);
  if (!stat.isFile()) {
    throw new ZedEvalAdmissionError('--instruction-suffix-file must be a regular file');
  }
  if (stat.size === 0) {
    throw new ZedEvalAdmissionError('--instruction-suffix-file must be non-empty');
  }
  try {
    accessSync(canonical, constants.R_OK);
  } catch {
    throw new ZedEvalAdmissionError('--instruction-suffix-file must be readable');
  }
  return canonical;
}

function gitResult(
  run: RunZedEvalProcess,
  workdir: string,
  args: readonly string[],
): ProcessRunResult {
  return run('git', ['-C', workdir, ...args], {
    cwd: workdir,
    stdio: 'pipe',
    timeoutMs: GIT_PROBE_TIMEOUT_MS,
    maxOutputBytes: 64 * 1024,
    processGroup: true,
  });
}

function gitText(
  run: RunZedEvalProcess,
  workdir: string,
  args: readonly string[],
  label: string,
): string {
  const result = gitResult(run, workdir, args);
  if (!result.ok) {
    const diagnostic = (result.stderr || result.error || `exit ${result.status}`).trim();
    throw new ZedEvalAdmissionError(`${label} failed${diagnostic ? `: ${diagnostic}` : ''}`);
  }
  return result.stdout.trim();
}

function resolveGitPath(base: string, value: string, label: string): string {
  const candidate = isAbsolute(value) ? value : resolve(base, value);
  try {
    return realpathSync(candidate);
  } catch (error) {
    throw new ZedEvalAdmissionError(`${label} cannot be resolved: ${errorMessage(error)}`);
  }
}

function probeWorktree(
  workdir: string,
  requireClean: boolean,
  run: RunZedEvalProcess,
): ZedEvalWorktreeFacts {
  const inside = gitText(
    run,
    workdir,
    ['rev-parse', '--is-inside-work-tree'],
    'Git worktree probe',
  ) === 'true';
  const topLevelText = gitText(
    run,
    workdir,
    ['rev-parse', '--show-toplevel'],
    'Git worktree root probe',
  );
  const worktreeRoot = canonicalDirectory(
    isAbsolute(topLevelText) ? topLevelText : resolve(workdir, topLevelText),
    'Git worktree root',
  );
  if (!isContained(worktreeRoot, workdir, true)) {
    throw new ZedEvalAdmissionError('--workdir resolves outside its Git worktree root');
  }

  const gitDirText = gitText(
    run,
    worktreeRoot,
    ['rev-parse', '--absolute-git-dir'],
    'Git directory probe',
  );
  const gitCommonDirText = gitText(
    run,
    worktreeRoot,
    ['rev-parse', '--git-common-dir'],
    'Git common directory probe',
  );
  const gitDir = resolveGitPath(worktreeRoot, gitDirText, 'Git directory');
  const gitCommonDir = resolveGitPath(worktreeRoot, gitCommonDirText, 'Git common directory');

  let clean = true;
  if (requireClean) {
    clean = gitText(
      run,
      worktreeRoot,
      ['status', '--porcelain=v1', '--untracked-files=all'],
      'Git cleanliness probe',
    ) === '';
  }

  return {
    insideWorkTree: inside,
    worktreeRoot,
    gitDir,
    gitCommonDir,
    clean,
  };
}

function makeRunId(deps: ZedEvalDependencies): string {
  const now = (deps.now ?? (() => new Date()))();
  const stamp = now.toISOString().replace(/[-:.TZ]/g, '');
  const entropy = (deps.randomBytes ?? nodeRandomBytes)(8).toString('hex');
  return `rh-ze-${stamp}-${entropy}`;
}

function allocateRunPaths(
  repoRoot: string,
  mode: ZedEvalRequest['mode'],
  deps: ZedEvalDependencies,
): { runId: string; artifacts: ZedEvalArtifactPaths } {
  const requestedRunsRoot = join(repoRoot, '.ai', 'harness', 'runs', 'zed-eval');
  assertNoSymlinkAncestors(repoRoot, requestedRunsRoot);
  mkdirSync(requestedRunsRoot, { recursive: true });
  const runsRoot = realpathSync(requestedRunsRoot);
  if (!isContained(repoRoot, runsRoot)) {
    throw new ZedEvalAdmissionError('canonical Zed eval runs root escapes repository root');
  }

  const runId = makeRunId(deps);
  const runRoot = join(runsRoot, runId);
  if (existsSync(runRoot)) {
    throw new ZedEvalAdmissionError(`generated Zed eval run already exists: ${runId}`);
  }
  mkdirSync(runRoot, { recursive: false, mode: 0o700 });
  const canonicalRunRoot = realpathSync(runRoot);
  if (!isContained(runsRoot, canonicalRunRoot)) {
    throw new ZedEvalAdmissionError('canonical Zed eval run root escapes runs root');
  }

  const outputDir = join(canonicalRunRoot, 'artifacts');
  if (existsSync(outputDir)) {
    throw new ZedEvalAdmissionError('artifacts path must be absent before launch');
  }

  let home: string | undefined;
  if (mode === 'writable') {
    const requestedHome = join(canonicalRunRoot, 'home');
    mkdirSync(requestedHome, { recursive: false, mode: 0o700 });
    chmodSync(requestedHome, 0o700);
    home = realpathSync(requestedHome);
    if (!isContained(canonicalRunRoot, home)) {
      throw new ZedEvalAdmissionError('run-scoped HOME escapes run root');
    }
    const operatorHome = existsSync(homedir()) ? realpathSync(homedir()) : resolve(homedir());
    if (home === operatorHome) {
      throw new ZedEvalAdmissionError('run-scoped HOME must differ from operator HOME');
    }
  }

  return {
    runId,
    artifacts: {
      runRoot: canonicalRunRoot,
      outputDir,
      resultJson: join(outputDir, 'result.json'),
      home,
    },
  };
}

function prepareZedEvalRun(
  request: ZedEvalRequest,
  deps: ZedEvalDependencies,
): PreparedZedEvalRun {
  validateZedEvalRequest(request);
  const binary = canonicalExecutable(request.binary);
  const workdir = canonicalDirectory(request.workdir, '--workdir');
  const instructionSuffixFile = canonicalSuffixFile(request.instructionSuffixFile);
  const canonicalRequest: ZedEvalRequest = {
    ...request,
    binary,
    workdir,
    instructionSuffixFile,
  };
  const worktree = probeWorktree(
    workdir,
    request.mode === 'writable',
    runOrDefault(deps),
  );
  const admission = admitZedEvalRequest(canonicalRequest, worktree);
  const allocated = allocateRunPaths(worktree.worktreeRoot, admission.mode, deps);

  return {
    request: canonicalRequest,
    binary,
    workdir,
    runId: allocated.runId,
    disabledTools: admission.disabledTools,
    artifacts: allocated.artifacts,
  };
}

function buildEvalCliArgs(prepared: PreparedZedEvalRun): string[] {
  const request = prepared.request;
  const args = [
    '--workdir', prepared.workdir,
    '--instruction', request.instruction,
    '--model', request.model,
    '--timeout', String(request.timeoutSeconds),
    '--output-dir', prepared.artifacts.outputDir,
  ];
  if (request.instructionSuffixFile) {
    args.push('--instruction-suffix-file', request.instructionSuffixFile);
  }
  if (request.noStaff === true) args.push('--no-staff');
  if (request.reasoningEffort) {
    args.push('--reasoning-effort', request.reasoningEffort);
  }
  if (request.thinking !== undefined) {
    args.push('--thinking', request.thinking ? 'true' : 'false');
  }
  return args;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function instructionRedaction(instruction: string): ProcessOutputRedaction {
  return {
    pattern: new RegExp(escapeRegExp(instruction), 'g'),
    replacement: '[instruction redacted]',
  };
}

function baseReceipt(
  prepared: PreparedZedEvalRun,
  process: ProcessRunResult,
): ZedEvalReceipt {
  return {
    schemaVersion: ZED_EVAL_RECEIPT_SCHEMA,
    runId: prepared.runId,
    sourceContract: {
      expectedZedCommit: ZED_EVAL_PINNED_COMMIT,
      binaryProvenance: 'unverified',
    },
    mode: prepared.request.mode,
    workdir: prepared.workdir,
    command: process.command,
    process: {
      status: process.status,
      signal: process.signal,
      timedOut: process.timedOut,
    },
    artifacts: prepared.artifacts,
    warning: ARTIFACT_WARNING,
  };
}

function failedReceipt(
  base: ZedEvalReceipt,
  kind: ZedEvalWrapperFailureKind,
  message: string,
): ZedEvalReceipt {
  return {
    ...base,
    failure: { kind, message },
  };
}

function assertOutputDirectory(outputDir: string): string {
  if (!existsSync(outputDir)) throw new Error('eval-cli did not create the artifacts directory');
  const lstat = lstatSync(outputDir);
  if (lstat.isSymbolicLink() || !lstat.isDirectory()) {
    throw new Error('eval-cli artifacts path must be a real directory');
  }
  return realpathSync(outputDir);
}

function assertRegularArtifact(
  outputDir: string,
  path: string,
  maxBytes: number,
  required: boolean,
): string | undefined {
  if (!existsSync(path)) {
    if (required) throw new Error(`missing artifact: ${path}`);
    return undefined;
  }
  const lstat = lstatSync(path);
  if (lstat.isSymbolicLink() || !lstat.isFile()) {
    throw new Error(`artifact must be a regular non-symlink file: ${path}`);
  }
  if (lstat.size > maxBytes) {
    throw new Error(`artifact exceeds ${maxBytes} bytes: ${path}`);
  }
  const canonicalOutput = assertOutputDirectory(outputDir);
  const canonical = realpathSync(path);
  if (!isContained(canonicalOutput, canonical)) {
    throw new Error(`artifact escapes output directory: ${path}`);
  }
  return canonical;
}

function readUtf8Fatal(path: string): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(path));
}

function sanitizedResult(
  result: ZedEvalUpstreamResult,
  instruction: string,
): ZedEvalUpstreamResult {
  if (!result.error) return result;
  const withSharedSecretsRemoved = redactProcessOutput(result.error);
  const withInstructionRemoved = redactProcessOutput(
    withSharedSecretsRemoved,
    [instructionRedaction(instruction)],
  );
  return { ...result, error: withInstructionRemoved };
}

export function runZedEval(
  request: ZedEvalRequest,
  deps: ZedEvalDependencies = {},
): ZedEvalReceipt {
  const prepared = prepareZedEvalRun(request, deps);
  const args = buildEvalCliArgs(prepared);
  const env: NodeJS.ProcessEnv = {
    ZED_EVAL_DISABLE_TOOLS: prepared.disabledTools.join(','),
  };
  if (prepared.artifacts.home) env.HOME = prepared.artifacts.home;

  const graceMs = deps.flushGraceMs ?? ARTIFACT_FLUSH_GRACE_MS;
  const outerTimeoutMs = prepared.request.timeoutSeconds * 1000 + graceMs;
  if (!Number.isSafeInteger(outerTimeoutMs) || outerTimeoutMs < 1) {
    throw new ZedEvalAdmissionError('combined process timeout is outside the safe integer range');
  }

  const processResult = runOrDefault(deps)(prepared.binary, args, {
    cwd: prepared.workdir,
    env,
    inheritEnv: true,
    stdio: 'pipe',
    processGroup: true,
    timeoutMs: outerTimeoutMs,
    maxOutputBytes: MAX_DIAGNOSTIC_BYTES,
    additionalRedactions: [instructionRedaction(prepared.request.instruction)],
  });
  const base = baseReceipt(prepared, processResult);

  if (processResult.timedOut) {
    return failedReceipt(
      base,
      'supervisor_timeout',
      processResult.error || 'outer process supervisor timed out',
    );
  }
  if (processResult.error) {
    return failedReceipt(base, 'spawn', processResult.error);
  }
  if (processResult.signal !== null) {
    return failedReceipt(
      base,
      'coherence',
      `eval-cli terminated by signal ${processResult.signal} without a validated terminal result`,
    );
  }
  if (![0, 1, 2, 3].includes(processResult.status)) {
    return failedReceipt(
      base,
      'coherence',
      `unsupported eval-cli exit code: ${processResult.status}`,
    );
  }

  let resultPath: string;
  try {
    assertOutputDirectory(prepared.artifacts.outputDir);
    resultPath = assertRegularArtifact(
      prepared.artifacts.outputDir,
      prepared.artifacts.resultJson,
      MAX_RESULT_BYTES,
      true,
    )!;
  } catch (error) {
    return failedReceipt(base, 'artifact', errorMessage(error));
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(readUtf8Fatal(resultPath));
  } catch (error) {
    return failedReceipt(base, 'schema', `invalid result.json: ${errorMessage(error)}`);
  }

  let result: ZedEvalUpstreamResult;
  try {
    result = parseZedEvalResult(parsedJson, prepared.request.model);
  } catch (error) {
    return failedReceipt(base, 'schema', errorMessage(error));
  }

  try {
    assertZedEvalExitStatusCoherence(processResult.status, result.status);
    const forbidden = new Set(prepared.disabledTools);
    for (const tool of Object.keys(result.tool_calls ?? {})) {
      if (forbidden.has(tool)) {
        throw new Error(`disabled tool reported by result: ${tool}`);
      }
    }
  } catch (error) {
    return failedReceipt(base, 'coherence', errorMessage(error));
  }

  let threadMarkdown: string | undefined;
  let threadJson: string | undefined;
  try {
    threadMarkdown = assertRegularArtifact(
      prepared.artifacts.outputDir,
      join(prepared.artifacts.outputDir, 'thread.md'),
      MAX_TRANSCRIPT_BYTES,
      false,
    );
    threadJson = assertRegularArtifact(
      prepared.artifacts.outputDir,
      join(prepared.artifacts.outputDir, 'thread.json'),
      MAX_TRANSCRIPT_BYTES,
      false,
    );
  } catch (error) {
    return failedReceipt(base, 'artifact', errorMessage(error));
  }

  return {
    ...base,
    result: sanitizedResult(result, prepared.request.instruction),
    artifacts: {
      ...prepared.artifacts,
      threadMarkdown,
      threadJson,
    },
  };
}
