// A/B of napi-rs `catch_unwind` on render()/renderInto(): per-call time on tiny and 720p frames,
// and that the ordinary error path keeps its class and code. node catch-unwind-bench.mjs <addon.node> <w> <h> <calls>
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { HtmlRenderer } = require(process.argv[2])
const [w, h, n] = [+process.argv[3], +process.argv[4], +process.argv[5]]
const r = new HtmlRenderer({ width: w, height: h, systemFonts: false })
r.load('<body style="margin:0;background:#123"><div style="width:10px;height:10px;background:#f00"></div>')
const buf = Buffer.alloc(r.frameByteLength)
const med = (a) => a.sort((x, y) => x - y)[a.length >> 1]
const into = [], rend = []
for (let rep = 0; rep < 7; rep++) {
  let t = performance.now(); for (let i = 0; i < n; i++) r.renderInto(buf); into.push((performance.now() - t) * 1000 / n)
  t = performance.now(); for (let i = 0; i < n; i++) r.render(); rend.push((performance.now() - t) * 1000 / n)
  await new Promise((res) => setImmediate(res))
}
let bad = null; try { r.renderInto(Buffer.alloc(3)) } catch (e) { bad = `${e.constructor.name} ${e.code}` }
console.log(JSON.stringify({ addon: process.argv[2].split('/').pop(), size: `${w}x${h}`, renderIntoUs: +med(into).toFixed(2), renderUs: +med(rend).toFixed(2), errorPath: bad }))
