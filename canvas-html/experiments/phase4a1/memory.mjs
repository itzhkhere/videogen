// Frame memory, each case in its own process (--expose-gc).
//  retained: keep N frames in an array (100/1000 at 720p, 100 at 1080p and 4K). Growth should
//            match N × frame bytes; then drop them and let Node run finalizers.
//  dropped:  300 renders, references dropped at once; tight loop vs an event-loop turn every 10
//            frames; then turns + gc. Shows delayed finalization (not a leak) and the steady state.
// Paths: render (new: frame handed to Node, V8 told about its bytes), old-render (Phase 4A addon),
// into (one reused Buffer).
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { make, writeResult, child, log, turn, buildDir, BACKENDS, MiB } from './lib/common.mjs'

const self = fileURLToPath(import.meta.url)
const RES = { '720p': 1, '1080p': 1.5, '4K': 3 }
const HTML = '<body style="margin:0;background:#1e293b"><h1 style="color:#fff;font:60px sans-serif">frame</h1>'

function sample(r, label, extra = {}) {
  const m = process.memoryUsage()
  return { label, rssMiB: MiB(m.rss), externalMiB: MiB(m.external), arrayBuffersMiB: MiB(m.arrayBuffers), nativeInUseMiB: r._nativeHeap ? MiB(r._nativeHeap().inUseBytes) : null, ...extra }
}
const settle = async (n = 20) => { for (let i = 0; i < n; i++) { globalThis.gc(); await turn() } }

if (process.argv[2] === '--child') {
  const [, , , backend, kind, mode, resName, nArg] = process.argv
  const n = +nArg
  const r = make(backend, HTML, { dpr: RES[resName] })
  const bytes = r.pixelWidth * r.pixelHeight * 4
  const target = mode === 'into' ? Buffer.alloc(bytes) : null
  const one = () => (target ? (r._renderInto(target), target) : r.render())
  one(); await settle()
  const out = { backend, kind, mode, res: resName, frames: n, frameMiB: MiB(bytes), samples: [sample(r, 'baseline')] }
  if (kind === 'retained') {
    const kept = []
    for (let i = 0; i < n; i++) kept.push(target ? Buffer.from(one()) : one())
    out.samples.push(sample(r, `${n} retained`, { expectedMiB: MiB(n * bytes) }))
    out.intact = kept.every((b) => b.length === bytes)
    kept.length = 0
    await settle()
    out.samples.push(sample(r, 'dropped + gc'))
  } else {
    const every = kind === 'dropped-yield' ? 10 : 0
    for (let i = 1; i <= n; i++) {
      one()
      if (every && i % every === 0) await turn()
      if (i % 50 === 0) out.samples.push(sample(r, `frame ${i}`))
    }
    await settle()
    out.samples.push(sample(r, 'after turns + gc'))
  }
  r.close()
  await settle()
  out.samples.push(sample(r, 'renderer closed'))
  console.log(JSON.stringify(out))
  process.exit(0)
}

const CASES = [
  ['retained', '720p', 100], ['retained', '720p', 1000], ['retained', '1080p', 100], ['retained', '4K', 100],
  ['dropped-tight', '1080p', 300], ['dropped-yield', '1080p', 300], ['dropped-tight', '4K', 300], ['dropped-yield', '4K', 300],
]
const rows = []
for (const backend of BACKENDS) for (const [kind, res, n] of CASES) for (const mode of ['render', 'old-render', 'into']) {
  if (kind === 'retained' && mode === 'into') continue
  const gpu = backend !== 'cpu'
  const env = mode === 'old-render' ? { CANVAS_HTML_NODE: path.join(buildDir, gpu ? 'phase4a-gpu.node' : 'phase4a-cpu.node') } : gpu ? { CANVAS_HTML_NODE: process.env.CANVAS_HTML_NODE ?? path.join(buildDir, 'gpu.node') } : {}
  const c = child(self, ['--child', backend, kind, mode, res, String(n)], { env, nodeArgs: ['--expose-gc'] })
  const row = c.json ?? { backend, kind, mode, res, frames: n, crashed: true, code: c.code, signal: c.signal, stderr: c.stderr }
  rows.push(row)
  log(kind.padEnd(13), res.padEnd(5), String(n).padStart(4), backend, mode.padEnd(10), row.crashed ? `FAILED ${c.signal ?? c.code} ${c.stderr.slice(-200)}` :
    row.samples.map((s) => `${s.label}: rss ${s.rssMiB} ext ${s.externalMiB} native ${s.nativeInUseMiB ?? '-'}${s.expectedMiB ? ` (expected ${s.expectedMiB})` : ''}`).join(' | '))
}
writeResult(`memory${process.env.PHASE4A1_SUFFIX ?? ''}.json`, { rows })
