import { existsSync, lstatSync } from "fs";
import { join } from "path";
import type { AdoptionMode } from "./modes";
import type { WriteFileOperation } from "./operations";
import { makeOperationId } from "./operations";

const COMMON_SENTINELS = [
  "tasks/contracts/.gitkeep",
  "tasks/reviews/.gitkeep",
  "tasks/notes/.gitkeep",
  ".ai/harness/checks/.gitkeep",
  ".ai/harness/handoff/.gitkeep",
] as const;

const STANDARD_SENTINELS = [
  "plans/archive/.gitkeep",
  "plans/prds/.gitkeep",
  "plans/sprints/.gitkeep",
  "tasks/archive/.gitkeep",
  ".ai/harness/failures/.gitkeep",
] as const;

const MINIMAL_SENTINELS = [
  "plans/.gitkeep",
] as const;

export interface WorkflowDirectoryPersistenceOptions {
  readonly repoRoot: string;
  readonly mode: AdoptionMode;
}

function sentinelOperation(repoRoot: string, path: string): WriteFileOperation {
  const target = join(repoRoot, ...path.split("/"));
  const exists = existsSync(target);
  if (exists && !lstatSync(target).isFile()) {
    throw new Error(`workflow directory sentinel target is not a regular file: ${path}`);
  }
  return {
    id: makeOperationId("writeFile", path, "ifMissing"),
    kind: "writeFile",
    path,
    content: "",
    ifMissing: true,
    reason: "Persist a required workflow directory across Git commits and fresh worktrees",
    risk: "low",
    status: exists ? "skipped" : "planned",
    expectedAbsent: exists ? undefined : true,
  };
}

/**
 * Git does not track empty directories. Keep the directories that are part of
 * the workflow contract present after an adoption commit is checked out in a
 * fresh worktree. Runtime-owned files remain ignored; only these empty
 * sentinels are repository state.
 */
export function planWorkflowDirectoryPersistence(
  opts: WorkflowDirectoryPersistenceOptions,
): readonly WriteFileOperation[] {
  if (opts.mode === "self-host") return [];
  const sentinels = [
    ...COMMON_SENTINELS,
    ...(opts.mode === "standard" ? STANDARD_SENTINELS : MINIMAL_SENTINELS),
  ];
  return sentinels.map((path) => sentinelOperation(opts.repoRoot, path));
}
