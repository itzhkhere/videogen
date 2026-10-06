// Output regression, Phase 4A.1 build → Phase 4A.2 build, on one backend: scenes A–G1000
// (720p, 1080p; render() only, as in Phase 4A's cpu-unchanged.mjs) and test/scenes/* (page seek
// 0, 500, 1500 ms). The 4A.2 build renders every frame twice, with render() and renderInto().
// Every hash must be equal: before.render == after.render == after.renderInto.
// node output-regression.mjs <before.node> <after.node> <cpu|gpu-gl|gpu-vulkan> [tag]
//   → evidence/output-regression-<backend>[-tag].json
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { SCENES, RESOLUTIONS, prepareAssets, baseUrl, repo } from '../phase4a/lib/scenes.mjs'
const here = path.dirname(fileURLToPath(import.meta.url))

if (process.argv[2] === '--child') {
  const [, , , addon, backend, into] = process.argv
  const { HtmlRenderer } = createRequire(import.meta.url)(addon)
  const opts = backend === 'cpu' ? {} : { experimentalBackend: backend }
  const out = {}
  const h = (b) => createHash('sha256').update(b).digest('hex').slice(0, 16)
  const frame = (r) => {
    if (into !== '1') return h(r.render())
    const t = Buffer.alloc(r.frameByteLength)
    r.renderInto(t)
    return h(t)
  }
  for (const res of RESOLUTIONS.slice(0, 2)) for (const s of SCENES) {
    const r = new HtmlRenderer({ width: 1280, height: 720, devicePixelRatio: res.dpr, systemFonts: false, ...opts })
    r.load(s.html(), baseUrl); out[`${s.id}@${res.name}`] = frame(r); r.close()
  }
  const dir = path.join(repo, 'test', 'scenes')
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.html')).sort()) {
    const r = new HtmlRenderer({ width: 1280, height: 720, scripts: true, ...opts })
    r.load(fs.readFileSync(path.join(dir, f), 'utf8'), pathToFileURL(path.join(dir, f)).href)
    for (const t of [0, 500, 1500]) { r.eval(`window.seek(${t})`); out[`${f}@${t}`] = frame(r) }
    r.close()
  }
  console.log(JSON.stringify(out))
  process.exit(0)
}

const [before, after, backend = 'cpu', tag] = process.argv.slice(2)
prepareAssets()
const run = (addon, into) => {
  const c = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--child', path.resolve(addon), backend, into], { encoding: 'utf8', maxBuffer: 1 << 26 })
  if (c.status !== 0) { console.error(c.stderr.slice(-1500)); process.exit(2) }
  return JSON.parse(c.stdout.trim().split('\n').pop())
}
const a = run(before, '0'), b = run(after, '0'), c = run(after, '1')
const keys = Object.keys(a)
const renderDiff = keys.filter((k) => a[k] !== b[k]), intoDiff = keys.filter((k) => b[k] !== c[k])
console.log(`${backend}: ${keys.length} frames; 4A.1 render() vs 4A.2 render(): ${renderDiff.length} differ${renderDiff.length ? ' (' + renderDiff.join(', ') + ')' : ''}; 4A.2 render() vs renderInto(): ${intoDiff.length} differ${intoDiff.length ? ' (' + intoDiff.join(', ') + ')' : ''}`)
fs.mkdirSync(path.join(here, 'evidence'), { recursive: true })
fs.writeFileSync(path.join(here, 'evidence', `output-regression-${backend}${tag ? '-' + tag : ''}.json`),
  JSON.stringify({ backend, before, after, frames: keys.length, renderDiffers: renderDiff, renderIntoDiffers: intoDiff, hashes: b }, null, 1) + '\n')
if (renderDiff.length || intoDiff.length) process.exit(1)
