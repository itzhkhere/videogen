// node test/speed-js.mjs [scene name in test/scenes] [frames]
import { createRequire } from 'node:module'
import fs from 'node:fs'
import { pathToFileURL, fileURLToPath } from 'node:url'
import path from 'node:path'
const { HtmlRenderer } = createRequire(import.meta.url)('../index.js')
const name = process.argv[2] || 'gsap', n = +process.argv[3] || 90
const f = path.join(path.dirname(fileURLToPath(import.meta.url)), 'scenes', `${name}.html`)
const r = new HtmlRenderer({ width: 1280, height: 720, scripts: true })
let t0 = performance.now()
r.load(fs.readFileSync(f, 'utf8'), pathToFileURL(f).href)
console.log(name, 'load', (performance.now() - t0).toFixed(0), 'ms')
let seekMs = 0, renderMs = 0
for (let i = 0; i < n; i++) {
  let s = performance.now(); r.call('seek', (i / 30) * 1000); seekMs += performance.now() - s
  s = performance.now(); r.render(); renderMs += performance.now() - s
}
console.log(name, 'fps', (n / ((seekMs + renderMs) / 1000)).toFixed(1), `(seek ${(seekMs / n).toFixed(1)} ms, render ${(renderMs / n).toFixed(1)} ms per frame)`, 'jsErrors', r.jsErrors.length)
