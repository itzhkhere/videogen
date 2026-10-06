import { HtmlRenderer } from '../lib/native.mjs'
const [mode, dpr] = [process.argv[2], +(process.argv[3] ?? 3)]
const r = new HtmlRenderer({ width: 1280, height: 720, devicePixelRatio: dpr, systemFonts: false }); r.load('<body style="background:#334"><p style="color:#fff">x</p>')
const t = Buffer.alloc(r.pixelWidth * r.pixelHeight * 4), xs = []
let keep
for (let i = 0; i < 40; i++) {
  const t0 = performance.now()
  keep = mode === 'render' ? r.render() : mode === 'into' ? (r._renderInto(t), t) : r._renderTimed({ output: mode, poolSize: 3 }).pixels
  if (i >= 5) xs.push(performance.now() - t0)
}
xs.sort((a, b) => a - b)
console.log(mode.padEnd(14), 'median', xs[xs.length >> 1].toFixed(2), 'p95', xs[Math.floor(xs.length * 0.95)].toFixed(2), 'rss', (process.memoryUsage().rss / 2 ** 20) | 0)
