// Animated sequences at 1080p (dpr 1.5), 30 fps, 120 and 300 frames: old vs new output path.
// Frame = page seek(ms) (JS + animation update) + the output call. One process per
// (backend, output path), so allocator and GC state never leak between paths.
//   old-render     Phase 4A addon, render()                (paint → clone → Buffer)
//   render         new addon, render()                     (Design A: frame handed to Node)
//   render-clone   new addon, render() with CANVAS_HTML_OUTPUT=clone (Phase 4A path, new code)
//   into           new addon, _renderInto into one reused Buffer      (Design C)
//   into-ring3     new addon, _renderInto into 3 Buffers in turn       (Design C, consumer ring)
// "yield" rows give Node an event-loop turn after every frame (a consumer writing to a stream).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { ANIMATED } from '../phase4a/lib/scenes.mjs'
import { make, stats, round, writeResult, child, log, turn, buildDir, BACKENDS, MiB } from './lib/common.mjs'

const self = fileURLToPath(import.meta.url)
const DPR = 1.5, FPS = 30
const LENGTHS = (process.env.PHASE4A1_ANIM_FRAMES ?? '120,300').split(',').map(Number)
const SCENES = (process.env.PHASE4A1_ANIM ?? 'effects,css,gsap').split(',')
const MODES = (process.env.PHASE4A1_ANIM_MODES ?? 'old-render,render,render-clone,into,into-ring3').split(',')

if (process.argv[2] === '--child') {
  const [, , , backend, mode, sceneId, frames, yieldArg] = process.argv
  const scene = ANIMATED.find((s) => s.id === sceneId)
  const r = make(backend, fs.readFileSync(scene.file, 'utf8'), { dpr: DPR, scripts: true, url: pathToFileURL(scene.file).href })
  const bytes = r.pixelWidth * r.pixelHeight * 4
  const ring = mode.startsWith('into') ? Array.from({ length: mode === 'into-ring3' ? 3 : 1 }, () => Buffer.alloc(bytes)) : null
  for (let i = 0; i < 3; i++) { r.call('seek', i * 100); r.render() } // warm-up (shaders, caches)
  const per = []
  let peak = 0, check = 0
  const t0 = performance.now()
  for (let i = 0; i < +frames; i++) {
    const s = performance.now()
    r.call('seek', (i * 1000) / FPS)
    let buf
    if (ring) { buf = ring[i % ring.length]; r._renderInto(buf) } else buf = r.render()
    check ^= buf[(i * 4099) % bytes]
    per.push(performance.now() - s)
    if (i % 10 === 0) peak = Math.max(peak, process.memoryUsage().rss)
    if (yieldArg === '1') await turn()
  }
  const totalMs = performance.now() - t0
  const backendName = r._backendInfo().backend
  r.close()
  console.log(JSON.stringify({ frameMs: round(stats(per)), totalMs: round(totalMs), fps: round(+frames / (totalMs / 1000)), peakRssMiB: MiB(peak), backendName, check }))
  process.exit(0)
}

const rows = []
for (const backend of BACKENDS) {
  const gpu = backend !== 'cpu'
  for (const sceneId of SCENES) for (const frames of LENGTHS) for (const y of frames === Math.max(...LENGTHS) && sceneId === 'effects' ? [0, 1] : [0]) for (const mode of MODES) {
    const env = {}
    if (mode === 'old-render') env.CANVAS_HTML_NODE = path.join(buildDir, gpu ? 'phase4a-gpu.node' : 'phase4a-cpu.node')
    else if (gpu) env.CANVAS_HTML_NODE = process.env.CANVAS_HTML_NODE ?? path.join(buildDir, 'gpu.node')
    if (mode === 'render-clone') env.CANVAS_HTML_OUTPUT = 'clone'
    const c = child(self, ['--child', backend, mode, sceneId, String(frames), String(y)], { env })
    const row = { backend, scene: sceneId, frames, yield: y, mode, ...(c.json ?? { crashed: true, code: c.code, signal: c.signal, stderr: c.stderr }) }
    rows.push(row)
    log(sceneId, frames, `y${y}`, backend, mode.padEnd(13), row.crashed ? `FAILED ${c.stderr.slice(-300)}` : `median ${row.frameMs.median} p95 ${row.frameMs.p95} total ${row.totalMs} ms (${row.fps} fps) peak RSS ${row.peakRssMiB} MiB`)
  }
}
writeResult(`animated${process.env.PHASE4A1_SUFFIX ?? ''}.json`, { dpr: DPR, fps: FPS, rows })
