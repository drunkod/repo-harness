import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, statSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "../..");
const PACKAGE_ROOT = join(ROOT, "assets", "skills", "repo-harness-chatgpt");
const ROUTER = join(PACKAGE_ROOT, "SKILL.md");
const CREATE = join(PACKAGE_ROOT, "references", "create.md");
const DOC = join(ROOT, "docs", "repo-harness-chatgpt-github-create.md");
const ENGINE_DOC = join(ROOT, "docs", "repo-harness-chatgpt-browser-engine.md");
const RUNTIME = join(ROOT, "src", "cli", "chatgpt-browser", "create-mode.ts");
const TYPES = join(ROOT, "src", "cli", "chatgpt-browser", "types.ts");
const COMMAND = join(ROOT, "src", "cli", "commands", "chatgpt.ts");
const RUNTIME_TEST = join(ROOT, "tests", "cli", "chatgpt-browser-create.test.ts");
const READBACK_TEST = join(ROOT, "tests", "cli", "chatgpt-browser-create-readback.test.ts");
const LIVE_TEST = join(ROOT, "tests", "live", "chatgpt-browser-create.live.test.ts");
const MANIFEST = join(ROOT, "assets", "skill-commands", "manifest.json");

const CREATE_FAILURE_CODES = [
  "CREATE_APP_REQUIRED",
  "CREATE_REPOSITORY_REQUIRED",
  "CREATE_REPOSITORY_INVALID",
  "CREATE_DEFAULT_BRANCH_REQUIRED",
  "CREATE_DEFAULT_BRANCH_INVALID",
  "CREATE_BASE_COMMIT_REQUIRED",
  "CREATE_BASE_COMMIT_INVALID",
  "CREATE_BRANCH_REQUIRED",
  "CREATE_BRANCH_INVALID",
  "CREATE_BRANCH_PREFIX_REQUIRED",
  "CREATE_DEFAULT_BRANCH_REJECTED",
  "CREATE_PLAN_REQUIRED",
  "CREATE_PLAN_NOT_FOUND",
  "CREATE_CONTRACT_REQUIRED",
  "CREATE_CONTRACT_NOT_FOUND",
  "CREATE_PROVIDER_UNSUPPORTED",
  "CREATE_ORACLE_NOT_INSTALLED",
  "CREATE_SURFACE_BLOCKED",
  "CREATE_READBACK_MODE_MISMATCH",
  "CREATE_READBACK_RESULT_REQUIRED",
  "CREATE_READBACK_APP_MISMATCH",
  "CREATE_READBACK_MISMATCH",
  "CREATE_READBACK_SURFACE_BLOCKED",
] as const;

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

  test("Create has one canonical reference home and a declared closed-set entry", () => {
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
    expect(protocol).toContain("moving\nbase ref");
    expect(protocol).toContain("agent/");
    expect(protocol).toContain('trust: "assistant_reported"');
    expect(protocol).toContain('trust: "assistant_reported_readback"');
    expect(protocol).toContain("provider-attest individual ChatGPT");
  });

  test("runtime validates strict target identity and exposes a separate read-back envelope", () => {
    const runtime = readFileSync(RUNTIME, "utf-8");
    const types = readFileSync(TYPES, "utf-8");
    const command = readFileSync(COMMAND, "utf-8");

    expect(command).toContain("browser-create-readback");
    expect(command).toContain("browser-create-verify");
    expect(command).toContain("--repository <owner/name>");
    expect(command).toContain("--default-branch <name>");
    expect(command).toContain("--base-commit <sha>");
    expect(command).not.toContain("--base <ref>");

    for (const code of CREATE_FAILURE_CODES) {
      expect(runtime).toContain(code);
    }
    expect(runtime).not.toContain("assertOracleAppPreselectCapability");
    expect(runtime).not.toContain("ORACLE_APP_PRESELECT_UNSUPPORTED");
    expect(runtime).toContain("repo-harness-create-readback-result");
    expect(runtime).toContain("Do not use any GitHub write action");
    expect(runtime).toContain("readBackSessionId: result.sessionId");
    expect(types).toContain("assistant_reported_readback");
    expect(types).toContain("BrowserCreateReadBackMeta");
  });

  test("unit and opt-in live integration tests cover the standard browser transport", () => {
    const runtimeTest = readFileSync(RUNTIME_TEST, "utf-8");
    const readBackTest = readFileSync(READBACK_TEST, "utf-8");
    const liveTest = readFileSync(LIVE_TEST, "utf-8");

    expect(runtimeTest).toContain("not.toContain('--browser-app')");
    expect(runtimeTest).toContain("prompt_contract_only");
    expect(runtimeTest).toContain("browser-create-readback");
    expect(runtimeTest).toContain("not.toContain('--followup')");
    expect(runtimeTest).toContain("CREATE_READBACK_MISMATCH");

    expect(readBackTest).toContain("CREATE_READBACK_RESULT_REQUIRED");
    expect(readBackTest).toContain("CREATE_READBACK_SURFACE_BLOCKED");
    expect(readBackTest).toContain("readBackSessionId");
    expect(readBackTest).toContain("without overwriting Create evidence");

    expect(liveTest).toContain("REPO_HARNESS_LIVE_CHATGPT_CREATE");
    expect(liveTest).toContain("test.skip");
    expect(liveTest).toContain("browser-create");
    expect(liveTest).toContain("browser-create-readback");
    expect(liveTest).toContain("--draft-pr");
    expect(liveTest).toContain("readBack.createSessionId");
    expect(liveTest).toContain("readBack.readBackSessionId");
    expect(liveTest).toContain("readBack.create.readBack.sessionId");
  });

  test("published guides have one ownership boundary and neutral examples", () => {
    const packageJson = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));
    expect(packageJson.files).toContain("docs/repo-harness-chatgpt-browser-engine.md");
    expect(packageJson.files).toContain("docs/repo-harness-chatgpt-github-create.md");
    expect(packageJson.scripts["test:live:chatgpt-create"]).toContain("chatgpt-browser-create.live.test.ts");

    const guide = readFileSync(DOC, "utf-8");
    const engineGuide = readFileSync(ENGINE_DOC, "utf-8");
    expect(guide).toContain("[ChatGPT Browser Engine](./repo-harness-chatgpt-browser-engine.md)");
    expect(engineGuide).toContain("[ChatGPT + GitHub App Create](./repo-harness-chatgpt-github-create.md)");
    expect(engineGuide).toContain("planning, bounded GitHub Create, and review workflows");
    expect(engineGuide).toContain("Create and Create read-back are not exposed as MCP tools");
    expect(engineGuide).not.toContain("--browser-app");
    expect(engineGuide).not.toContain("browserAppPreselect");
    expect(guide).toContain("--repository owner/repository");
    expect(guide).not.toContain("--repository drunkod/repo-harness");
    expect(guide).toContain("browser-create-readback");
    expect(guide).toContain("assistant_reported_readback");
    expect(guide).toContain("Live browser and GitHub-app acceptance test");
    expect(guide).toContain("## Reusable test map");
    for (const path of [
      "tests/cli/chatgpt-browser.test.ts",
      "tests/cli/chatgpt-browser-create.test.ts",
      "tests/skill-surface/chatgpt-package.test.ts",
      "tests/skill-surface/retired-names-scan.test.ts",
      "tests/live/chatgpt-browser-create.live.test.ts",
    ]) {
      expect(guide).toContain(path);
    }
    for (const code of CREATE_FAILURE_CODES) {
      expect(guide).toContain(code);
    }
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
    for (const path of [CREATE, DOC, ENGINE_DOC]) {
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
