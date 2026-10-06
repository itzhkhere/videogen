// Turns result sets into Markdown tables (for PHASE4A_RESULTS.md).
//   node summarize.mjs <tag> [<tag> ...] > results/summary.md
// Rows of later tags are added for their GPU backends only (their CPU rows are a repeat run,
// reported separately as CPU run-to-run variation).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const tags = process.argv.slice(2)
const load = (tag, name) => { try { return JSON.parse(fs.readFileSync(path.join(here, 'results', tag, name + '.json'), 'utf8')) } catch { return null } }
const merged = (name, rowsOf = (d) => d.rows) => {
  const out = []
  tags.forEach((tag, i) => { const d = load(tag, name); if (d) for (const r of rowsOf(d)) if (i === 0 || r.backend !== 'cpu') out.push({ ...r, tag }) })
  return out
}
const f = (x, d = 1) => (x == null || Number.isNaN(x) ? '–' : Number(x).toFixed(d))
const table = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n')
const BACK = ['cpu', 'gpu-gl', 'gpu-vulkan', 'gpu-graphite']
const label = { cpu: 'CPU raster', 'gpu-gl': 'Ganesh GL', 'gpu-vulkan': 'Ganesh Vulkan', 'gpu-graphite': 'Graphite Vulkan' }
const out = []
const say = (s = '') => out.push(s)

// ---------------------------------------------------------------- environment
for (const tag of tags) {
  const e = load(tag, 'environment')
  if (!e) continue
  say(`**${tag}**: ${e.distro}, ${e.cpu}, ${e.memGiB} GiB, Node ${e.node}, GPU ${e.nvidiaSmi ?? 'none'}; addon ${path.basename(e.addon)} (${f(e.addonBytes / 2 ** 20)} MiB)`)
  for (const [b, i] of Object.entries(e.backends)) say(`- ${b}: ${i.device ?? i.error}`)
  say()
}

// ---------------------------------------------------------------- correctness
const corr = tags.map((t) => [t, load(t, 'correctness')]).filter(([, d]) => d)
if (corr.length) {
  say('### Correctness (CPU vs GPU, severity / % pixels differing / max delta / % pixels with delta > 32)')
  for (const res of ['720p', '1080p', '4K']) {
    const scenes = Object.keys(corr[0][1].resolutions[res] ?? {})
    if (!scenes.length) continue
    const gpus = corr.flatMap(([, d]) => Object.keys(d.resolutions[res][scenes[0]]).filter((k) => k.startsWith('cpu-vs-')))
    say(`\n${res}\n`)
    say(table(['scene', ...gpus.map((g) => g.replace('cpu-vs-', ''))], scenes.map((s) => [s, ...gpus.map((g) => {
      const c = corr.map(([, d]) => d.resolutions[res][s][g]).find(Boolean)
      return `${c.severity} / ${f(c.differingPct, 2)} / ${c.maxDelta} / ${f(c.over32Pct, 3)}`
    })])))
  }
  say('\nAttribution (720p, by ablation)\n')
  say(table(['scene', ...corr.map(([t]) => t)], Object.keys(corr[0][1].attribution).map((s) => [s, ...corr.map(([, d]) => {
    const a = d.attribution[s]
    if (!a?.ablations) return a?.class ?? '–'
    const top = Object.entries(a.ablations).sort((x, y) => y[1].removedShare - x[1].removedShare)[0]
    return `${a.class} (${top[0]} removes ${f(100 * top[1].removedShare, 0)}%)`
  })])))
  say()
}

// ---------------------------------------------------------------- bench
const bench = merged('bench')
if (bench.length) {
  const get = (s, r, b) => bench.find((x) => x.scene === s && x.res === r && x.backend === b)
  const scenes = [...new Set(bench.map((x) => x.scene))]
  const backs = BACK.filter((b) => bench.some((x) => x.backend === b))
  for (const res of ['720p', '1080p', '4K']) {
    if (!bench.some((x) => x.res === res)) continue
    say(`### ${res}: median ms per frame, RGBA output (no-readback in brackets); speed-up vs CPU`)
    say(table(['scene', ...backs.map((b) => label[b])], scenes.map((s) => {
      const cpu = get(s, res, 'cpu')?.rgba?.total.median
      return [s, ...backs.map((b) => {
        const r = get(s, res, b)
        if (!r) return '–'
        if (r.error) return 'error'
        const t = r.rgba.total.median
        return `${f(t)} [${f(r.none.total.median)}]${b === 'cpu' ? '' : ` ×${f(cpu / t, 2)}`}`
      })]
    })))
    say()
    say(`${res} breakdown (median ms): resolve · paintPrep · paint(record) · submit · wait · readback · buffer · total · png encode · first frame · create`)
    say(table(['scene', 'backend', 'resolve', 'prep', 'paint', 'submit', 'wait', 'readback', 'buffer', 'total', 'cv', 'png', 'first', 'create'],
      scenes.flatMap((s) => backs.map((b) => {
        const r = get(s, res, b)
        if (!r || r.error) return [s, b, r?.error ?? '–', '', '', '', '', '', '', '', '', '', '', '']
        const m = (k) => f(r.rgba[k]?.median, 2)
        return [s, b, m('resolve'), f(r.prep.paintPrep?.median, 2), m('paint'), m('gpuSubmit'), m('gpuWait'), m('readback'), m('buffer'), m('total'), f(r.rgba.total.cv, 2), f(r.png.png?.median, 1), f(r.first.total, 1), f(r.createMs, 1)]
      }))))
    say()
  }
  // CPU repeat (second tag) for run-to-run variation
  for (const tag of tags.slice(1)) {
    const d = load(tag, 'bench')
    if (!d) continue
    const pairs = d.rows.filter((r) => r.backend === 'cpu' && !r.error).map((r) => [r, get(r.scene, r.res, 'cpu')]).filter(([, a]) => a)
    const ratios = pairs.map(([r, a]) => r.rgba.total.median / a.rgba.total.median)
    if (ratios.length) say(`CPU repeat run (${tag}) vs first run: median ratio ${f(ratios.sort((x, y) => x - y)[ratios.length >> 1], 3)}, range ${f(Math.min(...ratios), 3)}–${f(Math.max(...ratios), 3)} over ${ratios.length} scene/resolution pairs.\n`)
  }
}

// ---------------------------------------------------------------- animated
const anim = merged('animated')
if (anim.length) {
  say('### Animated sequences, 1080p, 30 fps (frame = seek + render; ms)')
  say(table(['scene', 'frames', 'backend', 'avg', 'median', 'p95', 'total s', 'fps', 'no-readback median', 'png median (encode only)', 'vs CPU frames'],
    anim.map((r) => r.error ? [r.scene, r.frames, r.backend, r.error, '', '', '', '', '', '', ''] : [r.scene, r.frames, r.backend, f(r.rgba.frameMs.mean, 2), f(r.rgba.frameMs.median, 2), f(r.rgba.frameMs.p95, 2), f(r.rgba.totalMs / 1000, 2), f(r.rgba.fps, 1),
      r.none ? f(r.none.frameMs.median, 2) : '', r.png ? f(r.png.steps.png?.median, 2) : '', r.vsCpu ? Object.values(r.vsCpu).map((c) => c.severity).join(', ') : ''])))
  say()
}

// ---------------------------------------------------------------- contexts
const ctx = merged('contexts')
if (ctx.length) {
  say('### Resource reuse, 1080p (median ms per frame; create/load/render/close for new renderers)')
  say(table(['scene', 'backend', 'mode', 'frame', 'create', 'load', 'render', 'close'], ctx.map((r) => r.error ? [r.scene, r.backend, r.mode, r.error, '', '', '', ''] :
    [r.scene, r.backend, r.mode, f(r.frame.median, 1), f(r.create?.median, 1), f(r.load?.median, 1), f(r.render.median, 1), f(r.close?.median, 1)])))
  say()
}

// ---------------------------------------------------------------- multi
const multi = merged('multi')
if (multi.length) {
  say('### Several renderers on one thread (scene E, 1080p, round-robin)')
  say(table(['backend', 'device', 'renderers', 'create all ms', 'fps', 'frame median', 'RSS MiB base→loaded→closed', 'GPU MiB (process, loaded→closed)', 'Skia GPU cache MiB', 'close all ms', 'exit'],
    multi.map((r) => r.crashed ? [r.backend, r.share, r.renderers, `CRASH ${r.signal ?? r.code}`, '', '', '', '', '', '', r.exitCode] :
      [r.backend, r.share, r.renderers, f(r.createAllMs, 0), f(r.fps, 1), f(r.frameMs.median, 1), `${f(r.rssBaselineMiB, 0)}→${f(r.rssLoadedMiB, 0)}→${f(r.rssClosedMiB, 0)}`,
        r.gpuLoaded ? `${r.gpuLoaded.processMiB ?? '–'}→${r.gpuClosed?.processMiB ?? '–'}` : '–', f((r.gpuResourceBytes ?? r.gpuResourceBytesSum ?? 0) / 2 ** 20, 0), f(r.closeAllMs, 0), r.exitCode])))
  say()
}

// ---------------------------------------------------------------- workers
const workers = merged('workers')
if (workers.length) {
  say('### Worker threads (effects scene, 1080p; each worker owns its renderer and device)')
  say(table(['backend', 'workers', 'wall ms', 'fps', 'create median ms', 'close median ms', 'frames ≠ 1-worker run', 'distinct devices'],
    workers.flatMap((r) => r.crashed ? [[r.backend, `CRASH ${r.signal ?? r.code}`, '', '', '', '', '', '']] : r.runs.map((x) => [r.backend, x.workers, f(x.wallMs, 0), f(x.fps, 1), f(x.createMs.median, 0), f(x.closeMs.median, 1), x.mismatchesVsOneWorker, x.distinctDevices]))))
  say()
  say(workers.filter((r) => !r.crashed).map((r) => `- ${r.backend}: terminate() of 2 rendering workers → exit codes ${r.terminateProbe.exitCodes.join(', ')}; rendering afterwards correct: ${r.terminateProbe.renderAfterTerminate}; process exit ${r.exitCode}`).join('\n'))
  say()
}

// ---------------------------------------------------------------- determinism
const det = tags.map((t) => [t, load(t, 'determinism')]).filter(([, d]) => d)
if (det.length) {
  say('### Determinism (1080p)')
  const rows = []
  det.forEach(([t, d], i) => {
    for (const [b, r] of Object.entries(d.backends)) {
      if (i > 0 && b === 'cpu') continue
      const fresh = Object.entries(r.fresh).map(([s, v]) => (v.identical ? s : `${s}✗`)).join(' ')
      const same = Object.entries(r.longLived).map(([s, v]) => `${s}:${v.sameDocument.matchesFresh ? 'same' : 'DIFF'}`).join(' ')
      const rel = Object.entries(r.longLived).map(([s, v]) => `${s}:${v.reloaded.matchesFresh ? 'same' : `${v.reloaded.worstVsFresh.severity} (max ${v.reloaded.worstVsFresh.maxDelta}, ${f(v.reloaded.worstVsFresh.differingPct, 3)}%)`}`).join(' ')
      rows.push([b, `5/5 identical: ${fresh}`, r.processesIdentical ? '3/3 identical' : 'differ', same, rel, `${r.animation.replayVsReplay}/60 (first play vs replay: ${r.animation.firstPlayVsReplay})`])
    }
  })
  say(table(['backend', 'fresh instances', 'fresh processes (E)', 'long-lived, same document', 'long-lived, reloaded', 'GSAP replay mismatches'], rows))
  say()
}

// ---------------------------------------------------------------- memory
const mem = merged('memory')
if (mem.length) {
  say('### Memory (scene C, 1080p): RSS MiB / GPU process MiB / Skia GPU cache MiB')
  const labels = mem.find((r) => !r.crashed)?.steps.map((s) => s.label) ?? []
  say(table(['backend', 'device', ...labels, '300 anim frames (RSS)', '30 cycles (RSS)'], mem.map((r) => r.crashed ? [r.backend, r.share, `CRASH ${r.signal ?? r.code}`] :
    [r.backend, r.share, ...r.steps.map((s) => `${f(s.rssMiB, 0)} / ${s.gpu?.processMiB ?? '–'} / ${f(s.skiaGpuResourceMiB, 0)}`), r.anim.map((s) => f(s.rssMiB, 0)).join('→'), r.cycles.map((s) => f(s.rssMiB, 0)).join('→')])))
  say()
}

// ---------------------------------------------------------------- fonts
const fonts = merged('fonts')
if (fonts.length) {
  say('### Font retention (scene B, 40 iterations): RSS MiB every 10 iterations')
  say(table(['backend', 'mode', 'RSS', 'after close', 'Skia font cache MiB', 'after purge'], fonts.map((r) => r.crashed ? [r.backend, r.mode, 'CRASH'] :
    [r.backend, r.mode, r.points.map((p) => f(p.rssMiB, 0)).join('→'), f(r.rssAfterCloseMiB, 0), f(r.purge.fontCacheBytesBefore / 2 ** 20, 1), f(r.rssAfterPurgeMiB, 0)])))
  say()
}

// ---------------------------------------------------------------- failures
const fail = merged('failures')
if (fail.length) {
  say('### Failure probes')
  say(table(['probe', 'backend', 'process', 'result'], fail.map((r) => [r.probe, r.backend, r.crashed ? `CRASH ${r.signal ?? r.code}` : 'exit 0', '`' + JSON.stringify(r.result).replace(/\|/g, '/').slice(0, 260) + '`'])))
  say()
}
process.stdout.write(out.join('\n') + '\n')
