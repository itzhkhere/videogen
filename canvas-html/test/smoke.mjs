// Core engine, no JavaScript: load, render, the frozen clock, boxes, dpr, PNG, errors.
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
const { HtmlRenderer } = createRequire(import.meta.url)('../index.js')

const html = `<!doctype html><style>
  body{margin:0;background:#101828}
  #box{position:absolute;left:100px;top:50px;width:100px;height:100px;background:#f97316;animation:move 1s linear both}
  @keyframes move{from{transform:translateX(0)}to{transform:translateX(200px)}}
  #t{position:absolute;left:20px;top:200px;font:700 32px sans-serif;color:white}
</style><div id="box"></div><div id="t">hello</div>`
const px = (buf, x, y, w = 400) => [...buf.subarray((y * w + x) * 4, (y * w + x) * 4 + 4)]
const orange = [249, 115, 22, 255]

const r = new HtmlRenderer({ width: 400, height: 300, background: '#000000' })
r.load(html)
// The clock is frozen: the CSS animation stays at its start until advanceClock()
let f = r.render(); assert.deepEqual(px(f, 150, 100), orange); assert.notDeepEqual(px(f, 350, 100), orange)
assert.equal(f.length, 400 * 300 * 4)
assert.equal(Buffer.compare(f, r.render()), 0, 'the same state renders the same pixels')
assert.equal(r.clockTime, 0)
r.advanceClock(500); assert.equal(r.clockTime, 500)
f = r.render(); assert.deepEqual(px(f, 250, 100), orange); assert.notDeepEqual(px(f, 120, 100), orange)
r.advanceClock(500)
f = r.render(); assert.deepEqual(px(f, 350, 100), orange); assert.notDeepEqual(px(f, 150, 100), orange)
// load() starts again from clock 0
r.load(html); assert.equal(r.clockTime, 0); assert.deepEqual(px(r.render(), 150, 100), orange)

const boxes = r.boxes()
assert.deepEqual(boxes.find((b) => b.id === 'box'), { id: 'box', tag: 'div', x: 100, y: 50, width: 100, height: 100 })
assert.ok(boxes.find((b) => b.id === 't').width > 50)

// dpr 2 doubles the pixel size
const r3 = new HtmlRenderer({ width: 400, height: 300, devicePixelRatio: 2 }); r3.load(html)
assert.equal(r3.render().length, 800 * 600 * 4)
assert.equal(r3.pixelWidth, 800)

// PNG output
const png = r.render({ format: 'png' })
assert.deepEqual([...png.subarray(1, 4)], [0x50, 0x4e, 0x47])
fs.writeFileSync(path.join(os.tmpdir(), 'canvas-html-smoke.png'), png)

// errors
assert.throws(() => new HtmlRenderer({ width: 0, height: 10 }))
assert.throws(() => new HtmlRenderer({ width: 10, height: 10, background: 'red' }))
assert.throws(() => new HtmlRenderer({ width: 10, height: 10, clock: 'fast' }), /clock/)
assert.throws(() => r.render({ format: 'jpeg' }), /format/)
assert.throws(() => r.advanceClock(-1))
assert.throws(() => r.advanceClock(Infinity))
assert.throws(() => r.eval('1'), /scripts: true/)
const r4 = new HtmlRenderer({ width: 10, height: 10 }); assert.throws(() => r4.render())
// a missing image is reported, not fatal
const r5 = new HtmlRenderer({ width: 100, height: 100 }); r5.load('<img src="nope.png">', 'file:///tmp/')
r5.render(); assert.ok(r5.loadErrors.some((e) => e.includes('nope.png')), String(r5.loadErrors))
// regressions found while making a 15 s promo video
{
  const g = new HtmlRenderer({ width: 200, height: 200, background: '#000000' })
  // a block with only empty inline content keeps its own height
  g.load('<style>body{margin:0}.ln{height:52px}</style><div class="ln" id="a"><span></span></div><div class="ln" id="b">x</div>')
  assert.equal(g.boxes().find((b) => b.id === 'b').y, 52)
  // an angled gradient in a background-size tile is centred on the tile (90deg grid lines)
  g.load('<style>body{margin:0}</style><div style="width:200px;height:200px;background-image:linear-gradient(90deg,#f00 1px,transparent 1px);background-size:80px 80px"></div>')
  let f = g.render()
  const at = (x, y) => [...f.subarray((y * 200 + x) * 4, (y * 200 + x) * 4 + 3)]
  assert.deepEqual(at(40, 40), [0, 0, 0]); assert.deepEqual(at(0, 40), [255, 0, 0])
  // background-clip: text on an inline element inside a block
  g.load('<style>body{margin:0;font:700 80px sans-serif}</style><div><span style="background:linear-gradient(#0f0,#0f0);-webkit-background-clip:text;background-clip:text;color:transparent">II</span></div>')
  f = g.render()
  let green = 0
  for (let i = 0; i < f.length; i += 4) if (f[i + 1] > 200 && f[i] < 50) green++
  assert.ok(green > 500, `gradient text on an inline span: ${green} green pixels`)
}
console.log('smoke: all passed')
