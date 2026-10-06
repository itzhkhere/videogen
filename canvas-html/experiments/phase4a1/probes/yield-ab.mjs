import { HtmlRenderer } from '../lib/native.mjs'
const [mode, yieldEvery] = [process.argv[2], +process.argv[3]]
const r = new HtmlRenderer({ width: 1280, height: 720, devicePixelRatio: +(process.env.DPR ?? 3), systemFonts: false }); r.load('<body style="background:#334">')
const xs = []
for (let i = 0; i < 45; i++) {
  const t0 = performance.now()
  const b = mode === 'render' ? r.render() : r._renderTimed({ output: 'pool', poolSize: 3 }).pixels
  if (i >= 5) xs.push(performance.now() - t0)
  if (yieldEvery && i % yieldEvery === 0) await new Promise((res) => setImmediate(res))
}
xs.sort((a, b) => a - b)
console.log(mode, 'yield', yieldEvery, process.env.GLIBC_TUNABLES ? 'tuned' : 'default', 'median', xs[xs.length >> 1].toFixed(2), 'p95', xs[Math.floor(xs.length * 0.95)].toFixed(2), 'rss', (process.memoryUsage().rss / 2 ** 20) | 0, r._poolStats?.() ? JSON.stringify(r._poolStats()) : "")
