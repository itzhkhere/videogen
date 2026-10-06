// renderInto in worker threads: 1, 2 and 4 workers render contiguous blocks of an animated scene
// (page seek(t) per frame) and must match a single-thread render() reference frame by frame.
//   transfer:   each frame is rendered into a transferable ArrayBuffer and moved to the parent
//               (postMessage(ab, [ab]): zero-copy). The parent hashes it and moves it back, so
//               the worker recycles returned buffers instead of allocating one per frame. After
//               each transfer the worker's view is detached; renderInto(view) must then throw.
//   in-process: each worker renders into its own Buffer and Uint8Array (alternating) and sends
//               only the hash.
// Checks: 0 missing, 0 mismatched frames, every worker exits with 0, use-after-transfer rejected.
// node test/render-into-workers.mjs     (HTML_RENDERER_NODE / HTML_RENDERER_BACKEND as in render-into.mjs)
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { fileURLToPath, pathToFileURL } from 'node:url'
const require = createRequire(import.meta.url)
const self = fileURLToPath(import.meta.url)
const scene = path.join(path.dirname(self), 'scenes', 'effects.html')
const FRAMES = 24, FPS = 30, W = 640, H = 360
const sha = (b) => createHash('sha256').update(b).digest('hex')
const backend = process.env.HTML_RENDERER_BACKEND

function make() {
  const { HtmlRenderer } = require(process.env.HTML_RENDERER_NODE ?? '../index.js')
  const r = new HtmlRenderer({ width: W, height: H, scripts: true, ...(backend ? { experimentalBackend: backend } : {}) })
  r.load(fs.readFileSync(scene, 'utf8'), pathToFileURL(scene).href)
  return r
}
const seek = (r, i) => r.eval(`seek(${(i * 1000) / FPS})`)

if (!isMainThread) {
  const { mode, from, to } = workerData
  const r = make()
  const n = r.frameByteLength
  const returned = []
  let allocated = 0, useAfterTransfer = 0, pending = 0
  parentPort.on('message', (m) => { returned.push(m.ab); pending-- })
  const u8 = new Uint8Array(n), buf = Buffer.alloc(n)
  for (let i = from; i < to; i++) {
    seek(r, i)
    if (mode === 'transfer') {
      // Use a buffer the parent gave back, or a new one; wait if too many are out.
      while (!returned.length && pending >= 2) await new Promise((res) => setImmediate(res))
      const ab = returned.pop() ?? (allocated++, new ArrayBuffer(n))
      const view = new Uint8Array(ab)
      r.renderInto(view)
      parentPort.postMessage({ i, ab }, [ab])
      pending++
      try { r.renderInto(view) } catch (e) { if (e.code === 'ERR_INVALID_ARG_VALUE' && view.byteLength === 0) useAfterTransfer++ }
    } else {
      const t = i % 2 ? buf : u8
      r.renderInto(t)
      parentPort.postMessage({ i, hash: sha(t) })
    }
  }
  while (pending > 0) await new Promise((res) => setImmediate(res))
  r.close()
  parentPort.postMessage({ done: true, allocated, useAfterTransfer })
  parentPort.close()
} else {
  const ref = make()
  const reference = []
  for (let i = 0; i < FRAMES; i++) { seek(ref, i); reference.push(sha(ref.render())) }
  ref.close()
  for (const mode of ['transfer', 'in-process']) for (const k of [1, 2, 4]) {
    const hashes = new Array(FRAMES).fill(null)
    const size = Math.ceil(FRAMES / k)
    let allocated = 0, useAfterTransfer = 0, received = 0
    const t0 = performance.now()
    const exits = await Promise.all(Array.from({ length: k }, (_, j) => new Promise((resolve, reject) => {
      const from = j * size, to = Math.min(FRAMES, (j + 1) * size)
      const w = new Worker(self, { workerData: { mode, from, to } })
      w.on('message', (m) => {
        if (m.done) { allocated += m.allocated; useAfterTransfer += m.useAfterTransfer; return }
        received++
        if (m.ab) {
          hashes[m.i] = sha(new Uint8Array(m.ab))
          w.postMessage({ ab: m.ab }, [m.ab]) // give it back for reuse
        } else hashes[m.i] = m.hash
      })
      w.once('error', reject)
      w.once('exit', resolve)
    })))
    const ms = performance.now() - t0
    const missing = hashes.filter((h) => h === null).length
    const mismatched = hashes.filter((h, i) => h !== null && h !== reference[i]).length
    console.log(`${mode.padEnd(10)} ${k} worker(s): ${received} frames, ${missing} missing, ${mismatched} mismatched, exits ${exits.join(',')}` +
      (mode === 'transfer' ? `, ${allocated} buffers allocated for ${FRAMES} frames, use-after-transfer rejected ${useAfterTransfer}/${FRAMES}` : '') + `, ${(FRAMES / (ms / 1000)).toFixed(1)} fps`)
    assert.equal(missing, 0); assert.equal(mismatched, 0)
    assert.ok(exits.every((c) => c === 0), 'clean worker exit')
    if (mode === 'transfer') {
      assert.equal(useAfterTransfer, FRAMES, 'a transferred (detached) view is rejected')
      assert.ok(allocated <= 3 * k, 'returned buffers are reused')
    }
  }
  console.log(`render-into-workers${backend ? ` (${backend})` : ''}: all passed`)
}
