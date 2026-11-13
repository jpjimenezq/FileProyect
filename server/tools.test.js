import test from 'node:test'
import assert from 'node:assert/strict'
import { compressArgs, protectArgs, sniff, TOOLS } from './tools.js'

test('sniff reconoce PDF y rechaza otros contenidos', () => {
  assert.equal(sniff(Buffer.from('%PDF-1.7\n...'), 'pdf'), true)
  assert.equal(sniff(Buffer.from('<html>'), ['pdf']), false)
})

test('sniff reconoce OOXML (zip) y OLE legacy', () => {
  assert.equal(sniff(Buffer.from([0x50, 0x4b, 3, 4, 0]), ['office']), true)
  assert.equal(sniff(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0]), ['office']), true)
  assert.equal(sniff(Buffer.from('hola'), ['office']), false)
})

test('sniff acepta RTF y texto plano donde corresponde', () => {
  assert.equal(sniff(Buffer.from(String.raw`{\rtf1\ansi hola}`), ['office', 'rtf']), true)
  assert.equal(sniff(Buffer.from('a,b;1,2'), ['office', 'text']), true)
  assert.equal(sniff(Buffer.from([0, 1, 2, 3]), ['text']), false)
})

test('compressArgs elige el preset según el nivel', () => {
  assert.ok(compressArgs('i.pdf', 'o.pdf', 'extreme').includes('-dPDFSETTINGS=/screen'))
  assert.ok(compressArgs('i.pdf', 'o.pdf', 'low').includes('-dPDFSETTINGS=/printer'))
  assert.ok(compressArgs('i.pdf', 'o.pdf', 'otro').includes('-dPDFSETTINGS=/ebook'))
})

test('protectArgs restringe impresión y copia solo si se pide', () => {
  const open = protectArgs('i.pdf', 'o.pdf', { password: 'abc' })
  assert.deepEqual(open.slice(0, 4), ['--encrypt', 'abc', 'abc', '256'])
  assert.ok(!open.includes('--print=none'))
  const locked = protectArgs('i.pdf', 'o.pdf', { password: 'abc', allowPrint: false, allowCopy: false })
  assert.ok(locked.includes('--print=none') && locked.includes('--extract=n'))
  assert.notEqual(locked[2], 'abc') // contraseña de propietario distinta
})

test('toda herramienta declara binario, entradas y extensión de salida', () => {
  for (const [id, t] of Object.entries(TOOLS)) {
    assert.ok(['qpdf', 'gs', 'soffice'].includes(t.bin), id)
    assert.ok(t.inputs[0].exts.length > 0, id)
    assert.ok(t.ext && t.mime, id)
  }
})
