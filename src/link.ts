import { createHash, randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import pkg from "../package.json";
import type { Store } from "./store.js";

export const ORIGIN = (process.env.SHELVD_URL ?? "https://www.shelvd.dev").replace(/\/$/, "");
const DIR = process.env.SHELVD_DIR ?? join(homedir(), ".shelvd");
const FILE = join(DIR, "link.json");
const LOGIN_MS = 5 * 60_000;
const CHUNK = 500;

export interface Link {
  version: 1;
  origin: string;
  userId: string;
  clientId: string;
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: number;
  importedFor: string[];
}

export class LoginExpired extends Error {
  constructor() {
    super("Shelvd login expired. Ask me to connect your account again.");
  }
}

export function readLink(): Link | null {
  try {
    const l = JSON.parse(readFileSync(FILE, "utf8")) as Link;
    return l.version === 1 ? l : null;
  } catch {
    return null;
  }
}

function writeLink(l: Link) {
  mkdirSync(DIR, { recursive: true, mode: 0o700 });
  chmodSync(DIR, 0o700);
  const tmp = `${FILE}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(l, null, 2), { mode: 0o600 });
  renameSync(tmp, FILE);
}

const b64 = (b: Buffer) => b.toString("base64url");

async function tokenRequest(origin: string, form: Record<string, string>) {
  const r = await fetch(`${origin}/api/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form),
  });
  if (!r.ok) return null;
  return (await r.json()) as { access_token: string; refresh_token: string; expires_in: number };
}

/** Valid access token, refreshing (and persisting the rotated pair) when needed. */
export async function accessToken(): Promise<{ token: string; link: Link }> {
  let l = readLink();
  if (!l) throw new LoginExpired();
  if (l.accessExpiresAt - 30_000 > Date.now()) return { token: l.accessToken, link: l };
  // Another client's server process may have rotated the pair since we started: re-read before refreshing.
  const t = await tokenRequest(l.origin, { grant_type: "refresh_token", refresh_token: l.refreshToken, client_id: l.clientId });
  if (!t) {
    const again = readLink();
    if (again && again.refreshToken !== l.refreshToken && again.accessExpiresAt > Date.now()) return { token: again.accessToken, link: again };
    throw new LoginExpired();
  }
  l = { ...l, accessToken: t.access_token, refreshToken: t.refresh_token, accessExpiresAt: Date.now() + t.expires_in * 1000 };
  writeLink(l);
  return { token: l.accessToken, link: l };
}

/** Call a hosted tool. Stateless: one short-lived client per call. */
export async function forward(name: string, args: Record<string, unknown>) {
  const { token, link } = await accessToken();
  const client = new Client({ name: "shelvd-mcp", version: pkg.version });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${link.origin}/api/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }),
  );
  try {
    return (await client.callTool({ name, arguments: args })) as { content: { type: "text"; text: string }[]; isError?: boolean };
  } finally {
    await client.close().catch(() => {});
  }
}

/** Send local ideas in chunks. Returns totals; throws if a chunk fails twice, leaving importedFor unchanged. */
export async function importIdeas(store: Store): Promise<{ imported: number; skipped: number; capped: number }> {
  const ideas = store.read();
  const total = { imported: 0, skipped: 0, capped: 0 };
  for (let i = 0; i < ideas.length; i += CHUNK) {
    const body = JSON.stringify({ ideas: ideas.slice(i, i + CHUNK) });
    let done = false;
    for (let attempt = 0; attempt < 2 && !done; attempt++) {
      const { token, link } = await accessToken();
      const r = await fetch(`${link.origin}/api/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body,
      });
      if (r.ok) {
        const j = (await r.json()) as typeof total;
        total.imported += j.imported;
        total.skipped += j.skipped;
        total.capped += j.capped ?? 0;
        done = true;
      }
    }
    if (!done) throw new Error("Import failed. Your local ideas are untouched; ask me to connect again to retry.");
  }
  const l = readLink();
  if (l && !l.importedFor.includes(l.userId)) writeLink({ ...l, importedFor: [...l.importedFor, l.userId] });
  return total;
}

function openBrowser(url: string) {
  if (!/^https?:\/\//.test(url)) return;
  // No shell: cmd.exe would treat "&" in the URL as a command separator.
  const [cmd, args] =
    platform() === "darwin" ? ["open", [url]] : platform() === "win32" ? ["rundll32", ["url.dll,FileProtocolHandler", url]] : ["xdg-open", [url]];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
  } catch {
    // headless: the URL is also returned to the user
  }
}

/** The hosted MCP has no whoami, so an empty import returns the account id. */
async function whoami(origin: string, token: string): Promise<string> {
  const r = await fetch(`${origin}/api/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ideas: [] }),
  });
  if (!r.ok) throw new Error("login check failed");
  return (await r.json()).account as string;
}

type Pending = { url: string; state: "waiting" | "done" | "failed"; message: string };
let pending: Pending | null = null;

/** Start (or report) a browser login. Returns at once; the loopback listener lives up to 5 minutes. */
export function startLogin(store: Store): Pending {
  if (pending?.state === "waiting") return pending;
  const verifier = b64(randomBytes(32));
  const challenge = b64(createHash("sha256").update(verifier).digest());
  const state = b64(randomBytes(16));
  const p: Pending = { url: "", state: "waiting", message: "" };
  pending = p;

  const srv = createServer();
  const finish = (state: "done" | "failed", message: string) => {
    p.state = state;
    p.message = message;
    clearTimeout(timer);
    srv.close();
  };
  const timer = setTimeout(() => finish("failed", "Login timed out. Ask me to connect again."), LOGIN_MS);

  srv.on("request", async (req, res) => {
    const u = new URL(req.url ?? "/", "http://127.0.0.1");
    if (u.pathname !== "/callback") return void res.writeHead(404).end();
    const reply = (t: string) => res.writeHead(200, { "Content-Type": "text/html" }).end(`<p style="font:16px system-ui">${t}</p>`);
    const code = u.searchParams.get("code");
    if (u.searchParams.get("state") !== state || !code) {
      reply("Login failed. You can close this tab.");
      return;
    }
    try {
      const redirect = `http://127.0.0.1:${(srv.address() as AddressInfo).port}/callback`;
      const t = await tokenRequest(ORIGIN, { grant_type: "authorization_code", code, redirect_uri: redirect, client_id: clientId, code_verifier: verifier });
      if (!t) throw new Error("token exchange failed");
      const userId = await whoami(ORIGIN, t.access_token);
      const prev = readLink();
      writeLink({
        version: 1,
        origin: ORIGIN,
        userId,
        clientId,
        accessToken: t.access_token,
        refreshToken: t.refresh_token,
        accessExpiresAt: Date.now() + t.expires_in * 1000,
        importedFor: prev?.importedFor ?? [],
      });
      reply("Shelvd is connected. You can close this tab and go back to your AI.");
      const r = await importIdeas(store);
      finish("done", `Linked. Imported ${r.imported} ideas, ${r.skipped} skipped. Everything now syncs with shelvd.dev.${r.capped ? ` ${r.capped} ideas were not uploaded: the free plan holds 50 open ideas. Upgrade to Pro for unlimited: https://shelvd.dev/pro` : ""}`);
    } catch (e) {
      if (!res.headersSent) reply("Login failed. You can close this tab.");
      finish("failed", e instanceof Error ? e.message : String(e));
    }
  });

  let clientId = "";
  srv.listen(0, "127.0.0.1", async () => {
    try {
      const redirect = `http://127.0.0.1:${(srv.address() as AddressInfo).port}/callback`;
      const reg = await fetch(`${ORIGIN}/api/oauth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_name: "Shelvd CLI", redirect_uris: [redirect] }),
      });
      if (!reg.ok) throw new Error("could not register with shelvd.dev");
      clientId = ((await reg.json()) as { client_id: string }).client_id;
      const q = new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri: redirect,
        code_challenge: challenge,
        code_challenge_method: "S256",
        state,
      });
      p.url = `${ORIGIN}/oauth/authorize?${q}`;
      openBrowser(p.url);
    } catch (e) {
      finish("failed", e instanceof Error ? e.message : String(e));
    }
  });
  return p;
}

export const clearLogin = () => void (pending = null);

export function loginStatus(): Pending | null {
  return pending;
}

export async function disconnect(): Promise<void> {
  const l = readLink();
  if (!l) return;
  await fetch(`${l.origin}/api/oauth/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: l.refreshToken, client_id: l.clientId }),
  }).catch(() => {});
  rmSync(FILE, { force: true });
  pending = null;
}
