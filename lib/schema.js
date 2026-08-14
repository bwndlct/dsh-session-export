/**
 * Export schema owned by dsh-session-export.
 *
 * This is the plugin's own stable schema, deliberately decoupled from DSH
 * internal event shapes: `session-adapter.ts` projects live DSH session
 * objects into these types, and the renderers only ever consume them.
 * `schemaVersion` leaves room for compatible evolution.
 */
/** Version of the export schema emitted by this plugin. */
export const SCHEMA_VERSION = '1.0';
