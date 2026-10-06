// CPU vs GPU correctness for scenes A–G at 720p, 1080p and 4K.
// Saves every 720p output (cpu, gpu-gl, gpu-vulkan), a diff image for every non-exact pair at
// 720p/1080p (and at 4K when moderate or major), and attributes each 720p difference to an
// operation class by ablation: remove one class (text, filters, shadows, images, gradients,
// opacity) on both backends and see how much of the difference goes away.
import fs from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'
import { SCENES, RESOLUTIONS, BACKENDS, prepareAssets, baseUrl } from './lib/scenes.mjs'
import { make, expectBackend, sha, writeResult, resultsDir, log } from './lib/common.mjs'
import { compare, writeDiffImage, ABLATIONS, CATEGORY, ablate } from './lib/diff.mjs'

prepareAssets()
const imgDir = path.join(resultsDir, 'images')
fs.mkdirSync(imgDir, { recursive: true })
const gpus = BACKENDS.filter((b) => b !== 'cpu')
const only = process.env.PHASE4A_SCENES?.split(',')
const scenes = SCENES.filter((s) => !only || only.includes(s.id))

const savePng = (file, buf, w, h) => {
  const png = new PNG({ width: w, height: h })
  buf.copy(png.data)
  fs.writeFileSync(file, PNG.sync.write(png))
}

const report = { resolutions: {}, attribution: {} }
const onlyRes = process.env.PHASE4A_RES?.split(',')
for (const res of RESOLUTIONS.filter((x) => !onlyRes || onlyRes.includes(x.name))) {
  log('correctness', res.name)
  // One long-lived renderer per backend and resolution; the scenes are loaded into it in turn.
  const px = {}
  for (const b of BACKENDS) {
    const r = make(b, null, { dpr: res.dpr })
    px[b] = {}
    for (const s of scenes) {
      r.load(s.html(), baseUrl)
      px[b][s.id] = expectBackend(r._renderTimed({ format: 'rgba' }), b).pixels
    }
    r.close()
  }
  const rows = {}
  for (const s of scenes) {
    const row = { hashes: Object.fromEntries(BACKENDS.map((b) => [b, sha(px[b][s.id])])) }
    if (res.name === '720p') for (const b of BACKENDS) savePng(path.join(imgDir, `${s.id}-${res.name}-${b}.png`), px[b][s.id], res.w, res.h)
    for (const g of gpus) {
      const c = compare(px.cpu[s.id], px[g][s.id], res.w, res.h)
      row[`cpu-vs-${g}`] = c
      const wantDiff = c.severity !== 'exact' && (res.name !== '4K' || ['edge-aa', 'moderate', 'major'].includes(c.severity))
      if (wantDiff) writeDiffImage(path.join(imgDir, `${s.id}-${res.name}-diff-cpu-vs-${g}.png`), px.cpu[s.id], px[g][s.id], res.w, res.h)
    }
    if (gpus.length === 2) row['gl-vs-vulkan'] = compare(px[gpus[0]][s.id], px[gpus[1]][s.id], res.w, res.h)
    rows[s.id] = row
    log(' ', s.id, gpus.map((g) => `${g}: ${row[`cpu-vs-${g}`].severity} (${row[`cpu-vs-${g}`].differingPct}% px, max ${row[`cpu-vs-${g}`].maxDelta}, >32: ${row[`cpu-vs-${g}`].over32Pct}%)`).join(' | '))
  }
  report.resolutions[res.name] = rows
}

// Attribution by ablation at 720p, against the first GPU backend.
const g = gpus[0]
if (g && report.resolutions['720p']) {
  const res = RESOLUTIONS[0]
  const cpu = make('cpu', null, { dpr: res.dpr }), gpu = make(g, null, { dpr: res.dpr })
  const pair = (html) => {
    cpu.load(html, baseUrl); gpu.load(html, baseUrl)
    return compare(expectBackend(cpu._renderTimed({ format: 'rgba' }), 'cpu').pixels, expectBackend(gpu._renderTimed({ format: 'rgba' }), g).pixels, res.w, res.h)
  }
  for (const s of scenes) {
    const base = report.resolutions['720p'][s.id][`cpu-vs-${g}`]
    if (base.severity === 'exact') { report.attribution[s.id] = { class: 'exact match' }; continue }
    const removed = {}
    for (const [k, css] of Object.entries(ABLATIONS)) {
      const c = pair(ablate(s.html(), css))
      removed[k] = { differingPixels: c.differingPixels, over32Pct: c.over32Pct, removedShare: +(1 - c.differingPixels / base.differingPixels).toFixed(3) }
    }
    const top = Object.entries(removed).sort((a, b) => b[1].removedShare - a[1].removedShare)[0]
    const cat = top && top[1].removedShare >= 0.25 ? top[0] : 'none'
    report.attribution[s.id] = { severity: base.severity, class: base.severity === 'near-exact' ? 'near-exact (rounding)' : CATEGORY[cat], dominant: cat, ablations: removed }
    log('  attribution', s.id, report.attribution[s.id].class)
  }
  cpu.close(); gpu.close()
}
writeResult('correctness.json', report)
log('wrote', path.join(resultsDir, 'correctness.json'))
