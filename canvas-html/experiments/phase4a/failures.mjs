// Failure probes, each in its own process so a crash is recorded rather than fatal.
// A probe passes when Node does not crash, the error is a clean JS exception naming the
// backend, and the process can still render afterwards.
import { fileURLToPath } from 'node:url'
import { BACKENDS, SCENES, prepareAssets, baseUrl } from './lib/scenes.mjs'
import { make, expectBackend, sha, writeResult, child, log } from './lib/common.mjs'

const self = fileURLToPath(import.meta.url)
const gpus = BACKENDS.filter((b) => b !== 'cpu')
const html = SCENES.find((s) => s.id === 'E').html()
const attempt = (f) => { try { return { ok: true, value: f() } } catch (e) { return { ok: false, error: String(e.message ?? e) } } }
const renders = (b, share) => attempt(() => { const r = make(b, html, { share }); const h = sha(expectBackend(r._renderTimed({ format: 'rgba' }), b).pixels); r.close(); return h })

const PROBES = {
  // GPU unavailable / driver initialization failure: a device index that does not exist
  'init-failure': (b) => ({ create: attempt(() => make(b, null)), cpuAfter: renders('cpu') }),
  'unsupported-backend': () => ({ create: attempt(() => make('gpu-metal', null)), shareOption: attempt(() => make(gpus[0], null, { share: 'process' })) }),
  // Surface creation failure: wider than any GPU texture
  'surface-failure': (b) => ({ create: attempt(() => make(b, null, { width: 70000, height: 16 })), gpuAfter: renders(b, 'thread') }),
  // Device lost (abandoned context): render fails cleanly (also the readback path), close works,
  // a new renderer gets a new device (an abandoned shared device is not reused)
  'device-lost': (b) => {
    const before = renders(b)
    const r = make(b, html, { share: 'thread' })
    const sibling = make(b, html, { share: 'thread' })
    r._renderTimed({ format: 'none' })
    const abandon = attempt(() => r._gpuAbandonForTesting())
    if (!abandon.ok) { r.close(); sibling.close(); return { abandon, note: 'device loss cannot be simulated on this backend' } }
    const out = {
      render: attempt(() => r._renderTimed({ format: 'rgba' })),
      renderNoReadback: attempt(() => r._renderTimed({ format: 'none', readback: false })),
      siblingOnSameDevice: attempt(() => sibling._renderTimed({ format: 'rgba' }).backend),
      info: r._backendInfo(),
      close: attempt(() => { r.close(); sibling.close(); return 'closed' }),
    }
    out.newRenderer = renders(b, 'thread')
    out.sameOutputAsBefore = out.newRenderer.value === before.value
    return out
  },
  'use-after-close': (b) => { const r = make(b, html); r.close(); return { render: attempt(() => r._renderTimed()), info: r._backendInfo(), closeAgain: attempt(() => r.close()) } },
  // Teardown without close(): GC finalizers, then process exit with live GPU renderers
  'gc-finalize': (b) => {
    for (let i = 0; i < 4; i++) { const r = make(b, html, { share: i % 2 ? 'thread' : 'renderer' }); r._renderTimed({ format: 'none' }) }
    globalThis.gc(); globalThis.gc()
    return { after: renders(b) }
  },
  'exit-with-live-renderers': (b) => {
    globalThis.keep = [make(b, html), make(b, html, { share: 'thread' }), make(b, html, { share: 'thread' })]
    for (const r of globalThis.keep) r._renderTimed({ format: 'none' })
    return { note: 'process exits right after this line without close()' }
  },
  // Out of memory (opt-in: PHASE4A_OOM=1): 8192² surfaces on one device until creation or render fails
  'out-of-memory': (b) => {
    const rs = []; let failure = null
    for (let i = 0; i < 64 && !failure; i++) {
      const a = attempt(() => { const r = make(b, '<body style="background:red">', { width: 8192, height: 8192, share: 'thread' }); rs.push(r); r._renderTimed({ format: 'none', readback: false }) })
      if (!a.ok) failure = { at: i, error: a.error }
    }
    const created = rs.length
    for (const r of rs) r.close()
    return { created, failure, after: renders(b) }
  },
}

if (process.argv[2] === '--child') {
  const [, , , probe, b] = process.argv
  console.log(JSON.stringify(PROBES[probe](b)))
  process.exit(0)
}

prepareAssets()
const rows = []
for (const probe of Object.keys(PROBES)) {
  if (probe === 'out-of-memory' && !process.env.PHASE4A_OOM) continue
  for (const b of probe === 'unsupported-backend' ? ['-'] : gpus) {
    const env = probe === 'init-failure' ? { CANVAS_HTML_GPU_DEVICE: '99' } : {}
    const c = child(self, ['--child', probe, b], { env, nodeArgs: ['--expose-gc'] })
    const row = { probe, backend: b, exitCode: c.code, signal: c.signal, crashed: c.code !== 0 || !!c.signal, result: c.json, stderr: c.code ? c.stderr : undefined }
    rows.push(row)
    log(probe.padEnd(26), b.padEnd(10), row.crashed ? `CRASH code=${c.code} signal=${c.signal} ${c.stderr.slice(-300)}` : JSON.stringify(c.json).slice(0, 400))
  }
}
writeResult('failures.json', { rows })
