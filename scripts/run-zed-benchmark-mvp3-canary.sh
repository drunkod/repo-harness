#!/usr/bin/env bash
set -euo pipefail

PINNED_ZED_EVAL_COMMIT="24e25552b1259d56a6fdd7956a419ed9e8a1a25e"
DEFAULT_POLL_SECONDS=60
DEFAULT_MAX_POLLS=240

usage() {
  cat <<'EOF'
Usage:
  scripts/run-zed-benchmark-mvp3-canary.sh \
    --zed-checkout /absolute/path/to/zed \
    --source-sha <40-lowercase-hex-sha> \
    --namespace <slug> \
    --benchmark <qna|rf|tw|terminal-bench-2.1|deepswe> \
    --model <model-id> \
    --doctor-ok \
    --deployment-ok \
    --show-logs \
    --approve-paid-canary \
    [--poll-seconds N] \
    [--max-polls N]

This is a paid/network canary. It submits exactly once. If submission is
uncertain, it reconciles only by run ID/status and never resubmits.
EOF
}

die() {
  echo "zed-mvp3-canary: $*" >&2
  exit 1
}

json_get() {
  local field="$1"
  node -e '
const fs = require("fs");
const field = process.argv[1];
const value = JSON.parse(fs.readFileSync(0, "utf8"));
if (value === null || Array.isArray(value) || typeof value !== "object") process.exit(2);
const result = value[field];
if (result === undefined || result === null) process.exit(2);
process.stdout.write(typeof result === "string" ? result : JSON.stringify(result));
' "$field"
}

is_positive_integer() {
  [[ "$1" =~ ^[1-9][0-9]*$ ]]
}

checkout=""
source_sha=""
namespace=""
benchmark=""
model=""
doctor=0
deployment=0
logs=0
approve=0
poll_seconds="$DEFAULT_POLL_SECONDS"
max_polls="$DEFAULT_MAX_POLLS"

while (($#)); do
  case "$1" in
    --zed-checkout)
      [[ $# -ge 2 ]] || die "--zed-checkout requires a value"
      checkout="$2"
      shift 2
      ;;
    --source-sha)
      [[ $# -ge 2 ]] || die "--source-sha requires a value"
      source_sha="$2"
      shift 2
      ;;
    --namespace)
      [[ $# -ge 2 ]] || die "--namespace requires a value"
      namespace="$2"
      shift 2
      ;;
    --benchmark)
      [[ $# -ge 2 ]] || die "--benchmark requires a value"
      benchmark="$2"
      shift 2
      ;;
    --model)
      [[ $# -ge 2 ]] || die "--model requires a value"
      model="$2"
      shift 2
      ;;
    --doctor-ok)
      doctor=1
      shift
      ;;
    --deployment-ok)
      deployment=1
      shift
      ;;
    --show-logs)
      logs=1
      shift
      ;;
    --approve-paid-canary)
      approve=1
      shift
      ;;
    --poll-seconds)
      [[ $# -ge 2 ]] || die "--poll-seconds requires a value"
      poll_seconds="$2"
      shift 2
      ;;
    --max-polls)
      [[ $# -ge 2 ]] || die "--max-polls requires a value"
      max_polls="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      die "unknown argument: $1"
      ;;
  esac
done

[[ -n "$checkout" && "$checkout" = /* ]] \
  || die "absolute --zed-checkout is required"
[[ "$source_sha" =~ ^[0-9a-f]{40}$ ]] \
  || die "full lowercase --source-sha is required"
[[ "$benchmark" =~ ^(qna|rf|tw|terminal-bench-2\.1|deepswe)$ ]] \
  || die "unsupported benchmark"
[[ -n "$namespace" && -n "$model" ]] \
  || die "--namespace and --model are required"
[[ "$doctor" == 1 && "$deployment" == 1 && "$logs" == 1 && "$approve" == 1 ]] \
  || die "all manual safety flags are required"
is_positive_integer "$poll_seconds" \
  || die "--poll-seconds must be a positive integer"
is_positive_integer "$max_polls" \
  || die "--max-polls must be a positive integer"
[[ -t 0 ]] || die "interactive approval is required"

repo="$(git rev-parse --show-toplevel)"
repo="$(cd "$repo" && pwd)"
reviewed_commit="$(git -C "$repo" rev-parse HEAD)"
zed_eval="$checkout/crates/eval_cli/script/zed-eval"

[[ -f "$zed_eval" && ! -L "$zed_eval" ]] \
  || die "pinned checkout does not contain a regular zed-eval script"
[[ "$(git -C "$checkout" rev-parse HEAD)" == "$PINNED_ZED_EVAL_COMMIT" ]] \
  || die "checkout pin mismatch"
[[ -z "$(git -C "$checkout" status --porcelain=v1 --untracked-files=all)" ]] \
  || die "checkout has tracked or non-ignored untracked changes"

before_status="$(git -C "$repo" status --porcelain=v1 --untracked-files=all)"

cat <<EOF

PAID ZED MVP3 CANARY
reviewed commit: $reviewed_commit
integration pin: $PINNED_ZED_EVAL_COMMIT
source SHA:      $source_sha
namespace:       $namespace
benchmark:       $benchmark
model:           $model
tasks:           1
concurrency:     1

This can incur remote cost and share benchmark data/artifacts.
There is no cancellation command. Submit will be attempted exactly once.
EOF

read -r -p 'Type exactly "RUN PAID ZED CANARY" to submit: ' confirmation
[[ "$confirmation" == "RUN PAID ZED CANARY" ]] \
  || die "approval not confirmed"

cli=(bun "$repo/src/cli/index.ts" zed-benchmark --repo "$repo")
submit_stderr="$(mktemp "${TMPDIR:-/tmp}/zed-mvp3-submit.XXXXXX")"
trap 'rm -f "$submit_stderr"' EXIT

submit_rc=0
submit_json="$(
  "${cli[@]}" submit \
    --zed-checkout "$checkout" \
    --source-sha "$source_sha" \
    --namespace "$namespace" \
    --benchmark "$benchmark" \
    --model "$model" \
    --n-tasks 1 \
    --n-concurrent 1 \
    --acknowledge-remote-cost-and-data \
    --json \
    2>"$submit_stderr"
)" || submit_rc=$?

run_id="$(printf '%s' "$submit_json" | json_get runId)" \
  || die "submit did not return a run ID; inspect stderr and do not retry blindly"
outcome="$(printf '%s' "$submit_json" | json_get outcome)" \
  || die "submit returned malformed local outcome JSON"

[[ "$run_id" =~ ^rh-zb-[0-9a-f-]{36}$ ]] \
  || die "unexpected run ID: $run_id"

case "$outcome:$submit_rc" in
  submitted:0)
    ;;
  submission-uncertain:1)
    echo "submission uncertain; reconciling only with status for $run_id" >&2
    ;;
  *)
    die "unexpected submit result $outcome/$submit_rc"
    ;;
esac

run_dir="$repo/.ai/harness/runs/zed-benchmark/$run_id"
acceptance_dir="$run_dir/acceptance"
[[ -d "$run_dir" && ! -L "$run_dir" ]] \
  || die "canonical run directory is missing or unsafe"
[[ ! -e "$acceptance_dir" || ! -L "$acceptance_dir" ]] \
  || die "acceptance directory cannot be a symlink"
mkdir -p "$acceptance_dir"
chmod 700 "$acceptance_dir" 2>/dev/null || true

printf '%s\n' "$submit_json" >"$acceptance_dir/submit.json"
cp "$submit_stderr" "$acceptance_dir/submit.stderr"
chmod 600 "$acceptance_dir/submit.json" "$acceptance_dir/submit.stderr" 2>/dev/null || true

phase=""
poll_count=0
while ((poll_count < max_polls)); do
  poll_count=$((poll_count + 1))
  status_rc=0
  status_json="$(
    "${cli[@]}" status --run-id "$run_id" --json \
      2>"$acceptance_dir/status.stderr"
  )" || status_rc=$?

  if ((status_rc == 0)); then
    printf '%s\n' "$status_json" >"$acceptance_dir/status.json"
    phase="$(printf '%s' "$status_json" | json_get status)" \
      || die "status returned malformed JSON"

    echo "remote phase: $phase"
    case "$phase" in
      completed)
        break
        ;;
      pending|running)
        ;;
      failed)
        die "remote run failed; preserve evidence and do not resubmit"
        ;;
      *)
        die "unexpected remote phase: $phase"
        ;;
    esac
  else
    echo "status attempt $poll_count failed; submit will not be retried" >&2
  fi

  if ((poll_count < max_polls)); then
    sleep "$poll_seconds"
  fi
done

[[ "$phase" == completed ]] \
  || die "run did not complete within configured status checks; do not resubmit"

echo "Printing bounded/redacted controller logs for explicit operator review."
"${cli[@]}" logs --run-id "$run_id"

"${cli[@]}" fetch --run-id "$run_id" >"$acceptance_dir/fetch.txt"
report_json="$("${cli[@]}" report --run-id "$run_id" --json)"
printf '%s\n' "$report_json" >"$acceptance_dir/report.json"
chmod 600 \
  "$acceptance_dir/status.json" \
  "$acceptance_dir/status.stderr" \
  "$acceptance_dir/fetch.txt" \
  "$acceptance_dir/report.json" \
  2>/dev/null || true

read -r -p 'Record actual cost/quota observation: ' cost
read -r -p 'Record actual resource/runtime observation: ' resource
read -r -p 'Record remote retention/access observation: ' retention
[[ -n "$cost" && -n "$resource" && -n "$retention" ]] \
  || die "all observations are required"

after_status="$(git -C "$repo" status --porcelain=v1 --untracked-files=all)"
tracked_worktree_unchanged=false
[[ "$before_status" == "$after_status" ]] && tracked_worktree_unchanged=true

export E_REVIEWED_COMMIT="$reviewed_commit"
export E_RUN_ID="$run_id"
export E_PIN="$PINNED_ZED_EVAL_COMMIT"
export E_SOURCE_SHA="$source_sha"
export E_NAMESPACE="$namespace"
export E_BENCHMARK="$benchmark"
export E_MODEL="$model"
export E_OUTCOME="$outcome"
export E_SUBMIT_RC="$submit_rc"
export E_POLLS="$poll_count"
export E_PHASE="$phase"
export E_COST="$cost"
export E_RESOURCE="$resource"
export E_RETENTION="$retention"
export E_TRACKED_UNCHANGED="$tracked_worktree_unchanged"

node - "$acceptance_dir/report.json" <<'NODE' >"$acceptance_dir/canary-evidence.json"
const fs = require("fs");
const report = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));

const evidence = {
  schemaVersion: "repo-harness.zed-benchmark-canary-evidence/v1",
  recordedAt: new Date().toISOString(),
  reviewedCommit: process.env.E_REVIEWED_COMMIT,
  operatorApproval: {
    explicitPaidCanaryApproval: true,
    interactiveConfirmation: true,
    doctorConfirmedManually: true,
    existingDeploymentConfirmedManually: true,
    deployInvokedByCanary: false
  },
  run: {
    runId: process.env.E_RUN_ID,
    integrationPin: process.env.E_PIN,
    sourceSha: process.env.E_SOURCE_SHA,
    namespace: process.env.E_NAMESPACE,
    benchmark: process.env.E_BENCHMARK,
    model: process.env.E_MODEL,
    nTasks: 1,
    nConcurrent: 1,
    submitAttempts: 1,
    submitOutcome: process.env.E_OUTCOME,
    submitExitCode: Number(process.env.E_SUBMIT_RC),
    statusPolls: Number(process.env.E_POLLS),
    finalPhase: process.env.E_PHASE
  },
  validation: {
    logsExplicitlyReviewed: true,
    fetchValidated: true,
    reportValidated: true,
    trackedWorktreeUnchanged: process.env.E_TRACKED_UNCHANGED === "true"
  },
  reportSummary: {
    nTrials: report.n_trials,
    nScored: report.n_scored,
    nPassed: report.n_passed,
    nFailed: report.n_failed,
    nErrored: report.n_errored
  },
  operatorObservations: {
    costAndQuota: process.env.E_COST,
    resources: process.env.E_RESOURCE,
    retentionAndAccess: process.env.E_RETENTION
  },
  safetyAssertions: {
    automaticResubmissionUsed: false,
    cancellationUsed: false,
    deployUsedAsCancellation: false,
    productWriterAuthorityUsed: false
  }
};

process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
NODE

chmod 600 "$acceptance_dir/canary-evidence.json" 2>/dev/null || true

[[ "$tracked_worktree_unchanged" == true ]] \
  || die "repository status changed during canary; evidence saved but T14 fails"

echo
echo "T14 canary completed for $run_id."
echo "Evidence: ${acceptance_dir#$repo/}/canary-evidence.json"
echo "Preserve the run-scoped evidence and do not resubmit or delete remote artifacts."
