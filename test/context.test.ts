import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { enrichContext, repoSlug } from "../src/context.js";
import { normalizeProvider } from "../src/shared.js";
import { Store } from "../src/store.js";
import * as t from "../src/tools.js";

describe("normalizeProvider", () => {
  it.each([
    ["claude-code", "claude-code"],
    ["Cursor", "cursor"],
    ["windsurf-client", "windsurf"],
    ["codex-mcp-client", "codex"],
    ["Visual Studio Code", "vscode"],
    ["claude-ai", "claude-ai"],
    ["some-new-editor", "other"],
  ])("%s -> %s", (n, p) => expect(normalizeProvider(n)).toBe(p));
  it("is null when unknown", () => {
    expect(normalizeProvider(undefined)).toBeNull();
    expect(normalizeProvider("  ")).toBeNull();
  });
});

describe("repoSlug", () => {
  it("reads ssh and https remotes", () => {
    expect(repoSlug("git@github.com:alex/twinspot.git")).toBe("alex/twinspot");
    expect(repoSlug("https://github.com/alex/twinspot")).toBe("alex/twinspot");
    expect(repoSlug("")).toBe("");
  });
});

const fakeGit = (m: Record<string, string>) => (...a: string[]) => m[a.join(" ")] ?? "";
const inRepo = fakeGit({
  "rev-parse --show-toplevel": "/w/twinspot",
  "remote get-url origin": "git@github.com:alex/twinspot.git",
  "branch --show-current": "feature/flagged-orders",
  "status --porcelain": " M orders_controller.rb\nR  old.tsx -> flagged_table.tsx",
});

describe("enrichContext", () => {
  it("fills editor, repo, branch and files", () => {
    const r = enrichContext({ title: "x" }, { name: "claude-code" }, inRepo);
    expect(r.project).toBe("twinspot");
    expect(r.context).toMatchObject({ client: "Claude Code", provider: "claude-code", repo: "alex/twinspot", branch: "feature/flagged-orders", files: ["orders_controller.rb", "flagged_table.tsx"], source: "mcp" });
  });
  it("lets the AI's own fields win", () => {
    const r = enrichContext({ title: "x", project: "P", context: { branch: "mine", files: ["a"] } }, { name: "cursor" }, inRepo);
    expect(r.project).toBe("P");
    expect(r.context).toMatchObject({ branch: "mine", files: ["a"], provider: "cursor" });
  });
  it("outside a repo keeps only editor info", () => {
    const r = enrichContext({ title: "x" }, { name: "cursor" }, fakeGit({}));
    expect(r.project).toBeUndefined();
    expect(r.context).toEqual({ source: "mcp", provider: "cursor", client: "Cursor" });
  });
});

describe("provider filter", () => {
  it("lists and searches only the chosen editor", () => {
    const store = new Store(mkdtempSync(join(tmpdir(), "shelvd-")));
    t.parkIdea(store, { title: "alpha", context: { provider: "cursor" } });
    t.parkIdea(store, { title: "alpha two", context: { client: "Claude Code", provider: "claude-code" } });
    t.parkIdea(store, { title: "alpha three" });
    expect((t.listIdeas(store, { provider: "cursor" }).data as unknown[]).length).toBe(1);
    expect((t.searchIdeas(store, { query: "alpha", provider: "claude-code" }).data as unknown[]).length).toBe(1);
    expect((t.listIdeas(store, {}).data as unknown[]).length).toBe(3);
  });
});
