/**
 * File exporter: writes rendered artifacts to disk.
 *
 * Owns cross-platform filename safety (Windows-forbidden characters and
 * reserved device names, POSIX separators, control characters, trailing
 * dots/spaces) and never overwrites an existing file — a name collision
 * appends a numeric suffix.
 */
import type { ExportFormat, SessionExport } from './schema.js';
/** Make one string safe to use as a filename component on Windows/macOS/Linux. */
export declare function safeFilePart(part: string): string;
/** Compact, filename-safe UTC timestamp: `20260101T120000Z`-style. */
export declare function fileTimestamp(date: Date): string;
/** First free path for `dir/base.ext`, appending `-1`, `-2`, … on collision. */
export declare function uniquePath(dir: string, base: string, ext: string): string;
/** Options for one export run. */
export interface ExportOptions {
    /** Directory to write into (created recursively when missing). */
    dir: string;
    /** Which artifacts to write. */
    format: ExportFormat;
    /** Injectable clock for deterministic tests. */
    now?: () => Date;
}
/** Result of one export run. */
export interface ExportResult {
    /** Absolute paths of the files written, in execution order. */
    files: string[];
}
/** Default subdirectory (relative to the session working directory). */
export declare const EXPORT_SUBDIR = ".dsh/exports";
/** Resolve the export directory for a session working directory. */
export declare function resolveExportDir(cwd: string | undefined): string;
/** Write one export to disk in the requested formats. Never overwrites. */
export declare function writeExport(export_: SessionExport, options: ExportOptions): Promise<ExportResult>;
