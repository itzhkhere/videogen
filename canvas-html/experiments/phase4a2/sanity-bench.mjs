// Performance sanity check (not a study): did productization keep the Phase 4A.1 gains?
// Scene A (output-dominated) and scene E (paint-heavy), 1080p and 4K, per backend:
//   4A.1 render()       Phase 4A.1 build, render()
//   4A.1 _renderInto    Phase 4A.1 build, the experimental _renderInto
//   4A.2 render()       this build, render()
//   4A.2 renderInto     this build, the public renderInto
// One process per row; 3 warm-up frames, then 15 (1080p) / 10 (4K) frames, tight loop; median
// and p95 wall ms around the call, peak RSS.
// PHASE4A2_BACKENDS=cpu,gpu-gl,gpu-vulkan node sanity-bench.mjs [tag]  → evidence/sanity-bench[-tag].json
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { SCENES, prepareAssets, baseUrl } from '../phase4a/lib/scenes.mjs'
const here = path.dirname(fileURLToPath(import.meta.url))
const RES = { '1080p': [1.5, 15], '4K': [3, 10] }
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))] }

if (process.argv[2] === '--child') {
  const [, , , addon, backend, sceneId, res, api] = process.argv
  const { HtmlRenderer } = createRequire(import.meta.url)(addon)
  const [dpr, n] = RES[res]
  const r = new HtmlRenderer({ width: 1280, height: 720, devicePixelRatio: dpr, systemFonts: false, ...(backend === 'cpu' ? {} : { experimentalBackend: backend }) })
  r.load(SCENES.find((s) => s.id === sceneId).html(), baseUrl)
  const target = Buffer.alloc(r.pixelWidth * r.pixelHeight * 4)
  const one = api === 'render' ? () => r.render() : api === '_renderInto' ? () => r._renderInto(target) : () => r.renderInto(target)
  for (let i = 0; i < 3; i++) one()
  const ms = []
  let peak = 0
  for (let i = 0; i < n; i++) { const t = performance.now(); one(); ms.push(performance.now() - t); peak = Math.max(peak, process.memoryUsage().rss) }
  r.close()
  console.log(JSON.stringify({ medianMs: +q(ms, 0.5).toFixed(2), p95Ms: +q(ms, 0.95).toFixed(2), peakRssMiB: Math.round(peak / 1048576) }))
  process.exit(0)
}

prepareAssets()
const backends = (process.env.PHASE4A2_BACKENDS ?? 'cpu').split(',')
const newAddon = (b) => process.env.CANVAS_HTML_NODE ?? (b === 'cpu' ? path.join(here, '../../canvas-html.linux-x64-gnu.node') : path.join(here, 'build/gpu.node'))
const oldAddon = (b) => process.env.PHASE4A1_NODE ?? (b === 'cpu' ? path.join(here, 'build/phase4a1-cpu.node') : path.join(here, '../phase4a1/build/gpu.node'))
const ROWS = [['4A.1 render()', oldAddon, 'render'], ['4A.1 _renderInto', oldAddon, '_renderInto'], ['4A.2 render()', newAddon, 'render'], ['4A.2 renderInto', newAddon, 'renderInto']]
const rows = []
for (const backend of backends) for (const sceneId of ['A', 'E']) for (const res of Object.keys(RES)) for (const [label, addon, api] of ROWS) {
  const c = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--child', addon(backend), backend, sceneId, res, api], { encoding: 'utf8' })
  const row = { backend, scene: sceneId, res, path: label, ...(c.status === 0 ? JSON.parse(c.stdout.trim().split('\n').pop()) : { error: c.stderr.slice(-400) }) }
  rows.push(row)
  console.log(`${backend.padEnd(10)} ${sceneId} ${res.padEnd(5)} ${label.padEnd(17)} ${row.error ? 'ERROR ' + row.error : `median ${row.medianMs} ms  p95 ${row.p95Ms} ms  peak RSS ${row.peakRssMiB} MiB`}`)
}
fs.mkdirSync(path.join(here, 'evidence'), { recursive: true })
fs.writeFileSync(path.join(here, 'evidence', `sanity-bench${process.argv[2] ? '-' + process.argv[2] : ''}.json`), JSON.stringify(rows, null, 1) + '\n')
if (rows.some((r) => r.error)) process.exit(1)
