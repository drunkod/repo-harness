export type DelegationBudgetField =
  | { readonly state: 'missing'; readonly raw: null; readonly value: null }
  | { readonly state: 'null'; readonly raw: string; readonly value: null }
  | { readonly state: 'number'; readonly raw: string; readonly value: number }
  | { readonly state: 'invalid'; readonly raw: string; readonly value: null };

export interface ParsedTaskContractDelegationBudget {
  readonly block: string | null;
  readonly hasLegacyToolCalls: boolean;
  readonly tokens: DelegationBudgetField;
  readonly runner_invocations: DelegationBudgetField;
  readonly wall_time_minutes: DelegationBudgetField;
}

const BUDGET_FIELDS = ['tokens', 'runner_invocations', 'wall_time_minutes'] as const;

export function taskContractDelegationYamlBlock(markdown: string): string | null {
  const fence = /```yaml\s*\n([\s\S]*?)\n```/g;
  let match: RegExpExecArray | null;
  while ((match = fence.exec(markdown)) !== null) {
    if (/(^|\n)delegation:/.test(match[1]!)) return match[1]!;
  }
  return null;
}

function parseField(block: string | null, key: string): DelegationBudgetField {
  if (block === null) return { state: 'missing', raw: null, value: null };
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = block.match(new RegExp(`^\\s*${escaped}:\\s*(.+)$`, 'm'));
  if (!match) return { state: 'missing', raw: null, value: null };

  const raw = match[1]!.trim();
  const scalar = raw.replace(/^["']|["']$/g, '');
  if (raw === 'null' || raw === '~' || scalar === 'null' || scalar === '~') {
    return { state: 'null', raw, value: null };
  }

  const parsed = Number(scalar);
  return Number.isFinite(parsed)
    ? { state: 'number', raw, value: parsed }
    : { state: 'invalid', raw, value: null };
}

export function parseTaskContractDelegationBudget(markdown: string): ParsedTaskContractDelegationBudget {
  const block = taskContractDelegationYamlBlock(markdown);
  const parsed = Object.fromEntries(BUDGET_FIELDS.map((field) => [field, parseField(block, field)])) as {
    tokens: DelegationBudgetField;
    runner_invocations: DelegationBudgetField;
    wall_time_minutes: DelegationBudgetField;
  };
  return Object.freeze({
    block,
    hasLegacyToolCalls: block !== null && /^\s*tool_calls\s*:/m.test(block),
    ...parsed,
  });
}

export function delegationBudgetNumber(field: DelegationBudgetField): number | null {
  return field.state === 'number' ? field.value : null;
}
