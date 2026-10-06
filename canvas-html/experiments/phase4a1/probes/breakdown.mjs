import { HtmlRenderer } from '../lib/native.mjs'
const mode = process.argv[2]
const r = new HtmlRenderer({ width: 1280, height: 720, devicePixelRatio: 3, systemFonts: false }); r.load('<body style="background:#334">')
const t = Buffer.alloc(r.pixelWidth * r.pixelHeight * 4), acc = {}
for (let i = 0; i < 45; i++) {
  const t0 = performance.now()
  const o = mode === 'into' ? r._renderInto(t) : r._renderTimed({ output: mode, poolSize: 3 })
  const wall = performance.now() - t0
  if (i >= 5) for (const [k, v] of Object.entries({ ...o.timingsNs, wall: wall * 1e6 })) (acc[k] ??= []).push(v / 1e6)
  await new Promise((res) => setImmediate(res))
}
const med = (xs) => xs.sort((a, b) => a - b)[xs.length >> 1].toFixed(2)
console.log(mode.padEnd(9), Object.entries(acc).filter(([k]) => ['alloc', 'paint', 'copy', 'buffer', 'total', 'wall'].includes(k)).map(([k, v]) => `${k} ${med(v)}`).join(' | '))
