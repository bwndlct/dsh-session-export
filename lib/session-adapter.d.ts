/**
 * DSH adapter: projects a live `Session` (event-sourced log) into the
 * plugin's own `SessionExport` schema.
 *
 * Per the dsh-session contract, a human-facing transcript must project
 * append-origin events rather than `session.surface`, because landed
 * replacement events (compaction) shadow history the reader already saw.
 * Tool calls are taken from the authoritative `tool/call` log events (the
 * same call also rides inside the assistant message, which we leave out to
 * avoid duplication). Unknown event types never throw — they surface as
 * `unknown_event` entries.
 */
import type { Session } from '@deepseek-ai/dsh-session';
import type { SessionExport } from './schema.js';
/** Hints the caller can supply when it knows the agent's route. */
export interface AdaptOptions {
    now?: () => Date;
    modelHint?: {
        provider?: string;
        model?: string;
    };
}
/** Project one DSH session into the export schema. Never throws on odd input. */
export declare function adaptSession(session: Session, options?: AdaptOptions): SessionExport;
