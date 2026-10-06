// Smallest GPU check: one page on CPU and on each requested GPU backend, pixel diff.
import { HtmlRenderer } from './lib/native.mjs'
const backends = process.argv.slice(2).length ? process.argv.slice(2) : ['gpu-gl']
const html = `<!doctype html><style>body{margin:0;background:#101828}
#b{position:absolute;left:40px;top:30px;width:200px;height:120px;border-radius:24px;background:linear-gradient(90deg,#f97316,#3b82f6);box-shadow:0 10px 30px rgba(0,0,0,.6)}
#t{position:absolute;left:30px;top:190px;font:700 36px sans-serif;color:white}</style>
<div id=b></div><div id=t>Hello GPU Skia</div>`
const render = (backend) => {
  const r = new HtmlRenderer({ width: 400, height: 300, experimentalBackend: backend })
  r.load(html)
  const out = r._renderTimed({ format: 'rgba' })
  const info = r._backendInfo()
  r.close()
  return { out, info }
}
const cpu = render('cpu')
for (const b of backends) {
  const g = render(b)
  let diff = 0, max = 0
  for (let i = 0; i < cpu.out.pixels.length; i++) { const d = Math.abs(cpu.out.pixels[i] - g.out.pixels[i]); if (d) { diff++; max = Math.max(max, d) } }
  console.log(b, JSON.stringify(g.info), '\n  backend=', g.out.backend, 'differing channels', diff, 'of', cpu.out.pixels.length, 'max delta', max)
  console.log('  timings ms', Object.fromEntries(Object.entries(g.out.timingsNs).map(([k, v]) => [k, +(v / 1e6).toFixed(3)])))
}
