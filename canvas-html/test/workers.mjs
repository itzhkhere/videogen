// Worker safety: renderers in separate worker threads must not share state. Each scene is
// rendered once by a single renderer and once split across N workers (each takes a contiguous
// block and starts by seeking to its first frame). Every frame's hash must match. Scenes follow
// the page contract: window.seek(ms) shows the page at ms.
// node test/workers.mjs [workers]
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const here = path.dirname(fileURLToPath(import.meta.url))
const W = 640, H = 360

function renderRange({ file, fps, from, to }) {
  const { HtmlRenderer } = require('../index.js')
  const r = new HtmlRenderer({ width: W, height: H, scripts: true })
  r.load(fs.readFileSync(file, 'utf8'), pathToFileURL(file).href)
  const hashes = []
  for (let i = from; i < to; i++) {
    r.call('seek', (i * 1000) / fps)
    hashes.push(createHash('sha1').update(r.render()).digest('hex'))
  }
  return { hashes, jsErrors: r.jsErrors }
}

if (!isMainThread) {
  parentPort.postMessage(renderRange(workerData))
} else {
  const n = Number(process.argv[2] || 2)
  const scale = Number(process.argv[3] || 1)
  const scenes = [
    { name: 'CSS motion, 30 fps', file: path.join(here, 'scenes/motion.html'), fps: 30, frames: 120 * scale },
    { name: 'GSAP, 30 fps', file: path.join(here, 'scenes/gsap.html'), fps: 30, frames: 120 * scale },
    { name: 'Motion library, 24 fps', file: path.join(here, 'scenes/motion-library.html'), fps: 24, frames: 96 * scale },
  ]
  let ok = true
  for (const s of scenes) {
    let t0 = performance.now()
    const single = renderRange({ ...s, from: 0, to: s.frames }).hashes
    const singleS = (performance.now() - t0) / 1000
    t0 = performance.now()
    const size = Math.ceil(s.frames / n)
    const parts = await Promise.all(Array.from({ length: n }, (_, k) => new Promise((res, rej) => {
      const w = new Worker(fileURLToPath(import.meta.url), {
        workerData: { file: s.file, fps: s.fps, from: k * size, to: Math.min(s.frames, (k + 1) * size) },
      })
      w.once('message', res); w.once('error', rej)
    })))
    const parallelS = (performance.now() - t0) / 1000
    const split = parts.flatMap((p) => p.hashes)
    const mismatches = split.reduce((acc, h, i) => acc + (h !== single[i] ? 1 : 0), 0)
    const errors = parts.flatMap((p) => p.jsErrors)
    ok &&= mismatches === 0 && errors.length === 0 && split.length === single.length
    console.log(`${s.name.padEnd(24)} ${mismatches === 0 ? 'identical' : `${mismatches} frames differ`} | 1 renderer ${singleS.toFixed(2)} s, ${n} workers ${parallelS.toFixed(2)} s (${(singleS / parallelS).toFixed(1)}x)${errors.length ? ' | jsErrors: ' + errors[0] : ''}`)
  }
  if (!ok) process.exit(1)
}
