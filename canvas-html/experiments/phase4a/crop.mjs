// Zoomed side-by-side crop, CPU (left) vs a GPU backend (right), for inspecting diff areas.
// node crop.mjs <scene> <dpr> <x> <y> <w> <h> <zoom> <out.png> [gpu-backend]
import fs from 'node:fs'
import { PNG } from 'pngjs'
import { make, expectBackend } from './lib/common.mjs'
import { SCENES, baseUrl } from './lib/scenes.mjs'
const [id, dpr, x0, y0, w, h, z] = [process.argv[2], +process.argv[3], +process.argv[4], +process.argv[5], +process.argv[6], +process.argv[7], +process.argv[8]]
const W = Math.round(1280 * dpr)
const px = {}
const g = process.argv[10] ?? 'gpu-gl'
for (const b of ['cpu', g]) { const r = make(b, SCENES.find((s) => s.id === id).html(), { dpr }); px[b] = expectBackend(r._renderTimed({ format: 'rgba' }), b).pixels; r.close() }
const out = new PNG({ width: w * z * 2 + 8, height: h * z })
for (let y = 0; y < h * z; y++) for (let x = 0; x < out.width; x++) {
  const o = (y * out.width + x) * 4, side = x < w * z ? 'cpu' : x >= w * z + 8 ? g : null
  if (!side) { out.data.set([255, 255, 255, 255], o); continue }
  const sx = x0 + Math.floor((side === 'cpu' ? x : x - w * z - 8) / z), sy = y0 + Math.floor(y / z), i = (sy * W + sx) * 4
  out.data.set(px[side].subarray(i, i + 4), o)
}
fs.writeFileSync(process.argv[9], PNG.sync.write(out))
