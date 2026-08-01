import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, statSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "..", "..");
const PACKAGE_ROOT = join(ROOT, "assets", "skills", "repo-harness-chatgpt");
const ROUTER = join(PACKAGE_ROOT, "SKILL.md");
const CREATE = join(PACKAGE_ROOT, "references", "create.md");
const DOC = join(ROOT, "docs", "repo-harness-chatgpt-github-create.md");
const RUNTIME = join(ROOT, "src", "cli", "chatgpt-browser", "create-mode.ts");
const COMMAND = join(ROOT, "src", "cli", "commands", "chatgpt.ts");
const RUNTIME_TEST = join(ROOT, "tests", "cli", "chatgpt-browser-create.test.ts");
const MANIFEST = join(ROOT, "assets", "skill-commands", "manifest.json");

function hasStandaloneName(content: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(?<![A-Za-z0-9_-])${escaped}(?![A-Za-z0-9_-])`, "u").test(content);
}

describe("repo-harness-chatgpt first-class Create mode", () => {
  test("router exposes the dedicated Browser Create runtime within the canonical byte budget", () => {
    const router = readFileSync(ROUTER, "utf-8");
    expect(router).toContain("first-class GitHub-app-backed Browser Create");
    expect(router).toContain("repo-harness chatgpt browser-create");
    expect(router).toContain("`references/create.md`");
    expect(router).toContain("sole ChatGPT Web mode allowed to perform GitHub writes");
    expect(statSync(ROUTER).size).toBeLessThanOrEqual(2048);
  });

  test("Create has one canonical reference home and the closed package set owns it", () => {
    expect(existsSync(CREATE)).toBe(true);
    expect(existsSync(join(PACKAGE_ROOT, "create.md"))).toBe(false);
    const packageTest = readFileSync(join(ROOT, "tests", "skill-surface", "chatgpt-package.test.ts"), "utf-8");
    expect(packageTest).toContain('"create.md"');
    expect(packageTest).toContain("ROUTER_BODY_BYTE_LIMIT = 2048");
  });

  test("canonical protocol uses browser-create and documents typed evidence boundaries", () => {
    const protocol = readFileSync(CREATE, "utf-8");
    expect(protocol).toContain("repo-harness chatgpt browser-create");
    expect(protocol).toContain("mode=create");
    expect(protocol).toContain("--chatgpt-app GitHub");
    expect(protocol).toContain("--base main");
    expect(protocol).toContain("--branch agent/example-change");
    expect(protocol).toContain("--plan plans/plan-example-change.md");
    expect(protocol).toContain("--contract tasks/contracts/example-change.contract.md");
    expect(protocol).toContain("repo-harness-create-result");
    expect(protocol).toContain('"trust": "assistant_reported"');
    expect(protocol).toContain("surface_blocked");
    expect(protocol).toContain("appSelection.verified");
    expect(protocol.toLowerCase().replace(/\s+/g, " ")).toContain("repo-harness does not intercept github tool calls");
  });

  test("runtime and execution-focused tests are present", () => {
    expect(existsSync(RUNTIME)).toBe(true);
    expect(existsSync(RUNTIME_TEST)).toBe(true);
    const runtime = readFileSync(RUNTIME, "utf-8");
    const command = readFileSync(COMMAND, "utf-8");
    const runtimeTest = readFileSync(RUNTIME_TEST, "utf-8");
    expect(command).toContain(".command('browser-create')");
    expect(command).toContain("runBrowserCreate");
    expect(runtime).toContain("assertOracleAppPreselectCapability");
    expect(runtime).toContain("requireSecretScan: true");
    expect(runtime).toContain("CREATE_SURFACE_BLOCKED");
    expect(runtime).toContain("assistant_reported");
    expect(runtimeTest).toContain("--browser-app");
    expect(runtimeTest).toContain("browserAppPreselect");
    expect(runtimeTest).toContain("write-output path policy");
    expect(runtimeTest).toContain("mode=create");
    expect(runtimeTest).toContain("surface_blocked");
  });

  test("published guide is packaged and cross-links the canonical Browser Engine doc", () => {
    const packageJson = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));
    expect(packageJson.files).toContain("docs/repo-harness-chatgpt-github-create.md");
    const guide = readFileSync(DOC, "utf-8");
    expect(guide).toContain("# ChatGPT + GitHub App Create");
    expect(guide).toContain("[ChatGPT Browser Engine](./repo-harness-chatgpt-browser-engine.md)");
    expect(guide).toContain("repo-harness chatgpt browser-create");
    expect(guide).toContain('mode: "create"');
    expect(guide).toContain("CREATE_SURFACE_BLOCKED");
    expect(guide).toContain("assistant_reported");
  });

  test("new Create documentation contains no retired package names or canonical stale patterns", () => {
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
