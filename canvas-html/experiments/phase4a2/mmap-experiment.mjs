// Time-boxed allocator experiment: render()'s heap frame ("transfer") vs a frame in its own
// anonymous mapping ("mmap"), through _renderTimed. One process per (mode, case), --expose-gc.
//   speed: 4K and 1080p, scene A-like page, 60 frames, tight loop and with an event-loop turn per
//          frame (median ms per frame, wall time around the call)
//   retain: 100 4K frames retained, then dropped + turns + gc: RSS before/while/after
// node mmap-experiment.mjs   → evidence/mmap-experiment.json
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
const here = path.dirname(fileURLToPath(import.meta.url))
const addon = process.env.CANVAS_HTML_NODE ?? path.join(here, '../../canvas-html.linux-x64-gnu.node')
const HTML = '<body style="margin:0;background:#1e293b"><h1 style="color:#fff;font:60px sans-serif">frame</h1>'
const MiB = (b) => Math.round(b / 1048576)
const turn = () => new Promise((r) => setImmediate(r))
const med = (a) => [...a].sort((x, y) => x - y)[a.length >> 1]

if (process.argv[2] === '--child') {
  const [, , , mode, kind, dprArg, turnsArg] = process.argv
  const { HtmlRenderer } = createRequire(import.meta.url)(addon)
  const r = new HtmlRenderer({ width: 1280, height: 720, devicePixelRatio: +dprArg, systemFonts: false })
  r.load(HTML)
  const one = () => r._renderTimed({ output: mode }).pixels
  for (let i = 0; i < 3; i++) one()
  const settle = async () => { for (let i = 0; i < 10; i++) { globalThis.gc(); await turn() } }
  await settle()
  if (kind === 'speed') {
    const per = []
    for (let i = 0; i < 60; i++) {
      const t = performance.now(); one(); per.push(performance.now() - t)
      if (turnsArg === '1') await turn()
    }
    console.log(JSON.stringify({ mode, kind, dpr: +dprArg, turns: turnsArg === '1', medianMs: +med(per).toFixed(2), peakRssMiB: MiB(process.memoryUsage().rss) }))
  } else {
    const base = MiB(process.memoryUsage().rss)
    let kept = Array.from({ length: 100 }, one)
    const held = MiB(process.memoryUsage().rss)
    kept = null
    await settle()
    console.log(JSON.stringify({ mode, kind, dpr: +dprArg, rssBaselineMiB: base, rssRetainedMiB: held, rssAfterDropMiB: MiB(process.memoryUsage().rss), nativeInUseAfterDropMiB: MiB(r._nativeHeap().inUseBytes) }))
  }
  r.close()
  process.exit(0)
}

const rows = []
const run = (...a) => {
  const c = spawnSync(process.execPath, ['--expose-gc', fileURLToPath(import.meta.url), '--child', ...a], { encoding: 'utf8' })
  const row = JSON.parse(c.stdout.trim().split('\n').pop())
  rows.push(row); console.log(JSON.stringify(row))
}
for (let round = 0; round < 2; round++) for (const dpr of ['1.5', '3']) for (const turns of ['0', '1']) for (const mode of ['transfer', 'mmap']) run(mode, 'speed', dpr, turns)
for (const mode of ['transfer', 'mmap']) run(mode, 'retain', '3', '0')
fs.mkdirSync(path.join(here, 'evidence'), { recursive: true })
fs.writeFileSync(path.join(here, 'evidence', `mmap-experiment${process.env.SUFFIX ?? ''}.json`), JSON.stringify(rows, null, 1))
