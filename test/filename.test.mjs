import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { safeFilePart, uniquePath, writeExport } from '../lib/exporter.js'
import { adaptSession } from '../lib/session-adapter.js'
import { fixtureSession, userMessageEvent } from './markdown.test.mjs'

test('filename: strips characters illegal on any platform', () => {
  const out = safeFilePart('a<b>c:d"e/f\\g|h?i*j\x00k')
  for (const ch of ['<', '>', ':', '"', '/', '\\', '|', '?', '*', '\x00']) {
    assert.ok(!out.includes(ch), `unexpected ${JSON.stringify(ch)} in ${out}`)
  }
})

test('filename: avoids Windows reserved device names', () => {
  assert.ok(!/^con(\.|$)/i.test(safeFilePart('CON')))
  assert.ok(!/^aux(\.|$)/i.test(safeFilePart('aux.txt')))
  assert.ok(!/^com3(\.|$)/i.test(safeFilePart('COM3')))
})

test('filename: trims trailing dots and spaces, survives empty input', () => {
  assert.ok(!safeFilePart('name.').endsWith('.'))
  assert.ok(!safeFilePart('name ').endsWith(' '))
  assert.ok(safeFilePart('').length > 0)
})

test('filename: collision never overwrites an existing file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-export-test-'))
  try {
    const first = join(dir, 'session-x.md')
    writeFileSync(first, 'original')
    const next = uniquePath(dir, 'session-x', '.md')
    assert.notEqual(next, first)
    assert.ok(next.endsWith('session-x-1.md'))
    writeFileSync(next, 'second')
    const third = uniquePath(dir, 'session-x', '.md')
    assert.ok(third.endsWith('session-x-2.md'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('export: writes markdown and json, defaults to all, rerun does not overwrite', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-export-run-'))
  try {
    const clock = () => new Date(Date.UTC(2026, 0, 15, 12, 0, 0))
    const doc = adaptSession(fixtureSession([userMessageEvent(1, 'hello')]))
    const files1 = (await writeExport(doc, { dir, format: 'all', now: clock })).files
    assert.equal(files1.length, 2)
    assert.ok(files1[0].endsWith('.md'))
    assert.ok(files1[1].endsWith('.json'))
    assert.ok(existsSync(files1[0]))
    assert.ok(existsSync(files1[1]))
    // DSH ids already start with "session-": no doubled prefix in the name.
    assert.ok(!files1[0].includes('session-session-'), 'must not double the session- prefix')

    const files2 = (await writeExport(doc, { dir, format: 'all', now: clock })).files
    for (const f of files2) assert.ok(!files1.includes(f), 'rerun must pick fresh names')

    const mdOnly = (await writeExport(doc, { dir, format: 'markdown', now: clock })).files
    assert.equal(mdOnly.length, 1)
    assert.ok(mdOnly[0].endsWith('.md'))

    assert.equal(readdirSync(dir).length, 5)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
