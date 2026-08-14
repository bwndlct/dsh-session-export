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
import type { Context } from '@deepseek-ai/cordis';
import { SCHEMA_VERSION, type ExportFormat } from './schema.js';
export declare const name = "dsh-session-export";
export declare const inject: string[];
export { SCHEMA_VERSION };
export { adaptSession } from './session-adapter.js';
export { renderMarkdown } from './markdown.js';
export { renderJson } from './json.js';
export { writeExport, uniquePath, safeFilePart, resolveExportDir } from './exporter.js';
export type * from './schema.js';
/** Shared export pipeline result for both entry points (JSON-serializable). */
export type ExportOutcome = {
    sessionId: string;
    format: ExportFormat;
    files: string[];
    eventCount: number;
    schemaVersion: string;
};
/** @param ctx - plugin context with the tools service injected. */
export declare function apply(ctx: Context): void;
