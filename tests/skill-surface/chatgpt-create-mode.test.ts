import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, statSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "../..");
const PACKAGE_ROOT = join(ROOT, "assets", "skills", "repo-harness-chatgpt");
const ROUTER = join(PACKAGE_ROOT, "SKILL.md");
const CREATE = join(PACKAGE_ROOT, "references", "create.md");
const DOC = join(ROOT, "docs", "repo-harness-chatgpt-github-create.md");
const RUNTIME = join(ROOT, "src", "cli", "chatgpt-browser", "create-mode.ts");
const TYPES = join(ROOT, "src", "cli", "chatgpt-browser", "types.ts");
const COMMAND = join(ROOT, "src", "cli", "commands", "chatgpt.ts");
const RUNTIME_TEST = join(ROOT, "tests", "cli", "chatgpt-browser-create.test.ts");
const LIVE_TEST = join(ROOT, "tests", "live", "chatgpt-browser-create.live.test.ts");
const MANIFEST = join(ROOT, "assets", "skill-commands", "manifest.json");

function hasStandaloneName(content: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(?<![A-Za-z0-9_-])${escaped}(?![A-Za-z0-9_-])`, "u").test(content);
}

describe("repo-harness-chatgpt strict Create mode", () => {
  test("router exposes the dedicated runtime within the canonical byte budget", () => {
    const router = readFileSync(ROUTER, "utf-8");
    expect(router).toContain("first-class GitHub-app-backed Browser Create");
    expect(router).toContain("repo-harness chatgpt browser-create");
    expect(router).toContain("`references/create.md`");
    expect(router).toContain("sole ChatGPT Web mode allowed to perform GitHub writes");
    expect(statSync(ROUTER).size).toBeLessThanOrEqual(2048);
  });

  test("Create has one canonical reference home", () => {
    expect(existsSync(CREATE)).toBe(true);
    expect(existsSync(join(PACKAGE_ROOT, "create.md"))).toBe(false);
    const packageTest = readFileSync(join(ROOT, "tests", "skill-surface", "chatgpt-package.test.ts"), "utf-8");
    expect(packageTest).toContain('"create.md"');
    expect(packageTest).toContain("ROUTER_BODY_BYTE_LIMIT = 2048");
  });

  test("protocol requires exact repository/default/base identity and a dedicated agent branch", () => {
    const protocol = readFileSync(CREATE, "utf-8");
    for (const flag of ["--repository", "--default-branch", "--base-commit", "--branch"]) {
      expect(protocol).toContain(flag);
    }
    expect(protocol).toContain("Never infer the remote repository");
    expect(protocol).toContain("moving base ref");
    expect(protocol).toContain("agent/");
    expect(protocol).toContain('trust: "assistant_reported"');
  });

  test("runtime validates strict target identity and a separate read-back envelope", () => {
    const runtime = readFileSync(RUNTIME, "utf-8");
    const types = readFileSync(TYPES, "utf-8");
    const command = readFileSync(COMMAND, "utf-8");
    expect(command).toContain("browser-create-readback");
    expect(command).toContain("browser-create-verify");
    expect(command).toContain("--repository <owner/name>");
    expect(command).toContain("--default-branch <name>");
    expect(command).toContain("--base-commit <sha>");
    expect(command).not.toContain("--base <ref>");
    expect(runtime).toContain("CREATE_REPOSITORY_INVALID");
    expect(runtime).toContain("CREATE_BASE_COMMIT_INVALID");
    expect(runtime).toContain("CREATE_BRANCH_PREFIX_REQUIRED");
    expect(runtime).toContain("CREATE_READBACK_MISMATCH");
    expect(runtime).toContain("repo-harness-create-readback-result");
    expect(runtime).toContain("Do not use any GitHub write action");
    expect(types).toContain("assistant_reported_readback");
    expect(types).toContain("BrowserCreateReadBackMeta");
  });

  test("unit and opt-in live integration tests cover the browser-app chain", () => {
    const runtimeTest = readFileSync(RUNTIME_TEST, "utf-8");
    const liveTest = readFileSync(LIVE_TEST, "utf-8");
    expect(runtimeTest).toContain("--browser-app");
    expect(runtimeTest).toContain("browser-create-readback");
    expect(runtimeTest).toContain("not.toContain('--followup')");
    expect(runtimeTest).toContain("CREATE_READBACK_MISMATCH");
    expect(liveTest).toContain("REPO_HARNESS_LIVE_CHATGPT_CREATE");
    expect(liveTest).toContain("browser-create");
    expect(liveTest).toContain("browser-create-readback");
    expect(liveTest).toContain("--draft-pr");
  });

  test("published guide documents strict Create, read-back, and the live smoke test", () => {
    const packageJson = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));
    expect(packageJson.files).toContain("docs/repo-harness-chatgpt-github-create.md");
    expect(packageJson.scripts["test:live:chatgpt-create"]).toContain("chatgpt-browser-create.live.test.ts");
    const guide = readFileSync(DOC, "utf-8");
    expect(guide).toContain("[ChatGPT Browser Engine](./repo-harness-chatgpt-browser-engine.md)");
    expect(guide).toContain("--repository drunkod/repo-harness");
    expect(guide).toContain("browser-create-readback");
    expect(guide).toContain("assistant_reported_readback");
    expect(guide).toContain("Live browser and GitHub-app acceptance test");
  });

  test("new Create documentation contains no retired package names or stale patterns", () => {
    const manifest = JSON.parse(readFileSync(MANIFEST, "utf-8")) as {
      retiredPackages: Array<{ name: string }>;
    };
    const stalePatterns = [
      "agentic-dev-",
      "gstack",
      "plan-eng-review",
      "plan-design-review",
      "compatibility shim",
      "compatibility-shim",
      "delegate_to",
    ];
    const violations: string[] = [];
    for (const path of [CREATE, DOC]) {
      const content = readFileSync(path, "utf-8");
      const lower = content.toLowerCase();
      for (const pattern of stalePatterns) {
        if (lower.includes(pattern)) violations.push(`${path}: ${pattern}`);
      }
      for (const entry of manifest.retiredPackages) {
        if (hasStandaloneName(content, entry.name)) violations.push(`${path}: ${entry.name}`);
      }
    }
    expect(violations).toEqual([]);
  });
});
