// Input hardening: malformed options and arguments return JS errors, never a process abort.
//   background parser (lengths, non-hex, multi-byte UTF-8 at every position, emoji, combining
//   marks, NUL, empty, very long), advanceClock range (NaN, ±Infinity, negative, the largest
//   supported clock and one past it), page timer delays far outside Duration's range, and PNG
//   alpha (premultiplied frame → straight-alpha PNG).
// node test/hardening.mjs      (HTML_RENDERER_NODE=<addon> HTML_RENDERER_BACKEND=gpu-gl|gpu-vulkan
//                               runs the PNG/alpha checks on a GPU build)
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const { HtmlRenderer } = require(process.env.HTML_RENDERER_NODE ?? '../index.js')
const { PNG } = require('pngjs')
const backend = process.env.HTML_RENDERER_BACKEND
const opts = (o = {}) => ({ width: 40, height: 20, systemFonts: false, ...(backend ? { experimentalBackend: backend } : {}), ...o })
const bgError = /background must be #rrggbb or #rrggbbaa/

// --- background ---------------------------------------------------------------------------------
for (const ok of ['#112233', '#11223344', '112233', '11223344', '  #AbCdEf  ', '#FFFFFF00']) {
  new HtmlRenderer(opts({ background: ok })).close()
}
const bad = ['', '#', '#1', '#12345', '#1234567', '#123456789', '#ggg000', '#12 456', '+12345', '##123456',
  '\0\0\0\0\0\0', '#1122\u00003', '😀', '#😀1111', '#11😀11', '#1111😀', 'ééé', '#１２３４５６',
  '#' + 'f'.repeat(100000), '#ééé', 'aééb']
// multi-byte characters at every position of a 6- and an 8-digit colour
for (const ch of ['é', '€', '😀', '́']) for (const len of [6, 8]) for (let i = 0; i < len; i++) {
  const d = Array.from({ length: len }, () => 'a'); d[i] = ch; bad.push('#' + d.join(''))
  const e = Array.from({ length: len - 1 }, () => 'a'); e.splice(i, 0, ch); bad.push(e.join(''))
}
for (const b of bad) assert.throws(() => new HtmlRenderer(opts({ background: b })), bgError, JSON.stringify(b).slice(0, 40))

// --- advanceClock range ---------------------------------------------------------------------------
const MAX = 8.64e15
{
  const r = new HtmlRenderer(opts({ scripts: true })); r.load('<p>x')
  for (const ms of [NaN, Infinity, -Infinity, -1, -0.0001]) assert.throws(() => r.advanceClock(ms), /finite number >= 0/, String(ms))
  for (const ms of [MAX + 2, 1e300, Number.MAX_VALUE]) assert.throws(() => r.advanceClock(ms), /past 8\.64e15 ms/, String(ms))
  r.advanceClock(MAX - 1); assert.equal(r.clockTime, MAX - 1)
  assert.throws(() => r.advanceClock(2), /past 8\.64e15 ms/, 'one step past the maximum')
  r.advanceClock(1); assert.equal(r.clockTime, MAX, 'exactly the maximum is accepted')
  assert.throws(() => r.advanceClock(Number.MIN_VALUE * 1e300), /past/, 'any further step is rejected')
  r.advanceClock(0); assert.equal(r.clockTime, MAX)
  assert.equal(r.eval('1 + 1'), 2, 'the renderer still works')
  r.close()
}

// --- page timers far outside Duration's range (used to panic in the script runtime) ---------------
{
  const r = new HtmlRenderer(opts({ scripts: true })); r.load('<p>x')
  r.eval('globalThis.fired = []')
  for (const d of ['1e25', '1e300', 'Number.MAX_VALUE', '2147483647', '2147483648', '4294967297', '-5', 'NaN', 'Infinity', '"x"'])
    r.eval(`setTimeout(() => fired.push(${JSON.stringify(d)}), ${d}); setInterval(() => {}, ${d}); 1`)
  r.advanceClock(5)
  const fired = r.eval('fired')
  // WebIDL long: 2^31 → negative → 0; 2^32+1 → 1; 1e25 % 2^32 etc. Non-finite and negative → 0.
  for (const d of ['2147483648', '4294967297', '-5', 'NaN', 'Infinity', '"x"']) assert.ok(fired.includes(d), `${d} fired as a short timer`)
  assert.ok(!fired.includes('2147483647'), 'the largest i32 delay is still ~24.8 days')
  r.close()
}

// --- PNG alpha: the frame is premultiplied, the PNG is straight alpha ----------------------------
const unpremul = ([r, g, b, a]) => a === 0 ? [0, 0, 0, 0] : [r, g, b].map((c) => Math.min(255, Math.round((c * 255) / a))).concat(a)
const cases = [
  ['transparent bg', '#00000000', 'transparent'],
  ['25% red', '#00000000', 'rgba(255,0,0,0.25)'],
  ['50% red', '#00000000', 'rgba(255,0,0,0.5)'],
  ['75% red', '#00000000', 'rgba(255,0,0,0.75)'],
  ['opaque red', '#00000000', '#ff0000'],
  ['50% teal', '#00000000', 'rgba(20,184,166,0.5)'],
  ['50% red over 50% green bg', '#00ff0080', 'rgba(255,0,0,0.5)'],
  ['opaque white bg, 50% red', '#ffffff', 'rgba(255,0,0,0.5)'],
]
for (const [name, background, fill] of cases) {
  const r = new HtmlRenderer(opts({ background }))
  r.load(`<body style="margin:0"><div style="width:20px;height:20px;background:${fill}"></div><div style="position:absolute;left:24px;top:2px;font:14px sans-serif;color:rgba(0,0,255,0.6)">Ag</div>`)
  const raw = r.render(), png = PNG.sync.read(r.render({ format: 'png' }))
  assert.equal(png.width, r.pixelWidth); assert.equal(png.height, r.pixelHeight)
  for (let i = 0; i < raw.length; i += 4) {
    const want = unpremul([raw[i], raw[i + 1], raw[i + 2], raw[i + 3]])
    const got = [png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]]
    assert.deepEqual(got, want, `${name}: pixel ${i / 4} raw ${[...raw.subarray(i, i + 4)]}`)
  }
  if (background === '#ffffff') assert.ok(Buffer.from(png.data).equals(raw), 'opaque frames: PNG pixels equal the raw frame')
  r.close()
}
// Spot values: 50% red over transparent is [128,0,0,128] raw and [255,0,0,128] in the PNG.
{
  const r = new HtmlRenderer(opts({ background: '#00000000' }))
  r.load('<body style="margin:0"><div style="width:40px;height:20px;background:rgba(255,0,0,0.5)"></div>')
  assert.deepEqual([...r.render().subarray(0, 4)], [128, 0, 0, 128])
  assert.deepEqual([...PNG.sync.read(r.render({ format: 'png' })).data.subarray(0, 4)], [255, 0, 0, 128])
  r.close()
}

console.log(`hardening${backend ? ` (${backend})` : ''}: all passed`)
