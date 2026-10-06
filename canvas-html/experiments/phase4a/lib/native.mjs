// Loads the experimental GPU-capable build (CANVAS_HTML_NODE overrides the path).
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const here = path.dirname(fileURLToPath(import.meta.url))
export const nativePath = path.resolve(process.env.CANVAS_HTML_NODE ?? path.join(here, '..', 'build', 'canvas-html-gpu.node'))
export const { HtmlRenderer } = createRequire(import.meta.url)(nativePath)
HtmlRenderer.prototype.call ??= function call(name, ...args) {
  const fn = JSON.stringify(String(name))
  return this.eval(`(() => { const f = globalThis[${fn}]; if (typeof f !== 'function') throw new TypeError(${fn} + ' is not a function'); return f(...${JSON.stringify(args)}); })()`)
}
