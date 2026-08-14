[简体中文](README.md) | **English**

# dsh-session-export

Export DeepSeek Harness (DSH) sessions to portable, human-readable **Markdown** and structured **JSON**.

`dsh-session-export` is a community plugin for [DeepSeek Harness](https://www.npmjs.com/package/@deepseek-ai/dsh). It reads the current session's event-sourced log and writes self-contained transcript files you can read, archive, share, diff, or feed to another agent — with a stable, versioned export schema that is decoupled from DSH internals.

## Features

- **Two entry points**
  - `session_export()` tool — ask the model to export at any time
  - `/session-export [markdown|json|all]` slash command — one keystroke in the Web UI, zero model tokens
- **Faithful execution order** — user messages, assistant messages (incl. reasoning), tool calls with parsed arguments, and tool results (incl. failures) in the exact order they happened
- **Stable export schema** — `schemaVersion` on every JSON document, room to evolve
- **Robust by design** — unknown future event types, missing metadata, hostile code fences, huge tool results, and non-text blocks never crash an export
- **Cross-platform safe filenames** — Windows-reserved names/characters handled; existing files are never overwritten
- **Zero runtime dependencies** — TypeScript, Node built-ins only

## Installation

Requires `dsh >= 0.1.0-rc.6`.

```sh
dsh plugin --profile web add dsh-session-export
```

Then add the package to the `bundles` list in the profile's `package.json` (the plugin ships a `dsh.bundle` patch manifest):

```jsonc
// ~/.dsh/profiles/web/package.json
"dsh": {
  "profile": {
    "bundles": [
      // ...,
      "dsh-session-export"
    ]
  }
}
```

Restart `dsh` afterwards. To install from GitHub instead of npm:

```sh
dsh plugin --profile web add github:<your-org>/dsh-session-export
```

## Usage

Ask the model:

```text
把当前会话导出成 Markdown
Export this session, json only
```

Or run a slash command directly in the Web UI:

```text
/session-export            # both files (default)
/session-export markdown   # .md only
/session-export json       # .json only
/session-export all        # both files
```

Prefer no argument at all? Fixed-format aliases do the same thing in one word (UI command input has no enum completion, so the aliases are the most convenient form):

```text
/export-md       # Markdown only
/export-json     # JSON only
```

Commands run in the UI command plane — their output never enters the model's history.

## Export Formats

### Markdown

A readable transcript: metadata header, then the session in execution order. Tool calls render their (parsed) arguments as JSON; tool results render as fenced `text` blocks — the fence auto-widens so result content containing ``` can never break out. Results longer than 8,000 characters are truncated with a marker.

### JSON

A stable document owned by this plugin (not a dump of DSH internals):

```json
{
  "schemaVersion": "1.0",
  "session": {
    "id": "session-e6bb6821-…",
    "createdAt": "2026-08-14T09:52:59.798Z",
    "exportedAt": "2026-08-14T09:53:24.300Z",
    "model": "glm-5.3",
    "provider": "zai-coding-cn",
    "cwd": "/private/tmp/dsh-export-verify",
    "asOfSeq": 137,
    "eventCount": 6,
    "omitted": { "contextMessages": 2 }
  },
  "events": [
    { "type": "user_message", "seq": 6, "timestamp": "…", "content": "…" },
    { "type": "assistant_message", "seq": 9, "timestamp": "…", "content": "…", "reasoning": "…", "provider": "…", "model": "…" },
    { "type": "tool_call", "seq": 10, "timestamp": "…", "callId": "…", "tool": "bash", "arguments": { "command": "echo hi" } },
    { "type": "tool_result", "seq": 11, "timestamp": "…", "callId": "…", "tool": "bash", "success": true, "content": "hi\n" },
    { "type": "unknown_event", "seq": 99, "timestamp": "…", "eventType": "future/thing" }
  ]
}
```

Notes on fidelity:

- `tool_call.arguments` keeps the model's raw string when it is not valid JSON.
- `tool_result.error` carries the internal `{ name, code }` identity for failed calls.
- Reasoning is exported when DSH records it on the assistant message; nothing private is reflected or extracted.
- Log-only bookkeeping events (turn/step boundaries, stream chunks, todo snapshots, request headers, permission presets, …) are intentionally skipped; injected context messages (instructions, skills, notices) are omitted by default and counted under `session.omitted`.
- Compaction replacement nodes are skipped (per the DSH transcript contract, a human-facing transcript projects append-origin events); the count is reported in `session.omitted.replacedEvents`.
- Unknown future event types surface as `unknown_event` entries — never a crash.

## Example

Markdown output (trimmed):

````markdown
# DSH Session Export

## Metadata

- Session ID: session-e6bb6821-2a4c-40a3-a178-13ea25ccfe4e
- Model: zai-coding-cn / glm-5.3
- Working Directory: /private/tmp/dsh-export-verify
- Exported Events: 6

---

## User

先用 bash 运行 echo verify-2 …

## Assistant

_zai-coding-cn / glm-5.3_

> The user wants me to: …

### Tool Call: `bash`

```json
{
  "command": "echo verify-2"
}
```

### Tool Result — `bash` (ok)

```text
verify-2
```
````

## Output Directory

Exports land in `<session working directory>/.dsh/exports/`:

```text
.dsh/exports/session-<session-id>-<UTC timestamp>.md
.dsh/exports/session-<session-id>-<UTC timestamp>.json
```

The directory is created automatically, filenames are sanitized for Windows/macOS/Linux, and a name collision appends `-1`, `-2`, … instead of overwriting.

## Privacy

**Exports can contain sensitive data.** A transcript may include your source code, file contents read by tools, tool arguments (paths, commands, queries), tool results, API responses, and absolute filesystem paths. Review an export before sharing it — this plugin performs no redaction.

## Development

```sh
pnpm install
pnpm run typecheck
pnpm run build
pnpm test          # node:test, no extra deps
```

Layout:

```text
src/
  index.ts            # plugin entry: tool + slash command
  session-adapter.ts  # DSH session -> export schema (only DSH-typed module)
  schema.ts           # the plugin-owned export schema types
  markdown.ts         # Markdown renderer (pure)
  json.ts             # JSON renderer (pure)
  exporter.ts         # filenames + file writing
test/                 # node:test suites for markdown / json / filenames
```

The renderers and schema have no DSH imports, so the export format can be unit-tested and evolved independently of the DSH Developer Preview API.

## Compatibility

- Built and verified against `@deepseek-ai/dsh 0.1.0-rc.6` (DSH Developer Preview).
- Uses the public plugin surface: `ctx.tools.register()` / `defineTool` from `@deepseek-ai/dsh-tools`, the optional `ctx.commands` service from `@deepseek-ai/dsh-commands`, and the public `Session` event log from `@deepseek-ai/dsh-session`. No private fields, no core modifications.
- The slash command registers only in profiles that mount the commands service (e.g. `web`); the tool works everywhere, including `headless`.

## License

[MIT](LICENSE)