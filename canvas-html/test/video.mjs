// node test/video.mjs <out.mp4> [scene path relative to test/] [duration ms]
import { createRequire } from 'node:module'
import fs from 'node:fs'
import { encode } from './encode.mjs'
const { HtmlRenderer } = createRequire(import.meta.url)('../index.js')
const [out = 'out.mp4', scene = 'scenes/motion.html', duration = '6000'] = process.argv.slice(2)
const file = new URL(scene, import.meta.url)
const r = new HtmlRenderer({ width: 1280, height: 720, background: '#000000', scripts: true })
r.load(fs.readFileSync(file, 'utf8'), new URL('.', file).href)
const res = await encode(r, { fps: 30, durationMs: Number(duration), output: out })
console.log({ ...res, loadErrors: r.loadErrors, jsErrors: r.jsErrors })
