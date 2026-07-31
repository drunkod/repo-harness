import { describe, expect, test } from "bun:test";
import { readFileSync, statSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "..", "..");
const PACKAGE_ROOT = join(ROOT, "assets", "skills", "repo-harness-chatgpt");
const ROUTER = join(PACKAGE_ROOT, "SKILL.md");
const CREATE = join(PACKAGE_ROOT, "create.md");
const DOC = join(ROOT, "docs", "repo-harness-chatgpt-github-create.md");

describe("repo-harness-chatgpt Create mode MVP", () => {
  test("router exposes a distinct GitHub-app-backed Create mode", () => {
    const router = readFileSync(ROUTER, "utf-8");
    expect(router).toContain("GitHub-app-backed Create");
    expect(router).toContain("`create.md`");
    expect(router).toContain("sole ChatGPT Web mode allowed to perform GitHub writes");
    expect(statSync(ROUTER).size).toBeLessThanOrEqual(2560);
  });

  test("Create reuses browser-consult with explicit GitHub app selection and fail-closed write boundaries", () => {
    const protocol = readFileSync(CREATE, "utf-8");
    const normalizedProtocol = protocol.replace(/\s+/g, " ");
    expect(protocol).toContain("repo-harness chatgpt browser-consult");
    expect(protocol).toContain("--chatgpt-app GitHub");
    expect(protocol).toContain("--dry-run");
    expect(protocol).toContain("--secret-scan");
    expect(normalizedProtocol).toContain("Never write directly to the default branch");
    expect(protocol).toContain("Never force-update a ref");
    expect(protocol).toContain("draft");
    expect(protocol).toContain("Do not mark it ready");
    expect(protocol).toContain("The Create conversation does not review");
    expect(protocol).toContain("does not add a GitHub API implementation to repo-harness");
  });

  test("published package includes the Create guide", () => {
    const packageJson = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));
    expect(packageJson.files).toContain("docs/repo-harness-chatgpt-github-create.md");
    const guide = readFileSync(DOC, "utf-8");
    expect(guide).toContain("ChatGPT + GitHub App Create MVP");
    expect(guide).toContain("assets/skills/repo-harness-chatgpt/create.md");
  });
});
