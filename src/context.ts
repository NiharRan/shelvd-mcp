import { execFileSync } from "node:child_process";
import { basename } from "node:path";
import { PROVIDER_LABEL, normalizeProvider, type ParkIdeaInput } from "./shared.js";

const git = (...args: string[]) => {
  try {
    // trimEnd only: porcelain lines start with a significant space
    return execFileSync("git", args, { encoding: "utf8", timeout: 2000, stdio: ["ignore", "pipe", "ignore"] }).trimEnd();
  } catch {
    return ""; // not a repo, git missing, or slow: context is best effort
  }
};

/** "git@github.com:o/n.git" or "https://github.com/o/n" -> "o/n"; anything else -> "". */
export function repoSlug(remote: string): string {
  return /[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/.exec(remote)?.[1] ?? "";
}

/**
 * Fill context the AI did not send: which editor is calling plus repo, branch and changed files from
 * the server's working directory. Anything the AI passed explicitly wins.
 */
export function enrichContext(input: ParkIdeaInput, client?: { name?: string }, cwdGit = git): ParkIdeaInput {
  const c = { ...input.context };
  const provider = normalizeProvider(client?.name);
  c.source ??= "mcp";
  if (provider) {
    c.provider ??= provider;
    c.client ??= provider === "other" ? client!.name!.slice(0, 80) : PROVIDER_LABEL[provider];
  }
  const top = cwdGit("rev-parse", "--show-toplevel");
  if (top) {
    c.repo ??= repoSlug(cwdGit("remote", "get-url", "origin")) || basename(top);
    c.branch ??= cwdGit("branch", "--show-current") || undefined;
    const dirty = cwdGit("status", "--porcelain").split("\n").filter(Boolean).map((l) => l.slice(3).split(" -> ").pop()!.trim());
    // clean tree: fall back to the last commit's files
    c.files ??= (dirty.length ? dirty : cwdGit("show", "--name-only", "--format=", "HEAD").split("\n").filter(Boolean)).slice(0, 20);
    if (!c.files.length) delete c.files;
  }
  return { ...input, project: input.project ?? (top ? basename(top) : undefined), context: c };
}
