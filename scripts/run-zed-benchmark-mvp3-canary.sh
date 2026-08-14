#!/usr/bin/env bash
set -euo pipefail

PINNED_ZED_EVAL_COMMIT=24e25552b1259d56a6fdd7956a419ed9e8a1a25e
usage() { echo "Usage: $0 --zed-checkout PATH --source-sha SHA --namespace SLUG --benchmark SELECTOR --model MODEL --doctor-ok --deployment-ok --show-logs --approve-paid-canary"; }
die() { echo "zed-mvp3-canary: $*" >&2; exit 1; }
checkout= source_sha= namespace= benchmark= model= doctor=deployment=logs=approve=0
while (($#)); do case "$1" in
  --zed-checkout) checkout=${2:?}; shift 2;; --source-sha) source_sha=${2:?}; shift 2;;
  --namespace) namespace=${2:?}; shift 2;; --benchmark) benchmark=${2:?}; shift 2;;
  --model) model=${2:?}; shift 2;; --doctor-ok) doctor=1; shift;;
  --deployment-ok) deployment=1; shift;; --show-logs) logs=1; shift;;
  --approve-paid-canary) approve=1; shift;; --help|-h) usage; exit 0;; *) die "unknown argument: $1";; esac; done
[[ -n "$checkout" && "$checkout" = /* ]] || die "absolute --zed-checkout is required"
[[ "$source_sha" =~ ^[0-9a-f]{40}$ ]] || die "full lowercase --source-sha is required"
[[ "$benchmark" =~ ^(qna|rf|tw|terminal-bench-2.1|deepswe)$ ]] || die "unsupported benchmark"
[[ -n "$namespace" && -n "$model" && "$doctor" == 1 && "$deployment" == 1 && "$logs" == 1 && "$approve" == 1 ]] || die "all manual safety flags are required"
[[ -t 0 ]] || die "interactive approval is required"
[[ "$(git -C "$checkout" rev-parse HEAD)" == "$PINNED_ZED_EVAL_COMMIT" ]] || die "checkout pin mismatch"
[[ -z "$(git -C "$checkout" status --porcelain=v1 --untracked-files=all)" ]] || die "checkout has tracked or non-ignored untracked changes"
repo=$(git rev-parse --show-toplevel)
read -r -p 'Type exactly "RUN PAID ZED CANARY" to submit: ' confirmation
[[ "$confirmation" == 'RUN PAID ZED CANARY' ]] || die "approval not confirmed"
cli=(bun "$repo/src/cli/index.ts" zed-benchmark --repo "$repo")
set +e
submit_json=$("${cli[@]}" submit --zed-checkout "$checkout" --source-sha "$source_sha" --namespace "$namespace" --benchmark "$benchmark" --model "$model" --n-tasks 1 --n-concurrent 1 --acknowledge-remote-cost-and-data --json)
submit_rc=$?
set -e
run_id=$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(x.runId)' "$submit_json") || die "submit did not return a run ID"
outcome=$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(x.outcome)' "$submit_json")
[[ "$outcome:$submit_rc" == submitted:0 || "$outcome:$submit_rc" == submission-uncertain:1 ]] || die "unexpected submit result"
phase=; for ((poll=1; poll<=240; poll++)); do
  set +e; status_json=$("${cli[@]}" status --run-id "$run_id" --json); status_rc=$?; set -e
  if ((status_rc == 0)); then phase=$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(x.status)' "$status_json"); echo "remote phase: $phase"; [[ "$phase" == completed ]] && break; [[ "$phase" == pending || "$phase" == running ]] || die "remote run failed"; fi
  sleep 60
done
[[ "$phase" == completed ]] || die "run did not complete; do not resubmit"
"${cli[@]}" logs --run-id "$run_id"
"${cli[@]}" fetch --run-id "$run_id" >/dev/null
report_json=$("${cli[@]}" report --run-id "$run_id" --json)
printf '%s\n' "$report_json"
read -r -p 'Record cost/quota observation: ' cost
read -r -p 'Record resource observation: ' resource
read -r -p 'Record retention/access observation: ' retention
[[ -n "$cost" && -n "$resource" && -n "$retention" ]] || die "observations are required"
echo "T14 completed for run $run_id; preserve run-scoped evidence and do not resubmit."
