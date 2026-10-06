// Phase 4A benchmark scenes A–G. Every scene is a 1280×720 CSS viewport; the output
// resolution comes from devicePixelRatio (1 → 720p, 1.5 → 1080p, 3 → 4K), so the layout and
// paint commands are identical at every resolution and only the pixel work grows.
// Inputs are deterministic: bundled fonts (Inter), local images, a seeded PRNG, no network,
// frozen clock.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { PNG } from 'pngjs'

const here = path.dirname(fileURLToPath(import.meta.url))
export const root = path.resolve(here, '..')
export const repo = path.resolve(root, '..', '..')
export const assetDir = path.join(root, 'assets')
export const baseUrl = pathToFileURL(assetDir + '/').href

export const VIEWPORT = { width: 1280, height: 720 }
export const RESOLUTIONS = [
  { name: '720p', dpr: 1, w: 1280, h: 720 },
  { name: '1080p', dpr: 1.5, w: 1920, h: 1080 },
  { name: '4K', dpr: 3, w: 3840, h: 2160 },
]

// Mulberry32: the same sequence on every machine.
export function prng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Copies the fonts and photo and writes a procedural 1600×1000 image (deterministic). */
export function prepareAssets() {
  fs.mkdirSync(assetDir, { recursive: true })
  for (const f of ['Inter-Regular.otf', 'Inter-Bold.otf', 'photo.png', 'gsap.min.js']) {
    const dst = path.join(assetDir, f)
    if (!fs.existsSync(dst)) fs.copyFileSync(path.join(repo, 'test', 'assets', f), dst)
  }
  const big = path.join(assetDir, 'texture.png')
  if (!fs.existsSync(big)) {
    const w = 1600, h = 1000, png = new PNG({ width: w, height: h })
    const rnd = prng(7)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const n = rnd() * 40
      png.data[i] = (x / w) * 200 + n
      png.data[i + 1] = (y / h) * 180 + n
      png.data[i + 2] = 128 + 100 * Math.sin((x + y) / 60) + n / 2
      png.data[i + 3] = 255
    }
    fs.writeFileSync(big, PNG.sync.write(png))
  }
}

const head = (css) => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Inter;font-weight:400;src:url(Inter-Regular.otf)}
@font-face{font-family:Inter;font-weight:700;src:url(Inter-Bold.otf)}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1280px;height:720px;overflow:hidden}
body{font-family:Inter;background:#0b1020;color:#fff}
${css}</style></head><body>`
const tail = '</body></html>'
const pick = (rnd, xs) => xs[Math.floor(rnd() * xs.length)]
const COLORS = ['#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#a855f7', '#22d3ee', '#eab308', '#ec4899']

// A. Simple typography: few text nodes, solid backgrounds, basic layout.
function sceneA() {
  return head(`body{background:#f8fafc;color:#0f172a;padding:64px}
  h1{font-size:56px;font-weight:700}p{font-size:22px;line-height:1.5;margin-top:18px;max-width:900px;color:#334155}
  .row{display:flex;gap:24px;margin-top:36px}.box{width:200px;height:120px;border-radius:12px;background:#2563eb}
  .box:nth-child(2){background:#16a34a}.box:nth-child(3){background:#dc2626}`) +
    `<h1>Quarterly summary</h1><p>Revenue grew in every region. The new renderer turns HTML into frames without a browser.</p>
    <p>Second paragraph: plain text, solid fills and a simple flex row.</p>
    <div class="row"><div class="box"></div><div class="box"></div><div class="box"></div></div>` + tail
}

// B. Large typography: many text nodes, large sizes, mixed weights, transforms, opacity.
function sceneB() {
  const rnd = prng(2)
  const words = ['Render', 'pixels', 'Skia', 'GPU', 'layout', 'frame', 'glyph', 'Blitz', 'motion', 'canvas', 'stylo', 'type']
  let s = ''
  for (let i = 0; i < 300; i++) {
    const size = Math.round(12 + rnd() ** 2 * 110)
    s += `<span style="left:${(rnd() * 1200) | 0}px;top:${(rnd() * 700) | 0}px;font-size:${size}px;font-weight:${rnd() < 0.5 ? 400 : 700};` +
      `color:${pick(rnd, COLORS)};opacity:${(0.35 + rnd() * 0.65).toFixed(2)};transform:rotate(${((rnd() - 0.5) * 50).toFixed(1)}deg) scale(${(0.7 + rnd() * 0.8).toFixed(2)})">` +
      `${pick(rnd, words)} ${pick(rnd, words)}</span>`
  }
  return head('span{position:absolute;white-space:nowrap;transform-origin:0 0}') + s + tail
}

// C. Image-heavy: multiple images, scaled, cropped, opacity, transforms.
function sceneC() {
  const rnd = prng(3)
  let s = ''
  for (let i = 0; i < 60; i++) {
    const w = (80 + rnd() * 320) | 0, h = (60 + rnd() * 220) | 0
    const src = rnd() < 0.5 ? 'photo.png' : 'texture.png'
    const crop = rnd() < 0.5
    s += `<div class="c" style="left:${(rnd() * 1150) | 0}px;top:${(rnd() * 640) | 0}px;width:${w}px;height:${h}px;opacity:${(0.5 + rnd() * 0.5).toFixed(2)};` +
      `transform:rotate(${((rnd() - 0.5) * 30).toFixed(1)}deg) scale(${(0.6 + rnd() * 0.9).toFixed(2)});border-radius:${crop ? 24 : 0}px">` +
      `<img src="${src}" style="width:${crop ? 180 : 100}%;height:${crop ? 180 : 100}%;margin-left:${crop ? -30 : 0}%;margin-top:${crop ? -20 : 0}%"></div>`
  }
  return head('.c{position:absolute;overflow:hidden}.c img{display:block}') + s + tail
}

// D. Gradient-heavy: linear, radial and conic gradients, many overlapping backgrounds.
function sceneD() {
  const rnd = prng(4)
  let s = ''
  for (let i = 0; i < 120; i++) {
    const a = pick(rnd, COLORS), b = pick(rnd, COLORS), c = pick(rnd, COLORS)
    const kind = i % 3
    const bg = kind === 0 ? `linear-gradient(${(rnd() * 360) | 0}deg,${a},${b} 60%,${c})`
      : kind === 1 ? `radial-gradient(circle at ${(rnd() * 100) | 0}% ${(rnd() * 100) | 0}%,${a},${b} 50%,transparent 70%)`
      : `linear-gradient(90deg,${a}80,transparent),radial-gradient(${b},${c})`
    s += `<div style="left:${(rnd() * 1150) | 0}px;top:${(rnd() * 620) | 0}px;width:${(60 + rnd() * 400) | 0}px;height:${(60 + rnd() * 300) | 0}px;` +
      `background:${bg};opacity:${(0.4 + rnd() * 0.6).toFixed(2)};border-radius:${(rnd() * 80) | 0}px"></div>`
  }
  return head('body{background:radial-gradient(circle at 30% 20%,#1e3a8a,#0b1020 70%)}div{position:absolute}') + s + tail
}

// E. Shadows, blur, filters, opacity layers.
function sceneE() {
  const rnd = prng(5)
  let s = ''
  for (let i = 0; i < 48; i++) {
    const f = i % 4
    const filter = f === 0 ? 'filter:blur(4px)' : f === 1 ? 'filter:drop-shadow(0 8px 12px rgba(0,0,0,.7)) saturate(1.5)' : f === 2 ? 'filter:grayscale(.6) brightness(1.2)' : ''
    s += `<div class="k" style="left:${(rnd() * 1100) | 0}px;top:${(rnd() * 560) | 0}px;background:${pick(rnd, COLORS)};` +
      `box-shadow:0 ${(rnd() * 30) | 0}px ${(20 + rnd() * 60) | 0}px rgba(0,0,0,.6),0 0 ${(rnd() * 40) | 0}px ${pick(rnd, COLORS)};opacity:${(0.6 + rnd() * 0.4).toFixed(2)};${filter}">` +
      `<b>Card ${i}</b></div>`
  }
  return head(`body{background:#e2e8f0}.k{position:absolute;width:170px;height:120px;border-radius:18px;padding:16px;
    font-size:22px;text-shadow:0 2px 6px rgba(0,0,0,.6)}`) + s + tail
}

// F. SVG / paths: many paths, strokes, fills, transforms, clips.
function sceneF() {
  const rnd = prng(6)
  let p = ''
  for (let i = 0; i < 400; i++) {
    const x = rnd() * 1280, y = rnd() * 720, r = 10 + rnd() * 60
    const d = `M${x.toFixed(1)} ${y.toFixed(1)} C${(x + r).toFixed(1)} ${(y - r).toFixed(1)} ${(x + 2 * r).toFixed(1)} ${(y + r).toFixed(1)} ${(x + 3 * r).toFixed(1)} ${y.toFixed(1)} ` +
      `S${(x + r).toFixed(1)} ${(y + 2 * r).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}Z`
    const clip = i % 5 === 0 ? ' clip-path="url(#cl)"' : ''
    p += `<path d="${d}" fill="${pick(rnd, COLORS)}" fill-opacity="${(0.2 + rnd() * 0.6).toFixed(2)}" stroke="${pick(rnd, COLORS)}" ` +
      `stroke-width="${(1 + rnd() * 5).toFixed(1)}" transform="rotate(${((rnd() - 0.5) * 40).toFixed(1)} ${x.toFixed(0)} ${y.toFixed(0)})"${clip}/>`
  }
  return head('svg{position:absolute;left:0;top:0}') +
    `<svg width="1280" height="720" viewBox="0 0 1280 720"><defs><clipPath id="cl"><circle cx="640" cy="360" r="300"/></clipPath></defs>${p}</svg>` + tail
}

// G. Layer/transform stress: n independently transformed elements.
function sceneG(n) {
  const rnd = prng(100 + n)
  let s = ''
  for (let i = 0; i < n; i++) {
    s += `<div style="left:${(rnd() * 1240) | 0}px;top:${(rnd() * 690) | 0}px;background:${pick(rnd, COLORS)};opacity:${(0.3 + rnd() * 0.7).toFixed(2)};` +
      `transform:translate(${((rnd() - 0.5) * 40).toFixed(1)}px,${((rnd() - 0.5) * 40).toFixed(1)}px) rotate(${(rnd() * 360).toFixed(1)}deg) scale(${(0.5 + rnd()).toFixed(2)})"></div>`
  }
  return head('div{position:absolute;width:40px;height:28px;border-radius:6px;border:2px solid rgba(255,255,255,.6)}') + s + tail
}

export const SCENES = [
  { id: 'A', name: 'simple typography', html: sceneA },
  { id: 'B', name: 'large typography', html: sceneB },
  { id: 'C', name: 'image-heavy', html: sceneC },
  { id: 'D', name: 'gradient-heavy', html: sceneD },
  { id: 'E', name: 'shadows/blur/filters', html: sceneE },
  { id: 'F', name: 'SVG/paths', html: sceneF },
  { id: 'G100', name: 'transform stress ×100', html: () => sceneG(100) },
  { id: 'G500', name: 'transform stress ×500', html: () => sceneG(500) },
  { id: 'G1000', name: 'transform stress ×1000', html: () => sceneG(1000) },
]

/** Animated scenes (page contract: window.seek(ms)). Files are in test/scenes. */
export const ANIMATED = [
  { id: 'css', name: 'CSS animation (test/scenes/motion.html)', file: path.join(repo, 'test', 'scenes', 'motion.html') },
  { id: 'gsap', name: 'GSAP timeline (test/scenes/gsap.html)', file: path.join(repo, 'test', 'scenes', 'gsap.html') },
  { id: 'effects', name: 'CSS effects: image, gradients, shadow, SVG (test/scenes/effects.html)', file: path.join(repo, 'test', 'scenes', 'effects.html') },
]

export const BACKENDS = (process.env.PHASE4A_BACKENDS ?? 'cpu,gpu-gl,gpu-vulkan').split(',')
