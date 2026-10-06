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
  /**
   * Experimental (Phase 4A; private, may change): the paint surface. "cpu" (default, Skia raster) is
   * the only backend of default builds. "gpu-gl" / "gpu-vulkan" (Skia Ganesh) need a build with the
   * experimental-gpu(-vulkan) feature, "gpu-graphite" (Skia Graphite on Vulkan) a build with
   * experimental-graphite. A backend that cannot start throws; there is no silent fallback.
   */
  experimentalBackend?: 'cpu' | 'gpu-gl' | 'gpu-vulkan' | 'gpu-graphite'
  /** Experimental: "renderer" (default): own GPU device; "thread": share one with this thread's renderers. */
  experimentalGpuShare?: 'renderer' | 'thread'
}
/** Experimental (Phase 4A): options of _renderTimed. */
export interface TimedRenderOptions {
  /** "rgba" (default), "png", or "none" (no pixels returned). */
  format?: 'rgba' | 'png' | 'none'
  /** GPU: copy the frame back to the CPU (default true; forced by "rgba"/"png"). */
  readback?: boolean
  /** Also time Blitz paint-command generation alone (an extra pass), as `paintPrep`. */
  measurePaintPrep?: boolean
  /**
   * Experimental (Phase 4A.1): how RGBA pixels reach Node. "transfer" (default; what render()
   * does): the frame is handed to the Buffer, no copy. "clone": painted into a reused scratch
   * frame, then copied (Phase 4A). "pool": like "transfer", but the Buffer's finalizer returns the
   * frame to a small pool for reuse (Design B).
   */
  output?: 'transfer' | 'clone' | 'pool'
  /** "pool" output: frames the pool keeps for reuse. Default 3. */
  poolSize?: number
}
/** Experimental (Phase 4A): a frame and where its time went. */
export interface TimedRender {
  /** The backend that drew the frame: "cpu-raster", "ganesh-gl", "ganesh-vulkan" or "graphite-vulkan". */
  backend: string
  /** Nanoseconds: frameJs, resolve, paintPrep?, alloc, paint, gpuSubmit, gpuWait, readback, copy, buffer, png?, total. */
  timingsNs: Record<string, number>
  pixels?: Buffer
}
/** Experimental (Phase 4A.1): options of _renderFramesExperimental. */
export interface FramesOptions {
  /**
   * "sync" (default): render, wait, read back, frame by frame (any backend). "deferred": up to
   * `depth` frames in flight on a ring of GPU surfaces, each read back later (Ganesh GL or Vulkan).
   * "pbo": Ganesh GL only, the read back goes into pixel-pack buffers with fences.
   */
  mode?: 'sync' | 'deferred' | 'pbo'
  /** Frames in flight for "deferred"/"pbo", 1–8. Default 2. */
  depth?: number
  /**
   * How the page is moved to each time: "page" (its global seek(t); the default with scripts) or
   * "clock" (the frozen clock; times must not go back).
   */
  seek?: 'page' | 'clock'
}
/** Experimental (Phase 4A.1): result of _renderFramesExperimental. */
export interface FramesResult {
  backend: string
  mode: string
  frames: number
  totalNs: number
  /** Per-frame nanoseconds: seek, prepare, paint, gpuSubmit, gpuWait, readback, latency (pipelined modes). */
  seriesNs: Record<string, number[]>
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
   *
   * Every call returns a new Buffer that owns its pixels and stays valid after close(). Its
   * native memory is freed when Node finalizes the Buffer, which happens on event-loop turns:
   * a synchronous loop of renders keeps every frame until it yields. The Buffer can be sent to a
   * worker by copy (postMessage(buf)) but not transferred (Node rejects external memory).
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
  /** Experimental (Phase 4A): render like render() and report the time of every step. */
  _renderTimed(options?: TimedRenderOptions): TimedRender
  /**
   * Experimental (Phase 4A.1, Design C): render into a caller-owned byte view of exactly
   * pixelWidth × pixelHeight × 4 bytes (Buffer, Uint8Array, or a view of an ArrayBuffer or
   * SharedArrayBuffer). Nothing is allocated or copied in canvas-html. The view is overwritten;
   * the caller decides when to reuse it, and must not let another thread touch it during the
   * call. Returns the timings (nanoseconds).
   */
  _renderInto(target: Uint8Array): { backend: string; timingsNs: Record<string, number> }
  /**
   * Experimental (Phase 4A.1): render a sequence. For every time (ms), move the page there, render
   * it and write its pixels into targets[i % targets.length] (each exactly one frame), in order.
   * With a pipelined mode, a target is reused only after the frame written to it `targets.length`
   * frames earlier; consume them after the call returns.
   */
  _renderFramesExperimental(times: number[], targets: Uint8Array[], options?: FramesOptions): FramesResult
  /** Experimental (Phase 4A.1, GPU builds): start a readback pipeline of up to `depth` (1–8) frames in flight. */
  _pipelineStart(mode: 'deferred' | 'pbo', depth: number): void
  /** Experimental (Phase 4A.1): render the document as it is now into the pipeline without waiting. Throws when full. */
  _pipelineSubmit(): { index: number; timingsNs: Record<string, number> }
  /** Experimental (Phase 4A.1): finish the oldest frame in flight into `target` (exactly one frame of bytes). */
  _pipelineComplete(target: Uint8Array): { index: number; timingsNs: Record<string, number> }
  /** Experimental (Phase 4A.1): wait for the GPU, discard frames in flight, free the pipeline. Returns the number discarded. close() does this too. */
  _pipelineStop(): number
  /** Experimental (Phase 4A.1): pool counters of the "pool" output, or null. */
  _poolStats(): { frameBytes: number; maxFree: number; free: number; allocated: number; reused: number; returned: number; discarded: number } | null
  /** Experimental (Phase 4A.1): the C heap (glibc mallinfo2), or null on other platforms. */
  _nativeHeap(): { inUseBytes: number; mmapBytes: number; arenaBytes: number; freeBytes: number } | null
  /** Experimental: backend, GPU device and Skia GPU resource cache usage. */
  _backendInfo(): Record<string, unknown>
  /** Experimental: free purgeable GPU resources (no-op on CPU). */
  _gpuFreeResources(): void
  /** Testing only (Ganesh): make the GPU context unusable, as a lost device would. */
  _gpuAbandonForTesting(): void
  /** Experimental (font-retention probe): drop Skia's process-wide glyph cache. */
  _purgeSkiaFontCache(): { fontCacheBytesBefore: number; fontCacheBytesAfter: number }
}
