// Workers: 1 / 2 / 4 workers render contiguous blocks of the effects scene (1080p, 60 frames)
// and deliver every frame to the parent:
//   clone          render() frame, postMessage(frame)        (structured clone: one copy)
//   into-transfer  _renderInto a worker-owned ArrayBuffer, postMessage(buf, [ab])  (zero copy)
//   shared         _renderInto a slot of a parent-owned SharedArrayBuffer ring       (zero copy)
// (`transfer` of a render() frame is rejected by Node: external memory; see probes/postmessage.mjs.)
// Checks: every frame equals the single-thread reference (same backend), frames stay readable
// after all workers exited, exit codes, and that frames never leave their creating thread except
// by copy or by Node-allocated memory. Each backend runs in its own process.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { ANIMATED } from '../phase4a/lib/scenes.mjs'
import { make, sha, round, writeResult, child, log, buildDir, BACKENDS } from './lib/common.mjs'

const self = fileURLToPath(import.meta.url)
const DPR = 1.5, FPS = 30, FRAMES = Number(process.env.PHASE4A1_WORKER_FRAMES ?? 60)
const scene = ANIMATED.find((s) => s.id === 'effects')
const html = () => fs.readFileSync(scene.file, 'utf8')

if (!isMainThread) {
  const { backend, from, to, mode, sab } = workerData
  const r = make(backend, html(), { dpr: DPR, scripts: true, url: pathToFileURL(scene.file).href })
  const bytes = r.pixelWidth * r.pixelHeight * 4
  for (let i = from; i < to; i++) {
    r.call('seek', (i * 1000) / FPS)
    if (mode === 'clone') parentPort.postMessage({ i, frame: r.render() })
    else if (mode === 'into-transfer') {
      const ab = new ArrayBuffer(bytes)
      r._renderInto(Buffer.from(ab))
      parentPort.postMessage({ i, frame: ab }, [ab])
    } else {
      const slot = Buffer.from(sab, i * bytes, bytes)
      r._renderInto(slot)
      parentPort.postMessage({ i })
    }
  }
  r.close()
  parentPort.postMessage({ done: true })
} else if (process.argv[2] === '--child') {
  const backend = process.argv[3]
  const out = { backend, runs: [] }
  const ref = make(backend, html(), { dpr: DPR, scripts: true, url: pathToFileURL(scene.file).href })
  const bytes = ref.pixelWidth * ref.pixelHeight * 4
  const reference = []
  for (let i = 0; i < FRAMES; i++) { ref.call('seek', (i * 1000) / FPS); reference.push(sha(ref.render())) }
  ref.close()
  for (const mode of ['clone', 'into-transfer', 'shared']) for (const k of [1, 2, 4]) {
    const sab = mode === 'shared' ? new SharedArrayBuffer(FRAMES * bytes) : undefined
    const frames = new Array(FRAMES)
    const size = Math.ceil(FRAMES / k)
    const t0 = performance.now()
    const exits = await Promise.all(Array.from({ length: k }, (_, j) => new Promise((res, rej) => {
      const w = new Worker(self, { workerData: { backend, from: j * size, to: Math.min(FRAMES, (j + 1) * size), mode, sab } })
      w.on('message', (m) => {
        if (m.done) return
        frames[m.i] = mode === 'shared' ? Buffer.from(sab, m.i * bytes, bytes) : Buffer.from(m.frame.buffer ?? m.frame, m.frame.byteOffset ?? 0, bytes)
      })
      w.once('error', rej)
      w.once('exit', res)
    })))
    const wallMs = performance.now() - t0
    globalThis.gc(); await new Promise((r) => setImmediate(r))
    const hashes = frames.map((f) => (f ? sha(f) : null))
    out.runs.push({
      mode, workers: k, wallMs: round(wallMs), fps: round(FRAMES / (wallMs / 1000)), exitCodes: exits,
      mismatches: hashes.reduce((n, h, i) => n + (h !== reference[i] ? 1 : 0), 0), missing: hashes.filter((h) => !h).length,
    })
  }
  console.log(JSON.stringify(out))
  process.exit(0)
} else {
  const rows = []
  for (const backend of BACKENDS) {
    const env = backend !== 'cpu' ? { CANVAS_HTML_NODE: process.env.CANVAS_HTML_NODE ?? path.join(buildDir, 'gpu.node') } : {}
    const c = child(self, ['--child', backend], { env, nodeArgs: ['--expose-gc'] })
    const row = c.json ?? { backend, crashed: true, code: c.code, signal: c.signal, stderr: c.stderr }
    row.processExit = c.code
    rows.push(row)
    if (row.crashed) log(backend, 'FAILED', c.code, c.signal, c.stderr.slice(-300))
    else for (const r of row.runs) log(backend, r.mode.padEnd(13), `${r.workers} workers: ${r.fps} fps, mismatches ${r.mismatches}, missing ${r.missing}, worker exits ${r.exitCodes.join(',')}`)
  }
  writeResult(`workers${process.env.PHASE4A1_SUFFIX ?? ''}.json`, { frames: FRAMES, scene: scene.id, rows })
}
