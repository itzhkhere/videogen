// Timing check on a GPU (not a study): did 4A.3 keep the frame-output performance of the baseline?
// Scene A (output-dominated) and scene E (paint-heavy), 1080p and 4K, per backend, render() and
// renderInto() of both builds (a baseline
// without renderInto, such as the 4A.1 build, uses its experimental _renderInto). One process per row; 3 warm-up frames, then 15 (1080p) / 10 (4K)
// frames, tight loop; median and p95 wall ms around the call, peak RSS.
// node timing.mjs <baseline.node> <4a3.node> <cpu,gpu-gl,gpu-vulkan> [tag]  → evidence/timing[-tag].json
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
  const into = r.renderInto ? (t) => r.renderInto(t) : (t) => r._renderInto(t)
  const one = api === 'render' ? () => r.render() : () => into(target)
  for (let i = 0; i < 3; i++) one()
  const ms = []
  let peak = 0
  for (let i = 0; i < n; i++) { const t = performance.now(); one(); ms.push(performance.now() - t); peak = Math.max(peak, process.memoryUsage().rss) }
  r.close()
  console.log(JSON.stringify({ medianMs: +q(ms, 0.5).toFixed(2), p95Ms: +q(ms, 0.95).toFixed(2), peakRssMiB: Math.round(peak / 1048576) }))
  process.exit(0)
}

prepareAssets()
const [before, after, backendList = 'cpu', tag] = process.argv.slice(2)
const backends = backendList.split(',')
const ROWS = [['baseline render()', before, 'render'], ['baseline into', before, 'renderInto'], ['4A.3 render()', after, 'render'], ['4A.3 renderInto', after, 'renderInto']]
const rows = []
for (const backend of backends) for (const sceneId of ['A', 'E']) for (const res of Object.keys(RES)) for (const [label, addon, api] of ROWS) {
  const c = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--child', path.resolve(addon), backend, sceneId, res, api], { encoding: 'utf8' })
  const row = { backend, scene: sceneId, res, path: label, ...(c.status === 0 ? JSON.parse(c.stdout.trim().split('\n').pop()) : { error: c.stderr.slice(-400) }) }
  rows.push(row)
  console.log(`${backend.padEnd(10)} ${sceneId} ${res.padEnd(5)} ${label.padEnd(17)} ${row.error ? 'ERROR ' + row.error : `median ${row.medianMs} ms  p95 ${row.p95Ms} ms  peak RSS ${row.peakRssMiB} MiB`}`)
}
fs.mkdirSync(path.join(here, 'evidence'), { recursive: true })
fs.writeFileSync(path.join(here, 'evidence', `timing${tag ? '-' + tag : ''}.json`), JSON.stringify(rows, null, 1) + '\n')
if (rows.some((r) => r.error)) process.exit(1)
