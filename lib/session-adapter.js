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
/** Log-only event types this adapter knows and intentionally skips.
 *  Beyond the core vocabulary, these are merge-registered log-only events
 *  from official dsh packages (observed in real sessions). */
const SKIPPED_LOG_TYPES = new Set([
    // core session vocabulary
    'turn/start',
    'turn/end',
    'step/start',
    'step/end',
    'assistant/chunk',
    'todo/write',
    'request/header',
    'request/context',
    'session/end-seed',
    // merge-registered log-only events from official packages
    'agent/inbox/spliced',
    'permission/preset',
    'sandbox/mode',
    'approval/policy',
    'session/title',
    'session/title-llm-request',
    'llm/retry',
    'llm/retry-started',
    'command/run',
    'command/done',
]);
function iso(ms) {
    return typeof ms === 'number' && Number.isFinite(ms)
        ? new Date(ms).toISOString()
        : '';
}
/** Best-effort textual projection of arbitrary content blocks. */
function extractText(blocks) {
    if (!blocks || blocks.length === 0)
        return '';
    const parts = [];
    for (const block of blocks) {
        switch (block.type) {
            case 'text':
            case 'reasoning':
                parts.push(block.text);
                break;
            case 'image':
                parts.push('[image attachment omitted]');
                break;
            case 'tool-call':
                parts.push(`[tool call: ${block.name}]`);
                break;
            case 'tool-result':
                parts.push(extractText(block.content));
                break;
            default:
                parts.push(`[unsupported block type: ${String(block.type)}]`);
        }
    }
    return parts.join('\n');
}
/** Parse model-produced tool arguments; keep the raw string when invalid. */
function parseArguments(raw) {
    try {
        return JSON.parse(raw);
    }
    catch {
        return raw;
    }
}
/** True when a surface event is a replacement (compaction) node to skip. */
function isReplacement(surfaceOp) {
    return typeof surfaceOp === 'object' && surfaceOp !== null;
}
/** Project one DSH session into the export schema. Never throws on odd input. */
export function adaptSession(session, options = {}) {
    const now = options.now ?? (() => new Date());
    const header = (session?.header ?? {});
    const events = Array.isArray(session?.events) ? session.events : [];
    const callTools = new Map();
    const counts = { contextMessages: 0, replacedEvents: 0, unknownEvents: 0 };
    const out = [];
    let lastModel;
    for (const event of events) {
        const seq = typeof event.seq === 'number' ? event.seq : -1;
        const timestamp = iso(event.time);
        const surfaceOp = event.surfaceOp;
        switch (event.type) {
            case 'user/message': {
                if (isReplacement(surfaceOp)) {
                    counts.replacedEvents++;
                    break;
                }
                const message = event.data;
                if (message?.source?.kind === 'user') {
                    out.push({
                        type: 'user_message',
                        seq,
                        timestamp,
                        content: extractText(message.content),
                    });
                }
                else {
                    // Plugin/model-injected context (instructions, skills, notices, …).
                    counts.contextMessages++;
                }
                break;
            }
            case 'assistant/message': {
                if (isReplacement(surfaceOp)) {
                    counts.replacedEvents++;
                    break;
                }
                const message = event.data?.message;
                const provider = message?.source?.provider;
                const model = message?.source?.model;
                if (provider || model)
                    lastModel = { provider, model };
                const text = [];
                const reasoning = [];
                for (const block of message?.content ?? []) {
                    if (block.type === 'text')
                        text.push(block.text);
                    else if (block.type === 'reasoning')
                        reasoning.push(block.text);
                    // `tool-call` blocks are exported via their own `tool/call` events.
                }
                out.push({
                    type: 'assistant_message',
                    seq,
                    timestamp,
                    content: text.join('\n'),
                    ...(reasoning.length > 0 ? { reasoning: reasoning.join('\n') } : {}),
                    ...(provider !== undefined ? { provider } : {}),
                    ...(model !== undefined ? { model } : {}),
                });
                break;
            }
            case 'tool/call': {
                const data = event.data;
                const callId = String(data?.callId ?? '');
                const tool = String(data?.name ?? 'unknown-tool');
                callTools.set(callId, tool);
                out.push({
                    type: 'tool_call',
                    seq,
                    timestamp,
                    callId,
                    tool,
                    arguments: parseArguments(String(data?.arguments ?? '')),
                });
                break;
            }
            case 'tool/result': {
                if (isReplacement(surfaceOp)) {
                    counts.replacedEvents++;
                    break;
                }
                const data = event.data;
                const block = data?.message?.content?.[0];
                const error = data?.error;
                const isError = Boolean(block?.isError) || Boolean(error);
                const callId = String(block?.toolCallId ?? data?.message?.source?.callId ?? '');
                const tool = callTools.get(callId);
                out.push({
                    type: 'tool_result',
                    seq,
                    timestamp,
                    callId,
                    ...(tool !== undefined ? { tool } : {}),
                    success: !isError,
                    content: extractText(block?.content),
                    ...(error ? { error: { name: String(error.name), code: String(error.code) } } : {}),
                });
                break;
            }
            default: {
                if (typeof event.type === 'string' && SKIPPED_LOG_TYPES.has(event.type))
                    break;
                counts.unknownEvents++;
                out.push({
                    type: 'unknown_event',
                    seq,
                    timestamp,
                    eventType: String(event.type),
                });
            }
        }
    }
    const route = options.modelHint?.provider || options.modelHint?.model
        ? options.modelHint
        : lastModel;
    const asOfSeq = events.length > 0
        ? Number(events[events.length - 1].seq ?? -1)
        : -1;
    const metadata = {
        ...(header.id !== undefined && header.id !== null ? { id: String(header.id) } : {}),
        ...(typeof header.createdAt === 'number' && Number.isFinite(header.createdAt)
            ? { createdAt: new Date(header.createdAt).toISOString() }
            : {}),
        exportedAt: now().toISOString(),
        ...(route?.model ? { model: String(route.model) } : {}),
        ...(route?.provider ? { provider: String(route.provider) } : {}),
        ...(typeof header.cwd === 'string' && header.cwd ? { cwd: header.cwd } : {}),
        ...(header.parentSession !== undefined && header.parentSession !== null
            ? { parentSession: String(header.parentSession) }
            : {}),
        ...(asOfSeq >= 0 ? { asOfSeq } : {}),
        eventCount: out.length,
        omitted: {
            ...(counts.contextMessages > 0 ? { contextMessages: counts.contextMessages } : {}),
            ...(counts.replacedEvents > 0 ? { replacedEvents: counts.replacedEvents } : {}),
            ...(counts.unknownEvents > 0 ? { unknownEvents: counts.unknownEvents } : {}),
        },
    };
    return { schemaVersion: '1.0', session: metadata, events: out };
}
