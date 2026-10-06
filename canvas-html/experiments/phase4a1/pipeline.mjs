// Pipelined GPU readback (time-boxed experiment). For each GPU backend, animated scenes at 1080p
// and 4K, 120 frames through _renderFramesExperimental (the page's own seek(t) per frame, no Node
// round-trips between stages):
//   sync            render, wait, read back, frame by frame (the baseline, same batch loop)
//   deferred d1..4  ring of d surfaces; frame N read back synchronously after N+1.. submitted
//   pbo d1..4       GL only: glReadPixels into a pixel-pack buffer + fence right after submit
// Reports fps, per-stage medians, latency (submit → pixels in memory), peak RSS, GPU memory and
// sampled GPU utilization (nvidia-smi, where present), and the theoretical upper bound from the
// sync run: (GPU wait + readback) / frame. A check phase compares 30 frames of every mode with sync.
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { ANIMATED } from '../phase4a/lib/scenes.mjs'
import { make, stats, round, writeResult, child, log, buildDir, BACKENDS, MiB } from './lib/common.mjs'

const self = fileURLToPath(import.meta.url)
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 16)
const FRAMES = Number(process.env.PHASE4A1_PIPE_FRAMES ?? 120), FPS = 30
const SCENES = (process.env.PHASE4A1_PIPE_SCENES ?? 'effects,css').split(',')
const RES = { '1080p': 1.5, '4K': 3 }

function gpuSampler() {
  const p = spawn('nvidia-smi', ['--query-gpu=utilization.gpu,memory.used', '--format=csv,noheader,nounits', '-lms', '100'], { stdio: ['ignore', 'pipe', 'ignore'] })
  const util = [], memUsed = []
  p.on('error', () => {})
  p.stdout?.on('data', (d) => { for (const l of String(d).trim().split('\n')) { const [u, m] = l.split(',').map(Number); if (!Number.isNaN(u)) { util.push(u); memUsed.push(m) } } })
  return () => { p.kill(); return util.length ? { gpuUtilMeanPct: round(util.reduce((a, b) => a + b) / util.length, 1), gpuUtilMaxPct: Math.max(...util), gpuMemMaxMiB: Math.max(...memUsed) } : null }
}

if (process.argv[2] === '--child') {
  const [, , , backend, sceneId, resName, phase] = process.argv
  const scene = ANIMATED.find((s) => s.id === sceneId)
  const r = make(backend, fs.readFileSync(scene.file, 'utf8'), { dpr: RES[resName], scripts: true, url: pathToFileURL(scene.file).href })
  const bytes = r.pixelWidth * r.pixelHeight * 4
  const modes = [['sync', 1], ...[1, 2, 3, 4].map((d) => ['deferred', d]), ...(backend === 'gpu-gl' ? [1, 2, 3, 4].map((d) => ['pbo', d]) : [])]
  const out = { backend, scene: sceneId, res: resName, runs: [] }
  if (phase === 'check') {
    const times = Array.from({ length: 30 }, (_, i) => (i * 1000) / FPS)
    let ref = null
    for (const [mode, depth] of modes) {
      const targets = times.map(() => Buffer.alloc(bytes))
      r._renderFramesExperimental(times, targets, { mode, depth })
      const hashes = targets.map(sha)
      ref ??= hashes
      out.runs.push({ mode, depth, identicalToSync: hashes.every((h, i) => h === ref[i]), firstHash: hashes[0] })
    }
  } else {
    const times = Array.from({ length: FRAMES }, (_, i) => (i * 1000) / FPS)
    const targets = Array.from({ length: 4 }, () => Buffer.alloc(bytes))
    r._renderFramesExperimental(times.slice(0, 10), targets, { mode: 'sync' }) // warm-up
    for (const [mode, depth] of modes) {
      const stop = gpuSampler()
      const rss0 = process.memoryUsage().rss
      const res = r._renderFramesExperimental(times, targets, { mode, depth })
      const gpu = stop()
      const med = Object.fromEntries(Object.entries(res.seriesNs).map(([k, v]) => [k, round(stats(v.map((x) => x / 1e6)).median)]))
      const row = { mode, depth, fps: round(FRAMES / (res.totalNs / 1e9)), msPerFrame: round(res.totalNs / 1e6 / FRAMES), stageMedianMs: med, rssMiB: MiB(process.memoryUsage().rss), rssDeltaMiB: MiB(process.memoryUsage().rss - rss0), gpu }
      if (res.seriesNs.latency) row.latencyMs = round(stats(res.seriesNs.latency.map((x) => x / 1e6)))
      if (mode === 'sync') {
        const per = res.seriesNs.gpuWait.map((w, i) => (w + res.seriesNs.readback[i]) / 1e6)
        row.upperBound = { waitPlusReadbackMedianMs: round(stats(per).median), shareOfFrame: round(stats(per).median / row.msPerFrame) }
      }
      out.runs.push(row)
    }
  }
  r.close()
  console.log(JSON.stringify(out))
  process.exit(0)
}

const rows = []
for (const backend of BACKENDS.filter((b) => b.startsWith('gpu-'))) for (const sceneId of SCENES) for (const res of Object.keys(RES)) for (const phase of ['check', 'bench']) {
  if (phase === 'check' && res === '4K') continue
  const c = child(self, ['--child', backend, sceneId, res, phase], { env: { CANVAS_HTML_NODE: process.env.CANVAS_HTML_NODE ?? path.join(buildDir, 'gpu.node') } })
  const row = { phase, ...(c.json ?? { backend, scene: sceneId, res, crashed: true, code: c.code, signal: c.signal, stderr: c.stderr }) }
  rows.push(row)
  if (row.crashed) { log(phase, backend, sceneId, res, 'FAILED', c.code, c.signal, c.stderr.slice(-300)); continue }
  for (const x of row.runs) log(phase, backend, sceneId, res, `${x.mode}${x.depth > 1 || x.mode !== 'sync' ? ' d' + x.depth : ''}`.padEnd(12),
    phase === 'check' ? `identical to sync: ${x.identicalToSync}` : `${x.fps} fps (${x.msPerFrame} ms/frame)${x.latencyMs ? `, latency median ${x.latencyMs.median} ms` : ''}${x.upperBound ? `, upper bound ${(x.upperBound.shareOfFrame * 100).toFixed(0)}% of frame (${x.upperBound.waitPlusReadbackMedianMs} ms)` : ''}, rss ${x.rssMiB} MiB${x.gpu ? `, GPU ${x.gpu.gpuUtilMeanPct}% / ${x.gpu.gpuMemMaxMiB} MiB` : ''}`)
}
writeResult(`pipeline${process.env.PHASE4A1_SUFFIX ?? ''}.json`, { frames: FRAMES, fps: FPS, rows })
