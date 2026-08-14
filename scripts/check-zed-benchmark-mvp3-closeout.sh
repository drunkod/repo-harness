#!/usr/bin/env bash
set -euo pipefail

PINNED_ZED_EVAL_COMMIT="24e25552b1259d56a6fdd7956a419ed9e8a1a25e"

die() {
  echo "zed-mvp3-closeout: $*" >&2
  exit 1
}

[[ $# -eq 2 ]] \
  || die "usage: $0 CANARY_EVIDENCE CLOSEOUT_REVIEW"

start_dir="$(pwd)"
case "$1" in
  /*) evidence="$1" ;;
  *) evidence="$start_dir/$1" ;;
esac
case "$2" in
  /*) review="$2" ;;
  *) review="$start_dir/$2" ;;
esac

[[ -f "$evidence" && ! -L "$evidence" ]] \
  || die "regular canary evidence file is required"
[[ -f "$review" && ! -L "$review" ]] \
  || die "regular closeout review file is required"

repo="$(git rev-parse --show-toplevel)"
repo="$(cd "$repo" && pwd)"
cd "$repo"

head_sha="$(git rev-parse HEAD)"
run_id="$(
  node -e '
const fs = require("fs");
const e = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
if (typeof e.run?.runId !== "string") process.exit(2);
process.stdout.write(e.run.runId);
' "$evidence"
)" || die "canary evidence does not contain a run ID"

[[ "$run_id" =~ ^rh-zb-[0-9a-f-]{36}$ ]] \
  || die "canary evidence has invalid run ID"

canonical_evidence="$repo/.ai/harness/runs/zed-benchmark/$run_id/acceptance/canary-evidence.json"
[[ "$evidence" == "$canonical_evidence" ]] \
  || die "canary evidence must be the canonical run-scoped ignored file"
git check-ignore -q -- "${canonical_evidence#$repo/}" \
  || die "raw canary evidence is not ignored by git"

node - "$evidence" "$review" "$head_sha" "$PINNED_ZED_EVAL_COMMIT" <<'NODE'
const fs = require("fs");

const evidence = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const review = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
const head = process.argv[4];
const pin = process.argv[5];

function ok(condition, message) {
  if (!condition) throw new Error(message);
}

ok(
  evidence.schemaVersion === "repo-harness.zed-benchmark-canary-evidence/v1",
  "canary evidence schema mismatch"
);
ok(evidence.reviewedCommit === head, "canary evidence commit mismatch");
ok(
  evidence.operatorApproval?.explicitPaidCanaryApproval === true &&
    evidence.operatorApproval?.interactiveConfirmation === true &&
    evidence.operatorApproval?.doctorConfirmedManually === true &&
    evidence.operatorApproval?.existingDeploymentConfirmedManually === true &&
    evidence.operatorApproval?.deployInvokedByCanary === false,
  "canary operator approval/prerequisite evidence incomplete"
);
ok(evidence.run?.integrationPin === pin, "integration pin mismatch");
ok(evidence.run?.nTasks === 1, "paid canary must use exactly one task");
ok(evidence.run?.nConcurrent === 1, "paid canary must use concurrency 1");
ok(evidence.run?.submitAttempts === 1, "submit must be attempted exactly once");
ok(
  evidence.run?.submitOutcome === "submitted" ||
    evidence.run?.submitOutcome === "submission-uncertain",
  "unsupported submit outcome"
);
ok(evidence.run?.finalPhase === "completed", "canary did not complete");
ok(
  evidence.validation?.logsExplicitlyReviewed === true &&
    evidence.validation?.fetchValidated === true &&
    evidence.validation?.reportValidated === true &&
    evidence.validation?.trackedWorktreeUnchanged === true,
  "canary validation evidence incomplete"
);
for (const key of ["costAndQuota", "resources", "retentionAndAccess"]) {
  ok(
    typeof evidence.operatorObservations?.[key] === "string" &&
      evidence.operatorObservations[key].trim().length > 0,
    `missing observation ${key}`
  );
}
ok(
  evidence.safetyAssertions?.automaticResubmissionUsed === false &&
    evidence.safetyAssertions?.cancellationUsed === false &&
    evidence.safetyAssertions?.deployUsedAsCancellation === false &&
    evidence.safetyAssertions?.productWriterAuthorityUsed === false,
  "canary safety assertions failed"
);

ok(
  review.schemaVersion === "repo-harness.zed-benchmark-closeout-review/v1",
  "closeout review schema mismatch"
);
ok(review.reviewedCommit === head, "closeout review commit mismatch");
ok(
  typeof review.reviewer === "string" && review.reviewer.trim().length > 0,
  "closeout reviewer is missing"
);
ok(review.decision === "approve", "closeout review is not approved");
for (const key of [
  "wazaStyleReviewCompleted",
  "noExtraSubsystemAdded",
  "sourceClaimsCheckedAgainstFinalPin",
  "durableConclusionsPromoted",
  "rawCanaryEvidenceRemainsIgnored",
  "contractWorktreeFinishCompleted",
  "planContractReviewNotesArchived",
  "remoteArtifactsPreserved"
]) {
  ok(review[key] === true, `${key} incomplete`);
}
NODE

E=".archcontext/model/nodes/capability.verification.evals-checks.yaml"
R=".archcontext/model/nodes/capability.runtime-harness.global-runtime-reconciliation.yaml"

for path in \
  'src/core/zed-benchmark/**' \
  'src/effects/zed-benchmark/**' \
  'src/cli/commands/zed-benchmark.ts'
do
  grep -Fq "$path" "$E" || die "missing eval ownership $path"
done

for path in \
  assets/reference-configs/external-tooling.md \
  docs/reference-configs/external-tooling.md
do
  ! grep -Fq "$path" "$E" || die "duplicate ownership $path"
  grep -Fq "$path" "$R" || die "missing runtime ownership $path"
done

cmp -s \
  scripts/check-architecture-sync.sh \
  assets/templates/helpers/check-architecture-sync.sh \
  || die "helper projection drift"

for forbidden in src/core/fleet src/effects/fleet src/cli/commands/fleet.ts; do
  [[ ! -e "$forbidden" ]] || die "forbidden generic fleet surface exists: $forbidden"
done

echo "[mvp3] focused tests"
bun test tests/zed-benchmark-admission.test.ts
bun test tests/zed-benchmark-state-schema.test.ts
bun test tests/zed-benchmark-receipt-store.test.ts
bun test tests/zed-benchmark-runner.test.ts
bun test tests/cli/zed-benchmark.test.ts

echo "[mvp3] static checks"
bun run check:type
bun run check:reference-configs
bun run check:helpers

echo "[mvp3] full test suite"
bun test

echo "[mvp3] repository gates"
bash scripts/check-deploy-sql-order.sh
bash scripts/check-architecture-sync.sh
bash scripts/check-task-sync.sh
bash scripts/check-task-workflow.sh --strict
bun scripts/inspect-project-state.ts --repo . --format text
bun src/cli/index.ts init --repo . --dry-run

echo "[mvp3] diff hygiene"
git diff --check

echo
echo "Zed Eval MVP3 closeout gate: PASS"
echo "Reviewed commit: $head_sha"
echo "The supplied T14/T15 evidence and repository gates agree."
echo "Do not delete remote runs or shared-volume artifacts during closeout."
