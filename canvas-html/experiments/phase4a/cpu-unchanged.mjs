// The CPU path must be unchanged: render scenes A–G (720p, 1080p) and test/scenes/* (seek 0,
// 500, 1500 ms) with two addons through the production render() API, in separate processes,
// and compare hashes. Usage: node cpu-unchanged.mjs <before.node> <after.node>
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { SCENES, RESOLUTIONS, prepareAssets, baseUrl, repo } from './lib/scenes.mjs'

if (process.argv[2] === '--child') {
  const { HtmlRenderer } = createRequire(import.meta.url)(process.argv[3])
  const out = {}
  const h = (b) => createHash('sha256').update(b).digest('hex').slice(0, 16)
  for (const res of RESOLUTIONS.slice(0, 2)) for (const s of SCENES) {
    const r = new HtmlRenderer({ width: 1280, height: 720, devicePixelRatio: res.dpr, systemFonts: false })
    r.load(s.html(), baseUrl); out[`${s.id}@${res.name}`] = h(r.render()); r.close?.()
  }
  const dir = path.join(repo, 'test', 'scenes')
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.html'))) {
    const r = new HtmlRenderer({ width: 1280, height: 720, scripts: true })
    r.load(fs.readFileSync(path.join(dir, f), 'utf8'), pathToFileURL(path.join(dir, f)).href)
    for (const t of [0, 500, 1500]) { r.eval(`window.seek(${t})`); out[`${f}@${t}`] = h(r.render()) }
    r.close?.()
  }
  console.log(JSON.stringify(out))
  process.exit(0)
}
prepareAssets()
const run = (addon) => JSON.parse(spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--child', path.resolve(addon)], { encoding: 'utf8', maxBuffer: 1 << 26 }).stdout.trim().split('\n').pop())
const a = run(process.argv[2]), b = run(process.argv[3])
const keys = Object.keys(a)
const diff = keys.filter((k) => a[k] !== b[k])
console.log(`${keys.length} frames compared, ${diff.length} differ${diff.length ? ': ' + diff.join(', ') : ''}`)
fs.writeFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'evidence', 'cpu-unchanged.json'), JSON.stringify({ before: process.argv[2], after: process.argv[3], frames: keys.length, differ: diff, hashes: a }, null, 2) + '\n')
if (diff.length) process.exit(1)
