import { test } from 'node:test'
import assert from 'node:assert/strict'
import { adaptSession } from '../lib/session-adapter.js'
import { renderJson } from '../lib/json.js'
import {
  fixtureSession,
  userMessageEvent,
  assistantMessageEvent,
  toolCallEvent,
  toolResultEvent,
} from './markdown.test.mjs'

test('json: output parses and carries the schema version', () => {
  const doc = adaptSession(fixtureSession([
    userMessageEvent(1, 'hi'),
    assistantMessageEvent(2, 'hello'),
  ]))
  const parsed = JSON.parse(renderJson(doc))
  assert.equal(parsed.schemaVersion, '1.0')
  assert.equal(Array.isArray(parsed.events), true)
  assert.equal(parsed.session.id, 'sess-abc')
})

test('json: preserves execution order across event kinds', () => {
  const doc = adaptSession(fixtureSession([
    userMessageEvent(1, 'read the file'),
    assistantMessageEvent(2, 'ok'),
    toolCallEvent(3, 'c1', 'read_file', '{"path":"a.ts"}'),
    toolResultEvent(4, 'c1', 'contents'),
    assistantMessageEvent(5, 'done'),
  ]))
  const parsed = JSON.parse(renderJson(doc))
  assert.deepEqual(parsed.events.map((e) => e.type), [
    'user_message',
    'assistant_message',
    'tool_call',
    'tool_result',
    'assistant_message',
  ])
  const call = parsed.events[2]
  assert.equal(call.tool, 'read_file')
  assert.deepEqual(call.arguments, { path: 'a.ts' })
  const result = parsed.events[3]
  assert.equal(result.tool, 'read_file')
  assert.equal(result.success, true)
})

test('json: special characters in arguments survive the round trip', () => {
  const args = JSON.stringify({ q: 'a"b\\c\nd\te <script> ünïcode ✓' })
  const doc = adaptSession(fixtureSession([toolCallEvent(1, 'c1', 'web_search', args)]))
  const parsed = JSON.parse(renderJson(doc))
  assert.deepEqual(parsed.events[0].arguments, { q: 'a"b\\c\nd\te <script> ünïcode ✓' })
})

test('json: invalid tool-call argument JSON is kept as the raw string', () => {
  const doc = adaptSession(fixtureSession([toolCallEvent(1, 'c1', 'bash', '{not json')]))
  const parsed = JSON.parse(renderJson(doc))
  assert.equal(parsed.events[0].arguments, '{not json')
})

test('json: missing metadata does not crash', () => {
  const doc = adaptSession(fixtureSession([userMessageEvent(1, 'hi')], {
    id: undefined,
    createdAt: undefined,
    cwd: undefined,
  }))
  const parsed = JSON.parse(renderJson(doc))
  assert.equal(parsed.session.id, undefined)
  assert.equal(parsed.session.createdAt, undefined)
  assert.equal(parsed.session.cwd, undefined)
  assert.ok(parsed.session.exportedAt)
  assert.equal(parsed.session.eventCount, 1)
})

test('json: unknown event types become unknown_event, never throw', () => {
  const doc = adaptSession(fixtureSession([
    userMessageEvent(1, 'hi'),
    { type: 'future/thing', seq: 2, time: Date.now(), data: { stuff: true }, ignorable: true },
  ]))
  const parsed = JSON.parse(renderJson(doc))
  const unknown = parsed.events.find((e) => e.type === 'unknown_event')
  assert.ok(unknown)
  assert.equal(unknown.eventType, 'future/thing')
  assert.equal(parsed.session.omitted.unknownEvents, 1)
})

test('json: log-only boundary events are skipped, injected context is omitted by default', () => {
  const injected = {
    type: 'user/message',
    seq: 1,
    time: Date.now(),
    data: {
      id: 'm1',
      role: 'user',
      content: [{ type: 'text', text: 'AGENTS.md instructions' }],
      source: { kind: 'plugin', plugin: 'dsh-agent-instructions' },
    },
    surfaceOp: 'append',
  }
  const doc = adaptSession(fixtureSession([
    injected,
    { type: 'turn/start', seq: 2, time: Date.now(), data: { turn: 1 } },
    { type: 'permission/preset', seq: 3, time: Date.now(), data: {}, ignorable: true },
    { type: 'session/title', seq: 4, time: Date.now(), data: { title: 't' }, ignorable: true },
    userMessageEvent(5, 'real prompt'),
  ]))
  const parsed = JSON.parse(renderJson(doc))
  assert.equal(parsed.events.length, 1)
  assert.equal(parsed.events[0].content, 'real prompt')
  assert.equal(parsed.session.omitted.contextMessages, 1)
  assert.equal(parsed.session.omitted.unknownEvents, undefined)
})

test('json: compaction replacement events are skipped', () => {
  const replaced = userMessageEvent(1, 'original', {
    surfaceOp: { op: 'replace', start: 0, end: 0 },
  })
  const doc = adaptSession(fixtureSession([replaced, userMessageEvent(2, 'after')]))
  const parsed = JSON.parse(renderJson(doc))
  assert.equal(parsed.events.length, 1)
  assert.equal(parsed.session.omitted.replacedEvents, 1)
})
