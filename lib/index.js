/**
 * dsh-session-export — export the current DSH session to portable
 * Markdown and JSON files under `<cwd>/.dsh/exports/`.
 *
 * Two entry points, both reading the same live event-sourced session log:
 *
 * - `session_export` tool — lets the model export on request;
 * - `/session-export [markdown|json|all]` command — direct UI action with
 *   zero model tokens (registered only when the commands service is mounted,
 *   so headless profiles still load the plugin).
 *
 * The export schema is owned by this plugin (`schema.ts`); the DSH adapter
 * (`session-adapter.ts`) is the only module that touches DSH session types.
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
import { SCHEMA_VERSION } from './schema.js';
import { adaptSession } from './session-adapter.js';
import { resolveExportDir, writeExport } from './exporter.js';
export const name = 'dsh-session-export';
export const inject = ['tools'];
export { SCHEMA_VERSION };
export { adaptSession } from './session-adapter.js';
export { renderMarkdown } from './markdown.js';
export { renderJson } from './json.js';
export { writeExport, uniquePath, safeFilePart, resolveExportDir } from './exporter.js';
const FORMATS = ['markdown', 'json', 'all'];
function parseFormat(raw) {
    const value = raw.trim().toLowerCase();
    if (value === '')
        return 'all';
    return FORMATS.includes(value) ? value : undefined;
}
/** Shared export pipeline for both entry points. Never throws on odd log content. */
async function exportCurrentSession(agent, format, signal) {
    const session = agent.session;
    const document = adaptSession(session, {
        modelHint: {
            provider: agent.options.provider,
            model: agent.options.model,
        },
    });
    const cwd = typeof session.header.cwd === 'string' ? session.header.cwd : undefined;
    const dir = resolveExportDir(cwd);
    const { files } = await writeExport(document, { dir, format });
    if (signal?.aborted)
        throw new Error('session_export: aborted');
    return {
        sessionId: document.session.id ?? 'unknown',
        format,
        files,
        eventCount: document.session.eventCount ?? document.events.length,
        schemaVersion: document.schemaVersion,
    };
}
function outcomeText(outcome) {
    const lines = outcome.files.map((file) => `  - ${file}`);
    return [
        `Exported session ${outcome.sessionId} (${outcome.eventCount} events, schema v${outcome.schemaVersion}):`,
        ...lines,
    ].join('\n');
}
/** @param ctx - plugin context with the tools service injected. */
export function apply(ctx) {
    ctx.tools.register(defineTool({
        name: 'session_export',
        description: 'Export the current session to portable files under .dsh/exports/: a human-readable ' +
            'Markdown transcript and/or a structured JSON document (schema versioned). Use when the ' +
            'user asks to export, save, share, or archive the current conversation. ' +
            'Note: exported files may contain source code, file contents, and tool results — ' +
            'the user should review them before sharing.',
        parameters: {
            format: {
                type: 'string',
                description: "Which artifacts to write: 'markdown', 'json', or 'all' (default 'all').",
                enum: ['markdown', 'json', 'all'],
            },
        },
        output: {
            schema: { type: 'object', additionalProperties: true },
            render: (args, value) => [
                { type: 'text', text: outcomeText(value) },
            ],
        },
        execute: async (args, exec) => {
            const agent = exec.agent;
            if (agent === undefined) {
                throw new Error('session_export: no agent is bound to this execution; cannot resolve the session');
            }
            const format = args.format ?? 'all';
            return await exportCurrentSession(agent, format, exec.signal);
        },
    }));
    // Optional slash commands: mounted only in profiles that provide the
    // commands service (e.g. web). Absent service is not an error.
    // `/session-export` keeps its optional argument for compatibility; the
    // fixed-format aliases (`/export-md`, `/export-json`) need no argument,
    // because UI command input has no enum completion.
    const commands = ctx.get('commands');
    if (commands !== undefined) {
        const register = (name, description, fixed, hint) => ctx.effect(() => commands.register({
            name,
            description,
            ...(hint !== undefined ? { input: { hint } } : {}),
            handler: async (invocation) => {
                let format = fixed ?? 'all';
                if (fixed === undefined) {
                    const parsed = parseFormat(invocation.rawInput);
                    if (parsed === undefined) {
                        return {
                            kind: 'error',
                            text: `${name}: unknown format "${invocation.rawInput.trim()}" (expected markdown, json, or all)`,
                        };
                    }
                    format = parsed;
                }
                try {
                    const outcome = await exportCurrentSession(invocation.agent, format, invocation.signal);
                    return { kind: 'success', text: outcomeText(outcome) };
                }
                catch (error) {
                    return {
                        kind: 'error',
                        text: `${name}: ${error instanceof Error ? error.message : String(error)}`,
                    };
                }
            },
        }), `dsh-session-export: /${name} command`);
        register('session-export', 'Export the current session to Markdown/JSON under .dsh/exports/ (default: all)', undefined, 'markdown | json | all — empty for all');
        register('export-md', 'Export the current session as Markdown only', 'markdown');
        register('export-json', 'Export the current session as JSON only', 'json');
    }
}
