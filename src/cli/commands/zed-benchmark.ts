import { Command } from 'commander';
import { resolve } from 'path';
import {
  PINNED_ZED_EVAL_COMMIT,
  ZED_BENCHMARK_MAX_CONCURRENT,
  ZED_BENCHMARK_MAX_TASKS,
  ZedBenchmarkAdmissionError,
  isZedBenchmarkSelector,
} from '../../core/zed-benchmark/admission';
import type { ZedBenchmarkSubmitRequest } from '../../core/zed-benchmark/types';
import {
  fetchZedBenchmark,
  logsZedBenchmark,
  reportZedBenchmark,
  statusZedBenchmark,
  submitZedBenchmark,
} from '../../effects/zed-benchmark/run-zed-benchmark';

function fail(error: unknown, exitCode?: number): never {
  const message = error instanceof Error ? error.message : 'unknown failure';
  process.stderr.write(`zed-benchmark: ${message}\n`);
  process.exit(exitCode ?? (error instanceof ZedBenchmarkAdmissionError ? 2 : 1));
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ZedBenchmarkAdmissionError(`${label} is required`);
  }
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new ZedBenchmarkAdmissionError(`${label} must be a positive integer`);
  }
  return parsed;
}

function rootOption(command: Command): string {
  return resolve(command.optsWithGlobals<{ repo?: string }>().repo ?? process.cwd());
}

export function buildZedBenchmarkCommand(): Command {
  const command = new Command('zed-benchmark')
    .description('Launch and inspect pinned remote Zed benchmark runs')
    .option('--repo <path>', 'Repository root used only for local ignored receipts', '.')
    .addHelpText(
      'after',
      [
        '',
        'Benchmark-only: this does not run a free-form task against the current repository.',
        'It is not a repository writer, provider, reviewer, sandbox attestation, or generic fleet runtime.',
        'Remote Modal/model execution can incur cost and share logs, patches, tasks, and artifacts.',
        'MVP 3 has no cancellation command. Never use deploy as cancellation.',
        '',
      ].join('\n'),
    );

  command
    .command('submit')
    .description('Submit one pinned remote benchmark; never auto-retries')
    .option('--zed-checkout <absolute-path>', 'Required. Pinned Zed source checkout')
    .option('--source-sha <40-hex-sha>', 'Required. Clean Zed source commit to benchmark')
    .option('--namespace <slug>', 'Required. Explicit remote volume namespace')
    .option('--benchmark <selector>', 'Required. qna|rf|tw|terminal-bench-2.1|deepswe')
    .option('--model <id>', 'Required. Upstream Zed model preset or provider/model id')
    .option('--n-tasks <count>', `Required. Task count, maximum ${ZED_BENCHMARK_MAX_TASKS}`)
    .option('--n-concurrent <count>', `Required. Concurrency, maximum ${ZED_BENCHMARK_MAX_CONCURRENT}`)
    .option(
      '--acknowledge-remote-cost-and-data',
      'Required. Acknowledge remote cost and data/artifact sharing',
    )
    .option('--json', 'Emit a machine-readable local outcome')
    .action((options: Record<string, string | boolean | undefined>, actionCommand: Command) => {
      try {
        const benchmark = requiredString(options.benchmark, '--benchmark');
        if (!isZedBenchmarkSelector(benchmark)) {
          throw new ZedBenchmarkAdmissionError('unsupported benchmark selector');
        }
        const request: ZedBenchmarkSubmitRequest = {
          repoRoot: rootOption(actionCommand),
          zedCheckout: requiredString(options.zedCheckout, '--zed-checkout'),
          integrationPin: PINNED_ZED_EVAL_COMMIT,
          sourceSha: requiredString(options.sourceSha, '--source-sha'),
          namespace: requiredString(options.namespace, '--namespace'),
          benchmark,
          model: requiredString(options.model, '--model'),
          nTasks: positiveInteger(options.nTasks, '--n-tasks'),
          nConcurrent: positiveInteger(options.nConcurrent, '--n-concurrent'),
          acknowledgeRemoteCostAndData: options.acknowledgeRemoteCostAndData === true,
        };
        const outcome = submitZedBenchmark(request);
        const payload = {
          outcome: outcome.kind,
          runId: outcome.receipt.runId,
          phase: outcome.receipt.phase,
          receipt: outcome.receipt.runDir,
        };
        if (options.json === true) {
          process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
        } else if (outcome.kind === 'submitted') {
          process.stdout.write(
            `submitted ${payload.runId}; run repo-harness zed-benchmark status --run-id ${payload.runId}\n`,
          );
        }
        if (outcome.kind === 'submission-uncertain') {
          process.stderr.write(
            `submission status is uncertain for ${payload.runId}; do not retry submit; run status with this run ID.\n`,
          );
          if (outcome.diagnostic) {
            process.stderr.write(`zed-benchmark: ${outcome.diagnostic}\n`);
          }
        }
        process.exit(outcome.kind === 'submitted' ? 0 : 1);
      } catch (error) {
        fail(error);
      }
    });

  command
    .command('status')
    .description('Read and validate the pinned upstream state.json lifecycle')
    .option('--run-id <id>', 'Required. Repo-harness Zed benchmark run ID')
    .option('--json', 'Emit the validated upstream state object')
    .action((options: { runId?: string; json?: boolean }, actionCommand: Command) => {
      try {
        const runId = requiredString(options.runId, '--run-id');
        const state = statusZedBenchmark(rootOption(actionCommand), runId);
        process.stdout.write(
          options.json === true
            ? `${JSON.stringify(state.raw, null, 2)}\n`
            : `${state.status}\n`,
        );
      } catch (error) {
        fail(error);
      }
    });

  command
    .command('logs')
    .description('Print potentially sensitive bounded/redacted controller logs once')
    .option('--run-id <id>', 'Required. Repo-harness Zed benchmark run ID')
    .action((options: { runId?: string }, actionCommand: Command) => {
      try {
        const runId = requiredString(options.runId, '--run-id');
        process.stdout.write(logsZedBenchmark(rootOption(actionCommand), runId));
      } catch (error) {
        fail(error);
      }
    });

  command
    .command('fetch')
    .description('Fetch the benchmark archive into the run-scoped ignored evidence directory')
    .option('--run-id <id>', 'Required. Repo-harness Zed benchmark run ID')
    .action((options: { runId?: string }, actionCommand: Command) => {
      try {
        const runId = requiredString(options.runId, '--run-id');
        void fetchZedBenchmark(rootOption(actionCommand), runId);
        process.stdout.write(`fetched ${runId} into ignored run evidence\n`);
      } catch (error) {
        fail(error);
      }
    });

  command
    .command('report')
    .description('Validate report JSON from an already fetched local job directory')
    .option('--run-id <id>', 'Required. Repo-harness Zed benchmark run ID')
    .option('--json', 'Emit the validated upstream report object')
    .action((options: { runId?: string; json?: boolean }, actionCommand: Command) => {
      try {
        const runId = requiredString(options.runId, '--run-id');
        const report = reportZedBenchmark(rootOption(actionCommand), runId);
        if (options.json === true) {
          process.stdout.write(`${JSON.stringify(report.raw, null, 2)}\n`);
        } else {
          process.stdout.write(
            `benchmark report: ${String(report.raw.n_passed)}/${String(report.raw.n_scored)} scored passed\n`,
          );
        }
      } catch (error) {
        fail(error);
      }
    });

  return command;
}
