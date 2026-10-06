// Memory per backend, each in its own process (--expose-gc):
//   baseline (addon loaded) → GPU initialized (1 renderer, nothing loaded) → 1 / 4 / 8 renderers
//   rendering scene C (images) at 1080p → after close + gc.
// Reported: RSS, V8 heap/external, nvidia-smi per-process and device memory (where present),
// and Skia's GPU resource cache bytes. Plus growth checks: 300 animated frames on one renderer
// and 30 create/render/close cycles.
import fs from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { SCENES, ANIMATED, BACKENDS, prepareAssets } from './lib/scenes.mjs'
import { make, expectBackend, writeResult, child, nvidiaProcessMiB, log } from './lib/common.mjs'

const DPR = 1.5
const self = fileURLToPath(import.meta.url)

function snapshot(label, rs = [], shared = false) {
  globalThis.gc?.()
  const m = process.memoryUsage()
  const infos = rs.map((r) => r._backendInfo())
  return {
    label, rssMiB: +(m.rss / 2 ** 20).toFixed(1), heapMiB: +(m.heapUsed / 2 ** 20).toFixed(1), externalMiB: +(m.external / 2 ** 20).toFixed(1),
    gpu: nvidiaProcessMiB(), // a shared device reports the same cache to each renderer: count it once
    skiaGpuResourceMiB: +((shared ? Math.max(0, ...infos.map((i) => i.gpuResourceBytes ?? 0)) : infos.reduce((a, i) => a + (i.gpuResourceBytes ?? 0), 0)) / 2 ** 20).toFixed(1),
    devices: new Set(infos.map((i) => i.device).filter(Boolean)).size,
  }
}

if (process.argv[2] === '--child') {
  const [, , , b, share] = process.argv
  const html = SCENES.find((s) => s.id === 'C').html()
  const opt = { dpr: DPR, share: b === 'cpu' ? undefined : share }
  const steps = [snapshot('baseline')]
  const init = make(b, null, opt)
  steps.push(snapshot('gpu initialized (1 renderer, empty)', [init]))
  init.close()
  const rs = []
  for (const k of [1, 4, 8]) {
    while (rs.length < k) { const r = make(b, html, opt); for (let i = 0; i < 3; i++) expectBackend(r._renderTimed({ format: 'rgba' }), b); rs.push(r) }
    steps.push(snapshot(`${k} renderer${k > 1 ? 's' : ''}`, rs, share === 'thread'))
  }
  for (const r of rs) r.close()
  steps.push(snapshot('after close'))
  // Growth: 300 animated frames on one renderer
  const g = ANIMATED.find((s) => s.id === 'effects')
  const a = make(b, fs.readFileSync(g.file, 'utf8'), { ...opt, scripts: true, url: pathToFileURL(g.file).href })
  const anim = []
  for (let i = 0; i < 300; i++) {
    a.call('seek', (i * 1000) / 30); a._renderTimed({ format: 'none', readback: true })
    if (i % 100 === 0 || i === 299) anim.push({ frame: i, ...snapshot('', [a]) })
  }
  a.close()
  // Growth: 30 create/render/close cycles
  const cycles = []
  for (let i = 0; i < 30; i++) {
    const r = make(b, html, opt); r._renderTimed({ format: 'none' }); r.close()
    if (i % 10 === 9) cycles.push({ cycle: i + 1, ...snapshot('') })
  }
  console.log(JSON.stringify({ backend: b, share, steps, anim, cycles }))
  process.exit(0)
}

prepareAssets()
const rows = []
for (const b of BACKENDS) for (const share of b === 'cpu' ? ['-'] : ['renderer', 'thread']) {
  const c = child(self, ['--child', b, share], { nodeArgs: ['--expose-gc'], timeout: 1800000 })
  const row = c.json ?? { backend: b, share, crashed: true, code: c.code, signal: c.signal, stderr: c.stderr }
  rows.push(row)
  if (row.crashed) { log(b, share, 'FAILED', c.code, c.signal, c.stderr.slice(-300)); continue }
  log(b.padEnd(10), share.padEnd(8), row.steps.map((s) => `${s.label}: rss ${s.rssMiB}${s.gpu ? ` gpu ${s.gpu.processMiB}` : ''} skia ${s.skiaGpuResourceMiB}`).join(' | '))
  log(' '.repeat(19), 'anim rss', row.anim.map((s) => s.rssMiB).join('→'), '| cycles rss', row.cycles.map((s) => s.rssMiB).join('→'))
}
writeResult('memory.json', { dpr: DPR, scene: 'C', rows })
