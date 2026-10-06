// Run every contract case on Boa and on Deno. Writes evidence/contract.json and prints a
// table. Exit code 1 if any non-diagnostic case fails on either engine or the engines differ.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { runtimes } from './runtimes.mjs'
import { cases, SCENE } from './cases.mjs'

const isDeepEqual = (a, b) => { try { assert.deepStrictEqual(a, b); return true } catch { return false } }
const only = process.argv[2]
const rows = []
let failed = 0
for (const c of cases) {
  if (only && !c.name.includes(only) && c.row !== only) continue
  const results = {}
  for (const rt of runtimes) {
    let value, error = null, renderer
    try {
      renderer = rt.create(c.html || SCENE, { epochMs: c.epochMs ?? 0 })
      value = c.run(renderer)
    } catch (e) {
      error = String(e && e.message || e).split('\n')[0]
    }
    try { renderer?.close() } catch {}
    let pass = null
    if (!c.diagnostic) {
      pass = error === null && (c.expect !== undefined ? isDeepEqual(value, c.expect) : c.check ? c.check(value) : true)
    }
    results[rt.name] = { pass, value, error }
  }
  const same = isDeepEqual(results.boa.value, results.deno.value) && results.boa.error === results.deno.error
  const ok = c.diagnostic || (results.boa.pass && results.deno.pass && same)
  if (!ok) failed++
  rows.push({ row: c.row, name: c.name, diagnostic: !!c.diagnostic, sameAcrossEngines: same, boa: results.boa, deno: results.deno, expect: c.expect ?? null })
  const mark = (r) => (r.pass === null ? 'diag' : r.pass ? 'pass' : 'FAIL')
  console.log(`${ok ? ' ' : '!'} ${c.row.padEnd(22)} boa:${mark(results.boa)} deno:${mark(results.deno)} same:${same ? 'yes' : 'NO '} ${c.name}`)
  if (!ok) {
    for (const [k, r] of Object.entries(results)) console.log(`    ${k}: ${JSON.stringify(r.error ?? r.value)}`)
    if (c.expect !== undefined) console.log(`    expected: ${JSON.stringify(c.expect)}`)
  }
}
if (!only) {
  fs.mkdirSync(new URL('../evidence/', import.meta.url), { recursive: true })
  fs.writeFileSync(new URL('../evidence/contract.json', import.meta.url), JSON.stringify({ node: process.version, cases: rows }, null, 2) + '\n')
}
console.log(`${rows.length - failed}/${rows.length} cases pass on both engines with identical results`)
process.exitCode = failed ? 1 : 0
