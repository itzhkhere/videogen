// Fallible allocation under memory pressure (Linux, run under an address-space limit).
// render(): 4K frames are retained until one cannot be allocated → a JS Error, not an abort;
// after releasing them, render() works again. renderInto(): allocates nothing per frame, so it
// keeps working at the limit with one caller buffer.
// node oom.mjs   (spawns itself under `ulimit -v`; PHASE4A2_AS_LIMIT_KIB, default 3 GiB)
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const self = fileURLToPath(import.meta.url)
const addon = process.env.CANVAS_HTML_NODE ?? path.join(path.dirname(self), '../../canvas-html.linux-x64-gnu.node')

if (process.argv[2] === '--child') {
  const { HtmlRenderer } = createRequire(import.meta.url)(addon)
  const r = new HtmlRenderer({ width: 1280, height: 720, devicePixelRatio: 3, systemFonts: false })
  r.load('<body style="background:#334155"><h1 style="color:#fff">oom</h1>')
  const target = Buffer.alloc(r.frameByteLength)
  const kept = []
  let failure = null
  for (let i = 0; i < 400 && !failure; i++) {
    try { kept.push(r.render()) } catch (e) { failure = { at: i, name: e.constructor.name, message: e.message } }
  }
  let intoAtLimit
  try { r.renderInto(target); intoAtLimit = 'ok' } catch (e) { intoAtLimit = e.message }
  const n = kept.length
  kept.length = 0
  for (let i = 0; i < 10; i++) { globalThis.gc(); await new Promise((res) => setImmediate(res)) }
  let afterRelease
  try { afterRelease = r.render().length === r.frameByteLength ? 'ok' : 'wrong size' } catch (e) { afterRelease = e.message }
  r.close()
  console.log(JSON.stringify({ framesRetainedBeforeFailure: n, failure, renderIntoAtLimit: intoAtLimit, renderAfterRelease: afterRelease }))
  process.exit(0)
}
const kib = Number(process.env.PHASE4A2_AS_LIMIT_KIB ?? 3 * 1024 * 1024)
const c = spawnSync('sh', ['-c', `ulimit -v ${kib}; exec "${process.execPath}" --expose-gc "${self}" --child`], { encoding: 'utf8' })
console.log(`address-space limit ${kib >> 10} MiB; exit ${c.status}${c.signal ? ' signal ' + c.signal : ''}`)
console.log(c.stdout.trim() || c.stderr.slice(-800))
process.exit(c.status === 0 ? 0 : 1)
