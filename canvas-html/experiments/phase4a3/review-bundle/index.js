'use strict'
const path = require('node:path')

function loadNative() {
  const candidates = [`html-renderer.${process.platform}-${process.arch}-gnu.node`, `html-renderer.${process.platform}-${process.arch}.node`]
  for (const f of candidates) {
    try { return require(path.join(__dirname, f)) } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e }
  }
  throw new Error(`html-renderer: no native build for ${process.platform}-${process.arch}. Run "npm run build" (needs Rust).`)
}
const { HtmlRenderer } = loadNative()

/**
 * Call a global function of the page with JSON-serialisable arguments and return its result
 * (through JSON). Throws if the function is missing or throws. Needs `scripts: true`.
 *   r.call('seek', 1500)
 */
HtmlRenderer.prototype.call = function call(name, ...args) {
  const fn = JSON.stringify(String(name))
  return this.eval(
    `(() => { const f = globalThis[${fn}]; if (typeof f !== 'function') throw new TypeError(${fn} + ' is not a function on the page'); return f(...${JSON.stringify(args)}); })()`
  )
}

module.exports = { HtmlRenderer }
