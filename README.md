# shelvd-mcp: idea parking MCP server for Claude Code

[![npm version](https://img.shields.io/npm/v/shelvd-mcp)](https://www.npmjs.com/package/shelvd-mcp)
[![npm downloads](https://img.shields.io/npm/dm/shelvd-mcp)](https://www.npmjs.com/package/shelvd-mcp)
[![license](https://img.shields.io/npm/l/shelvd-mcp)](LICENSE)

Park ideas from your AI tool and pick them up later. Shelvd is a local, private [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server for Claude Code, Cursor and other MCP clients: a to-do and idea backlog that lives in your AI assistant. Your ideas stay in a JSON file on your machine, and nothing is sent anywhere.

**npm:** [npmjs.com/package/shelvd-mcp](https://www.npmjs.com/package/shelvd-mcp)

## Install

Claude Code:

```
claude mcp add shelvd -- npx -y shelvd-mcp
```

Any other MCP client: run `npx -y shelvd-mcp` as a stdio server.

## Use

Talk to your assistant:

- "Park an idea: add dark mode, remind me friday 3pm"
- "List my ideas"
- "Snooze the dark mode idea until next week"
- "Mark 6ebe83 done"

## Tools

| Tool | What it does |
| --- | --- |
| `park_idea` | Save an idea with an optional due date (natural language works), project, details and context (repo, branch, files, summary). |
| `list_ideas` | Show ideas as a table. Filter by `project`, `status` (`parked`, `due`, `snoozed`, `done`, `all`), `from`/`to` dates and `limit`. |
| `get_idea` | Show one idea with its context, notes and history. |
| `update_idea` | Edit title, details, project or due date, or append a `note`. Only the fields you give change. |
| `search_ideas` | Find ideas by text in title, details, project and notes. |
| `start_idea` | Load an idea's details, context and notes as a brief, so the assistant can start work on it. |
| `complete_idea` | Mark an idea done. |
| `snooze_idea` | Move the due date later, using `until` (date text) or `minutes`. |
| `delete_idea` | Permanently delete one idea by id. |
| `clear_ideas` | Delete many ideas by scope: `done`, `all` or `project:<name>`. Previews first; only deletes with `confirm=true`. |

## Due-idea reminders at session start

The server mentions ideas that are due or overdue in the first reply of a session. To also see them from a Claude Code `SessionStart` hook, run:

```
npx -y shelvd-mcp hook
```

It prints a snippet to paste into `~/.claude/settings.json`. Shelvd never edits that file for you.

## Where data lives

Ideas are stored in `~/.shelvd/ideas.json` (directory `0700`, file `0600`). Set `SHELVD_DIR` to use another directory.

If the file is corrupt, Shelvd leaves it untouched and reports the error. Fix or move the file, then retry.

## Limits

- Two clients writing in the same millisecond can drop one write (no file lock).
- Phone reminders (`nagEveryMinutes`) need the hosted Pro version.

## Links

- npm: https://www.npmjs.com/package/shelvd-mcp
- Source and issues: https://github.com/NiharRan/shelvd-mcp

Keywords: MCP server, Model Context Protocol, Claude Code, idea parking, idea tracker, backlog, to-do, reminders, snooze, notes, local-first, privacy.
