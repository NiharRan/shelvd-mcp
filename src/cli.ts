import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer } from "./server.js";
import { Store } from "./store.js";
import { dueSummary } from "./tools.js";

const HOOK = JSON.stringify(
  { hooks: { SessionStart: [{ hooks: [{ type: "command", command: "npx -y shelvd-mcp due" }] }] } },
  null,
  2,
);

const cmd = process.argv[2];
const store = new Store();

if (cmd === "due") {
  // Used by a Claude Code SessionStart hook: must never fail the session.
  try {
    const out = dueSummary(store.read(), new Date());
    if (out) console.log(out);
  } catch (e) {
    console.log(`shelvd: ${e instanceof Error ? e.message : e}`);
  }
} else if (cmd === "hook") {
  console.log(`Add this to ~/.claude/settings.json (Shelvd never edits it for you):\n\n${HOOK}`);
} else {
  await buildServer(store).connect(new StdioServerTransport());
}
