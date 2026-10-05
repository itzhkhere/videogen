// Web Animations on top of CSS animations. Values were checked against Chrome 141
// (test/waapi-chrome.mjs compares a full scene pixel by pixel).
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
const { HtmlRenderer } = createRequire(import.meta.url)('../index.js')

const page = (body, css = '') => `<!doctype html><style>body{margin:0} .b{position:absolute;top:0;left:0;width:20px;height:20px;background:#f00} ${css}</style>${body}`
const make = (html) => { const r = new HtmlRenderer({ width: 400, height: 100, scripts: true }); r.load(html); return r }
// translateX of an element's computed transform, after a render
const tx = (r, id) => { r.render(); const m = r.eval(`getComputedStyle(document.getElementById(${JSON.stringify(id)})).transform`); return m === 'none' ? 0 : Number(m.split(',')[4]) }
const near = (a, b, msg, eps = 0.05) => assert.ok(Math.abs(a - b) < eps, `${msg}: got ${a}, expected ${b}`)

// --- CSS animations through getAnimations()
{
  const r = make(page('<div id="a" class="b"></div>', '#a{animation:go 1s linear both} @keyframes go{to{transform:translateX(200px)}}'))
  assert.deepEqual(r.eval('document.getAnimations().map((a) => [a.animationName, a.playState, a.currentTime])'), [['go', 'running', 0]])
  r.advanceClock(250)
  assert.equal(r.eval('a.getAnimations()[0].currentTime'), 250)
  near(tx(r, 'a'), 50, 'running with the clock')
  r.eval('const an = a.getAnimations()[0]; an.pause(); an.currentTime = 800')
  near(tx(r, 'a'), 160, 'paused and seeked')
  r.eval('a.getAnimations()[0].currentTime = 100')
  near(tx(r, 'a'), 20, 'seek back')
  r.advanceClock(500)
  near(tx(r, 'a'), 20, 'a paused animation ignores the clock')
}

// --- several CSS animations on one element all follow their own seek
{
  const r = make(page('<div id="a" class="b"></div>',
    '#a{animation:x 1s linear both, o 2s linear both} @keyframes x{to{transform:translateX(200px)}} @keyframes o{from{opacity:1}to{opacity:0}}'))
  r.eval('for (const an of document.getAnimations()) { an.pause(); an.currentTime = 500 }')
  near(tx(r, 'a'), 100, 'first animation')
  near(Number(r.eval('getComputedStyle(a).opacity')), 0.75, 'second animation', 0.01)
}

// --- element.animate: keyframe forms, timing, fill, iterations, direction
{
  const r = make(page(`<div id="a" class="b"></div><div id="b" class="b"></div><div id="c" class="b"></div><div id="d" class="b"></div><div id="e" class="b"></div>
<script>
  const k = [{ transform: 'translateX(0)' }, { transform: 'translateX(200px)' }]
  window.A = a.animate(k, { duration: 1000, fill: 'both' })
  window.B = b.animate({ transform: ['translateX(0)', 'translateX(100px)'] }, { duration: 1000, delay: 500, fill: 'backwards' })
  window.C = c.animate(k, { duration: 600, iterations: 2, direction: 'alternate', fill: 'both' })
  window.D = d.animate([{ transform: 'translateX(200px)' }], { duration: 2000, fill: 'both' })
  D.playbackRate = 2
  window.E = e.animate(k, { duration: 1000, easing: 'steps(4)', fill: 'both' })
  window.seek = (t) => { for (const an of document.getAnimations()) { an.pause(); an.currentTime = t } }
</script>`))
  for (const [t, a, b, c, d, e] of [
    [0, 0, 0, 0, 0, 0],
    [400, 80, 0, 133.33, 40, 50],
    [700, 140, 20, 166.67, 70, 100],
    [1000, 200, 50, 66.67, 100, 200],
    [300, 60, 0, 100, 30, 50], // backwards again
    [1500, 200, 0, 0, 150, 200], // b has no forward fill: back to its own style at the end
  ]) {
    r.call('seek', t)
    near(tx(r, 'a'), a, `a at ${t}`); near(tx(r, 'b'), b, `b at ${t}`); near(tx(r, 'c'), c, `c (alternate) at ${t}`)
    near(tx(r, 'd'), d, `d (single keyframe, rate 2) at ${t}`); near(tx(r, 'e'), e, `e (steps) at ${t}`)
  }
  const ct = r.eval('C.currentTime = 700, C.effect.getComputedTiming()')
  assert.equal(ct.currentIteration, 1); near(ct.progress, 1 - 100 / 600, 'computed progress', 1e-9)
  assert.deepEqual(r.eval('document.getAnimations().map((an) => an.id === "" && an.playState)'), ['paused', 'paused', 'paused', 'paused', 'paused'])
}

// --- easing in reverse iterations matches browsers (forward interval, mirrored progress)
{
  const r = make(page('<div id="n" class="b"></div><div id="v" class="b"></div>',
    '#n{animation:go 1s ease-in both paused;animation-delay:-750ms} #v{animation:go 1s ease-in reverse both paused;animation-delay:-250ms} @keyframes go{to{transform:translateX(200px)}}'))
  near(tx(r, 'v'), tx(r, 'n'), 'reverse at 25% equals normal at 75%', 0.01)
}

// --- playing on the clock, finish events, the finished promise, cancel
{
  const r = make(page(`<div id="a" class="b"></div><script>
    window.log = []
    window.A = a.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(100px)' }], 400)
    A.onfinish = () => log.push('onfinish ' + performance.now())
    A.finished.then(() => log.push('finished'))
  </script>`))
  r.advanceClock(200); near(tx(r, 'a'), 50, 'running')
  assert.equal(r.eval('A.playState'), 'running')
  r.advanceClock(300); r.render()
  assert.equal(r.eval('A.playState'), 'finished')
  near(tx(r, 'a'), 0, 'fill none after the end')
  assert.deepEqual(r.eval('log'), ['onfinish 500', 'finished'])
  r.eval('A.play()'); r.advanceClock(100); near(tx(r, 'a'), 25, 'play() after finish restarts')
  r.eval('window.B = a.animate({ opacity: [0, 1] }, 1000); B.cancel()')
  assert.equal(r.eval('B.playState'), 'idle')
  assert.equal(r.eval('a.getAnimations().length'), 1, 'a cancelled animation leaves getAnimations()')
  assert.equal(r.eval('getComputedStyle(a).opacity'), '1')
}

// --- unsupported features throw instead of pretending to work
{
  const r = make(page('<div id="a" class="b"></div>'))
  const k = '[{ opacity: 0 }, { opacity: 1 }]'
  for (const code of [
    `a.animate(${k}, 100).reverse()`,
    `a.animate(${k}, 100).playbackRate = -1`,
    `a.animate(${k}, { duration: 100, composite: 'add' })`,
    `a.animate(${k}, { duration: 100, iterationStart: 0.5 })`,
  ]) assert.throws(() => r.eval(code), /NotSupportedError|not supported/, code)
  assert.equal(r.eval('try { a.animate([{ opacity: 0 }, { opacity: 1 }], 100).reverse() } catch (e) { e.name }'), 'NotSupportedError')
}
console.log('smoke-waapi: all passed')
