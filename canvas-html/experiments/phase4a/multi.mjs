// Several renderers on one thread: 1/2/4/8, one GPU device per renderer vs one shared device.
// Each configuration runs in its own process (clean memory, crash isolation). Round-robin
// rendering of scene E at 1080p; reports creation, throughput, memory and close behaviour.
import { fileURLToPath } from 'node:url'
import { SCENES, BACKENDS, prepareAssets, baseUrl } from './lib/scenes.mjs'
import { make, expectBackend, stats, writeResult, round, child, nvidiaProcessMiB, log } from './lib/common.mjs'

const DPR = 1.5, ROUNDS = Number(process.env.PHASE4A_MULTI_ROUNDS ?? 8)

if (process.argv[2] === '--child') {
  const [, , , backend, k, share] = process.argv
  const html = SCENES.find((s) => s.id === 'E').html()
  const out = { backend, renderers: Number(k), share }
  const rss = () => +(process.memoryUsage().rss / 2 ** 20).toFixed(1)
  out.rssBaselineMiB = rss(); out.gpuBaseline = nvidiaProcessMiB()
  let t = performance.now()
  const rs = Array.from({ length: out.renderers }, () => make(backend, html, { dpr: DPR, share: backend === 'cpu' ? undefined : share }))
  out.createAllMs = round(performance.now() - t)
  for (const r of rs) for (let i = 0; i < 2; i++) expectBackend(r._renderTimed({ format: 'rgba' }), backend)
  const frame = []
  t = performance.now()
  for (let i = 0; i < ROUNDS; i++) for (const r of rs) {
    const s = performance.now(); expectBackend(r._renderTimed({ format: 'rgba' }), backend); frame.push(performance.now() - s)
  }
  const wall = performance.now() - t
  out.frameMs = round(stats(frame)); out.fps = round((ROUNDS * rs.length) / (wall / 1000))
  out.rssLoadedMiB = rss(); out.gpuLoaded = nvidiaProcessMiB()
  out.backendInfo = rs[0]._backendInfo()
  const bytes = rs.map((r) => r._backendInfo().gpuResourceBytes ?? 0)
  out.gpuResourceBytes = share === 'thread' ? Math.max(0, ...bytes) : bytes.reduce((a, x) => a + x, 0) // a shared cache counts once
  t = performance.now(); for (const r of rs) r.close(); out.closeAllMs = round(performance.now() - t)
  globalThis.gc?.()
  out.rssClosedMiB = rss(); out.gpuClosed = nvidiaProcessMiB()
  console.log(JSON.stringify(out))
  process.exit(0)
}

prepareAssets()
const rows = []
for (const b of BACKENDS) for (const share of b === 'cpu' ? ['-'] : ['renderer', 'thread']) for (const k of [1, 2, 4, 8]) {
  const c = child(fileURLToPath(import.meta.url), ['--child', b, String(k), share], { nodeArgs: ['--expose-gc'] })
  const row = c.json ?? { backend: b, renderers: k, share, crashed: true, code: c.code, signal: c.signal, stderr: c.stderr }
  row.exitCode = c.code; row.signal = c.signal
  rows.push(row)
  log(b.padEnd(10), share.padEnd(8), k, row.crashed ? `FAILED code=${c.code} signal=${c.signal} ${c.stderr.slice(-300)}` :
    `create ${row.createAllMs} ms, ${row.fps} fps (frame median ${row.frameMs.median}), rss ${row.rssBaselineMiB}→${row.rssLoadedMiB}→${row.rssClosedMiB} MiB, gpu ${JSON.stringify(row.gpuLoaded)}, close ${row.closeAllMs} ms, exit ${c.code}`)
}
writeResult('multi.json', { dpr: DPR, rounds: ROUNDS, scene: 'E', rows })
