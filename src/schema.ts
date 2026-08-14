/**
 * Export schema owned by dsh-session-export.
 *
 * This is the plugin's own stable schema, deliberately decoupled from DSH
 * internal event shapes: `session-adapter.ts` projects live DSH session
 * objects into these types, and the renderers only ever consume them.
 * `schemaVersion` leaves room for compatible evolution.
 */

/** Version of the export schema emitted by this plugin. */
export const SCHEMA_VERSION = '1.0' as const

/** Which artifact(s) to write. */
export type ExportFormat = 'markdown' | 'json' | 'all'

/** Session-level metadata; every field except `exportedAt` is optional. */
export interface SessionExportMetadata {
  /** DSH session id, when the header carried one. */
  id?: string
  /** Session creation time (ISO 8601), when known. */
  createdAt?: string
  /** Time this export was produced (ISO 8601). */
  exportedAt: string
  /** Model id that produced the assistant messages, when known. */
  model?: string
  /** Provider route that produced the assistant messages, when known. */
  provider?: string
  /** Session working directory, when known. */
  cwd?: string
  /** Parent session id for forked/delegated sessions, when known. */
  parentSession?: string
  /** Last event seq included in this export. */
  asOfSeq?: number
  /** Number of export events (post-projection). */
  eventCount?: number
  /** Counts of source events intentionally left out of the export. */
  omitted?: SessionExportOmissions
}

/** What was omitted and why. */
export interface SessionExportOmissions {
  /** user-role messages that were plugin/model-injected context, not human input. */
  contextMessages?: number
  /** Surface events skipped because a later compaction event replaced them. */
  replacedEvents?: number
  /** Log events this plugin did not recognize (kept as `unknown_event`). */
  unknownEvents?: number
}

/** Internal error identity carried on a failed tool result. */
export interface ExportToolError {
  name: string
  code: string
}

/** One projected, human/agent-consumable event, in execution order. */
export type SessionExportEvent =
  | {
      type: 'user_message'
      seq: number
      timestamp: string
      content: string
    }
  | {
      type: 'assistant_message'
      seq: number
      timestamp: string
      content: string
      reasoning?: string
      provider?: string
      model?: string
    }
  | {
      type: 'tool_call'
      seq: number
      timestamp: string
      callId: string
      tool: string
      /** Parsed arguments when the raw string was valid JSON, else the raw string. */
      arguments: unknown
    }
  | {
      type: 'tool_result'
      seq: number
      timestamp: string
      callId: string
      /** Tool name resolved from the paired `tool/call`, when one preceded it. */
      tool?: string
      success: boolean
      content: string
      error?: ExportToolError
    }
  | {
      /** Unrecognized log event kept for transparency; never fails the export. */
      type: 'unknown_event'
      seq: number
      timestamp: string
      eventType: string
    };

/** The complete export document. */
export interface SessionExport {
  schemaVersion: typeof SCHEMA_VERSION
  session: SessionExportMetadata
  events: SessionExportEvent[]
}
