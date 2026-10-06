// GPU resource reuse: per-frame cost when the device/context, the surface or nothing is reused.
//   reuse:            one renderer (device + context + surface + caches) for every frame
//   new-renderer:     a new renderer per frame, each with its own device (experimentalGpuShare "renderer")
//   new-surface:      a new renderer per frame on a reused device (experimentalGpuShare "thread";
//                     a keeper renderer holds the device), so only surface and caches are new
// Scenes A (easy) and E (filters) at 1080p.
import { SCENES, BACKENDS, prepareAssets, baseUrl } from './lib/scenes.mjs'
import { make, expectBackend, stats, writeResult, round, log } from './lib/common.mjs'

prepareAssets()
const DPR = 1.5, FRAMES = Number(process.env.PHASE4A_CTX_FRAMES ?? 10)
const rows = []
for (const id of ['A', 'E']) {
  const html = SCENES.find((s) => s.id === id).html()
  for (const b of BACKENDS) {
    const modes = b === 'cpu' ? ['reuse', 'new-renderer'] : ['reuse', 'new-renderer', 'new-surface']
    for (const mode of modes) {
      const row = { scene: id, backend: b, mode }
      try {
        const parts = { create: [], load: [], render: [], close: [], frame: [] }
        let keeper = null, r = null
        if (mode === 'new-surface') keeper = make(b, null, { dpr: DPR, share: 'thread' })
        if (mode === 'reuse') { r = make(b, html, { dpr: DPR }); for (let i = 0; i < 3; i++) r._renderTimed({ format: 'rgba' }) }
        for (let i = 0; i < FRAMES; i++) {
          const f0 = performance.now()
          if (mode !== 'reuse') {
            let t = performance.now()
            r = make(b, null, { dpr: DPR, share: mode === 'new-surface' ? 'thread' : 'renderer' })
            parts.create.push(performance.now() - t)
            t = performance.now(); r.load(html, baseUrl); parts.load.push(performance.now() - t)
          }
          let t = performance.now()
          expectBackend(r._renderTimed({ format: 'rgba' }), b)
          parts.render.push(performance.now() - t)
          if (mode !== 'reuse') { t = performance.now(); r.close(); parts.close.push(performance.now() - t) }
          parts.frame.push(performance.now() - f0)
        }
        if (mode === 'reuse') r.close()
        keeper?.close()
        for (const [k, v] of Object.entries(parts)) if (v.length) row[k] = round(stats(v))
      } catch (e) {
        row.error = String(e.message ?? e)
      }
      rows.push(row)
      log(id, b.padEnd(10), mode.padEnd(12), row.error ?? `frame median ${row.frame.median} ms` + (row.create ? ` (create ${row.create.median}, load ${row.load.median}, render ${row.render.median}, close ${row.close.median})` : ''))
    }
  }
}
writeResult('contexts.json', { dpr: DPR, frames: FRAMES, rows })
