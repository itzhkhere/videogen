// Markdown tables from a Phase 4A.1 result set: node summarize.mjs <tag> > results/<tag>/summary.md
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const here = path.dirname(fileURLToPath(import.meta.url))
const tag = process.argv[2] ?? 'local'
const load = (n) => { try { return JSON.parse(fs.readFileSync(path.join(here, 'results', tag, n + '.json'), 'utf8')) } catch { return null } }
const f = (x, d = 1) => (x == null || Number.isNaN(x) ? '–' : Number(x).toFixed(d))
const table = (h, rows) => [`| ${h.join(' | ')} |`, `|${h.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n')
const out = []
const say = (s = '') => out.push(s)

const env = load('environment')
if (env) say(`**${tag}**: ${env.distro}, ${env.cpu}, ${env.memGiB} GiB, Node ${env.node}, GPU ${env.nvidiaSmi ?? 'none'}; ${Object.entries(env.backends ?? {}).map(([b, i]) => `${b}: ${i.device ?? i.error}`).join('; ')}\n`)

const tr = load('transport')
if (tr) {
  const rows = tr.rows.filter((r) => !r.crashed)
  for (const backend of [...new Set(rows.map((r) => r.backend))]) {
    say(`### Raw RGBA transport — ${backend} (median ms per frame, wall time around the JS call)`)
    const modes = ['old-render', 'render', 'clone', 'transfer', 'pool', 'pool-yield', 'into']
    const keys = [...new Set(rows.filter((r) => r.backend === backend).map((r) => `${r.scene}|${r.res}`))]
    say(table(['scene', 'res', ...modes], keys.map((k) => { const [s, res] = k.split('|'); return [s, res, ...modes.map((m) => { const x = rows.find((r) => r.backend === backend && r.scene === s && r.res === res && r.mode === m); return x?.error ? 'err' : f(x?.wallMs?.median, 2) })] })))
    say()
    say(`Breakdown (median ms): paint (CPU raster or GPU record) · readback · alloc (frame memory) · copy (clone) · buffer (JS Buffer creation in the call)`)
    say(table(['scene', 'res', 'mode', 'paint', 'gpuSubmit', 'gpuWait', 'readback', 'alloc', 'copy', 'buffer', 'rust total', 'wall'], rows.filter((r) => r.backend === backend && r.rust && ['old-timed', 'clone', 'transfer', 'pool', 'into'].includes(r.mode)).map((r) => {
      const m = (k) => f(r.rust[k]?.median, 2)
      return [r.scene, r.res, r.mode, m('paint'), m('gpuSubmit'), m('gpuWait'), m('readback'), m('alloc'), r.mode === 'old-timed' ? m('buffer') : m('copy'), r.mode === 'old-timed' ? '(in copy)' : m('buffer'), m('total'), f(r.wallMs.median, 2)]
    })))
    say()
  }
}

const an = load('animated')
if (an) {
  say('### Animated sequences, 1080p (frame = seek + output call)')
  say(table(['scene', 'frames', 'turns', 'backend', 'mode', 'avg', 'median', 'p95', 'total s', 'fps', 'peak RSS MiB'], an.rows.map((r) => r.crashed ? [r.scene, r.frames, r.yield, r.backend, r.mode, 'CRASH', '', '', '', '', ''] :
    [r.scene, r.frames, r.yield ? 'yes' : 'no', r.backend, r.mode, f(r.frameMs.mean, 2), f(r.frameMs.median, 2), f(r.frameMs.p95, 2), f(r.totalMs / 1000, 2), f(r.fps, 1), f(r.peakRssMiB, 0)])))
  say()
}

const pl = load('pipeline')
if (pl) {
  say('### Pipelined readback (120 frames, page seek per frame, no Node round-trips)')
  say(table(['backend', 'scene', 'res', 'mode', 'depth', 'fps', 'ms/frame', 'latency median', 'wait', 'readback', 'paint', 'submit', 'RSS MiB', 'GPU util % (mean/max)', 'GPU mem MiB', 'bound'], pl.rows.filter((r) => r.phase === 'bench' && !r.crashed).flatMap((r) => r.runs.map((x) =>
    [r.backend, r.scene, r.res, x.mode, x.depth, f(x.fps, 1), f(x.msPerFrame, 2), f(x.latencyMs?.median, 1), f(x.stageMedianMs.gpuWait, 2), f(x.stageMedianMs.readback, 2), f(x.stageMedianMs.paint, 2), f(x.stageMedianMs.gpuSubmit, 2), f(x.rssMiB, 0),
      x.gpu ? `${x.gpu.gpuUtilMeanPct}/${x.gpu.gpuUtilMaxPct}` : '–', x.gpu?.gpuMemMaxMiB ?? '–', x.upperBound ? `${f(x.upperBound.waitPlusReadbackMedianMs, 2)} ms = ${f(100 * x.upperBound.shareOfFrame, 0)}%` : '']))))
  say()
  const checks = pl.rows.filter((r) => r.phase === 'check' && !r.crashed)
  say(`Order/identity check (30 frames vs sync): ${checks.map((r) => `${r.backend}/${r.scene}: ${r.runs.every((x) => x.identicalToSync) ? 'all identical' : 'DIFFER ' + r.runs.filter((x) => !x.identicalToSync).map((x) => x.mode + x.depth).join(',')}`).join('; ')}\n`)
}

const mem = load('memory')
if (mem) {
  say('### Memory (RSS / Node external / native in-use MiB)')
  say(table(['kind', 'res', 'frames', 'backend', 'mode', 'samples'], mem.rows.map((r) => r.crashed ? [r.kind, r.res, r.frames, r.backend, r.mode, 'CRASH'] :
    [r.kind, r.res, r.frames, r.backend, r.mode, r.samples.map((s) => `${s.label}: ${f(s.rssMiB, 0)}/${f(s.externalMiB, 0)}/${s.nativeInUseMiB == null ? '–' : f(s.nativeInUseMiB, 0)}${s.expectedMiB ? ` (expected ${f(s.expectedMiB, 0)})` : ''}`).join('; ')])))
  say()
}

const wk = load('workers')
if (wk) {
  say('### Workers (effects 1080p, every frame delivered to the parent)')
  say(table(['backend', 'delivery', 'workers', 'fps', 'mismatches', 'missing', 'worker exits', 'process exit'], wk.rows.flatMap((r) => r.crashed ? [[r.backend, 'CRASH', '', '', '', '', '', r.processExit]] : r.runs.map((x) => [r.backend, x.mode, x.workers, f(x.fps, 1), x.mismatches, x.missing, x.exitCodes.join(','), r.processExit]))))
  say()
}

const lt = load('lifetimes')
if (lt) {
  say('### Ownership, lifetime and failure probes')
  say(table(['probe', 'backend', 'process', 'result'], lt.rows.map((r) => [r.probe, r.backend, r.crashed ? `CRASH ${r.signal ?? r.code}` : 'exit 0', '`' + JSON.stringify(r.result).replace(/\|/g, '/').slice(0, 300) + '`'])))
  say()
}
process.stdout.write(out.join('\n') + '\n')
