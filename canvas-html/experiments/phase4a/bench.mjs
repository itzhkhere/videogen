// Static-scene timing breakdown, CPU vs GPU, scenes A–G at 720p / 1080p / 4K.
// Per (scene, resolution, backend), on a fresh renderer:
//   cold:  constructor (incl. GPU device), load, first frame (shader compilation etc.)
//   warm-up frames (not reported), then
//   rgba:  N frames with readback + Node Buffer        (the production render() path)
//   none:  N frames without readback (GPU stays on GPU; CPU still rasterizes into memory)
//   png:   K frames with readback + PNG encoding (encoding reported separately)
//   prep:  K frames that also time Blitz command generation alone (paintPrep)
// Every frame states which backend rendered it; a mismatch aborts the run.
import { SCENES, RESOLUTIONS, BACKENDS, prepareAssets, baseUrl } from './lib/scenes.mjs'
import { make, expectBackend, timingStats, writeResult, round, log } from './lib/common.mjs'

prepareAssets()
const scale = Number(process.env.PHASE4A_FRAMES ?? 1)
const N = { '720p': 20, '1080p': 15, '4K': 10 }
const WARM = 5
const only = process.env.PHASE4A_SCENES?.split(',')
const onlyRes = process.env.PHASE4A_RES?.split(',')

const rows = []
for (const s of SCENES.filter((x) => !only || only.includes(x.id))) {
  const html = s.html()
  for (const res of RESOLUTIONS.filter((x) => !onlyRes || onlyRes.includes(x.name))) {
    const n = Math.max(3, Math.round(N[res.name] * scale)), k = Math.max(3, Math.round(n / 3))
    for (const b of BACKENDS) {
      const row = { scene: s.id, res: res.name, backend: b }
      try {
        let t = performance.now()
        const r = make(b, null, { dpr: res.dpr })
        row.createMs = performance.now() - t
        t = performance.now()
        r.load(html, baseUrl)
        row.loadMs = performance.now() - t
        row.first = round(Object.fromEntries(Object.entries(expectBackend(r._renderTimed({ format: 'rgba' }), b).timingsNs).map(([k2, v]) => [k2, v / 1e6])))
        for (let i = 0; i < WARM; i++) expectBackend(r._renderTimed({ format: 'rgba' }), b)
        const run = (opts, count) => {
          const frames = []
          for (let i = 0; i < count; i++) frames.push(expectBackend(r._renderTimed(opts), b).timingsNs)
          return timingStats(frames)
        }
        row.rgba = run({ format: 'rgba' }, n)
        row.none = run({ format: 'none', readback: false }, n)
        row.png = run({ format: 'png' }, k)
        row.prep = run({ format: 'none', readback: false, measurePaintPrep: true }, k)
        row.info = r._backendInfo()
        r.close()
        row.createMs = round(row.createMs); row.loadMs = round(row.loadMs)
      } catch (e) {
        row.error = String(e.message ?? e)
      }
      rows.push(row)
      log(s.id, res.name, b.padEnd(10), row.error ?? `total ${row.rgba.total.median} ms (paint ${row.rgba.paint.median}, submit ${row.rgba.gpuSubmit.median}, wait ${row.rgba.gpuWait.median}, readback ${row.rgba.readback.median}) | no-readback ${row.none.total.median} | first ${row.first.total}`)
    }
  }
}
writeResult(`bench${process.env.PHASE4A_SUFFIX ?? ''}.json`, { warmup: WARM, frames: N, scale, rows })
