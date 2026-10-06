// Worker threads: 1/2/4/8 workers, each owning its renderer (and, on GPU, its own device:
// a GPU device/context is bound to the thread that created it). The animated effects scene,
// 1080p, 120 frames split into contiguous blocks. Frame hashes must equal the 1-worker run.
// Also: terminate GPU workers mid-render, then check that the process still renders.
// Each backend runs in its own process.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'
import fs from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { ANIMATED, BACKENDS } from './lib/scenes.mjs'
import { make, expectBackend, sha, stats, writeResult, round, child, log } from './lib/common.mjs'

const DPR = 1.5, FPS = 30, FRAMES = Number(process.env.PHASE4A_WORKER_FRAMES ?? 120)
const scene = ANIMATED.find((s) => s.id === 'effects')
const self = fileURLToPath(import.meta.url)

function renderRange({ backend, from, to, loop }) {
  const html = fs.readFileSync(scene.file, 'utf8')
  let t = performance.now()
  const r = make(backend, html, { dpr: DPR, scripts: true, url: pathToFileURL(scene.file).href })
  const createMs = performance.now() - t
  const hashes = []
  t = performance.now()
  do {
    for (let i = from; i < to; i++) {
      r.call('seek', (i * 1000) / FPS)
      hashes.push(sha(expectBackend(r._renderTimed({ format: 'rgba' }), backend).pixels))
    }
  } while (loop)
  const renderMs = performance.now() - t
  const device = r._backendInfo().device ?? null
  t = performance.now(); r.close()
  return { hashes, createMs, renderMs, closeMs: performance.now() - t, device }
}

if (!isMainThread) {
  parentPort.postMessage(renderRange(workerData))
} else if (process.argv[2] === '--child') {
  const backend = process.argv[3]
  const out = { backend, runs: [] }
  let single = null
  for (const k of [1, 2, 4, 8]) {
    const size = Math.ceil(FRAMES / k)
    const t0 = performance.now()
    const parts = await Promise.all(Array.from({ length: k }, (_, j) => new Promise((res, rej) => {
      const w = new Worker(self, { workerData: { backend, from: j * size, to: Math.min(FRAMES, (j + 1) * size) } })
      w.once('message', res); w.once('error', rej)
    })))
    const wallMs = performance.now() - t0
    const hashes = parts.flatMap((p) => p.hashes)
    single ??= hashes
    out.runs.push({
      workers: k, wallMs: round(wallMs), fps: round(FRAMES / (wallMs / 1000)),
      createMs: round(stats(parts.map((p) => p.createMs))), closeMs: round(stats(parts.map((p) => p.closeMs))),
      mismatchesVsOneWorker: hashes.reduce((a, h, i) => a + (h !== single[i] ? 1 : 0), 0),
      distinctDevices: [...new Set(parts.map((p) => p.device))].length,
    })
  }
  // Termination probe: 2 workers render forever; terminate them after 1.5 s.
  const ws = Array.from({ length: 2 }, () => new Worker(self, { workerData: { backend, from: 0, to: 30, loop: true } }))
  await new Promise((r) => setTimeout(r, 1500))
  const codes = await Promise.all(ws.map((w) => w.terminate()))
  const after = renderRange({ backend, from: 0, to: 2 })
  out.terminateProbe = { exitCodes: codes, renderAfterTerminate: after.hashes[0] === single[0] }
  console.log(JSON.stringify(out))
  process.exit(0)
} else {
  const rows = []
  for (const b of BACKENDS) {
    const c = child(self, ['--child', b], { timeout: 1800000 })
    const row = c.json ?? { backend: b, crashed: true, code: c.code, signal: c.signal, stderr: c.stderr }
    row.exitCode = c.code; row.signal = c.signal
    rows.push(row)
    if (row.crashed) log(b, 'FAILED', c.code, c.signal, c.stderr.slice(-400))
    else for (const run of row.runs) log(b.padEnd(10), `${run.workers} workers: ${run.fps} fps (wall ${run.wallMs} ms), create median ${run.createMs.median} ms, mismatches ${run.mismatchesVsOneWorker}`)
    if (!row.crashed) log(b.padEnd(10), 'terminate probe', JSON.stringify(row.terminateProbe), 'exit', c.code)
  }
  writeResult('workers.json', { dpr: DPR, frames: FRAMES, scene: scene.id, rows })
}
