// The same contract cases on the original v0.5 production Boa addon (before Phase 3), to show
// which contracts the shared host changed. Pass BOA_ADDON_INDEX=/path/to/v0.5/index.js.
// v0.5 has no epochMs, close() or _dropNodeForTesting(); those cases fail by construction.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { boa } from './runtimes.mjs'
import { cases, SCENE } from './cases.mjs'

const eq = (a, b) => { try { assert.deepStrictEqual(a, b); return true } catch { return false } }
const out = []
for (const c of cases) {
  if (c.diagnostic) continue
  let value, error = null, r
  try { r = boa.create(c.html || SCENE, { epochMs: c.epochMs ?? 0 }); value = c.run(r) } catch (e) { error = String(e.message).split('\n')[0] }
  try { r?.close?.() } catch {}
  const pass = error === null && (c.expect !== undefined ? eq(value, c.expect) : c.check ? c.check(value) : true)
  out.push({ row: c.row, name: c.name, pass, value, error })
  console.log(`${pass ? 'pass' : 'FAIL'} ${c.row.padEnd(22)} ${c.name}${pass ? '' : '\n     ' + JSON.stringify(error ?? value).slice(0, 400)}`)
}
fs.writeFileSync(new URL('../evidence/contract-boa-v0.5-before.json', import.meta.url), JSON.stringify(out, null, 2) + '\n')
console.log(`${out.filter((o) => o.pass).length}/${out.length} pass on the v0.5 Boa addon`)
