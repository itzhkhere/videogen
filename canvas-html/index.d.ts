export interface RendererOptions {
  /** Output width in CSS pixels. */
  width: number
  /** Output height in CSS pixels. */
  height: number
  /** CSS pixels are multiplied by this. Default 1. */
  devicePixelRatio?: number
  /** Painted under the page, "#rrggbb" or "#rrggbbaa". Default "#ffffff". */
  background?: string
  /** Also use fonts installed on this machine. Default true. */
  systemFonts?: boolean
  /**
   * Families to try, in order, for text in a script the element's font lacks, keyed by
   * ISO 15924 tag, e.g. { Taml: ['Noto Sans Tamil'] }. Merged over the built-in defaults.
   */
  fallbackFonts?: Record<string, string[]>
  /** Run the page's <script> tags (Boa JS engine). Default false. */
  scripts?: boolean
  /**
   * "frozen" (default): Date, performance.now, timers and CSS animations stand still until you
   * call advanceClock(ms), so every render of the same state gives the same pixels.
   * "real": the clock follows the wall clock, like a browser tab.
   */
  clock?: 'frozen' | 'real'
  /**
   * Epoch of JS time, in ms since the Unix epoch: performance.timeOrigin, and Date.now() at clock 0.
   * With the frozen clock, Date.now() = floor(epochMs + clockTime) and performance.now() = clockTime.
   * Default: the wall-clock time at load.
   */
  epochMs?: number
}
export interface RenderOptions {
  /** "rgba" (default): raw pixels, 4 bytes per pixel, row by row. "png": a PNG file. */
  format?: 'rgba' | 'png'
}
export interface MissingGlyphs {
  /** The element's id, or its tag name when it has none. */
  element: string
  /** Characters no available font could draw (each listed once). */
  chars: string
  count: number
}
export interface ElementBox { id: string; tag: string; x: number; y: number; width: number; height: number }
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
export declare class HtmlRenderer {
  constructor(options: RendererOptions)
  /** Register a TTF/OTF/TTC/WOFF font; use its family name in CSS. Applies to the next load(). */
  registerFont(data: Buffer): void
  /** Load a document and run its scripts. baseUrl (file://...) resolves images, fonts and stylesheets. */
  load(html: string, baseUrl?: string | null): void
  /**
   * Draw the document as it is now. Like a browser's rendering step, it first updates running
   * Web Animations and runs requestAnimationFrame callbacks, then styles, lays out and paints.
   */
  render(options?: { format?: 'rgba' }): Buffer
  render(options: { format: 'png' }): Buffer
  render(options?: RenderOptions): Buffer
  /** Move the frozen clock forward by ms. Timers that come due on the way run in order. */
  advanceClock(ms: number): void
  /** The document's clock, in ms since load. */
  readonly clockTime: number
  /**
   * Run JavaScript in the page (needs scripts: true) and return its result through JSON.
   * Throws if the code throws.
   */
  eval(code: string): JsonValue
  /** Call a global function of the page: r.call('seek', 1500). Arguments and result go through JSON. */
  call(name: string, ...args: JsonValue[]): JsonValue
  /** Text drawn as empty boxes because no font has the characters. Register a font that covers them. */
  missingGlyphs(): MissingGlyphs[]
  /** Layout boxes of every element with an id (page coordinates, before transforms). */
  boxes(): ElementBox[]
  /** Uncaught JavaScript errors since load. */
  readonly jsErrors: string[]
  /** Resources that failed to load. */
  readonly loadErrors: string[]
  readonly pixelWidth: number
  readonly pixelHeight: number
  /** Release the document and script runtime now. Idempotent; later calls throw "renderer is closed". */
  close(): void
  /**
   * Testing only: drop the native node matched by selector, as an embedder teardown would. Its JS
   * wrappers become stale and throw an InvalidStateError DOMException when used.
   */
  _dropNodeForTesting(selector: string): boolean
}
