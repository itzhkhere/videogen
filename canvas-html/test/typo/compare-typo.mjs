// Renders test/typo/sheet.html with canvas-html and Chrome, scores each cell, and writes
// report.png: one row per feature [canvas-html | Chrome | difference x4] plus results.json.
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { PNG } from 'pngjs'
import { chromium } from 'playwright-core'
const { HtmlRenderer } = createRequire(import.meta.url)('../../index.js')

const here = path.dirname(fileURLToPath(import.meta.url))
const W = 1280, H = 720, CW = 320, CH = 144
const sheet = path.join(here, process.argv[2] || 'sheet.html')
const html = fs.readFileSync(sheet, 'utf8')
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'

const r = new HtmlRenderer({ width: W, height: H })
r.load(html, pathToFileURL(path.dirname(sheet) + '/').href)
const mine = r.render()

const browser = await chromium.launch({ executablePath: CHROME })
const page = await browser.newPage({ viewport: { width: W, height: H } })
await page.goto(pathToFileURL(sheet).href)
await page.evaluate(() => document.fonts.ready)
const labels = await page.evaluate(() => [...document.querySelectorAll('.c > b')].map((b) => b.textContent))
const chrome = PNG.sync.read(await page.screenshot({ type: 'png' })).data
await browser.close()

const rows = []
const out = new PNG({ width: CW * 3, height: CH * labels.length })
labels.forEach((label, i) => {
  const cx = (i % 4) * CW, cy = Math.floor(i / 4) * CH
  let se = 0
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const s = ((cy + y) * W + cx + x) * 4
    for (let k = 0; k < 3; k++) {
      const o = ((i * CH + y) * CW * 3 + x + k * CW) * 4
      for (let c = 0; c < 3; c++) {
        const d = mine[s + c] - chrome[s + c]
        if (k === 0) se += d * d
        out.data[o + c] = k === 0 ? mine[s + c] : k === 1 ? chrome[s + c] : 255 - Math.min(255, Math.abs(d) * 4)
      }
      out.data[o + 3] = 255
    }
  }
  const mse = se / (CW * CH * 3)
  rows.push({ feature: label, psnr: +(mse === 0 ? 99 : 10 * Math.log10(65025 / mse)).toFixed(1) })
})
fs.writeFileSync(path.join(here, 'report.png'), PNG.sync.write(out))
fs.writeFileSync(path.join(here, 'results.json'), JSON.stringify(rows, null, 1))
for (const row of rows) console.log(String(row.psnr).padStart(5), 'dB ', row.feature)
