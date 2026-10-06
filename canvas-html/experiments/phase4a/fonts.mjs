// Font/typeface retention follow-up (Phase 3: Skia's glyph cache pins typeface copies when
// every renderer/document creates its own typefaces). Per backend, in its own process:
//   per-renderer: 40 × (new renderer, load text scene B with @font-face Inter, render, close)
//   reused:       1 renderer, 40 × (load scene B, render)
// RSS and Skia's font cache size every 10 iterations, then after purging Skia's font cache
// (the small fix candidate). GPU adds its own glyph atlas, which lives in the GPU context.
import { fileURLToPath } from 'node:url'
import { SCENES, BACKENDS, prepareAssets, baseUrl } from './lib/scenes.mjs'
import { make, writeResult, child, nvidiaProcessMiB, log } from './lib/common.mjs'

const self = fileURLToPath(import.meta.url), N = 40
if (process.argv[2] === '--child') {
  const [, , , b, mode] = process.argv
  const html = SCENES.find((s) => s.id === 'B').html()
  const rss = () => { globalThis.gc?.(); return +(process.memoryUsage().rss / 2 ** 20).toFixed(1) }
  const probe = make('cpu', null)
  const points = [{ i: 0, rssMiB: rss() }]
  const reused = mode === 'reused' ? make(b, null) : null
  for (let i = 1; i <= N; i++) {
    const r = reused ?? make(b, null)
    r.load(html, baseUrl); r._renderTimed({ format: 'none' })
    if (!reused) r.close()
    if (i % 10 === 0) points.push({ i, rssMiB: rss(), gpu: nvidiaProcessMiB(), gpuResourceMiB: reused ? +(reused._backendInfo().gpuResourceBytes / 2 ** 20 || 0).toFixed(1) : null })
  }
  reused?.close()
  const rssAfterCloseMiB = rss()
  const purge = probe._purgeSkiaFontCache()
  const after = rss()
  probe.close()
  console.log(JSON.stringify({ backend: b, mode, points, rssAfterCloseMiB, purge, rssAfterPurgeMiB: after }))
  process.exit(0)
}
prepareAssets()
const rows = []
for (const b of BACKENDS) for (const mode of ['per-renderer', 'reused']) {
  const c = child(self, ['--child', b, mode], { nodeArgs: ['--expose-gc'] })
  const row = c.json ?? { backend: b, mode, crashed: true, code: c.code, signal: c.signal, stderr: c.stderr }
  rows.push(row)
  log(b.padEnd(10), mode.padEnd(12), row.crashed ? `FAILED ${c.stderr.slice(-300)}` :
    `rss ${row.points.map((p) => p.rssMiB).join('→')} | skia font cache ${(row.purge.fontCacheBytesBefore / 2 ** 20).toFixed(1)} MiB | after close ${row.rssAfterCloseMiB} → purge → ${row.rssAfterPurgeMiB}`)
}
writeResult('fonts.json', { iterations: N, scene: 'B', rows })
