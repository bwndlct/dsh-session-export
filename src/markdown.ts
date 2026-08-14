/**
 * Markdown renderer: turns a `SessionExport` into a readable transcript.
 * Pure function — no filesystem, no DSH imports.
 */

import type { SessionExport, SessionExportEvent } from './schema.js'

/** Tool results longer than this are truncated in Markdown output. */
export const MAX_TOOL_RESULT_CHARS = 8000

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}\n… [truncated ${text.length - max} more characters]`
}

/** Build a code fence no content can accidentally close. */
function fenced(content: string, lang: string): string {
  const longestRun = content
    .match(/`+/g)
    ?.reduce((max, run) => Math.max(max, run.length), 2) ?? 2
  const ticks = '`'.repeat(Math.max(3, longestRun + 1))
  return `${ticks}${lang}\n${content}\n${ticks}`
}

function body(text: string, placeholder = '_(empty)_'): string {
  return text.length > 0 ? text : placeholder
}

function renderEvent(event: SessionExportEvent, out: string[]): void {
  switch (event.type) {
    case 'user_message':
      out.push('## User', '', body(event.content), '')
      break
    case 'assistant_message': {
      out.push('## Assistant', '')
      if (event.provider !== undefined || event.model !== undefined) {
        out.push(`_${[event.provider, event.model].filter(Boolean).join(' / ')}_`, '')
      }
      if (event.reasoning !== undefined && event.reasoning.length > 0) {
        out.push(...event.reasoning.split('\n').map((line) => `> ${line}`), '')
      }
      out.push(body(event.content), '')
      break
    }
    case 'tool_call': {
      out.push(`### Tool Call: \`${event.tool}\``, '')
      const args =
        typeof event.arguments === 'string'
          ? fenced(event.arguments, 'text')
          : fenced(JSON.stringify(event.arguments, null, 2), 'json')
      out.push(args, '')
      break
    }
    case 'tool_result': {
      const label = event.tool !== undefined ? ` — \`${event.tool}\`` : ''
      const status = event.success ? 'ok' : 'FAILED'
      out.push(`### Tool Result${label} (${status})`, '')
      if (event.error !== undefined) {
        out.push(`- error: \`${event.error.name}\` (\`${event.error.code}\`)`, '')
      }
      out.push(fenced(truncate(body(event.content, '(no content)'), MAX_TOOL_RESULT_CHARS), 'text'), '')
      break
    }
    case 'unknown_event':
      out.push(`<!-- dsh-session-export: unknown event type "${event.eventType}" at seq ${event.seq} -->`, '')
      break
  }
}

/** Render the complete Markdown document for one export. */
export function renderMarkdown(export_: SessionExport): string {
  const out: string[] = ['# DSH Session Export', '', '## Metadata', '']
  const meta = export_.session
  const rows: Array<[string, string]> = []
  if (meta.id !== undefined) rows.push(['Session ID', meta.id])
  if (meta.createdAt !== undefined) rows.push(['Created', meta.createdAt])
  rows.push(['Exported', meta.exportedAt])
  if (meta.provider !== undefined || meta.model !== undefined) {
    rows.push(['Model', [meta.provider, meta.model].filter(Boolean).join(' / ')])
  }
  if (meta.cwd !== undefined) rows.push(['Working Directory', meta.cwd])
  if (meta.parentSession !== undefined) rows.push(['Parent Session', meta.parentSession])
  if (meta.asOfSeq !== undefined) rows.push(['As Of Seq', String(meta.asOfSeq)])
  if (meta.eventCount !== undefined) rows.push(['Exported Events', String(meta.eventCount)])
  const omitted = meta.omitted
  if (omitted !== undefined) {
    const parts: string[] = []
    if (omitted.contextMessages) parts.push(`${omitted.contextMessages} injected context message(s)`)
    if (omitted.replacedEvents) parts.push(`${omitted.replacedEvents} compaction-replaced event(s)`)
    if (omitted.unknownEvents) parts.push(`${omitted.unknownEvents} unknown event(s)`)
    if (parts.length > 0) rows.push(['Omitted', parts.join(', ')])
  }
  for (const [label, value] of rows) out.push(`- ${label}: ${value}`)
  out.push('', '---', '')
  for (const event of export_.events) renderEvent(event, out)
  return `${out.join('\n')}\n`
}
