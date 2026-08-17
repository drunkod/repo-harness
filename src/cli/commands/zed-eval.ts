import { Command, InvalidArgumentError, Option } from 'commander';
import { readFileSync } from 'fs';
import { ZED_EVAL_PINNED_COMMIT, type ZedEvalMode, type ZedEvalReasoningEffort } from '../../core/zed-eval/types';
import { runZedEval } from '../../effects/zed-eval/run-zed-eval';

const DEFAULT_MODEL = 'anthropic/claude-sonnet-4-6-latest';
const DEFAULT_TIMEOUT_SECONDS = 120;
const ADAPTER_ERROR_EXIT = 4;

interface ZedEvalCliOptions {
  readonly binary: string;
  readonly workdir: string;
  readonly instruction?: string;
  readonly instructionSuffixFile?: string;
  readonly model: string;
  readonly timeout: number;
  readonly staff: boolean;
  readonly reasoningEffort?: ZedEvalReasoningEffort;
  readonly thinking?: boolean;
  readonly mode: ZedEvalMode;
  readonly disposableWorktree?: boolean;
  readonly json?: boolean;
}

function parsePositiveInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new InvalidArgumentError('must be a positive safe integer');
  }
  return parsed;
}

function parseBoolean(value: string): boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new InvalidArgumentError('must be true or false');
}

function readInstruction(explicit: string | undefined): string {
  const stdin = process.stdin.isTTY === true ? undefined : readFileSync(0, 'utf8');
  const piped = stdin !== undefined && stdin.trim() !== '' ? stdin.trim() : undefined;
  if (explicit !== undefined && piped !== undefined) {
    throw new Error('use exactly one instruction source: --instruction or non-empty stdin');
  }
  const instruction = explicit ?? piped;
  if (instruction === undefined || instruction.trim() === '') {
    throw new Error('instruction is required via --instruction or stdin');
  }
  return instruction;
}

function printHuman(receipt: ReturnType<typeof runZedEval>): void {
  const status = receipt.result?.status ?? receipt.failure?.kind ?? 'unknown';
  const lines = [
    `zed-eval: ${status}`,
    `mode: ${receipt.mode}`,
    `run: ${receipt.runId}`,
    `artifacts: ${receipt.artifacts.outputDir}`,
  ];
  if (receipt.result) {
    lines.splice(2, 0, `model: ${receipt.result.model}`, `duration_secs: ${receipt.result.duration_secs}`);
  }
  lines.push(`warning: ${receipt.warning}`);
  process.stdout.write(`${lines.join('\n')}\n`);
  if (receipt.failure) {
    process.stderr.write(`zed-eval: ${receipt.failure.kind}: ${receipt.failure.message}\n`);
  }
}

export function buildZedEvalCommand(): Command {
  const command = new Command('zed-eval')
    .description('Run one local headless Zed eval-cli session and return one terminal receipt')
    .requiredOption('--binary <absolute-path>', 'Caller-built eval-cli executable; repo-harness never installs it')
    .requiredOption('--workdir <absolute-path>', 'Git worktree directory for the run')
    .option('--instruction <text>', 'Instruction text; mutually exclusive with non-empty stdin')
    .option('--instruction-suffix-file <absolute-path>', 'Readable non-empty file appended by eval-cli')
    .option('--model <provider/model>', 'Pinned eval-cli provider/model identifier', DEFAULT_MODEL)
    .option('--timeout <seconds>', 'Upstream agent timeout in seconds', parsePositiveInteger, DEFAULT_TIMEOUT_SECONDS)
    .option('--no-staff', 'Disable eval-cli staff mode')
    .addOption(new Option('--reasoning-effort <level>').choices(['low', 'medium', 'high']))
    .option('--thinking <bool>', 'Override thinking with true or false', parseBoolean)
    .addOption(new Option('--mode <mode>').choices(['read-only', 'writable']).default('read-only'))
    .option('--disposable-worktree', 'Required acknowledgement for writable mode; invalid in read-only mode')
    .option('--json', 'Emit the normalized terminal receipt as JSON')
    .addHelpText('after', [
      '',
      `Pinned source contract: Zed ${ZED_EVAL_PINNED_COMMIT}. Re-audit before changing the pin.`,
      'read-only restricts the pinned built-in mutation, shell, network, and subagent tools.',
      'It is not an OS sandbox, read-only filesystem, network namespace, or pre-tool authorization boundary.',
      'writable requires a clean linked non-primary worktree plus --disposable-worktree and uses a fresh run-scoped HOME.',
      'Artifacts remain ignored raw evidence and may contain sensitive prompt/model/tool content.',
      '',
    ].join('\n'));

  command.action((options: ZedEvalCliOptions) => {
    try {
      const instruction = readInstruction(options.instruction);
      const receipt = runZedEval({
        binary: options.binary,
        workdir: options.workdir,
        instruction,
        instructionSuffixFile: options.instructionSuffixFile,
        model: options.model,
        timeoutSeconds: options.timeout,
        noStaff: options.staff === false,
        reasoningEffort: options.reasoningEffort,
        thinking: options.thinking,
        mode: options.mode,
        disposableWorktree: options.disposableWorktree === true,
      });

      if (options.json === true) {
        process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
      } else {
        printHuman(receipt);
      }
      process.exitCode = receipt.failure ? ADAPTER_ERROR_EXIT : receipt.process.status;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? 'unknown failure');
      process.stderr.write(`zed-eval: ${message}\n`);
      process.exitCode = ADAPTER_ERROR_EXIT;
    }
  });

  return command;
}
