// One output path per process: median / p95 ms per render and final RSS, tight loop (yield 0)
// or with an event-loop turn after each frame (yield 1).
//   node probes/matrix.mjs <mode> <dpr> <yield>
// mode: render | into | any _renderTimed output (clone, clone-accounted, transfer, transfer-plain, pool)
import { HtmlRenderer } from '../lib/native.mjs'
const [mode, dpr, y] = [process.argv[2], +process.argv[3], +process.argv[4]]
const r = new HtmlRenderer({ width: 1280, height: 720, devicePixelRatio: dpr, systemFonts: false })
r.load('<body style="background:#334"><p style="color:#fff;font:40px sans-serif">frame</p>')
const t = Buffer.alloc(r.pixelWidth * r.pixelHeight * 4), xs = []
let peak = 0
for (let i = 0; i < 65; i++) {
  const t0 = performance.now()
  const b = mode === 'render' ? r.render() : mode === 'into' ? (r._renderInto(t), t) : r._renderTimed({ output: mode, poolSize: 3 }).pixels
  if (b[0] === undefined) throw new Error('no pixels')
  if (i >= 5) xs.push(performance.now() - t0)
  peak = Math.max(peak, process.memoryUsage().rss)
  if (y) await new Promise((res) => setImmediate(res))
}
xs.sort((a, b) => a - b)
console.log(JSON.stringify({ mode, dpr, yield: y, median: +xs[xs.length >> 1].toFixed(2), p95: +xs[Math.floor(xs.length * 0.95)].toFixed(2), peakRssMiB: (peak / 2 ** 20) | 0 }))
