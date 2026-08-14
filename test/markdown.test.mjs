import { test } from 'node:test'
import assert from 'node:assert/strict'
import { adaptSession } from '../lib/session-adapter.js'
import { renderMarkdown } from '../lib/markdown.js'

const T0 = Date.UTC(2026, 0, 15, 10, 0, 0)

/** Build a minimal duck-typed DSH session fixture. */
export function fixtureSession(events, header = {}) {
  return {
    header: { version: 1, id: 'sess-abc', createdAt: T0, cwd: '/tmp/demo', ...header },
    events,
  }
}

export function userMessageEvent(seq, text, extra = {}) {
  return {
    type: 'user/message',
    seq,
    time: T0 + seq * 1000,
    data: {
      id: `m${seq}`,
      role: 'user',
      content: [{ type: 'text', text }],
      source: { kind: 'user' },
    },
    surfaceOp: 'append',
    ...extra,
  }
}

export function assistantMessageEvent(seq, text, extraData = {}, extra = {}) {
  return {
    type: 'assistant/message',
    seq,
    time: T0 + seq * 1000,
    data: {
      turn: 1,
      step: 1,
      message: {
        id: `m${seq}`,
        role: 'assistant',
        content: [{ type: 'text', text }],
        source: { kind: 'model', provider: 'prov', model: 'model-x', ...extraData },
      },
    },
    surfaceOp: 'append',
    ...extra,
  }
}

export function toolCallEvent(seq, callId, name, args) {
  return {
    type: 'tool/call',
    seq,
    time: T0 + seq * 1000,
    data: { turn: 1, step: 1, callId, name, arguments: args },
  }
}

export function toolResultEvent(seq, callId, text, { isError = false, error } = {}) {
  return {
    type: 'tool/result',
    seq,
    time: T0 + seq * 1000,
    data: {
      turn: 1,
      step: 1,
      message: {
        id: `m${seq}`,
        role: 'user',
        content: [{
          type: 'tool-result',
          toolCallId: callId,
          content: [{ type: 'text', text }],
          isError,
        }],
        source: { kind: 'tool', callId },
      },
      ...(error ? { error } : {}),
    },
    surfaceOp: 'append',
  }
}

test('markdown: renders user and assistant messages', () => {
  const doc = adaptSession(fixtureSession([
    userMessageEvent(1, '修复 payment API。'),
    assistantMessageEvent(2, '我先检查相关代码。'),
  ]))
  const md = renderMarkdown(doc)
  assert.match(md, /## User/)
  assert.match(md, /修复 payment API。/)
  assert.match(md, /## Assistant/)
  assert.match(md, /我先检查相关代码。/)
  assert.match(md, /prov \/ model-x/)
})

test('markdown: renders tool call with json arguments and its result', () => {
  const doc = adaptSession(fixtureSession([
    userMessageEvent(1, 'read the file'),
    assistantMessageEvent(2, 'ok'),
    toolCallEvent(3, 'c1', 'read_file', '{"path":"src/payment.ts"}'),
    toolResultEvent(4, 'c1', 'export const x = 1'),
  ]))
  const md = renderMarkdown(doc)
  assert.match(md, /### Tool Call: `read_file`/)
  assert.match(md, /"path": "src\/payment\.ts"/)
  assert.match(md, /### Tool Result — `read_file` \(ok\)/)
  assert.match(md, /export const x = 1/)
})

test('markdown: failed tool result is marked FAILED with error identity', () => {
  const doc = adaptSession(fixtureSession([
    toolCallEvent(1, 'c1', 'bash', '{"command":"exit 1"}'),
    toolResultEvent(2, 'c1', 'command failed', {
      isError: true,
      error: { name: 'HarnessError', code: 'NONZERO_EXIT' },
    }),
  ]))
  const md = renderMarkdown(doc)
  assert.match(md, /### Tool Result — `bash` \(FAILED\)/)
  assert.match(md, /`HarnessError` \(`NONZERO_EXIT`\)/)
})

test('markdown: tool result containing code fences cannot escape the fence', () => {
  const hostile = 'before\n```\ninner fence\n```\nafter'
  const doc = adaptSession(fixtureSession([
    toolCallEvent(1, 'c1', 'read_file', '{}'),
    toolResultEvent(2, 'c1', hostile),
  ]))
  const md = renderMarkdown(doc)
  // The wrapping fence must be strictly longer than any inner backtick run.
  const fenceMatch = md.match(/(`+)text\nbefore\n```\ninner fence\n```\nafter\n\1/)
  assert.ok(fenceMatch, 'wrapping fence must enclose inner ``` run')
  assert.ok(fenceMatch[1].length >= 4)
})

test('markdown: truncates very long tool results', () => {
  const doc = adaptSession(fixtureSession([
    toolCallEvent(1, 'c1', 'read_file', '{}'),
    toolResultEvent(2, 'c1', 'x'.repeat(20_000)),
  ]))
  const md = renderMarkdown(doc)
  assert.match(md, /… \[truncated \d+ more characters\]/)
  assert.ok(md.length < 12_000)
})

test('markdown: empty session still renders metadata', () => {
  const doc = adaptSession(fixtureSession([]))
  const md = renderMarkdown(doc)
  assert.match(md, /# DSH Session Export/)
  assert.match(md, /- Session ID: sess-abc/)
  assert.match(md, /- Exported: /)
})
