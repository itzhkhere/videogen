// AlphaType experiment (Phase 4A.3): the production surfaces are RGBA8888 + AlphaType::Opaque.
// Does Premul change any byte? Renders the same pages with an Opaque build and a Premul build of
// the addon (identical except the surface AlphaType, CPU raster and Ganesh) and compares frames.
// Cases: opaque scene, transparent background, translucent background, semi-transparent fills,
// text, an image (with alpha), blur / box-shadow / CSS filter, opacity groups, gradients.
// node alphatype.mjs <opaque.node> <premul.node> <cpu|gpu-gl|gpu-vulkan>
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const self = fileURLToPath(import.meta.url)
const here = path.dirname(self)

// a 2×2 PNG with alpha (red opaque, green 50 %, blue 25 %, transparent), as a data URL
const IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGP4z8DwnwEIGBgYGBkYGQAZ7AL+5EzZ3QAAAABJRU5ErkJggg=='
const BODY = `<body style="margin:0;font:16px sans-serif">
<div style="position:absolute;left:4px;top:4px;width:60px;height:30px;background:rgba(255,0,0,0.5)"></div>
<div style="position:absolute;left:30px;top:20px;width:60px;height:30px;background:rgba(0,128,255,0.6);border-radius:8px"></div>
<div style="position:absolute;left:100px;top:6px;color:rgba(20,20,20,0.7);font-size:22px">Text Ag</div>
<div style="position:absolute;left:8px;top:60px;width:50px;height:30px;background:#14b8a6;box-shadow:0 4px 12px rgba(0,0,0,0.6)"></div>
<div style="position:absolute;left:80px;top:60px;width:50px;height:30px;background:#f59e0b;filter:blur(3px)"></div>
<div style="position:absolute;left:150px;top:60px;width:50px;height:30px;background:#8b5cf6;opacity:0.4"></div>
<div style="position:absolute;left:150px;top:10px;width:60px;height:30px;background:linear-gradient(90deg,rgba(255,0,0,0),rgba(0,0,255,0.8))"></div>
<img src="${IMG}" style="position:absolute;left:220px;top:10px;width:40px;height:40px;image-rendering:pixelated">
<div style="position:absolute;left:220px;top:60px;width:40px;height:30px;background:#000;filter:drop-shadow(2px 2px 2px rgba(255,0,0,.8)) brightness(1.5)"></div>`
const CASES = [
  ['opaque scene', '#ffffff'],
  ['transparent background', '#00000000'],
  ['translucent background', '#00ff0080'],
  ['dark opaque background', '#101828'],
]

if (process.argv[2] === '--child') {
  const [, , , addon, backend] = process.argv
  const { HtmlRenderer } = createRequire(import.meta.url)(addon)
  const out = {}
  for (const [name, background] of CASES) for (const dpr of [1, 2]) {
    const r = new HtmlRenderer({ width: 280, height: 100, devicePixelRatio: dpr, background, systemFonts: false, ...(backend === 'cpu' ? {} : { experimentalBackend: backend }) })
    r.load(BODY)
    const f = r.render()
    let minA = 255
    for (let i = 3; i < f.length; i += 4) if (f[i] < minA) minA = f[i]
    let premulOk = true
    for (let i = 0; i < f.length; i += 4) if (f[i] > f[i + 3] || f[i + 1] > f[i + 3] || f[i + 2] > f[i + 3]) { premulOk = false; break }
    out[`${name}@${dpr}x`] = { hash: createHash('sha256').update(f).digest('hex').slice(0, 16), minAlpha: minA, colourNeverAboveAlpha: premulOk, bytes: f.toString('base64') }
    r.close()
  }
  fs.writeSync(1, JSON.stringify(out) + '\n') // synchronous: the output is large and process.exit would cut a piped write
  process.exit(0)
}

const [opaque, premul, backend = 'cpu'] = process.argv.slice(2)
const run = (addon) => {
  const c = spawnSync(process.execPath, [self, '--child', path.resolve(addon), backend], { encoding: 'utf8', maxBuffer: 1 << 28 })
  if (c.status !== 0) { console.error(c.stderr.slice(-1500)); process.exit(2) }
  return JSON.parse(c.stdout.trim().split('\n').pop())
}
const a = run(opaque), b = run(premul)
const rows = []
for (const k of Object.keys(a)) {
  const fa = Buffer.from(a[k].bytes, 'base64'), fb = Buffer.from(b[k].bytes, 'base64')
  let diff = 0, maxDelta = 0
  for (let i = 0; i < fa.length; i++) { const d = Math.abs(fa[i] - fb[i]); if (d) { diff++; if (d > maxDelta) maxDelta = d } }
  rows.push({ case: k, identical: diff === 0, differingBytes: diff, maxDelta, minAlpha: a[k].minAlpha, opaqueBuildPremultiplied: a[k].colourNeverAboveAlpha, premulBuildPremultiplied: b[k].colourNeverAboveAlpha, hashOpaque: a[k].hash, hashPremul: b[k].hash })
}
for (const r of rows) console.log(`${backend.padEnd(10)} ${r.case.padEnd(28)} ${r.identical ? 'identical' : `DIFFER ${r.differingBytes} bytes, max Δ ${r.maxDelta}`}  min alpha ${r.minAlpha}  colour ≤ alpha: opaque build ${r.opaqueBuildPremultiplied}, premul build ${r.premulBuildPremultiplied}`)
fs.mkdirSync(path.join(here, 'evidence'), { recursive: true })
fs.writeFileSync(path.join(here, 'evidence', `alphatype-${backend}${process.env.TAG ? '-' + process.env.TAG : ''}.json`), JSON.stringify(rows, null, 1) + '\n')
