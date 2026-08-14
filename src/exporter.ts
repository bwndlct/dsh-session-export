/**
 * File exporter: writes rendered artifacts to disk.
 *
 * Owns cross-platform filename safety (Windows-forbidden characters and
 * reserved device names, POSIX separators, control characters, trailing
 * dots/spaces) and never overwrites an existing file — a name collision
 * appends a numeric suffix.
 */

import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { ExportFormat, SessionExport } from './schema.js'
import { renderJson } from './json.js'
import { renderMarkdown } from './markdown.js'

/** Characters forbidden in at least one of Windows/macOS/Linux filenames. */
const UNSAFE_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g
/** Windows reserved device names (case-insensitive, with or without extension). */
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i
/** Cap identifier length so `session-<id>-<ts>` stays within common path limits. */
const MAX_ID_LENGTH = 80

/** Make one string safe to use as a filename component on Windows/macOS/Linux. */
export function safeFilePart(part: string): string {
  let cleaned = part.replace(UNSAFE_CHARS, '_').trim()
  cleaned = cleaned.replace(/[. ]+$/, '')
  if (cleaned.length > MAX_ID_LENGTH) cleaned = cleaned.slice(0, MAX_ID_LENGTH)
  if (cleaned.length === 0 || WINDOWS_RESERVED.test(cleaned)) cleaned = `_${cleaned}`
  return cleaned
}

/** Compact, filename-safe UTC timestamp: `20260101T120000Z`-style. */
export function fileTimestamp(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`
}

/** First free path for `dir/base.ext`, appending `-1`, `-2`, … on collision. */
export function uniquePath(dir: string, base: string, ext: string): string {
  let candidate = join(dir, `${base}${ext}`)
  for (let i = 1; existsSync(candidate); i++) {
    candidate = join(dir, `${base}-${i}${ext}`)
  }
  return candidate
}

/** Options for one export run. */
export interface ExportOptions {
  /** Directory to write into (created recursively when missing). */
  dir: string
  /** Which artifacts to write. */
  format: ExportFormat
  /** Injectable clock for deterministic tests. */
  now?: () => Date
}

/** Result of one export run. */
export interface ExportResult {
  /** Absolute paths of the files written, in execution order. */
  files: string[]
}

/** Default subdirectory (relative to the session working directory). */
export const EXPORT_SUBDIR = '.dsh/exports'

/** Resolve the export directory for a session working directory. */
export function resolveExportDir(cwd: string | undefined): string {
  return resolve(cwd ?? process.cwd(), EXPORT_SUBDIR)
}

/** Build the filename base, avoiding a doubled `session-` prefix (DSH ids
 *  already start with `session-`). */
function baseName(sessionId: string | undefined, stamp: string): string {
  const raw = safeFilePart(sessionId ?? 'session')
  const id = raw.startsWith('session-') ? raw : `session-${raw}`
  return `${id}-${stamp}`
}

/** Write one export to disk in the requested formats. Never overwrites. */
export async function writeExport(
  export_: SessionExport,
  options: ExportOptions,
): Promise<ExportResult> {
  await mkdir(options.dir, { recursive: true })
  const stamp = fileTimestamp((options.now ?? (() => new Date()))())
  const base = baseName(export_.session.id, stamp)
  const files: string[] = []

  if (options.format === 'markdown' || options.format === 'all') {
    const path = uniquePath(options.dir, base, '.md')
    await writeFile(path, renderMarkdown(export_), 'utf8')
    files.push(path)
  }
  if (options.format === 'json' || options.format === 'all') {
    const path = uniquePath(options.dir, base, '.json')
    await writeFile(path, renderJson(export_), 'utf8')
    files.push(path)
  }
  return { files }
}
