/**
 * JSON renderer: serializes a `SessionExport` deterministically.
 * `JSON.stringify` handles escaping of special characters in arguments and
 * content; array order preserves execution order.
 */
import type { SessionExport } from './schema.js';
/** Render the complete JSON document for one export. */
export declare function renderJson(export_: SessionExport): string;
