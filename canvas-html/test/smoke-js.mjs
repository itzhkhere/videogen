// JavaScript: the frozen clock, timers, requestAnimationFrame, eval/call, the seek(t) contract, errors.
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
const here = path.dirname(fileURLToPath(import.meta.url))
const { HtmlRenderer } = createRequire(import.meta.url)('../index.js')

const W = 400, H = 200
const px = (buf, x, y) => [...buf.subarray((y * W + x) * 4, (y * W + x) * 4 + 3)]
const html = `<!doctype html><style>body{margin:0;background:#000}
#box{position:absolute;left:0;top:0;width:20px;height:20px;background:#ff0000}
#late{position:absolute;left:0;top:100px;width:20px;height:20px;background:#00ff00;display:none}</style>
<div id="box"></div><div id="late"></div>
<script>
  globalThis.rafCalls = 0; globalThis.ticks = 0
  const t0 = performance.now()
  function loop(ts) { rafCalls++; globalThis.lastTs = ts; box.style.left = (performance.now() - t0) / 10 + 'px'; requestAnimationFrame(loop) }
  requestAnimationFrame(loop)
  setTimeout(() => { late.style.display = 'block' }, 500)
  setInterval(() => ticks++, 100)
  globalThis.dateAtLoad = Date.now()
</script>`

// scripts are off by default
const off = new HtmlRenderer({ width: W, height: H }); off.load(html)
off.advanceClock(1000)
assert.deepEqual(px(off.render(), 5, 5), [255, 0, 0], 'box must stay at x=0 without scripts')

// frozen clock (default): nothing moves until advanceClock
const r = new HtmlRenderer({ width: W, height: H, scripts: true })
r.load(html)
const left = () => r.boxes().find((b) => b.id === 'box').x
r.render(); r.render(); r.render()
assert.equal(r.eval('rafCalls'), 3, 'requestAnimationFrame runs once per render()')
assert.equal(left(), 0)
assert.equal(r.eval('performance.now()'), 0)
assert.equal(r.eval('Date.now() - dateAtLoad'), 0)
assert.deepEqual(px(r.render(), 5, 105), [0, 0, 0])
// timers run in order while the clock moves, exactly on time
r.advanceClock(499); r.render()
assert.deepEqual(px(r.render(), 5, 105), [0, 0, 0])
assert.equal(r.eval('ticks'), 4)
r.advanceClock(1); r.render()
assert.deepEqual(px(r.render(), 5, 105), [0, 255, 0])
assert.equal(r.eval('ticks'), 5)
assert.equal(r.eval('Date.now() - dateAtLoad'), 500)
assert.equal(r.eval('lastTs'), 500, 'the rAF timestamp is the clock time')
assert.equal(left(), 50)

// eval returns JSON values; call() runs a page function
assert.equal(r.eval('1 + 2'), 3)
assert.deepEqual(r.eval('({ a: [1, "x", null], b: true })'), { a: [1, 'x', null], b: true })
assert.equal(r.eval('undefined'), null)
assert.throws(() => r.eval('throw new Error("bad")'), /bad/)
r.eval('globalThis.add = (a, b) => a + b')
assert.equal(r.call('add', 2, 40), 42)
assert.throws(() => r.call('nope'), /not a function/)

// the seek(t) contract: the page is a pure function of t, so any order gives the same pixels
const seekHtml = `<style>body{margin:0}</style><div id="t" style="position:absolute;left:0;top:0;width:10px;height:10px;background:#00f"></div>
<script>window.seek = (ms) => { t.style.left = (ms / 10) + 'px' }</script>`
const s1 = new HtmlRenderer({ width: W, height: H, scripts: true }); s1.load(seekHtml)
const s2 = new HtmlRenderer({ width: W, height: H, scripts: true }); s2.load(seekHtml)
const at = (s, t) => { s.call('seek', t); return s.render() }
const forward = [0, 500, 1000, 1500].map((t) => at(s1, t))
const shuffled = [1500, 0, 1000, 500].map((t) => [t, at(s2, t)])
for (const [t, buf] of shuffled) assert.equal(Buffer.compare(buf, forward[t / 500]), 0, `seek(${t}) differs`)
assert.equal(s1.boxes().find((b) => b.id === 't').x, 150)

// JS errors are collected, not fatal
const r4 = new HtmlRenderer({ width: W, height: H, scripts: true })
r4.load('<script>setTimeout(() => { throw new Error("boom") }, 100)</script><script>nope(</script>')
r4.advanceClock(200); r4.render()
assert.ok(r4.jsErrors.length >= 2, String(r4.jsErrors))
assert.ok(r4.jsErrors.some((e) => e.includes('boom')))
// runaway 0 ms timer loops are stopped with an error instead of hanging
const r5 = new HtmlRenderer({ width: W, height: H, scripts: true })
r5.load('<script>function spin() { setTimeout(spin, 0) } spin()</script>')
assert.throws(() => r5.advanceClock(100), /timer callbacks/)

// real clock: time follows the wall clock, advanceClock is refused
const real = new HtmlRenderer({ width: W, height: H, scripts: true, clock: 'real' })
real.load('<script>setTimeout(() => { globalThis.fired = true }, 30)</script>')
assert.throws(() => real.advanceClock(10), /frozen/)
const until = Date.now() + 80; while (Date.now() < until) {}
real.render()
assert.ok(real.eval('performance.now()') >= 60)
assert.equal(real.eval('globalThis.fired'), true, 'due timers run at render()')
assert.ok(real.clockTime >= 60)

// Playback: a page that plays on its own (GSAP on requestAnimationFrame) runs on the frozen clock
// when you step it, and lands where the seekable version of the same timeline is.
const load = (file) => {
  const r = new HtmlRenderer({ width: 1280, height: 720, scripts: true })
  r.load(fs.readFileSync(path.join(here, file), 'utf8'), pathToFileURL(path.join(here, file)).href)
  return r
}
const play = load('js-scenes/gsap-play.html'), seek = load('scenes/gsap.html')
play.render()
for (let i = 0; i < 36; i++) { play.advanceClock(1000 / 30); play.render() }
seek.call('seek', 1200)
const a = play.render(), b = seek.render()
let se = 0
for (let i = 0; i < a.length; i += 4) for (let c = 0; c < 3; c++) se += (a[i + c] - b[i + c]) ** 2
const psnr = 10 * Math.log10(65025 / (se / (a.length / 4 * 3)))
assert.ok(psnr > 30, `playback vs seek at 1.2 s: ${psnr.toFixed(1)} dB`)
assert.deepEqual([...play.jsErrors, ...seek.jsErrors], [])

console.log('smoke-js: all passed')
