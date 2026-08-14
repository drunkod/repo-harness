import { afterEach, describe, expect, test } from 'bun:test';
import { chmodSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { spawnSync } from 'child_process';
import { PINNED_ZED_EVAL_COMMIT } from '../../src/core/zed-benchmark/admission';

const CLI = resolve(import.meta.dir, '..', '..', 'src', 'cli', 'index.ts');
const SOURCE_SHA = '0123456789abcdef0123456789abcdef01234567';
const roots: string[] = [];

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'repo-harness-zb-cli-'));
  roots.push(root);
  const repo = join(root, 'repo');
  const checkout = join(root, 'zed');
  const bin = join(root, 'bin');
  const capture = join(root, 'zed-eval-argv.log');
  mkdirSync(repo, { recursive: true });
  mkdirSync(bin, { recursive: true });
  mkdirSync(join(checkout, 'crates', 'eval_cli', 'script'), { recursive: true });

  const git = join(bin, 'git');
  writeFileSync(git, `#!/usr/bin/env bash\nprintf '%s\\n' '${PINNED_ZED_EVAL_COMMIT}'\n`, { mode: 0o755 });
  chmodSync(git, 0o755);

  const zedEval = join(checkout, 'crates', 'eval_cli', 'script', 'zed-eval');
  writeFileSync(zedEval, `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "${capture}"
mode=""
run_id=""
jobs_dir=""
prev=""
for arg in "$@"; do
  if [[ "$prev" == "fetch" || "$prev" == "status" || "$prev" == "logs" || "$prev" == "report" ]]; then run_id="$arg"; fi
  if [[ "$prev" == "--jobs-dir" ]]; then jobs_dir="$arg"; fi
  case "$arg" in run|status|logs|fetch|report) mode="$arg" ;; esac
  prev="$arg"
done
case "$mode" in
  run)
    if [[ "\${ZED_EVAL_FAIL_RUN:-0}" == "1" ]]; then echo 'ambiguous submit' >&2; exit 9; fi
    exit 0
    ;;
  status)
    printf '{"status":"running","run_id":"%s","namespace":"repo-harness-evals","experiment_name":"rf"}\\n' "$run_id"
    ;;
  logs)
    printf 'controller log for %s\\n' "$run_id"
    ;;
  fetch)
    mkdir -p "$jobs_dir/$run_id"
    printf 'fetched\\n'
    ;;
  report)
    printf '{"label":"%s","job_dir":"fixture","n_trials":1,"n_scored":1,"n_passed":1,"n_failed":0,"n_errored":0,"n_attempts":1,"pass_rate":1,"pass_sem":null,"resolved_models":{"sonnet-4.6":1},"agent_statuses":{"completed":1},"on_success":{},"overall":{},"errored_trials":[]}\\n' "$run_id"
    ;;
  *) echo "unexpected mode: $mode" >&2; exit 2 ;;
esac
`, { mode: 0o755 });
  chmodSync(zedEval, 0o755);

  return { root, repo, checkout, bin, capture };
}

function runCli(args: string[], fixtureData: ReturnType<typeof fixture>, extraEnv: NodeJS.ProcessEnv = {}) {
  return spawnSync('bun', [CLI, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fixtureData.bin}:${process.env.PATH ?? ''}`,
      ...extraEnv,
    },
  });
}

function submitArgs(checkout: string, json = false): string[] {
  return [
    'zed-benchmark',
    '--repo', '__REPO__',
    'submit',
    '--zed-checkout', checkout,
    '--source-sha', SOURCE_SHA,
    '--namespace', 'repo-harness-evals',
    '--benchmark', 'rf',
    '--model', 'sonnet-4.6',
    '--n-tasks', '1',
    '--n-concurrent', '1',
    '--acknowledge-remote-cost-and-data',
    ...(json ? ['--json'] : []),
  ];
}

function withRepo(args: string[], repo: string): string[] {
  return args.map((arg) => arg === '__REPO__' ? repo : arg);
}

function nonEvidenceFiles(root: string): string[] {
  const output: string[] = [];
  function walk(dir: string, rel = ''): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const childRel = rel ? join(rel, entry.name) : entry.name;
      if (childRel === '.ai') continue;
      const child = join(dir, entry.name);
      if (entry.isDirectory()) walk(child, childRel);
      else output.push(childRel);
    }
  }
  walk(root);
  return output.sort();
}

describe('zed-benchmark CLI', () => {
  test('top-level help registers the benchmark-only command once and install help remains Claude/Codex-only', () => {
    const f = fixture();
    const help = runCli(['--help'], f);
    expect(help.status).toBe(0);
    expect((help.stdout.match(/zed-benchmark/g) ?? []).length).toBe(1);
    const zedHelp = runCli(['zed-benchmark', '--help'], f);
    expect(zedHelp.status).toBe(0);
    expect(zedHelp.stdout).toContain('Benchmark-only');
    expect(zedHelp.stdout).toContain('no cancellation command');
    expect(zedHelp.stdout).toContain('Remote Modal/model execution can incur cost');
    const installHelp = runCli(['install', '--help'], f);
    expect(installHelp.stdout).toContain('codex|claude|both');
    expect(installHelp.stdout).not.toContain('zed-benchmark');
    expect(installHelp.stdout).not.toContain('codex|claude|zed');
  });

  test('missing cost/data acknowledgement fails before git or zed-eval', () => {
    const f = fixture();
    const args = withRepo(submitArgs(f.checkout).filter((arg) => arg !== '--acknowledge-remote-cost-and-data'), f.repo);
    const result = runCli(args, f);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('acknowledgement is required');
    expect(() => readFileSync(f.capture, 'utf8')).toThrow();
    expect(nonEvidenceFiles(f.repo)).toEqual([]);
  });

  test('submit, status, logs, fetch, and report use one exact generated run id and confined paths', () => {
    const f = fixture();
    const submitted = runCli(withRepo(submitArgs(f.checkout), f.repo), f);
    expect(submitted.status).toBe(0);
    const match = submitted.stdout.match(/submitted (rh-zb-[0-9a-f-]+);/);
    expect(match).not.toBeNull();
    const runId = match![1]!;

    const receiptPath = join(f.repo, '.ai', 'harness', 'runs', 'zed-benchmark', runId, 'receipt.json');
    const receipt = JSON.parse(readFileSync(receiptPath, 'utf8')) as { runId: string; phase: string };
    expect(receipt.runId).toBe(runId);
    expect(receipt.phase).toBe('pending');

    const status = runCli(['zed-benchmark', '--repo', f.repo, 'status', '--run-id', runId, '--json'], f);
    expect(status.status).toBe(0);
    expect(JSON.parse(status.stdout).status).toBe('running');

    const logs = runCli(['zed-benchmark', '--repo', f.repo, 'logs', '--run-id', runId], f);
    expect(logs.status).toBe(0);
    expect(logs.stdout).toContain(`controller log for ${runId}`);

    const fetched = runCli(['zed-benchmark', '--repo', f.repo, 'fetch', '--run-id', runId], f);
    expect(fetched.status).toBe(0);
    const expectedJobDir = join(f.repo, '.ai', 'harness', 'runs', 'zed-benchmark', runId, 'artifacts', runId);
    expect(readdirSync(expectedJobDir)).toEqual([]);

    const report = runCli(['zed-benchmark', '--repo', f.repo, 'report', '--run-id', runId, '--json'], f);
    expect(report.status).toBe(0);
    expect(JSON.parse(report.stdout).n_passed).toBe(1);

    const calls = readFileSync(f.capture, 'utf8').trim().split(/\r?\n/);
    expect(calls[0]).toContain(`run rf --run-id ${runId} --from ${SOURCE_SHA} --require-clean`);
    expect(calls.some((line) => line.includes(`status ${runId} --experiment-name rf`))).toBe(true);
    expect(calls.some((line) => line.includes(`logs ${runId} --experiment-name rf`))).toBe(true);
    expect(calls.some((line) => line.includes(`fetch ${runId} --experiment-name rf --jobs-dir ${join(f.repo, '.ai', 'harness', 'runs', 'zed-benchmark', runId, 'artifacts')}`))).toBe(true);
    const reportCall = calls.find((line) => line.includes(`report ${runId}`))!;
    expect(reportCall).toContain(`--job-dir ${expectedJobDir} --json`);
    expect(reportCall).not.toContain('--fetch');
    expect(nonEvidenceFiles(f.repo)).toEqual([]);
  });

  test('uncertain JSON output preserves valid stdout and tells the operator not to retry on stderr', () => {
    const f = fixture();
    const result = runCli(withRepo(submitArgs(f.checkout, true), f.repo), f, { ZED_EVAL_FAIL_RUN: '1' });
    expect(result.status).toBe(1);
    const payload = JSON.parse(result.stdout) as { outcome: string; runId: string; phase: string };
    expect(payload.outcome).toBe('submission-uncertain');
    expect(payload.phase).toBe('submission-uncertain');
    expect(payload.runId).toMatch(/^rh-zb-/);
    expect(result.stderr).toContain('do not retry submit; run status with this run ID');
    const calls = readFileSync(f.capture, 'utf8').trim().split(/\r?\n/);
    expect(calls).toHaveLength(1);
  });

  test('the command module does not import forbidden fleet/review/hook/installer surfaces or register cancel/deploy', () => {
    const source = readFileSync(resolve(import.meta.dir, '..', '..', 'src', 'cli', 'commands', 'zed-benchmark.ts'), 'utf8');
    expect(source).not.toMatch(/from ['"][^'"]*(?:fleet|review|hook|installer)[^'"]*['"]/);
    expect(source).not.toMatch(/\.command\(['"]cancel['"]\)/);
    expect(source).not.toMatch(/\.command\(['"]deploy['"]\)/);
  });
});
