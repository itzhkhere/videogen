// Raw RGBA frame transport: old (Phase 4A) vs new output path, scenes A, C, E, F, G1000 at
// 720p / 1080p / 4K, per backend. Each addon runs in its own process.
//   old-render     Phase 4A addon, public render()            (paint → clone → Buffer)
//   old-timed      Phase 4A addon, _renderTimed rgba          (its breakdown: buffer = clone + Buffer)
//   render         new addon, public render()                 (Design A: Vec handed to Node)
//   clone          new addon, _renderTimed output "clone"     (Phase 4A path, new breakdown)
//   transfer       new addon, _renderTimed output "transfer"  (Design A, breakdown)
//   pool           new addon, _renderTimed output "pool" (3)  tight loop (no event-loop turns)
//   pool-yield     same, with an event-loop turn after each frame (finalizers can run)
//   into           new addon, _renderInto(reused Buffer)      (Design C)
// "wall" = time around the JS call; Rust's "total" excludes returning the Buffer to JS.
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { SCENES, RESOLUTIONS, prepareAssets, baseUrl } from '../phase4a/lib/scenes.mjs'
import { make, stats, round, timingStats, writeResult, child, log, turn, buildDir, BACKENDS, environment } from './lib/common.mjs'

const self = fileURLToPath(import.meta.url)
const N = { '720p': 20, '1080p': 15, '4K': 10 }
const WARM = 3
const SCENE_IDS = (process.env.PHASE4A1_SCENES ?? 'A,C,E,F,G1000').split(',')
const RES = (process.env.PHASE4A1_RES ?? '720p,1080p,4K').split(',')
const scale = Number(process.env.PHASE4A1_FRAMES ?? 1)

async function runMode(r, mode, n, frameBytes) {
  const wall = [], rust = []
  let last = null
  const target = mode === 'into' ? Buffer.alloc(frameBytes) : null
  for (let i = 0; i < WARM + n; i++) {
    const t0 = performance.now()
    let out
    switch (mode) {
      case 'old-render': case 'render': last = r.render(); break
      case 'old-timed': out = r._renderTimed({ format: 'rgba' }); last = out.pixels; break
      case 'clone': case 'transfer': out = r._renderTimed({ output: mode }); last = out.pixels; break
      case 'pool': case 'pool-yield': out = r._renderTimed({ output: 'pool', poolSize: 3 }); last = out.pixels; break
      case 'into': out = r._renderInto(target); last = target; break
    }
    const w = performance.now() - t0
    if (last.length !== frameBytes) throw new Error(`${mode}: ${last.length} bytes, expected ${frameBytes}`)
    if (i >= WARM) { wall.push(w); if (out) rust.push(out.timingsNs) }
    if (mode === 'pool-yield') await turn()
  }
  const res = { wallMs: round(stats(wall)) }
  if (rust.length) res.rust = timingStats(rust)
  if (mode.startsWith('pool')) res.pool = r._poolStats()
  return res
}

if (process.argv[2] === '--child') {
  const [, , , backend, modesArg] = process.argv
  const modes = modesArg.split(',')
  prepareAssets()
  const rows = []
  for (const id of SCENE_IDS) {
    const html = SCENES.find((s) => s.id === id).html()
    for (const res of RESOLUTIONS.filter((x) => RES.includes(x.name))) {
      const r = make(backend, html, { dpr: res.dpr })
      const frameBytes = res.w * res.h * 4
      const n = Math.max(4, Math.round(N[res.name] * scale))
      for (const mode of modes) {
        try { rows.push({ scene: id, res: res.name, backend, mode, ...(await runMode(r, mode, n, frameBytes)) }) }
        catch (e) { rows.push({ scene: id, res: res.name, backend, mode, error: String(e.message ?? e) }) }
      }
      r.close()
    }
  }
  console.log(JSON.stringify({ rows }))
  process.exit(0)
}

prepareAssets()
const rows = []
for (const backend of BACKENDS) {
  const gpu = backend !== 'cpu'
  const runs = [
    { addon: path.join(buildDir, gpu ? 'phase4a-gpu.node' : 'phase4a-cpu.node'), modes: 'old-render,old-timed' },
    { addon: process.env.CANVAS_HTML_NODE ?? (gpu ? path.join(buildDir, 'gpu.node') : undefined), modes: 'render,clone,transfer,pool,pool-yield,into' },
  ]
  for (const run of runs) {
    const c = child(self, ['--child', backend, run.modes], { env: run.addon ? { CANVAS_HTML_NODE: run.addon } : {} })
    if (!c.json) { log(backend, run.modes, 'FAILED', c.code, c.signal, c.stderr.slice(-500)); rows.push({ backend, modes: run.modes, crashed: true, code: c.code, signal: c.signal }); continue }
    rows.push(...c.json.rows)
    for (const x of c.json.rows) log(x.scene, x.res, backend, x.mode.padEnd(10), x.error ?? `wall ${x.wallMs.median} ms` + (x.rust ? ` (paint ${x.rust.paint?.median}, readback ${x.rust.readback?.median}, alloc ${x.rust.alloc?.median ?? '-'}, copy ${x.rust.copy?.median ?? x.rust.buffer?.median}, buffer ${x.rust.buffer?.median ?? '-'}, rust total ${x.rust.total?.median})` : ''))
  }
}
writeResult(`transport${process.env.PHASE4A1_SUFFIX ?? ''}.json`, { env: environment(BACKENDS), warmup: WARM, frames: N, scale, rows })
