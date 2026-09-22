# Start here: a new repository with Planner and Luna-low

Status: usable onboarding/planning entrypoint; unattended execution is deployment-gated.
Last reviewed: 2026-09-22.

## What you can do now

Start with **repository inspection, adoption only if needed, and one approved task**.
Do not wait for host automation work to begin product planning. Do not promise an
unattended Sprint merely because the CLI exposes controller primitives.

The corrected runtime revision `823f1f8fce000142ba7b69438ac67f7344bc9b95` is published on
`origin/docs/new-project-fast-luna-019`, but the current Nix pin
`3d0ada93d2d370627b12907a84b2b567ba3c8751` does not contain it. A `0.19.0` version string alone does not
prove the fix is installed. Until the published revision (or a descendant
containing it) is pinned, validated and activated, treat the multi-minute
`repo-harness run contract-run run` path as unavailable on the current Nix pin:
its outer helper timeout is 120 seconds. Do not work around this by silently
disabling the deadline or changing the user's global installation.

If the installed runtime cannot support the selected task safely, finish planning,
report the precise execution blocker, and let the human choose an explicitly
approved alternative. A supervised task still needs a supported execution path;
"supervised" does not remove the timeout.

## Which document do I use?

| Document | Use |
|---|---|
| This page | Entry decision, safe defaults, copy/paste setup and resume prompts |
| [Human runbook](../deploy/runbooks/new-repository-fast-luna.md) | Exact claim, plan, worktree, lease binding, evidence and closeout procedure after checking runtime compatibility |
| [Detailed tutorial](repo-harness-new-project-fast-luna-tutorial.md) | Explanations and command examples; not proof of what is installed |
| [MCP/CodeGraph operations](../deploy/runbooks/general-repo-mcp-codegraph.md) | Optional MCP/index troubleshooting; not a mandatory onboarding step |
| `nix-config/REPO-HARNESS.md` | Host installation, upgrades and projection ownership |
| `nix-config/docs/repo-harness/guides/01-onboard-repository.md` | M1-min host preflight and onboarding wrapper |
| `nix-config/docs/repo-harness/quick/planner.md` | Planner capability boundary and connector operations |
| [Deferred goals](../tasks/todos.md#deferred-new-repository-rollout) | Follow-up deployment and hands-off execution gates |

The Nix paths above are in the separate host repository, not this package.
Use documentation from the same reviewed revision as the runtime. Source runbooks
are not guaranteed to be included in the installed CLI package.

## Workflow and ownership

```text
Human approves product scope and explicit execution/publication limits
  -> ChatGPT Pro / parent agent: product and architecture decisions
  -> Repo Harness: approved plan, contract, claim and worktree identity
  -> local Codex client using Luna-low: bounded implementation
  -> canonical deterministic verification
  -> independent policy-selected read-only semantic reviewer
  -> typed AcceptanceReceipt
  -> authorized closeout and separately authorized integration
  -> state next: inspect the suggested continuation
```

Planner may write permitted workflow artifacts; it must not edit application
source or launch Codex. Luna is a remotely served model used by a local client,
not local inference. `state next` reports a continuation; it does not execute it.
A browser tab or connector is not a persistent local supervisor.

### Today: one task at a time

1. Identify the real Git root, target branch, dirty paths, existing worktrees,
   adoption marker, active Sprint, contracts, claims and running workers.
2. Read project instructions and existing research. Use CodeGraph for code
   discovery, scoped to the exact checkout. Do not replace working indexes blindly.
3. If not adopted, review `.gitignore` and the separate reader boundary `.ignore`,
   establish a reviewed initial commit, preview standard adoption, then apply only
   reviewed operations. Do not rerun adoption as a reset on an adopted repository.
4. Reuse the existing approved product direction. For a new direction, propose a
   small PRD and one to three ordered Sprint rows and obtain approval.
5. Select one decision-complete task. Reuse its existing worktree/claim if valid;
   otherwise follow the runbook's identity-linked creation and binding sequence.
6. Verify the installed execution path and agree on a wall-time/attempt budget
   before starting a worker. Missing support is a blocker, not permission to patch
   Repo Harness while onboarding the application.
7. Reuse current canonical verification evidence when valid. Run the exact reviewer
   required by the frozen acceptance policy; Luna-low is a preference, not a reason
   to override a different required provider/source. Never replace review with a
   fabricated pass or an unapproved user waiver.
8. Close out only with valid acceptance. Report publication separately: `--no-merge`
   is not integration into the target branch. Stop after one task by default.

MCP, OAuth and a public tunnel are optional for local onboarding. If a verified
Planner connector already exists, use it. Otherwise plan in the local parent agent
or transfer a reviewed planning brief; do not turn host repair into a prerequisite.

### Later: approve once and leave the Sprint running

This requires a separately validated local supervisor/controller with durable
identity, claim/lease handling, bounded retries and deadlines, restart recovery,
semantic acceptance, authorized publication and terminal-state reporting. It must
continue independently of ChatGPT's web tab. Do not invent a shell loop around
`state next`, hand-edit authority stores, or assume a CLI command's presence proves
a supported bootstrap path.

Freeze what "approve once" covers: selected Sprint rows, allowed paths, maximum
attempts/time, model/provider use, target branch and whether local integration is
authorized. Push, PR creation, deployment, secrets and external mutations remain
separate unless explicitly authorized. Do not claim enforceable token/cost caps
without provider-backed support.

Retry an ordinary in-scope failure only within the approved budget. Stop on budget
exhaustion, missing decisions, scope expansion, lost/ambiguous ownership, uncertain
external effects, or invalid acceptance. A finished Sprint and a blocked Sprint
must produce different final reports.

## Copy/paste prompt: initialize or resume safely

Replace the repository and product goal before sending this to a **local coding
agent with filesystem access**. A Planner-only connector cannot perform the local
execution half. This prompt authorizes reviewed project-local adoption and planning;
it does not authorize host changes or product implementation before approval.

```text
Help me initialize OR resume Repo Harness in this repository:
REPOSITORY: /absolute/path/to/project
PRODUCT GOAL: describe the next user-visible outcome, or reuse the existing approved plan
MODE: supervised first task; do not start an unattended Sprint

Read the Repo Harness docs/new-repository-start-here.md entrypoint, then its linked
human runbook and detailed tutorial from the reviewed source checkout. Read the
project's own AGENTS/CLAUDE instructions. Check the installed runtime revision,
not only its version string, before using revision-dependent instructions.

First inspect without changing anything:
- exact Git root, current/target branch, dirty and untracked paths;
- existing worktrees, adoption state, active PRD/Sprint/plan/contract;
- current claims/leases and running workers (never infer liveness from old chat);
- actual project test commands, dependencies and ignored worktree prerequisites;
- CodeGraph readiness for the exact checkout; use it for relevant code discovery.

Preserve all existing work. Do not reset, stash, delete, steal a lease, create a
second worker, replace an existing Sprint, or assume the target branch is main.
Reuse existing approved architecture instead of asking Luna to redesign it.

If adoption is missing, show the standard-adoption dry-run and review exclusions
and proposed writes. Apply only safe project-local adoption; ask before resolving
any conflict with existing files. Stage/commit nothing unless I explicitly approve.
If already adopted, resume its current state instead of reinitializing it.

Propose one small decision-complete task, exact allowed paths, acceptance checks,
wall-time/attempt budget and publication target. Stop for my approval before
application edits or a paid model worker. Do not mark a newly proposed PRD/Sprint
Approved yourself. Existing approvals are reusable only for their actual scope.

After approval, use the supported runtime's contract/worktree/claim-binding path.
Use GPT-5.6 Luna with low effort for implementation and an independent read-only
reviewer only where the frozen acceptance policy permits it. Keep canonical
verification reuse-first, record a real typed receipt, and close out only after
acceptance. No user waiver without separate explicit authorization.

Do not change Nix, runtime pins, global hooks/trust, MCP profile/grants, launchd,
tunnels or OAuth. Do not fix Repo Harness bugs as part of this application task.
If the current runtime cannot safely execute the task, finish the brief and report
the blocker; do not improvise an unbounded runner or pretend automation is ready.
No push, PR, merge or deployment without explicit authorization.

Return: observed state, exact artifact/worktree identities, commands and evidence,
what changed, acceptance status, integration status, next action and blockers.
Absent requirements are forbidden design space: no unrelated improvements.
```

## This laptop: Devin resume, not a new initialization

A read-only check on 2026-09-21 found `/Users/test/Documents/work/devin-webmcp-local-chat`
on clean `main`, with an existing linked worktree:

`/Users/test/Documents/work/devin-webmcp-local-chat-wt-cg-3b-add-stable-jazz-user-to-chatgpt-project-binding`

The current contract directory contains
`20260920-1307-cg-3b-add-stable-jazz-user-to-chatgpt-project-binding.contract.md`.
This is a discovery snapshot, not proof of current lease ownership, worker liveness,
approval, acceptance or integration. Recheck those facts before execution.

Use the prompt above with:

```text
REPOSITORY: /Users/test/Documents/work/devin-webmcp-local-chat
PRODUCT GOAL: inspect and resume the existing CG-3B binding-persistence work;
do not recreate the historical CG-0 Sprint or adopt the repository again.
MODE: supervised resume; preserve the existing linked worktree and stop before
any ownership transfer or additional worker until current state is verified.
```

For WorkAdventure, replace the repository path and inspect its actual branch and
publication state. Historical `--no-merge` closeout means integration may still be
pending; do not assume the old chat proves it is merged or still needs merging.

## Planner-only prompt

```text
Use only the verified Planner MCP capabilities to inspect the selected repository
and its current workflow. Reuse existing research and approved artifacts. Draft
missing PRD/Sprint/decision-complete briefs for my approval, with explicit non-goals,
verification, budgets and publication limits. Do not edit application source,
launch workers, change host configuration or claim a local supervisor is running.
Return the exact planning artifact identities and a handoff for the local executor.
```
