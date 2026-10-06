# Skia GPU internals that matter for canvas-html (from the m153 sources)

Source: `skia.googlesource.com/skia`, branch `chrome/m153` (commit 37c5ad6a, the milestone rust-skia
0.153.3 builds: `skia = "m153-0.101.2"`). Directed Graphify graph of Ganesh, Graphite, GPU text,
the public GPU headers, the skia-safe/skia-bindings GPU layer and our anyrender_skia:
33,337 nodes, 72,108 edges (`stage-and-extract.sh`; query with `q.py find|out|in|path`).
Graphify's C++ extractor misses some out-of-class definitions (`Foo::bar()` in .cpp), so call
chains were confirmed in the source.

## Graphite drops raster images unless the client converts them

- `src/gpu/graphite/Recorder.cpp` `DefaultImageProvider::findOrCreate` returns `nullptr`:
  "by default, Graphite won't draw any non-Graphite-backed images".
- `src/gpu/graphite/KeyHelpers.cpp` `add_image_to_key`: no Graphite-backed image →
  "Couldn't convert SkImage to a Graphite-backed representation" and an error block (draw dropped).
- `include/gpu/graphite/ImageProvider.h`: the client supplies `RecorderOptions::fImageProvider`;
  "makeTextureImage can always be called to create an acceptable Graphite-backed image which
  could then be cached"; "by default, Graphite will not perform any caching of images".
- rust-skia 0.153.3 binds `RecorderOptions` without `fImageProvider`. canvas-html therefore
  uploads in the scene painter with `graphite::images::texture_from_image` and keeps the result
  in the existing image-shader cache: the pattern the header recommends. A proper fix upstream
  is an `ImageProvider` binding.

## Readback: what "sync" costs, and the async path that exists

- Ganesh `SurfaceContext::readPixels` (`src/gpu/ganesh/SurfaceContext.cpp`) flushes the
  surface, then `GrGpu::readPixels`:
  - Vulkan (`vk/GrVkGpu.cpp` `onReadPixels`): copy image → `kXferGpuToCpu` transfer buffer,
    then "submit the current command buffer to the Queue and make sure it finishes" — a second
    blocking submit per frame.
  - GL (`gl/GrGLGpu.cpp` `readOrTransferPixelsFrom`): `glReadPixels` (blocking).
- Graphite has no synchronous readback. rust-skia's `C_Context_readPixels`
  (`skia-bindings/src/graphite.cpp`) calls `asyncRescaleAndReadPixels`, then
  `submit(SyncToCpu::kYes)` and pumps `checkAsyncWorkCompletion`. Underneath:
  `Context::asyncReadPixels` → `asyncReadTexture` → `transferPixels` (texture → transfer buffer)
  → `finalizeAsyncReadPixels` (map + callback).
- Both engines have real async readback (Ganesh `asyncRescaleAndReadPixels`, Graphite the path
  above). Pipelining (read back frame N while frame N+1 paints) is the next step if readback
  dominates; it needs a frame of latency in the API.

## GPU text: atlas vs paths, and the reload drift

- `src/text/gpu/SubRunContainer.cpp`: glyphs smaller than the max mask size go to the glyph
  atlas ("direct mask", the 99.99% case; SDF only when enabled for transformed text); larger
  ones (>~254 px on the device, `SkGlyph::fitsInAtlasInterpolated`) are drawn as paths by
  Ganesh's path renderers.
- Measured (Mesa, 1080p): atlas glyphs — upright or rotated — are bit-stable across document
  reloads; only path glyphs drift (≤0.004 % of pixels, max 17/255), and only when the GrContext
  is reused: fresh renderers with their own device are identical, renderers sharing a device are
  not. Disabling the atlas path renderer, tessellation, MSAA, SDF paths or path-mask caching
  does not remove it; `freeGpuResources()` does. Consistent with cached path vertex data:
  `ops/TriangulatingPathRenderer.cpp` keeps triangulations in `GrThreadSafeCache` and reuses one
  whose tolerance is good enough (`cache_match`), so a later draw can use geometry triangulated
  for an earlier one.
- canvas-html now frees a Ganesh renderer's purgeable GPU resources on `load()`: reloads are
  bit-exact again. With a device shared between renderers, a document's pixels can still
  depend on what the other renderers drew (tiny, path glyphs only): bit-exact offline output
  needs one device per renderer, or a purge between documents.
- Graphite shows similar drift on reload (lavapipe, max 9/255); skia-safe binds no Graphite
  `freeGpuResources`, so this stays open for Graphite.

## Ganesh options worth knowing (`include/gpu/ganesh/GrContextOptions.h`)

`fGlyphCacheTextureMaximumBytes` (8 MiB atlas), `fMinDistanceFieldFontSize` 18,
`fGlyphsAsPathsFontSize` 256–384, `fInternalMultisampleCount` 4, `fAllowPathMaskCaching`,
`fDisableCoverageCountingPaths` (atlas path renderer), `fDisableTessellationPathRenderer`,
`fSupportBilerpFromGlyphAtlas` (false). `CANVAS_HTML_GANESH_OPTIONS` toggles some of them for
experiments.

## Path renderer chain (`src/gpu/ganesh/PathRendererChain.cpp`)

DashLine → AAConvex → AAHairline → AALinearizing → Atlas (MSAA atlas) → Small (SDF/coverage
atlas for small paths) → Triangulating → Tessellation → Default (always), software as the
last resort.
