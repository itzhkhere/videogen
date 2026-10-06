# Phase 4A — paint path and where a GPU surface fits

Written before the GPU backend was added; file and line facts refer to the Phase 3 tree.

## Current flow (production: CPU raster)

```text
HtmlRenderer.render()                                     src/lib.rs
  run due timers; script documents: __canvasHtml.frame()  (rAF, WAAPI/CSS animation tick)
  resolve()  → BaseDocument::resolve(t)                   Stylo style, Taffy layout, Parley text
  paint()    → SkiaImageRenderer::render_to_vec(draw, &mut buffer)
                 surfaces::wrap_pixels(buffer)            raster SkSurface over the Vec (no copy)
                 canvas.clear
                 draw(SkiaScenePainter { canvas, cache }) blitz_paint::paint_scene → AnyRender
                                                          PaintScene calls → SkCanvas calls
                 scene_cache.next_gen()
  Buffer::from(buffer.clone())                            RGBA → Node Buffer (one copy)
  or png::Encoder(buffer)                                 PNG
```

| Question | Answer |
|---|---|
| Where are Skia surfaces created? | `vendor/anyrender_skia/src/image_renderer.rs`, `render_to_vec`: `surfaces::wrap_pixels` over the output `Vec`, every frame (a cheap wrapper). |
| Where are canvases acquired? | Same place: `surface.canvas()`. |
| Where does AnyRender hand commands to Skia? | `SkiaScenePainter` (`vendor/anyrender_skia/src/scene.rs`) implements `anyrender::PaintScene`; `blitz_paint::paint_scene` walks the laid-out tree and calls it. Every call becomes an immediate `SkCanvas` call (no intermediate display list). |
| Where does readback happen? | Nowhere on CPU: Skia rasterizes straight into the `Vec`. |
| Where is the RGBA Buffer created? | `src/lib.rs`, `render()`: `Buffer::from(self.buffer.clone())`. |
| Where is PNG encoded? | `src/lib.rs`, `render({format:'png'})`: `png` crate, from the same `Vec`. |
| Reused across frames | `SkiaImageRenderer` (image info, `SkiaSceneCache`: paint, fonts/typefaces, image shaders, glyph buffers, generation-based eviction), the output `Vec`, Skia's process-wide glyph and typeface caches. |
| Recreated per frame | The `SkSurface`/`SkCanvas` wrapper; the Node `Buffer` (copy). |

Command generation and rasterization are interleaved: there is no recorded scene between Blitz
and Skia. "Paint command preparation" is therefore measured separately by running
`paint_scene` into AnyRender's `NullScenePainter` (`_renderTimed({measurePaintPrep: true})`,
key `paintPrep`); `paint` = command generation + Skia work on the canvas (CPU: rasterization;
GPU: recording into Skia's op lists).

## Where the GPU goes

Only the surface changes. Everything above `SkiaScenePainter` (DOM, Stylo, layout, Blitz
paint, the JS engines, the clock) is untouched:

```text
Blitz paint_scene → SkiaScenePainter → SkCanvas
                                         ├─ CPU: raster SkSurface over the output Vec   (default)
                                         ├─ Ganesh: GPU render target (GL via EGL device, or Vulkan)
                                         └─ Graphite: GPU render target via a Recorder (Vulkan)
GPU only: flush + submit → wait → read_pixels into the same Vec (optional)
```

Per frame on GPU: record (clear + `paint_scene`), flush/snap + submit, wait for the GPU, read
back (optional), then the same Buffer/PNG code as CPU.

One adapter-level exception, found by the correctness suite: Graphite drops draws of raster
`SkImage`s ("Couldn't convert SkImage to a Graphite-backed representation"). Skia's fix is an
`ImageProvider` on the Recorder, which rust-skia 0.153.3 does not bind; instead the scene
painter uploads each image once with `graphite::images::texture_from_image` (the image-shader
cache keeps the texture across frames). Ganesh uploads raster images itself.

## Skia GPU options in the pinned build (rust-skia 0.153.3)

rust-skia ships prebuilt Skia binaries keyed by feature set. Production links
`ganesh-gl-jpegd-jpege-pdf`: Ganesh and GL were already in the shipped binary (unused by the
CPU path). Probed for x86_64-unknown-linux-gnu:

| Binary (features) | Exists | Gives |
|---|---|---|
| `ganesh-gl-jpegd-jpege-pdf` | yes (production) | Ganesh + OpenGL |
| `ganesh-gl-jpegd-jpege-pdf-vulkan` | yes | Ganesh + OpenGL + Vulkan |
| `graphite-jpegd-jpege-pdf-vulkan` | yes | Graphite + Vulkan, no Ganesh, no GL |
| `ganesh-gl-graphite-jpegd-jpege-pdf-vulkan`, `ganesh-graphite-…`, `gl-graphite-…` | no | — |

- Metal, Direct3D: not Linux. Dawn: not built by rust-skia (no binary, no bindings). Graphite
  has no GL backend.
- Ganesh and Graphite therefore need two different native builds. anyrender_skia enabled
  skia-safe `gl` unconditionally (its window renderer); Phase 4A makes that a default feature
  (`ganesh-gl`) so a Graphite-only build is possible. The production feature set and Skia
  binary are unchanged.
- Headless: GL uses an EGL device (`EGL_EXT_platform_device`) and a surfaceless context — no
  X11/Wayland, no window. Vulkan needs no surface extensions.
