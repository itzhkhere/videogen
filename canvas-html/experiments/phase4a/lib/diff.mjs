// Pixel comparison, severity grading and diff images.
import fs from 'node:fs'
import { PNG } from 'pngjs'

/** Compares two RGBA buffers of the same size. Delta of a pixel = max channel difference. */
export function compare(a, b, w, h) {
  if (a.length !== b.length) throw new Error(`size mismatch ${a.length} vs ${b.length}`)
  const n = w * h
  let differing = 0, over8 = 0, over32 = 0, over64 = 0, max = 0, sum = 0, edge = 0, edge32 = 0
  for (let p = 0; p < n; p++) {
    const i = p * 4
    const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]), Math.abs(a[i + 3] - b[i + 3]))
    if (!d) continue
    differing++; sum += d
    if (d > max) max = d
    if (d > 8) over8++
    if (d > 32) over32++
    if (d > 64) over64++
    // An edge pixel: some colour channel of the reference changes by >24 to one of the 8
    // neighbours (antialiased geometry or glyph edges).
    if (isEdge(a, p, w, h)) {
      edge++
      if (d > 32) edge32++
    }
  }
  const pct = (k) => +((100 * k) / n).toFixed(4)
  const r = {
    differingPixels: differing, differingPct: pct(differing), maxDelta: max, meanDelta: differing ? +(sum / differing).toFixed(2) : 0,
    over8Pct: pct(over8), over32Pct: pct(over32), over64Pct: pct(over64), edgeFraction: differing ? +(edge / differing).toFixed(3) : 0,
    over32EdgeFraction: over32 ? +(edge32 / over32).toFixed(3) : 0,
  }
  r.severity = severity(r)
  return r
}

function isEdge(a, p, w, h) {
  const x = p % w, y = (p / w) | 0, i = p * 4
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if ((!dx && !dy) || x + dx < 0 || x + dx >= w || y + dy < 0 || y + dy >= h) continue
    const j = i + 4 * (dy * w + dx)
    if (Math.abs(a[i] - a[j]) > 24 || Math.abs(a[i + 1] - a[j + 1]) > 24 || Math.abs(a[i + 2] - a[j + 2]) > 24) return true
  }
  return false
}

/**
 * exact → near-exact (≤3 levels) → minor (≤0.1 % perceptible pixels) → edge-aa (more, but
 * ≥90 % of them on edges of the reference: antialiasing coverage) → moderate (≤1 %) → major.
 */
export function severity(r) {
  if (r.differingPixels === 0) return 'exact'
  if (r.maxDelta <= 3) return 'near-exact'
  if (r.over32Pct <= 0.1) return 'minor'
  if (r.over32EdgeFraction >= 0.9) return 'edge-aa'
  if (r.over32Pct <= 1) return 'moderate'
  return 'major'
}

/** Reference in dimmed grey, differing pixels in red (brightness = delta × 8). */
export function writeDiffImage(file, a, b, w, h) {
  const png = new PNG({ width: w, height: h })
  for (let p = 0; p < w * h; p++) {
    const i = p * 4
    const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]))
    const g = (a[i] * 0.3 + a[i + 1] * 0.59 + a[i + 2] * 0.11) * 0.3
    png.data[i] = d ? Math.min(255, 60 + d * 8) : g
    png.data[i + 1] = d ? 0 : g
    png.data[i + 2] = d ? 0 : g
    png.data[i + 3] = 255
  }
  fs.writeFileSync(file, PNG.sync.write(png))
}

/** CSS that removes one class of paint operation, for attributing a difference. */
export const ABLATIONS = {
  text: '*{color:transparent!important;text-shadow:none!important}',
  filters: '*{filter:none!important}',
  shadows: '*{box-shadow:none!important;text-shadow:none!important}',
  images: 'img{visibility:hidden!important}',
  gradients: '*{background-image:none!important}',
  opacity: '*{opacity:1!important}',
}
export const CATEGORY = {
  text: 'text rasterization difference',
  filters: 'filter precision difference',
  shadows: 'shadow/blur precision difference',
  images: 'image sampling difference',
  gradients: 'gradient interpolation difference',
  opacity: 'layer/opacity blending difference',
  none: 'geometry antialiasing difference',
}
export const ablate = (html, css) => html.replace('</style>', css + '</style>')
