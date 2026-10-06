// renderInto(target) and frameByteLength: the public frame API contract.
//   accepted targets, rejected targets (type, SharedArrayBuffer, length, detached, closed) with
//   their error classes and codes, no side effects when rejected, same bytes as render(),
//   caller ownership and lifetimes, close/repeat behaviour, constructor size limits.
// node test/render-into.mjs        (CANVAS_HTML_NODE=<addon> CANVAS_HTML_BACKEND=gpu-gl|gpu-vulkan
//                                   runs it on a GPU build)
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const { HtmlRenderer } = require(process.env.CANVAS_HTML_NODE ?? '../index.js')
const backend = process.env.CANVAS_HTML_BACKEND
const make = (o = {}) => new HtmlRenderer({ width: 64, height: 40, systemFonts: false, scripts: true, ...(backend ? { experimentalBackend: backend } : {}), ...o })
const turn = () => new Promise((r) => setImmediate(r))
const settle = async () => { for (let i = 0; i < 5; i++) { globalThis.gc?.(); await turn() } }

// A page whose rAF callbacks count frames and move a box, so frame steps are observable.
const PAGE = `<body style="margin:0;background:#0b1220">
<div id="b" style="position:absolute;left:0;top:0;width:10px;height:10px;background:#f97316"></div>
<script>
  globalThis.frames = 0
  const b = document.getElementById('b')
  function tick() { frames++; b.style.left = (frames * 4) + 'px'; requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
</script>`
const frames = (r) => r.eval('frames')
const throwsLike = (f, cls, code, re) => assert.throws(f, (e) => e instanceof cls && e.code === code && re.test(e.message), `${cls.name} ${code} ${re}`)

// frameByteLength: pixelWidth × pixelHeight × 4, also with DPR rounding; constant after close.
{
  const r = make({ width: 101, height: 33, devicePixelRatio: 1.5 })
  assert.equal(r.pixelWidth, 152); assert.equal(r.pixelHeight, 50)
  assert.equal(r.frameByteLength, 152 * 50 * 4)
  r.close()
  assert.equal(r.frameByteLength, 152 * 50 * 4)
}

// Accepted: Buffer, Uint8Array, Uint8ClampedArray (any offset into an ordinary or resizable
// ArrayBuffer). Same bytes as render() of the same state. Returns undefined.
{
  const r = make(); r.load(PAGE)
  const n = r.frameByteLength
  const ref = make(); ref.load(PAGE)
  const buf = Buffer.alloc(n), u8 = new Uint8Array(n), u8c = new Uint8ClampedArray(n)
  const ab = new ArrayBuffer(n + 32), off = new Uint8Array(ab, 16, n)
  new Uint8Array(ab).fill(7)
  const rab = new ArrayBuffer(n, { maxByteLength: 2 * n }), resizable = new Uint8Array(rab)
  for (const target of [buf, u8, u8c, off, resizable]) {
    assert.equal(r.renderInto(target), undefined)
    assert.ok(Buffer.from(target.buffer, target.byteOffset, n).equals(ref.render()), `${target.constructor.name}: same bytes as render()`)
  }
  const whole = new Uint8Array(ab)
  assert.ok(whole.subarray(0, 16).every((x) => x === 7) && whole.subarray(16 + n).every((x) => x === 7), 'bytes outside the view untouched')
  r.close(); ref.close()
}

// Rejected targets: the right error, and the call has no side effects (no frame step, no write).
{
  const r = make(); r.load(PAGE)
  const n = r.frameByteLength
  r.renderInto(Buffer.alloc(n))
  const before = frames(r)
  const sentinel = Buffer.alloc(n + 1, 0xab)
  const bad = [
    [() => r.renderInto(Buffer.alloc(n - 1)), RangeError, 'ERR_OUT_OF_RANGE', /is \d+ bytes; the frame needs exactly/],
    [() => r.renderInto(sentinel), RangeError, 'ERR_OUT_OF_RANGE', /exactly/],
    [() => r.renderInto(new Uint8Array(0)), RangeError, 'ERR_OUT_OF_RANGE', /is 0 bytes/],
    [() => r.renderInto(new Float32Array(n / 4)), TypeError, 'ERR_INVALID_ARG_TYPE', /another typed array/],
    [() => r.renderInto(new Uint32Array(n / 4)), TypeError, 'ERR_INVALID_ARG_TYPE', /another typed array/],
    [() => r.renderInto(new Int16Array(n / 2)), TypeError, 'ERR_INVALID_ARG_TYPE', /another typed array/],
    [() => r.renderInto(new Int8Array(n)), TypeError, 'ERR_INVALID_ARG_TYPE', /another typed array/],
    [() => r.renderInto(new BigUint64Array(n / 8)), TypeError, 'ERR_INVALID_ARG_TYPE', /another typed array/],
    [() => r.renderInto(new DataView(new ArrayBuffer(n))), TypeError, 'ERR_INVALID_ARG_TYPE', /must be a Buffer/],
    [() => r.renderInto(new ArrayBuffer(n)), TypeError, 'ERR_INVALID_ARG_TYPE', /must be a Buffer/],
    [() => r.renderInto(new Uint8Array(new SharedArrayBuffer(n))), TypeError, 'ERR_INVALID_ARG_TYPE', /SharedArrayBuffer/],
    [() => r.renderInto(Buffer.from(new SharedArrayBuffer(n))), TypeError, 'ERR_INVALID_ARG_TYPE', /SharedArrayBuffer/],
    [() => r.renderInto(new Uint8Array(new SharedArrayBuffer(n, { maxByteLength: 2 * n }))), TypeError, 'ERR_INVALID_ARG_TYPE', /SharedArrayBuffer/],
    [() => r.renderInto(Array(n).fill(0)), TypeError, 'ERR_INVALID_ARG_TYPE', /must be a Buffer/],
    [() => r.renderInto({ length: n, byteLength: n }), TypeError, 'ERR_INVALID_ARG_TYPE', /must be a Buffer/],
    [() => r.renderInto('x'.repeat(n)), TypeError, 'ERR_INVALID_ARG_TYPE', /must be a Buffer/],
    [() => r.renderInto(42), TypeError, 'ERR_INVALID_ARG_TYPE', /must be a Buffer/],
    [() => r.renderInto(null), TypeError, 'ERR_INVALID_ARG_TYPE', /must be a Buffer/],
    [() => r.renderInto(), TypeError, 'ERR_INVALID_ARG_TYPE', /must be a Buffer/],
    [() => { const ab = new ArrayBuffer(n), v = new Uint8Array(ab); structuredClone(ab, { transfer: [ab] }); r.renderInto(v) }, TypeError, 'ERR_INVALID_ARG_VALUE', /detached/],
    [() => { const ab = new ArrayBuffer(n), v = new Uint8Array(ab); ab.transfer(); r.renderInto(v) }, TypeError, 'ERR_INVALID_ARG_VALUE', /detached/],
  ]
  for (const [f, cls, code, re] of bad) throwsLike(f, cls, code, re)
  assert.equal(frames(r), before, 'rejected calls ran no frame step')
  assert.ok(sentinel.every((x) => x === 0xab), 'a rejected target is not written')
  // A shrunk resizable buffer: the view now tracks fewer bytes → rejected, not overrun.
  const rab = new ArrayBuffer(n, { maxByteLength: 2 * n }), v = new Uint8Array(rab)
  rab.resize(n - 4)
  throwsLike(() => r.renderInto(v), RangeError, 'ERR_OUT_OF_RANGE', /exactly/)
  r.close()
}

// renderInto runs the same frame step as render(): one rAF tick per call.
{
  const a = make(); a.load(PAGE)
  const b = make(); b.load(PAGE)
  const t = Buffer.alloc(a.frameByteLength)
  for (let i = 0; i < 5; i++) {
    a.renderInto(t)
    assert.ok(t.equals(b.render()), `frame ${i}: renderInto and render() agree`)
  }
  assert.equal(frames(a), frames(b))
  a.close(); b.close()
}

// Caller ownership: the renderer keeps no reference. A target is complete when the call returns,
// unchanged by later renders into other targets, readable after close() and after the renderer
// is garbage-collected; the renderer can close right after renderInto.
{
  let r = make(); r.load(PAGE)
  const n = r.frameByteLength
  const t1 = Buffer.alloc(n), t2 = Buffer.alloc(n)
  r.renderInto(t1)
  const copy1 = Buffer.from(t1)
  r.renderInto(t2)
  for (let i = 0; i < 5; i++) r.render()
  assert.ok(t1.equals(copy1), 'later renders do not touch an earlier target')
  assert.ok(!t1.equals(t2), 'the page moved between frames')
  r.renderInto(t2)
  r.close()
  const copy2 = Buffer.from(t2)
  r = null
  await settle()
  assert.ok(t2.equals(copy2) && t1.equals(copy1), 'targets outlive close() and the renderer')
}

// render() keeps its contract: an owning Buffer per call, unchanged by later renders, valid after
// close() and the renderer being collected.
{
  let r = make(); r.load(PAGE)
  const f1 = r.render(), c1 = Buffer.from(f1)
  for (let i = 0; i < 5; i++) r.render()
  r.renderInto(Buffer.alloc(r.frameByteLength))
  assert.ok(f1.equals(c1))
  assert.equal(f1.length, r.frameByteLength)
  r.close(); r = null
  await settle()
  assert.ok(f1.equals(c1), 'render() Buffer outlives the renderer')
}

// Closed renderer, repeated close, repeated renderInto.
{
  const r = make(); r.load(PAGE)
  const t = Buffer.alloc(r.frameByteLength)
  for (let i = 0; i < 50; i++) r.renderInto(t)
  r.close(); r.close()
  assert.throws(() => r.renderInto(t), /renderer is closed/)
  assert.throws(() => r.renderInto(42), /renderer is closed/, 'closed is reported before the target is checked')
  assert.throws(() => r.render(), /renderer is closed/)
}

// Before load(): both APIs throw the same error and nothing is written.
{
  const r = make()
  const t = Buffer.alloc(r.frameByteLength, 0xcd)
  assert.throws(() => r.renderInto(t), /call load\(html\) first/)
  assert.throws(() => r.render(), /call load\(html\) first/)
  assert.ok(t.every((x) => x === 0xcd))
  r.close()
}

// Sizes that cannot be a frame fail at construction with an Error, never a panic or abort.
for (const [o, re] of [
  [{ width: 100000, height: 100000 }, /out of range/],
  [{ width: 4000, height: 4000, devicePixelRatio: 10 }, /out of range/],
  [{ width: 100, height: 100, devicePixelRatio: Infinity }, /devicePixelRatio/],
  [{ width: 100, height: 100, devicePixelRatio: NaN }, /devicePixelRatio/],
  [{ width: 100, height: 100, devicePixelRatio: 0 }, /devicePixelRatio/],
  [{ width: 100, height: 100, devicePixelRatio: -1 }, /devicePixelRatio/],
  [{ width: 0, height: 10 }, /width and height/],
  [{ width: 1, height: 1, devicePixelRatio: 1e-9 }, /out of range/],
]) assert.throws(() => make(o), re, JSON.stringify(o))
// The largest side: CPU renders it; a GPU may refuse a surface above its texture limit, with an
// Error (Mesa llvmpipe: 16384).
try {
  const r = make({ width: 32767, height: 1 })
  assert.equal(r.frameByteLength, 32767 * 4)
  r.close()
} catch (e) {
  assert.ok(backend && /GPU surface .* could not be created/.test(e.message), e.message)
}

console.log(`render-into${backend ? ` (${backend})` : ''}: all passed`)
