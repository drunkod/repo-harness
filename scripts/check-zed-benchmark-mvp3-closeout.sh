#!/usr/bin/env bash
set -euo pipefail

die() { echo "zed-mvp3-closeout: $*" >&2; exit 1; }
[[ $# -eq 2 ]] || die "usage: $0 CANARY_EVIDENCE CLOSEOUT_REVIEW"
evidence=$1 review=$2
[[ -f "$evidence" && -f "$review" ]] || die "evidence and review files are required"
repo=$(git rev-parse --show-toplevel); cd "$repo"
head=$(git rev-parse HEAD)
node - "$evidence" "$review" "$head" <<'NODE'
const fs=require('fs'); const e=JSON.parse(fs.readFileSync(process.argv[2])); const r=JSON.parse(fs.readFileSync(process.argv[3])); const h=process.argv[4];
const ok=(x,m)=>{if(!x) throw new Error(m)};
ok(e.reviewedCommit===h,'canary evidence commit mismatch'); ok(e.run?.submitAttempts===1,'submit count'); ok(e.run?.finalPhase==='completed','canary not completed'); ok(e.validation?.trackedWorktreeUnchanged===true,'worktree changed');
for(const k of ['costAndQuota','resources','retentionAndAccess']) ok(typeof e.operatorObservations?.[k]==='string'&&e.operatorObservations[k].trim(),'missing observation');
ok(r.schemaVersion==='repo-harness.zed-benchmark-closeout-review/v1','review schema'); ok(r.reviewedCommit===h,'review commit mismatch'); ok(r.decision==='approve','review not approved');
for(const k of ['wazaStyleReviewCompleted','noExtraSubsystemAdded','sourceClaimsCheckedAgainstFinalPin','durableConclusionsPromoted','rawCanaryEvidenceRemainsIgnored','contractWorktreeFinishCompleted','planContractReviewNotesArchived','remoteArtifactsPreserved']) ok(r[k]===true,k+' incomplete');
NODE
E=.archcontext/model/nodes/capability.verification.evals-checks.yaml; R=.archcontext/model/nodes/capability.runtime-harness.global-runtime-reconciliation.yaml
for p in 'src/core/zed-benchmark/**' 'src/effects/zed-benchmark/**' 'src/cli/commands/zed-benchmark.ts'; do grep -Fq "$p" "$E" || die "missing eval ownership $p"; done
for p in assets/reference-configs/external-tooling.md docs/reference-configs/external-tooling.md; do ! grep -Fq "$p" "$E" || die "duplicate ownership $p"; grep -Fq "$p" "$R" || die "missing runtime ownership $p"; done
cmp -s scripts/check-architecture-sync.sh assets/templates/helpers/check-architecture-sync.sh || die 'helper projection drift'
bun run check:type
bun run check:reference-configs
bun run check:helpers
bun test tests/zed-benchmark-admission.test.ts tests/zed-benchmark-state-schema.test.ts tests/zed-benchmark-receipt-store.test.ts tests/zed-benchmark-runner.test.ts tests/cli/zed-benchmark.test.ts
bash scripts/check-architecture-sync.sh
bash scripts/check-task-sync.sh
git diff --check
echo "Zed Eval MVP3 closeout gate: PASS"
