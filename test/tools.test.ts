import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { parseDue } from "../src/dates.js";
import { Store } from "../src/store.js";
import * as t from "../src/tools.js";

const now = new Date(2026, 9, 31, 9, 0); // Sat 31 Oct 2026 09:00 local
let dir: string;
let store: Store;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "shelvd-"));
  store = new Store(dir);
});

describe("dates", () => {
  it("defaults to 10:00 when no time given", () => {
    expect(parseDue("tomorrow", now)?.getHours()).toBe(10);
  });
  it("keeps explicit time", () => {
    expect(parseDue("tomorrow 3pm", now)?.getHours()).toBe(15);
  });
  it("returns null for junk", () => {
    expect(parseDue("blargh", now)).toBeNull();
  });
});

describe("park_idea", () => {
  it("parks undated in Inbox", () => {
    const r = t.parkIdea(store, { title: "x" }, now);
    expect(r.text).toContain("No due date");
    expect((r.data as any).project).toBe("Inbox");
  });
  it("uses repo as project and parks on bad date", () => {
    const r = t.parkIdea(store, { title: "x", due: "blargh", context: { repo: "api" } }, now);
    expect(r.text).toContain("parked without one");
    expect((r.data as any).project).toBe("api");
  });
  it("mentions Pro for nagging", () => {
    expect(t.parkIdea(store, { title: "x", nagEveryMinutes: 30 }, now).text).toContain("Pro");
  });
});

describe("list_ideas", () => {
  it("sorts overdue before upcoming before undated, hides done", () => {
    t.parkIdea(store, { title: "undated" }, now);
    t.parkIdea(store, { title: "later", due: "next week" }, now);
    t.parkIdea(store, { title: "old", due: "2026-10-01" }, now);
    const done = t.parkIdea(store, { title: "finished" }, now).data as any;
    t.completeIdea(store, done.id, now);
    const titles = (t.listIdeas(store, {}, now).data as any[]).map((i) => i.title);
    expect(titles).toEqual(["old", "later", "undated"]);
  });
  it("lists known projects for unknown project", () => {
    t.parkIdea(store, { title: "x", project: "A" }, now);
    const r = t.listIdeas(store, { project: "B" }, now);
    expect(r.isError).toBe(true);
    expect(r.text).toContain("A");
  });
});

describe("delete and clear", () => {
  it("deletes by exact id only", () => {
    const i = t.parkIdea(store, { title: "x" }, now).data as any;
    expect(t.deleteIdea(store, "nope").isError).toBe(true);
    expect(t.deleteIdea(store, i.id).text).toContain('"x"');
    expect(store.read()).toHaveLength(0);
  });
  it("clear previews without confirm, deletes with it", () => {
    t.parkIdea(store, { title: "a", project: "P" }, now);
    t.parkIdea(store, { title: "b", project: "Q" }, now);
    expect(t.clearIdeas(store, { scope: "project:p" }).text).toContain("Would delete 1");
    expect(store.read()).toHaveLength(2);
    t.clearIdeas(store, { scope: "project:p", confirm: true });
    expect(store.read().map((i) => i.title)).toEqual(["b"]);
  });
});

describe("store safety", () => {
  it("never overwrites a corrupt file", () => {
    writeFileSync(join(dir, "ideas.json"), "{broken");
    expect(() => t.parkIdea(store, { title: "x" }, now)).toThrow(/unreadable/);
    expect(readFileSync(join(dir, "ideas.json"), "utf8")).toBe("{broken");
  });
});

describe("due summary", () => {
  it("is empty when nothing due", () => {
    t.parkIdea(store, { title: "x", due: "next month" }, now);
    expect(t.dueSummary(store.read(), now)).toBe("");
  });
  it("lists overdue", () => {
    t.parkIdea(store, { title: "x", due: "2026-10-01" }, now);
    expect(t.dueSummary(store.read(), now)).toContain("overdue");
  });
});

describe("update_idea / search_ideas / start_idea", () => {
  it("updates fields and appends a note", () => {
    const id = (t.parkIdea(store, { title: "a" }, now).data as any).id;
    const r = t.updateIdea(store, { id, title: "b", project: "api", due: "tomorrow", note: "n1" }, now);
    const i = r.data as any;
    expect([i.title, i.project, i.notes]).toEqual(["b", "api", ["n1"]]);
    expect(i.dueAt).not.toBeNull();
  });
  it("rejects bad due and unknown id without changing anything", () => {
    const id = (t.parkIdea(store, { title: "a" }, now).data as any).id;
    expect(t.updateIdea(store, { id, title: "z", due: "blargh" }, now).isError).toBe(true);
    expect(t.updateIdea(store, { id: "nope", title: "z" }, now).isError).toBe(true);
    expect((store.read()[0] as any).title).toBe("a");
  });
  it("searches title, details and notes case-insensitively", () => {
    const id = (t.parkIdea(store, { title: "alpha", details: "Needle here" }, now).data as any).id;
    t.parkIdea(store, { title: "beta" }, now);
    t.updateIdea(store, { id, note: "hay" }, now);
    expect((t.searchIdeas(store, { query: "needle" }, now).data as any[]).map((i) => i.title)).toEqual(["alpha"]);
    expect((t.searchIdeas(store, { query: "HAY" }, now).data as any[]).length).toBe(1);
    expect(t.searchIdeas(store, { query: "zzz" }, now).text).toContain("No ideas match");
  });
  it("start_idea returns a brief with context", () => {
    const id = (t.parkIdea(store, { title: "a", context: { repo: "api", files: ["x.ts"] } }, now).data as any).id;
    const r = t.startIdea(store, id);
    expect(r.text).toContain("Repo: api");
    expect(r.text).toContain("x.ts");
    expect(t.startIdea(store, "nope").isError).toBe(true);
  });
});
