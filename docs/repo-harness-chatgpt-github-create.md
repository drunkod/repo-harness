# ChatGPT + GitHub App Create MVP

## Purpose

`ChatGPT + GitHub app Create` is the mutating third stage beside the existing
ChatGPT Browser Plan and ChatGPT Browser Review usages.

Plan and Review continue to use the generic
`repo-harness chatgpt browser-consult` surface with non-mutating prompts.
Create deliberately reuses the same Browser Engine but preselects the GitHub
app and applies a separate write protocol:

```text
Plan (browser-consult, no writes)
  -> approved plan + task contract
  -> Create (browser-consult --chatgpt-app GitHub)
  -> branch + commit + optional draft PR
  -> Review (new browser-consult session, no writes)
  -> human decision
```

This MVP does not add a GitHub client, credentials, or another browser
provider to repo-harness. The browser engine supplies transport and evidence;
the selected ChatGPT GitHub app supplies the repository tools.

## Preconditions

- the target repository is adopted by repo-harness;
- an approved plan and task contract exist;
- Oracle passes `browser-doctor`;
- the GitHub app is available in the authenticated ChatGPT workspace;
- the exact installed app name is known (`GitHub` is only the example name);
- the app has the required permission for the exact repository;
- a dedicated branch name and base commit are known;
- Gitleaks is available when `--secret-scan` is required.

## 1. Prepare the plan and contract

The Create stage consumes, but must not edit:

```text
plans/plan-<task>.md
tasks/contracts/<task>.contract.md
```

The task contract should freeze:

- repository;
- base branch and commit;
- dedicated branch name;
- allowed paths;
- forbidden paths;
- required behavior;
- required checks;
- exact installed ChatGPT app name;
- whether a draft PR is requested;
- rollback.

## 2. Confirm the app name and dry-run the Create session

The examples below assume the installed ChatGPT app is literally named
`GitHub`. If the workspace shows another name, replace `GitHub` with that exact
name. Do not guess or rely on prompt prose to select an app.

```bash
repo-harness chatgpt browser-consult \
  --repo . \
  --provider oracle \
  --chatgpt-app GitHub \
  --secret-scan \
  --dry-run \
  --prompt "
Use the selected GitHub app as the Create entity.
Read AGENTS.md, the approved plan, and the task contract.
Resolve the exact repository and base commit before any write.
Return the proposed branch and exact file list.
Do not write during this dry run.
" \
  --file AGENTS.md \
  --file plans/plan-<task>.md \
  --file tasks/contracts/<task>.contract.md
```

Inspect the generated session `prompt.md`, attached-file manifest, app
preselection, and secret-scan receipt.

## 3. Run Create

```bash
stamp="$(date -u +%Y%m%dT%H%M%SZ)"

repo-harness chatgpt browser-consult \
  --repo . \
  --provider oracle \
  --chatgpt-app GitHub \
  --secret-scan \
  --model gpt-5.5-pro \
  --heartbeat 59 \
  --prompt "
Use the selected GitHub app as the Create entity.

The approved task contract is authoritative.
Read before writing.
Create the dedicated branch from the exact base commit.
Change only allowed paths.
Use one atomic commit when practical.
Open a draft PR only if the contract requests it.
Do not merge, enable auto-merge, mark the PR ready, resolve review threads,
rerun CI, or claim checks ran without direct evidence.

Return a Creation Report with repository, base, branch, commit, changed files,
draft PR, observed checks, missing checks, and residual risks.
" \
  --file AGENTS.md \
  --file plans/plan-<task>.md \
  --file tasks/contracts/<task>.contract.md \
  --write-output ".ai/harness/handoff/chatgpt/create-${stamp}-<task>.md"
```

Before allowing repository actions, verify in ChatGPT that the intended app is
visibly selected. If it is absent or another app is selected, stop and correct
the exact app name or select it manually.

## 4. Required GitHub write sequence

Before writes:

1. resolve the exact repository;
2. read the base ref and record the base commit;
3. read every file to be updated;
4. restate the exact proposed paths;
5. stop if scope differs from the contract.

For one file, use the GitHub app's create/update-file action.

For a related multi-file change, prefer one atomic Git-data sequence:

```text
create blobs
  -> create tree
  -> create commit
  -> fast-forward target branch ref
```

Never force-update the branch.

## 5. Creation Report

The managed `--write-output` should contain:

```markdown
# Creation Report

- Repository:
- Base ref:
- Base commit:
- Branch:
- Commit:
- Draft PR:
- Files created:
- Files updated:
- Files deleted:
- Checks observed:
- Checks not run:
- Residual risks:
- Actions not performed:
```

A tool event and returned GitHub identifiers prove repository actions. ChatGPT
prose without a visible tool call does not.

## 6. Review handoff

Start a new, non-mutating Browser Review session. Provide:

- approved plan;
- task contract;
- base commit;
- implementation commit;
- changed-file list;
- PR patch;
- CI/status evidence;
- Creation Report.

The Create conversation never approves its own work. A human remains the merge
authority.

## Failure handling

- `ORACLE_APP_PRESELECT_UNSUPPORTED` means the Oracle binary cannot preselect
  any ChatGPT app; upgrade/fix Oracle or select the app manually.
- A missing or mismatched app name is different: if the requested app is not
  visibly selected, stop before repository access and use the exact installed
  name. Do not assume every workspace calls the app `GitHub`.
- With no visible GitHub tool event, classify the run as `surface_blocked`;
  prose alone is not proof that a repository write occurred.
- On `ORACLE_CAPTURE_INCOMPLETE`, inspect GitHub state before retrying because
  writes may already have happened, then continue the saved provider session.

## Safety summary

Create must not:

- write to the default branch;
- force-update a ref;
- change paths outside the contract;
- add unrelated refactors or dependencies;
- merge or enable auto-merge;
- mark a PR ready;
- resolve review threads;
- rerun CI without separate approval;
- handle browser or GitHub credentials;
- claim tests ran without evidence.

The canonical detailed protocol is
`assets/skills/repo-harness-chatgpt/references/create.md`.
