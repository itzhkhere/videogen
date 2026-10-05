// Renders every scene in test/scenes with canvas-html and with headless Chrome at the same
// times. Every scene follows the page contract: window.seek(ms) shows the page at ms, and both
// engines call that same function before they draw. It then reports PSNR (higher = closer; ~30 dB looks the same at a glance,
// 40+ dB is near identical) and speed. Writes side-by-side images to test/report/.
// Usage: node test/compare.mjs [chromePath]
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { PNG } from 'pngjs'
import { chromium } from 'playwright-core'
const { HtmlRenderer } = createRequire(import.meta.url)('../index.js')

const here = path.dirname(fileURLToPath(import.meta.url))
const W = 1280, H = 720
const CHROME = process.argv[2] || process.env.CHROME_PATH || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'
const TIMES = { motion: [0, 700, 1500, 2600, 4300, 5970], gsap: [0, 400, 900, 1200, 1800, 3200], 'motion-library': [0, 300, 700, 1200, 1600, 2200, 3200], waapi: [0, 150, 400, 700, 1000, 1500], default: [0, 200, 500, 1000, 2500] }
const SPEED_FRAMES = 90
const outDir = path.join(here, 'report'); fs.mkdirSync(outDir, { recursive: true })

function psnr(a, b) {
  let se = 0
  for (let i = 0; i < a.length; i += 4) for (let c = 0; c < 3; c++) { const d = a[i + c] - b[i + c]; se += d * d }
  const mse = se / ((a.length / 4) * 3)
  return mse === 0 ? 99 : 10 * Math.log10((255 * 255) / mse)
}
function sideBySide(a, b, file) {
  // [canvas-html | chrome | |diff| x4]
  const out = new PNG({ width: W * 3, height: H })
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const s = (y * W + x) * 4
    for (let k = 0; k < 3; k++) {
      const o = (y * W * 3 + x + k * W) * 4
      for (let c = 0; c < 3; c++) out.data[o + c] = k === 0 ? a[s + c] : k === 1 ? b[s + c] : Math.min(255, Math.abs(a[s + c] - b[s + c]) * 4)
      out.data[o + 3] = 255
    }
  }
  fs.writeFileSync(file, PNG.sync.write(out))
}

const browser = await chromium.launch({ executablePath: CHROME })
const page = await browser.newPage({ viewport: { width: W, height: H } })
const ONLY = process.env.ONLY
const scenes = fs.readdirSync(path.join(here, 'scenes')).filter((f) => f.endsWith('.html')).sort()
  .filter((f) => !ONLY || f.startsWith(ONLY))
const chromeSeek = (t) => page.evaluate((t) => { window.seek(t) }, t) // braces: seek may return a timeline object
const at = (r, t) => { r.call('seek', t); return r.render() }
const rows = []
for (const file of scenes) {
  const name = file.replace('.html', '')
  const full = path.join(here, 'scenes', file)
  const html = fs.readFileSync(full, 'utf8')
  const baseUrl = pathToFileURL(path.dirname(full) + '/').href
  const r = new HtmlRenderer({ width: W, height: H, background: '#ffffff', systemFonts: true, scripts: true })
  r.load(html, baseUrl)

  await page.goto(pathToFileURL(full).href)
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all([...document.images].map((i) => (i.complete ? 0 : new Promise((r) => (i.onload = i.onerror = r)))))
  })
  // Chrome quirk: after the first pause, compositor animations keep showing the frame they had
  // when they were paused until the next seek, so the first seek(0) looks advanced. Seek to
  // another time and capture once before measuring.
  await chromeSeek(50)
  await page.screenshot({ type: 'png' })
  const scores = []
  for (const t of TIMES[name] || TIMES.default) {
    await chromeSeek(t)
    // let Chrome present the seeked frame (composited animations can lag one frame)
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
    const chrome = PNG.sync.read(await page.screenshot({ type: 'png' })).data
    const mine = at(r, t)
    const p = psnr(mine, chrome)
    scores.push(p)
    sideBySide(mine, chrome, path.join(outDir, `${name}_${t}ms.png`))
  }

  // speed: SPEED_FRAMES sequential frames at 30 fps
  const r2 = new HtmlRenderer({ width: W, height: H, scripts: true }); r2.load(html, baseUrl)
  let t0 = performance.now()
  for (let i = 0; i < SPEED_FRAMES; i++) at(r2, (i / 30) * 1000)
  const mineFps = SPEED_FRAMES / ((performance.now() - t0) / 1000)
  t0 = performance.now()
  for (let i = 0; i < SPEED_FRAMES; i++) {
    await chromeSeek((i / 30) * 1000)
    await page.screenshot({ type: 'jpeg', quality: 92 })
  }
  const chromeFps = SPEED_FRAMES / ((performance.now() - t0) / 1000)
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length
  rows.push({ scene: name, psnr_avg: +avg.toFixed(1), psnr_min: +Math.min(...scores).toFixed(1), canvas_html_fps: +mineFps.toFixed(1), chrome_fps: +chromeFps.toFixed(1), load_errors: r.loadErrors.length, js_errors: r.jsErrors.length })
  console.log(rows.at(-1))
}
await browser.close()
const md = ['| scene | PSNR avg | PSNR min | canvas-html fps | Chrome fps (JPEG capture) | speedup |', '|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.scene} | ${r.psnr_avg} dB | ${r.psnr_min} dB | ${r.canvas_html_fps} | ${r.chrome_fps} | ${(r.canvas_html_fps / r.chrome_fps).toFixed(1)}x |`)].join('\n')
fs.writeFileSync(path.join(outDir, 'results.md'), md + '\n')
console.log('\n' + md)
