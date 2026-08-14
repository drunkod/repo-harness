# Zed Agent Interactive Hand-off MVP 1

> **Artifact type:** documentation-only audit and implementation proposal
> **Decision:** revise the supplied draft before implementation
> **Recommended MVP:** standalone `repo-harness zed-agent` launcher, not an installer target
> **Branch:** `docs/zed-agent-mvp1-plan`
> **Prepared:** 2026-08-14

## Purpose

This package audits the proposed Zed MVP 1 against the current `repo-harness`
architecture and current Zed documentation. It provides a decision-complete,
implementation-ready replacement without modifying production code.

The proposed user experience remains intentionally small:

```bash
repo-harness zed-agent "Review the current diff and suggest the smallest safe fix"
```

The command asks the local `zed` CLI to open a `zed://agent?prompt=...` URI.
After the CLI accepts that hand-off, the user must check Zed and, if the prompt
appears in the Agent Panel, review and submit it. The command does not observe
editor state, run an agent turn, wait for completion, collect a result, install
hooks, or declare Zed runtime compatibility.

## Verdict

**Do not implement the supplied draft as written.** Its installer-target design
crosses an abstraction boundary and changes existing `--target both` behavior.
Implement the launcher-only revision described in this package if the
interactive convenience command is still desired.

The decisive repository fact is:

```ts
function resolveTargets(spec: InstallTargetSpec) {
  if (spec === 'both') return [...ALL_TARGETS];
}
```

Appending a detect-only Zed entry to `ALL_TARGETS` would make `both` include
Zed. It would not remain Claude plus Codex as the draft claims.

## Terminology

Use these terms consistently:

- **Zed:** editor and agent host.
- **Zed Agent:** Zed's native agent path.
- **External Agent:** an agent integrated into Zed over Agent Client Protocol
  (ACP), such as Claude or Codex.
- **LLM provider:** a model/API provider used by Zed Agent.
- **repo-harness installer target:** a Claude/Codex hook-runtime configuration
  writer represented by `AgentTarget`.
- **interactive hand-off:** a one-way prompt prefill opened through a Zed URI.

MVP 1 is only the final item. It is not a provider integration and not an ACP
agent integration.

## Package contents

| Document | Purpose |
|---|---|
| [`audit-and-decision.md`](audit-and-decision.md) | Findings, rejected assumptions, alternatives, and revised decision |
| [`implementation-plan.md`](implementation-plan.md) | Scope, architecture, future file list, acceptance criteria, risk, and rollback |
| [`tasks-and-subtasks.md`](tasks-and-subtasks.md) | Ordered implementation tasks and verification subtasks |
| [`proposed-code-snippets.md`](proposed-code-snippets.md) | Complete proposed TypeScript, test, CLI registration, and documentation snippets |
| [`implementation-and-testing-tutorial.md`](implementation-and-testing-tutorial.md) | File-by-file execution and validation tutorial |

## Revised MVP contract

### In scope

- Build `zed://agent?prompt=...` deterministically.
- Invoke the local `zed` CLI with that URI.
- Add a standalone Commander command named `zed-agent`.
- Return a non-zero exit code when the CLI cannot be launched.
- State clearly that the CLI accepted a hand-off and the user must check Zed,
  review the prompt if it appears, and submit it manually.
- Keep prompt contents out of repo-harness stdout and stderr, including
  Commander parse-error paths for prompts that begin with `-`.
- Unit-test URI construction and process invocation through an injected runner.
- End-to-end test CLI registration with a fake `zed` executable.
- Document privacy and operational limitations.

### Out of scope

- `AgentTarget`, `TargetId`, `InstallTargetSpec`, or `ALL_TARGETS` changes.
- `repo-harness install --target zed`.
- Zed hook installation or event dispatch.
- Adding `zed` to `compatibility.agents`.
- Fleet projection, subagent definitions, cross-review, benchmark providers, or
  headless execution.
- ACP server implementation.
- `eval-cli` or `zed-eval` orchestration.
- Automatic submission, result capture, completion tracking, or exit status for
  the agent turn.
- Guaranteeing which open Zed workspace receives the prompt.

## Future implementation file set

### Exact hand-authored files

If this proposal is approved, the implementation should hand-edit only:

```text
src/effects/zed-agent-launcher.ts                                      new
src/cli/commands/zed-agent.ts                                          new
src/cli/index.ts                                                       edit
tests/effects/zed-agent-launcher.test.ts                               new
tests/cli/zed-agent.test.ts                                            new
assets/reference-configs/external-tooling.md                           edit
.archcontext/model/nodes/capability.runtime-harness.global-runtime-reconciliation.yaml  edit
```

The architecture node must claim the two new source paths and focused tests;
otherwise they remain unmatched/root paths while `src/cli/index.ts` and the
external-tooling docs already resolve to the global-runtime-reconciliation
capability.

### Deterministic generated/projection files

Run the repository projection commands rather than editing these directly:

```text
docs/reference-configs/external-tooling.md                             generated by sync:reference-configs
docs/architecture/modules/runtime-harness/global-runtime-reconciliation.md  generated by ArchContext projection
docs/architecture/.projection-manifest.json                           generated when reported by archctx docs plan
```

`archctx docs plan --json` is authoritative for any additional generated
architecture paths. Workflow artifacts required by repository policy should be
created through the normal plan/contract workflow when implementation is
approved. Timestamped workflow files and generated projection outputs are not
hard-coded as hand edits in this documentation-only audit.

## Files explicitly excluded from MVP 1

```text
src/cli/installer/types.ts
src/cli/installer/targets/registry.ts
src/cli/installer/targets/zed.ts
src/cli/commands/install.ts
src/cli/hook/route-registry.ts
src/cli/installer/managed-entries.ts
src/core/review/cross-review.ts
src/effects/review/cross-review-runner.ts
assets/templates/helpers/install-agent-fleet.sh
assets/workflow-contract.v1.json
.ai/harness/workflow-contract.json
```

## Security and privacy summary

The prompt is embedded in a URI and passed as a process argument. Therefore it
may be observable in process listings, endpoint telemetry, URI-handler logs, or
Zed diagnostics while the hand-off occurs. MVP 1 must:

1. never print the prompt or full URI;
2. never include the prompt in error messages, including Commander errors before
   the action executes;
3. accept unknown option-like prompt words as positional data without echoing
   them; known command options such as `--help` remain options and literal
   prompts with those values require the standard `--` separator;
4. advise users not to pass secrets or sensitive source text;
5. avoid claiming that URL encoding is encryption;
6. document that portable deep-link length limits are not established; and
7. use only non-sensitive test prompts in manual verification.

## Research basis

### Current official sources

Accessed 2026-08-14:

- [Zed agent paths](https://zed.dev/docs/ai/agents.md)
- [Zed External Agents and ACP](https://zed.dev/docs/ai/external-agents.md)
- [Zed Agent Panel](https://zed.dev/docs/ai/agent-panel.md)
- [Zed CLI reference](https://zed.dev/docs/reference/cli.md)
- [Zed Agent Server Extensions deprecation](https://zed.dev/docs/extensions/agent-servers.md)
- [Agent Client Protocol](https://agentclientprotocol.com)

The official CLI reference confirms that the CLI can open `zed://` URLs. The
Agent Panel documentation states that the user types in the message editor and
presses Enter to submit. Zed's first-class external-agent extension point is
ACP. The supplied research contains the source-level audit of the specific
`zed://agent?prompt=` route; that route should still be verified manually
against the supported Zed release before merge because it is not documented in
the current public CLI reference.

### Supplied research

The following were session attachments under `/Users/test/Downloads` at audit
time. They are external provenance, not repository runtime dependencies; their
durable conclusions have been promoted into this package.

- `wikeep-devin-session-drunkod_repo-harness-please deep research how inte-2026-08-14.md`
- `deep-research-report (5).md`
- `wikeep-devin-session-drunkod_repo-harness-pleas e research how integrat-2026-08-13.md`
- `wikeep-devin-drunkod_repo-harness-__full-wiki-2026-08-13 (2).md`

## Approval gate

Before implementation begins, confirm all of the following:

- [ ] The desired product is a convenience hand-off, not first-class Zed runtime compatibility.
- [ ] A manual smoke test confirms the supported Zed release still accepts `zed://agent?prompt=`.
- [ ] The URI prefills rather than auto-submits the prompt.
- [ ] The lack of structured result and completion tracking is acceptable.
- [ ] Prompt-in-URI privacy limitations are acceptable.
- [ ] The launcher-only hand-authored file set and generated projection surfaces are approved.

If any item is false, stop and choose an ACP or headless-runtime design instead.
