// What bytes does a frame contain? Renders small pages with known colours on each backend and
// reads pixels back: channel order, row order, alpha byte with an opaque / transparent /
// translucent `background`, and translucent page content over each.
// node pixel-format.mjs [cpu,gpu-gl,gpu-vulkan]   (GPU: CANVAS_HTML_NODE=build/gpu.node)
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const here = path.dirname(fileURLToPath(import.meta.url))
const { HtmlRenderer } = require(process.env.CANVAS_HTML_NODE ?? path.join(here, '../../canvas-html.linux-x64-gnu.node'))
const backends = (process.argv[2] ?? 'cpu').split(',')

// 40×20 CSS px at dpr 1. Left half: page content; right half: nothing (background only).
// Row 0..9 top band, row 10..19 bottom band, so row order is visible.
const page = (content) => `<body style="margin:0"><div style="position:absolute;left:0;top:0;width:20px;height:10px;background:${content}"></div><div style="position:absolute;left:0;top:10px;width:20px;height:10px;background:#0000ff"></div>`
const px = (buf, w, x, y) => Array.from(buf.subarray((y * w + x) * 4, (y * w + x) * 4 + 4))
const cases = [
  ['white bg, red', '#ffffff', '#ff0000'],
  ['white bg, 50% red', '#ffffff', 'rgba(255,0,0,0.5)'],
  ['transparent bg, red', '#00000000', '#ff0000'],
  ['transparent bg, 50% red', '#00000000', 'rgba(255,0,0,0.5)'],
  ['50% green bg, red', '#00ff0080', '#ff0000'],
  ['50% green bg, 50% red', '#00ff0080', 'rgba(255,0,0,0.5)'],
]
const out = []
for (const backend of backends) {
  for (const [name, background, content] of cases) {
    const r = new HtmlRenderer({ width: 40, height: 20, background, systemFonts: false, experimentalBackend: backend === 'cpu' ? undefined : backend })
    r.load(page(content))
    const w = r.pixelWidth
    const a = r.render()
    const b = Buffer.alloc(r.frameByteLength)
    r.renderInto(b)
    out.push({ backend, case: name, background, content, contentPx: px(a, w, 5, 5), backgroundPx: px(a, w, 35, 5), bottomLeftPx: px(a, w, 5, 15), renderIntoEqualsRender: a.equals(b), bytes: a.length, pixelWidth: w, pixelHeight: r.pixelHeight })
    r.close()
  }
}
for (const o of out) console.log(`${o.backend.padEnd(11)} ${o.case.padEnd(26)} content ${JSON.stringify(o.contentPx).padEnd(18)} background ${JSON.stringify(o.backgroundPx).padEnd(18)} row 15 ${JSON.stringify(o.bottomLeftPx)}  renderInto==render ${o.renderIntoEqualsRender}`)
if (process.env.PIXEL_FORMAT_JSON) (await import('node:fs')).writeFileSync(process.env.PIXEL_FORMAT_JSON, JSON.stringify(out, null, 1))
