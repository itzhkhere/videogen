// Animated sequences at 1080p (dpr 1.5), 30 fps, 120 and 300 frames, page contract seek(ms).
// Frame time = seek (JS + animation update) + _renderTimed total. Reported: average, median,
// p95, total sequence time and the per-step medians. Separate passes for no-readback and PNG
// (PNG encoding reported on its own). Frames 0, middle and last are compared CPU vs GPU.
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import { ANIMATED, BACKENDS } from './lib/scenes.mjs'
import { make, expectBackend, stats, timingStats, sha, writeResult, round, log } from './lib/common.mjs'
import { compare } from './lib/diff.mjs'

const DPR = 1.5, W = 1920, H = 1080, FPS = 30
const lengths = (process.env.PHASE4A_ANIM_FRAMES ?? '120,300').split(',').map(Number)
const only = process.env.PHASE4A_ANIM?.split(',')

function sequence(r, backend, frames, opts, keep) {
  const per = [], timings = [], hashes = [], kept = {}
  const t0 = performance.now()
  for (let i = 0; i < frames; i++) {
    const s = performance.now()
    r.call('seek', (i * 1000) / FPS)
    const seekMs = performance.now() - s
    const out = expectBackend(r._renderTimed(opts), backend)
    per.push(performance.now() - s)
    timings.push({ ...out.timingsNs, seek: seekMs * 1e6 })
    if (out.pixels && opts.format === 'rgba') {
      hashes.push(sha(out.pixels))
      if (keep.includes(i)) kept[i] = out.pixels
    }
  }
  const totalMs = performance.now() - t0
  return { frameMs: round(stats(per)), totalMs: round(totalMs), fps: round(frames / (totalMs / 1000)), steps: timingStats(timings), rawFrameMs: round(per, 2), hashes, kept }
}

const rows = []
for (const scene of ANIMATED.filter((s) => !only || only.includes(s.id))) {
  const html = fs.readFileSync(scene.file, 'utf8'), url = pathToFileURL(scene.file).href
  for (const frames of lengths) {
    const keep = [0, frames >> 1, frames - 1]
    const ref = {}
    for (const b of BACKENDS) {
      const row = { scene: scene.id, frames, backend: b }
      try {
        const r = make(b, html, { dpr: DPR, scripts: true, url })
        for (let i = 0; i < 3; i++) { r.call('seek', i * 100); r._renderTimed({ format: 'rgba' }) } // warm-up
        const rgba = sequence(r, b, frames, { format: 'rgba' }, keep)
        row.rgba = { ...rgba, kept: undefined, hashes: undefined }
        row.hashes = rgba.hashes
        if (b === 'cpu') Object.assign(ref, rgba.kept)
        else if (Object.keys(ref).length) row.vsCpu = Object.fromEntries(keep.map((i) => [i, compare(ref[i], rgba.kept[i], W, H)]))
        if (frames === lengths[0]) {
          row.none = { ...sequence(r, b, frames, { format: 'none', readback: false }, []), kept: undefined, hashes: undefined }
          row.png = { ...sequence(r, b, frames, { format: 'png' }, []), kept: undefined, hashes: undefined }
        }
        row.jsErrors = r.jsErrors
        r.close()
      } catch (e) {
        row.error = String(e.message ?? e)
      }
      rows.push(row)
      log(scene.id, frames, b.padEnd(10), row.error ?? `median ${row.rgba.frameMs.median} ms, p95 ${row.rgba.frameMs.p95}, total ${row.rgba.totalMs} ms (${row.rgba.fps} fps)` +
        (row.none ? ` | no-readback median ${row.none.frameMs.median}` : '') + (row.vsCpu ? ` | vs cpu: ${Object.values(row.vsCpu).map((c) => c.severity).join(',')}` : ''))
    }
  }
}
writeResult('animated.json', { dpr: DPR, width: W, height: H, fps: FPS, rows })
