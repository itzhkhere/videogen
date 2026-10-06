// Worker → parent frame hand-off semantics for one mode:
//   clone     postMessage(frame)                        structured clone
//   transfer  postMessage(frame, [frame.buffer])        transfer list (frame from render())
//   shared    worker _renderInto a Buffer over a SharedArrayBuffer owned by the parent
//   into-transfer  worker _renderInto a Buffer over its own ArrayBuffer, then transfers it
// Prints JSON: whether it worked, whether the parent's bytes equal the worker's, whether the
// worker's view was detached, timings, and that the parent can read the frame after the worker exited.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { HtmlRenderer } from '../lib/native.mjs'
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 16)
const HTML = '<body style="margin:0;background:#0f766e"><h1 style="color:#fff;font:60px sans-serif">worker frame</h1>'
if (!isMainThread) {
  const { mode, sab } = workerData
  const r = new HtmlRenderer({ width: 1280, height: 720, devicePixelRatio: 1.5, systemFonts: false }); r.load(HTML)
  const out = { mode }
  try {
    if (mode === 'into-transfer') {
      // a Node-allocated (transferable) ArrayBuffer, rendered into, then moved to the parent
      const ab = new ArrayBuffer(r.pixelWidth * r.pixelHeight * 4), view = Buffer.from(ab)
      r._renderInto(view)
      out.workerHash = sha(view)
      const t0 = performance.now(); parentPort.postMessage({ out, frame: view }, [ab]); out.postMs = performance.now() - t0
      out.workerViewLengthAfter = view.length
    } else if (mode === 'shared') {
      const view = Buffer.from(sab)
      r._renderInto(view)
      out.workerHash = sha(view)
      const t0 = performance.now(); parentPort.postMessage({ out, frame: null }); out.postMs = performance.now() - t0
    } else {
      const frame = r.render()
      out.workerHash = sha(frame)
      const t0 = performance.now()
      parentPort.postMessage({ out, frame }, mode === 'transfer' ? [frame.buffer] : [])
      out.postMs = performance.now() - t0
      out.workerViewLengthAfter = frame.length
    }
  } catch (e) { out.error = `${e.name}: ${e.message}` ; parentPort.postMessage({ out, frame: null }) }
  parentPort.postMessage({ done: out })
  r.close()
} else {
  const mode = process.argv[2]
  const sab = mode === 'shared' ? new SharedArrayBuffer(1920 * 1080 * 4) : undefined
  const w = new Worker(fileURLToPath(import.meta.url), { workerData: { mode, sab } })
  let got = null, done = null
  w.on('message', (m) => { if (m.done) done = m.done; else got = m })
  w.on('error', (e) => { console.log(JSON.stringify({ mode, workerError: String(e) })); process.exit(1) })
  await new Promise((res) => w.once('exit', res))
  const frame = mode === 'shared' ? Buffer.from(sab) : got?.frame
  globalThis.gc?.(); await new Promise((r) => setImmediate(r))
  const res = { ...done, ...(got?.out?.error ? { error: got.out.error } : {}), received: !!frame, parentHash: frame ? sha(Buffer.from(frame.buffer ?? frame, frame.byteOffset ?? 0, frame.byteLength ?? frame.length)) : null, readableAfterWorkerExit: frame ? frame[0] !== undefined : false }
  res.identical = res.parentHash === res.workerHash
  console.log(JSON.stringify(res))
}
