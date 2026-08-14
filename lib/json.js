/**
 * JSON renderer: serializes a `SessionExport` deterministically.
 * `JSON.stringify` handles escaping of special characters in arguments and
 * content; array order preserves execution order.
 */
/** Render the complete JSON document for one export. */
export function renderJson(export_) {
    return `${JSON.stringify(export_, null, 2)}\n`;
}
