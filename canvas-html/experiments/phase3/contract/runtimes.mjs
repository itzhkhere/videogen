// The two script runtimes behind one driver interface. Contract tests only see this interface,
// so every test runs unchanged on both engines.
//
//   create(html, { width, height, epochMs }) -> {
//     engine, eval(src), advanceTo(ms), render(), renderPng(), jsErrors(), clockTime(),
//     dropNode(selector), close()
//   }
//
// Boa is the production renderer (index.js, scripts: true, frozen clock). Deno is the Phase 3
// experimental addon. Both use the same fonts (Inter only, no system fonts), viewport and backdrop.
import { createRequire } from 'node:module'
import fs from 'node:fs'

const require = createRequire(import.meta.url)
const inter = fs.readFileSync(new URL('../../../test/assets/Inter-Regular.otf', import.meta.url))

let deno
function denoAddon() {
  if (!deno) {
    deno = require('../addon.node')
    deno.initPlatform()
  }
  return deno
}

export const boa = {
  name: 'boa',
  create(html, { width = 160, height = 64, epochMs = 0 } = {}) {
    const { HtmlRenderer } = require(process.env.BOA_ADDON_INDEX || '../../../index.js')
    const r = new HtmlRenderer({ width, height, scripts: true, systemFonts: false, epochMs })
    r.registerFont(inter)
    r.load(html)
    return {
      engine: 'boa',
      raw: r,
      eval: (src) => r.eval(src),
      advanceTo(ms) {
        const now = r.clockTime
        if (!(Number.isFinite(ms) && ms >= now)) throw new Error(`time must be finite and monotonic, got ${ms}`)
        r.advanceClock(ms - now)
      },
      render: () => r.render(),
      renderPng: () => r.render({ format: 'png' }),
      jsErrors: () => r.jsErrors,
      clockTime: () => r.clockTime,
      dropNode: (selector) => r._dropNodeForTesting(selector),
      close: () => r.close(),
    }
  },
}

export const denoRuntime = {
  name: 'deno',
  create(html, { width = 160, height = 64, epochMs = 0, evalTimeoutMs = 5000 } = {}) {
    const a = denoAddon()
    const r = new a.ExperimentalDenoRenderer(html, { width, height, epochMs, evalTimeoutMs })
    return {
      engine: 'deno',
      raw: r,
      eval: (src) => r.eval(src),
      advanceTo: (ms) => r.advanceTo(ms),
      render: () => r.render(),
      renderPng: () => r.render(true),
      jsErrors: () => r.jsErrors(),
      clockTime: () => r.clockTime(),
      dropNode: (selector) => r._dropNodeForTesting(selector),
      close: () => r.close(),
    }
  },
}

export const runtimes = [boa, denoRuntime]
