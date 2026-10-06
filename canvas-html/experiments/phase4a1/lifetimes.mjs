// Ownership, lifetime and failure probes. Every probe runs in its own process (--expose-gc), so
// a crash is recorded (exit code / signal) instead of ending the run.
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { make, writeResult, child, log, turn, buildDir, BACKENDS } from './lib/common.mjs'

const self = fileURLToPath(import.meta.url)
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 16)
const HTML = '<body style="margin:0;background:#7c2d12"><h1 style="color:#fff;font:60px sans-serif">lifetime</h1><div style="width:300px;height:80px;background:linear-gradient(90deg,#f59e0b,#3b82f6)"></div>'
const settle = async () => { for (let i = 0; i < 10; i++) { globalThis.gc(); await turn() } }
const attempt = (f) => { try { return { ok: true, value: f() } } catch (e) { return { ok: false, error: String(e.message ?? e) } } }

const PROBES = {
  // A frame survives later renders, close(), and the renderer being garbage-collected.
  'buffer-outlives-renderer': async (b) => {
    let r = make(b, HTML)
    const first = r.render(), h = sha(first)
    const later = Array.from({ length: 10 }, () => r.render())
    const pooled = r._renderTimed({ output: 'pool', poolSize: 2 }).pixels, hp = sha(pooled)
    r.close()
    const afterClose = sha(first) === h
    r = null
    await settle()
    return { afterRenders: later.every((f) => sha(f) === h), afterClose, afterRendererGc: sha(first) === h, pooledAfterRendererGc: sha(pooled) === hp }
  },
  // Pooled Buffers finalized after the renderer is gone: the finalizer uses only the pool (Arc).
  'pool-finalizers-after-close': async (b) => {
    let r = make(b, HTML)
    let frames = Array.from({ length: 8 }, () => r._renderTimed({ output: 'pool', poolSize: 3 }).pixels)
    const stats = r._poolStats()
    r.close(); r = null
    await settle()
    frames = null
    await settle()
    return { statsBeforeClose: stats, finalizedWithoutRenderer: true }
  },
  // Many frames retained, then dropped: all intact, then released.
  'many-retained-then-dropped': async (b) => {
    const r = make(b, HTML, { dpr: 1.5 })
    const frames = Array.from({ length: 200 }, () => r.render())
    const h = sha(frames[0]), intact = frames.every((f) => sha(f) === h)
    const inUse = r._nativeHeap().inUseBytes
    frames.length = 0
    await settle()
    return { intact, inUseMiBWhileRetained: inUse >> 20, inUseMiBAfterDrop: r._nativeHeap().inUseBytes >> 20 }
  },
  '_renderInto-misuse': async (b) => {
    const r = make(b, HTML)
    const bytes = r.pixelWidth * r.pixelHeight * 4
    const ab = new ArrayBuffer(bytes), view = Buffer.from(ab)
    structuredClone(ab, { transfer: [ab] }) // detach it: the view now has length 0
    const out = {
      tooSmall: attempt(() => r._renderInto(Buffer.alloc(bytes - 4))),
      tooLarge: attempt(() => r._renderInto(Buffer.alloc(bytes + 4))),
      detachedView: attempt(() => r._renderInto(view)),
      plainUint8Array: attempt(() => { const u = new Uint8Array(bytes); r._renderInto(u); return u.some((x) => x !== 0) }),
      notBytes: attempt(() => r._renderInto(new Float32Array(bytes / 4))),
      notAnObject: attempt(() => r._renderInto(42)),
      ok: attempt(() => { const t = Buffer.alloc(bytes); r._renderInto(t); return sha(t) === sha(r.render()) }),
    }
    r.close()
    out.afterClose = attempt(() => r._renderInto(Buffer.alloc(bytes)))
    return out
  },
  'frame-size-limits': async (b) => ({
    huge: attempt(() => make(b, null, { width: 100000, height: 100000 })),
    hugeDpr: attempt(() => make(b, null, { width: 4000, height: 4000, dpr: 10 })),
    infiniteDpr: attempt(() => make(b, null, { width: 100, height: 100, dpr: Infinity })),
    maxSide: attempt(() => { const r = make(b, null, { width: 32767, height: 1 }); const n = r.pixelWidth; r.close(); return n }),
  }),
  // Retain 4K frames until allocation fails (run under an address-space limit): error, not abort.
  'retain-until-allocation-fails': async (b) => {
    const r = make(b, HTML, { dpr: 3 })
    const kept = []
    let failure = null
    for (let i = 0; i < 400 && !failure; i++) {
      const a = attempt(() => r.render())
      if (a.ok) kept.push(a.value); else failure = { at: i, error: a.error }
    }
    const n = kept.length
    kept.length = 0
    await settle()
    const after = attempt(() => r.render().length)
    r.close()
    return { framesBeforeFailure: n, failure, renderAfterRelease: after }
  },
  // A pool of 1 slot with frames still owned by JS: the pool allocates more (no unbounded reuse of
  // memory JS can see; growth is bounded by what JS retains).
  'full-pool': async (b) => {
    const r = make(b, HTML, { dpr: 1.5 })
    const held = Array.from({ length: 6 }, () => r._renderTimed({ output: 'pool', poolSize: 1 }).pixels)
    const distinct = new Set(held.map((f) => f.buffer)).size
    const stats = r._poolStats()
    held.length = 0
    await settle()
    const after = r._renderTimed({ output: 'pool', poolSize: 1 }).pixels.length
    return { heldFrames: 6, distinctMemory: distinct, stats, statsAfterRelease: r._poolStats(), renderAfter: after }
  },
}

if (process.argv[2] === '--child') {
  const [, , , probe, backend] = process.argv
  console.log(JSON.stringify(await PROBES[probe](backend)))
  process.exit(0)
}

const rows = []
for (const backend of BACKENDS) for (const probe of Object.keys(PROBES)) {
  // Frame allocation is the same Rust code on every backend; GPU drivers reserve large address
  // ranges, so the address-space-limited probe runs on CPU only.
  if (probe === 'retain-until-allocation-fails' && backend !== 'cpu') continue
  const env = backend !== 'cpu' ? { CANVAS_HTML_NODE: process.env.CANVAS_HTML_NODE ?? path.join(buildDir, 'gpu.node') } : {}
  let c
  if (probe === 'retain-until-allocation-fails') {
    // 3 GiB of address space beyond what Node reserves at start: ~90 4K frames fit
    const limitKiB = Number(process.env.PHASE4A1_AS_LIMIT_KIB ?? 16 * 1024 * 1024)
    const sh = `ulimit -v ${limitKiB}; exec "${process.execPath}" --expose-gc "${self}" --child ${probe} ${backend}`
    const { spawnSync } = await import('node:child_process')
    const r = spawnSync('sh', ['-c', sh], { encoding: 'utf8', env: { ...process.env, ...env }, timeout: 600000 })
    let json = null; try { json = JSON.parse(r.stdout.trim().split('\n').pop()) } catch {}
    c = { code: r.status, signal: r.signal, stderr: (r.stderr ?? '').slice(-1500), json }
  } else c = child(self, ['--child', probe, backend], { env, nodeArgs: ['--expose-gc'] })
  const row = { probe, backend, exitCode: c.code, signal: c.signal, crashed: c.code !== 0 || !!c.signal, result: c.json, stderr: c.code ? c.stderr : undefined }
  rows.push(row)
  log(probe.padEnd(30), backend, row.crashed ? `CRASH code=${c.code} signal=${c.signal} ${c.stderr.slice(-300)}` : JSON.stringify(c.json).slice(0, 420))
}
writeResult(`lifetimes${process.env.PHASE4A1_SUFFIX ?? ''}.json`, { rows })
