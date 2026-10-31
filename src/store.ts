import { randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Idea } from "./shared.js";

interface FileShape {
  version: 1;
  ideas: Idea[];
}

export class CorruptStoreError extends Error {
  constructor(file: string) {
    super(`${file} is unreadable. Left untouched; fix or move it, then retry.`);
  }
}

export class Store {
  readonly file: string;

  constructor(dir = process.env.SHELVD_DIR ?? join(homedir(), ".shelvd")) {
    this.dir = dir;
    this.file = join(dir, "ideas.json");
  }
  private dir: string;

  read(): Idea[] {
    let raw: string;
    try {
      raw = readFileSync(this.file, "utf8");
    } catch (e: any) {
      if (e.code === "ENOENT") return [];
      throw e;
    }
    try {
      const parsed = JSON.parse(raw) as FileShape;
      if (parsed.version !== 1 || !Array.isArray(parsed.ideas)) throw new Error();
      return parsed.ideas;
    } catch {
      throw new CorruptStoreError(this.file);
    }
  }

  // shortcut: re-reads before each write but takes no lock, so two clients writing in the same
  // millisecond can drop one write. Add a lockfile if that ever happens in practice.
  update<T>(fn: (ideas: Idea[]) => T): T {
    const ideas = this.read();
    const result = fn(ideas);
    mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    chmodSync(this.dir, 0o700); // mkdir mode skips existing dirs from older installs
    const tmp = `${this.file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify({ version: 1, ideas } satisfies FileShape, null, 2), { mode: 0o600 });
    renameSync(tmp, this.file);
    return result;
  }

  newId(ideas: Idea[]): string {
    for (;;) {
      const id = randomBytes(4).toString("hex").slice(0, 6);
      if (!ideas.some((i) => i.id === id)) return id;
    }
  }
}
