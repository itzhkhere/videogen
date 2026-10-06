// Determinism (5 fresh instances per engine), the GSAP selector-tween contract and the Motion
// probe, on both engines. Writes evidence/{determinism,gsap,motion-probe}.json and PNG frames.
// Cross-engine frame differences are attributed to the first differing layer:
// DOM semantics -> style semantics -> timing -> layout -> paint.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { runtimes } from './runtimes.mjs'
import { sha } from './cases.mjs'

const TIMES = [0, 250, 500, 750, 1000]
const evidence = (name) => new URL('../evidence/' + name, import.meta.url)
fs.mkdirSync(evidence('frames/'), { recursive: true })
const eq = (a, b) => { try { assert.deepStrictEqual(a, b); return true } catch { return false } }
const write = (name, v) => fs.writeFileSync(evidence(name), JSON.stringify(v, null, 2) + '\n')

// Layers observed at every frame, in attribution order.
const LAYERS = ['dom', 'style', 'timing', 'layout', 'pixels']
const observe = (rt, ids) => rt.eval(`(() => { const ids = ${JSON.stringify(ids)}; const out = { dom: {}, style: {}, layout: {} };
  for (const id of ids) { const e = document.getElementById(id); out.dom[id] = [e.textContent, e.getAttribute("style"), e.className];
    const s = getComputedStyle(e); out.style[id] = [s.opacity, s.transform, s.width, s.height, s.backgroundColor, s.left, s.top];
    const r = e.getBoundingClientRect(); out.layout[id] = [r.x, r.y, r.width, r.height] }
  out.timing = [Date.now(), performance.now()]; return out })()`)
const attribute = (a, b) => LAYERS.find((l) => !eq(a[l], b[l])) || null

function play(engine, html, setup, ids, step) {
  const rt = engine.create(html, { epochMs: 0 })
  if (setup) rt.eval(setup)
  const frames = []
  for (const t of TIMES) {
    step(rt, t)
    const raw = rt.render()
    const o = observe(rt, ids)
    frames.push({ t, ...o, pixels: sha(raw), png: rt.renderPng() })
  }
  const errors = rt.jsErrors()
  const consoleLog = engine.name === 'deno' ? rt.eval('__canvasHtml.console()') : null
  rt.close()
  return { frames, errors, console: consoleLog }
}

function compareEngines(a, b) {
  return a.frames.map((fa, i) => {
    const fb = b.frames[i]
    const layer = fa.pixels === fb.pixels ? null : attribute(fa, fb)
    return { t: fa.t, identical: fa.pixels === fb.pixels, firstDifferingLayer: layer }
  })
}

const strip = (run) => ({ ...run, frames: run.frames.map(({ png, ...f }) => f) })

// ------------------------------------------------------------------ determinism
const DATE_SCENE = `<style>body{margin:0;font-family:Inter;font-size:12px}#box{position:absolute;left:0;top:20px;width:16px;height:16px;background:red}</style><div id="date"></div><div id="box"></div>`
const DATE_SETUP = `globalThis.b = document.getElementById("box"); globalThis.d = document.getElementById("date");
  setTimeout(() => { b.style.background = "blue" }, 500);
  function f(t) { d.textContent = String(Date.now()); b.style.width = (16 + t / 100) + "px"; b.style.transform = "translateX(" + (t / 10) + "px)"; requestAnimationFrame(f) }
  requestAnimationFrame(f);`
const determinism = {}
for (const engine of runtimes) {
  const runs = []
  for (let fresh = 0; fresh < 5; fresh++) {
    const run = play(engine, DATE_SCENE, DATE_SETUP, ['date', 'box'], (rt, t) => rt.advanceTo(t))
    if (fresh === 0) run.frames.forEach((f) => fs.writeFileSync(evidence(`frames/dom-${engine.name}-${f.t}.png`), f.png))
    runs.push(strip(run))
  }
  const replay = runs.every((r) => eq(r.frames, runs[0].frames))
  determinism[engine.name] = { replayIdentical: replay, distinctFrames: new Set(runs[0].frames.map((f) => f.pixels)).size, errors: runs[0].errors, frames: runs[0].frames }
  console.log(`determinism ${engine.name}: 5 fresh replays identical=${replay}, distinct frame hashes=${determinism[engine.name].distinctFrames}`)
}
determinism.crossEngine = compareEngines(determinism.boa, determinism.deno)
console.log('determinism cross-engine:', JSON.stringify(determinism.crossEngine))
write('determinism.json', determinism)

// ------------------------------------------------------------------ GSAP selector tween
const gsapSource = fs.readFileSync(new URL('../../../test/assets/gsap.min.js', import.meta.url), 'utf8')
const GSAP_SCENE = DATE_SCENE
const gsap = {}
for (const mode of ['paused', 'auto']) {
  for (const engine of runtimes) {
    const setup = gsapSource + `\n;globalThis.tween = gsap.to("#box", { x: 100, opacity: 0.5, duration: 1, ease: "none", paused: ${mode === 'paused'} });
      gsap.ticker.lagSmoothing(0);` + (mode === 'paused' ? 'gsap.ticker.sleep();' : '')
    const run = play(engine, GSAP_SCENE, setup, ['box'], (rt, t) => {
      rt.advanceTo(t)
      if (mode === 'paused') rt.eval(`tween.totalTime(${t / 1000}, false)`)
    })
    // GSAP's own view of the tween after each rendered frame
    const check = engine.create(GSAP_SCENE, { epochMs: 0 })
    check.eval(setup)
    const states = []
    for (const t of TIMES) {
      check.advanceTo(t)
      if (mode === 'paused') check.eval(`tween.totalTime(${t / 1000}, false)`)
      check.render()
      states.push({ t, ...check.eval(`(() => { const b = document.querySelector("#box"), s = getComputedStyle(b);
        return { x: gsap.getProperty(b, "x"), opacity: s.opacity, transform: s.transform, inlineTransform: b.style.transform, inlineOpacity: b.style.opacity } })()`) })
    }
    const version = check.eval('gsap.version')
    check.close()
    run.frames.forEach((f) => fs.writeFileSync(evidence(`frames/gsap-${mode}-${engine.name}-${f.t}.png`), f.png))
    // GSAP writes translate3d() mid-tween (force3D: "auto"), so the computed value is a
    // matrix3d(); compare the x translation of either form.
    const translateX = (tr) => {
      if (tr === 'none') return 0
      const n = tr.slice(tr.indexOf('(') + 1, -1).split(',').map(Number)
      return tr.startsWith('matrix3d') ? n[12] : n[4]
    }
    const expected = states.every((s) => Math.abs(Number(s.opacity) - (1 - s.t / 2000)) < 1e-6 && Math.abs(Number(s.x) - s.t / 10) < 1e-6 &&
      Math.abs(translateX(s.transform) - s.t / 10) < 1e-6)
    gsap[`${mode}-${engine.name}`] = { version, expectedValues: expected, states, ...strip(run) }
    console.log(`gsap ${mode} ${engine.name}: version ${version}, expected values=${expected}, errors=${run.errors.length}, console=${JSON.stringify(run.console)}`)
  }
  gsap[`${mode}-crossEngine`] = compareEngines(gsap[`${mode}-boa`], gsap[`${mode}-deno`])
  console.log(`gsap ${mode} cross-engine:`, JSON.stringify(gsap[`${mode}-crossEngine`]))
}
gsap.pausedVsAutoIdentical = Object.fromEntries(runtimes.map((e) => [e.name, eq(gsap[`paused-${e.name}`].frames.map((f) => f.pixels), gsap[`auto-${e.name}`].frames.map((f) => f.pixels))]))
console.log('gsap paused vs auto identical:', JSON.stringify(gsap.pausedVsAutoIdentical))
write('gsap.json', gsap)

// ------------------------------------------------------------------ Motion probe (diagnostic)
const motionSource = fs.readFileSync(new URL('../../../test/assets/motion.min.js', import.meta.url), 'utf8')
const motion = {}
for (const engine of runtimes) {
  const rt = engine.create(DATE_SCENE, { epochMs: 0 })
  const steps = []
  const attempt = (label, src) => {
    try { steps.push({ label, ok: true, value: rt.eval(src) }) } catch (e) { steps.push({ label, ok: false, error: String(e.message).split('\n')[0] }) }
  }
  attempt('load motion.min.js', motionSource + '\n;typeof Motion')
  attempt('typeof Motion.animate', 'typeof Motion.animate')
  attempt('animate(#box, {opacity, x}) paused', `globalThis.c = Motion.animate("#box", { opacity: [1, 0.5], x: [0, 100] }, { duration: 1, ease: "linear" }); c.pause(); typeof c`)
  for (const t of [0, 500, 1000]) {
    attempt(`seek ${t}`, `c.time = ${t / 1000}; (() => { const s = getComputedStyle(document.getElementById("box")); return [s.opacity, s.transform] })()`)
  }
  attempt('render, then computed at 1000', 'null'); try { rt.render() } catch (e) { steps.push({ label: 'render', ok: false, error: String(e.message).split('\n')[0] }) }
  attempt('computed after render', `(() => { const s = getComputedStyle(document.getElementById("box")); return [s.opacity, s.transform] })()`)
  attempt('animate(0, 100, onUpdate) value animation', `globalThis.v = []; globalThis.c2 = Motion.animate(0, 100, { duration: 1, ease: "linear", onUpdate: (x) => v.push(Math.round(x)) }); c2.pause(); c2.time = 0.5; v.slice(-1)`)
  // Next missing API after EventTarget (diagnostic only: a stand-in EventTarget, not an implementation)
  if (engine.name === 'deno') {
    attempt('with stand-in EventTarget: animate', `globalThis.EventTarget = globalThis.EventTarget || class EventTarget {};
      globalThis.c3 = Motion.animate("#box", { opacity: [1, 0.5] }, { duration: 1, ease: "linear" }); c3.pause(); c3.time = 0.5; getComputedStyle(document.getElementById("box")).opacity`)
    attempt('typeof element.animate', 'typeof document.getElementById("box").animate')
  }
  motion[engine.name] = { steps, jsErrors: rt.jsErrors() }
  try { rt.close() } catch {}
  console.log(`motion ${engine.name}: ` + steps.map((s) => `${s.label}=${s.ok ? JSON.stringify(s.value) : 'ERROR ' + s.error}`).join(' | '))
}
write('motion-probe.json', motion)
