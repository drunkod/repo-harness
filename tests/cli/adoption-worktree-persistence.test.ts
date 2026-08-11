import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { spawnSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";

const ROOT = join(import.meta.dir, "..", "..");
const CLI = join(ROOT, "src", "cli", "index.ts");

function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function git(repo: string, args: string[]) {
  return spawnSync("git", args, { cwd: repo, encoding: "utf-8" });
}

describe("adoption workflow-directory persistence", () => {
  test("a committed standard adoption passes strict workflow checks in a fresh Git worktree", () => {
    const repo = tempDir("repo-harness-adoption-worktree-repo-");
    const home = tempDir("repo-harness-adoption-worktree-home-");
    const worktreeParent = tempDir("repo-harness-adoption-worktree-checkout-");
    const worktree = join(worktreeParent, "fresh");

    try {
      expect(git(repo, ["init", "-q"]).status).toBe(0);
      writeFileSync(join(repo, "README.md"), "# Fixture\n");
      expect(git(repo, ["add", "README.md"]).status).toBe(0);
      expect(git(repo, ["-c", "user.name=Repo Harness Test", "-c", "user.email=repo-harness@example.invalid", "commit", "-qm", "initial"]).status).toBe(0);

      const init = spawnSync(
        "bun",
        [CLI, "init", "--repo", repo, "--no-codegraph", "--json"],
        {
          cwd: ROOT,
          encoding: "utf-8",
          env: { ...process.env, REPO_HARNESS_HOME: home },
        },
      );
      expect(init.status).toBe(0);

      expect(git(repo, ["add", "-A"]).status).toBe(0);
      const requiredSentinels = [
        "plans/archive/.gitkeep",
        "plans/prds/.gitkeep",
        "plans/sprints/.gitkeep",
        "tasks/archive/.gitkeep",
        "tasks/contracts/.gitkeep",
        "tasks/reviews/.gitkeep",
        "tasks/notes/.gitkeep",
        ".ai/harness/checks/.gitkeep",
        ".ai/harness/failures/.gitkeep",
        ".ai/harness/handoff/.gitkeep",
        ".ai/harness/worktrees/.gitkeep",
        ".ai/harness/runs/.gitkeep",
      ];
      for (const path of requiredSentinels) {
        expect(git(repo, ["ls-files", "--error-unmatch", "--", path]).status).toBe(0);
      }

      expect(git(repo, ["-c", "user.name=Repo Harness Test", "-c", "user.email=repo-harness@example.invalid", "commit", "-qm", "adopt"]).status).toBe(0);
      expect(git(repo, ["worktree", "add", "--detach", worktree, "HEAD"]).status).toBe(0);

      const requiredDirectories = [
        "plans",
        "plans/archive",
        "plans/prds",
        "plans/sprints",
        "tasks/archive",
        "tasks/contracts",
        "tasks/reviews",
        "tasks/notes",
        ".ai/harness/checks",
        ".ai/harness/failures",
        ".ai/harness/handoff",
        ".ai/harness/worktrees",
        ".ai/harness/runs",
      ];
      for (const path of requiredDirectories) {
        expect(existsSync(join(worktree, ...path.split("/")))).toBe(true);
      }

      const strict = spawnSync(
        "bun",
        [CLI, "run", "check-task-workflow", "--strict"],
        { cwd: worktree, encoding: "utf-8", env: { ...process.env, REPO_HARNESS_HOME: home } },
      );
      expect(strict.status).toBe(0);
      expect(`${strict.stdout}${strict.stderr}`).toContain("[workflow] OK");
    } finally {
      if (existsSync(worktree)) git(repo, ["worktree", "remove", "--force", worktree]);
      rmSync(repo, { recursive: true, force: true });
      rmSync(home, { recursive: true, force: true });
      rmSync(worktreeParent, { recursive: true, force: true });
    }
  }, 30_000);
});
