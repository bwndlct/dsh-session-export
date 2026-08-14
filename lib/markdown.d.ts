/**
 * Markdown renderer: turns a `SessionExport` into a readable transcript.
 * Pure function — no filesystem, no DSH imports.
 */
import type { SessionExport } from './schema.js';
/** Tool results longer than this are truncated in Markdown output. */
export declare const MAX_TOOL_RESULT_CHARS = 8000;
/** Render the complete Markdown document for one export. */
export declare function renderMarkdown(export_: SessionExport): string;
