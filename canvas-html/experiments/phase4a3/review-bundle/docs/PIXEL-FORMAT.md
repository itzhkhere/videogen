# Pixel format

What `render()` (RGBA), `renderInto(target)` and `render({ format: 'png' })` produce, measured on
the CPU raster backend and on Ganesh GL and Ganesh Vulkan (Mesa, NVIDIA L4).

## Raw frames: `render()` and `renderInto()`

| property | value |
|---|---|
| size | `frameByteLength` = `pixelWidth × pixelHeight × 4` bytes, `pixelWidth = round(width × devicePixelRatio)` |
| layout | 4 bytes per pixel in the order **R, G, B, A**; rows top to bottom; no padding (stride `pixelWidth × 4`) |
| values | 8-bit, sRGB-encoded as CSS gives them; no colour-space tag and no conversion; blending in sRGB-encoded space, as browsers do |
| alpha | **premultiplied** |
| opaque `background` (default `#ffffff`) | every alpha byte is 255; colours are the usual opaque values |
| transparent or translucent `background` | alpha is the real coverage and colours are premultiplied |

Examples (`experiments/phase4a2/pixel-format.mjs`, identical on CPU, GL and Vulkan):

| background | content | pixel |
|---|---|---|
| `#ffffff` | 50 % red | `[255, 127, 127, 255]` |
| `#00000000` | opaque red | `[255, 0, 0, 255]` |
| `#00000000` | 50 % red | `[128, 0, 0, 128]` |
| `#00ff0080` | none | `[0, 128, 0, 128]` |
| `#00ff0080` | 50 % red | `[128, 64, 0, 192]` |

`render()` and `renderInto()` produce identical bytes for the same state.

## Surface `AlphaType`: `Opaque`, kept deliberately

Skia surfaces (CPU raster `SkiaImageRenderer`, Ganesh `SkiaGpuImageRenderer`, Graphite) are
created as `RGBA8888` + `AlphaType::Opaque`.

- **Origin:** inherited from upstream anyrender_skia's CPU image renderer; the GPU renderers
  (patch 0003) copied it. It is not required by anything in the pipeline.
- **Effect on bytes:** none measured. Phase 4A.3 built the addon twice, identical except the surface
  `AlphaType` (`Opaque` vs `Premul`, CPU raster and Ganesh), and compared frames for an opaque scene,
  transparent and translucent backgrounds, semi-transparent fills, text, an image with alpha,
  box-shadow, blur, drop-shadow, opacity groups and gradients, at 1× and 2×: **identical bytes on CPU,
  Ganesh GL and Ganesh Vulkan** (`experiments/phase4a3/alphatype.mjs`, `evidence/alphatype-*.json`).
  The surface is cleared to transparent and the background is drawn by the engine; Skia blends
  premultiplied colour either way, and readback uses the same `ImageInfo` as the surface, so no
  conversion happens.
- **Decision:** keep `Opaque` (no correctness gain from changing it; output stays bit-identical).
  The label is metadata; the bytes are premultiplied whatever it says.
- **Phase 4B implication:** when a frame leaves the engine as a GPU texture or an `SkImage`, the
  consumer must be told the alpha is **premultiplied**. An `SkImage` snapped from an `Opaque`
  surface would be treated as opaque by Skia (alpha ignored when compositing), so a texture/image
  export path should declare `Premul` explicitly — the surface label can change then, in the same
  commit that adds the export, with this experiment rerun.

## PNG: `render({ format: 'png' })`

PNG colour type 6 stores **straight** (unpremultiplied) alpha. Since phase 4A.3 the PNG path
converts the premultiplied frame first:

- `A = 255`: unchanged (opaque frames encode exactly as before);
- `A = 0`: `R = G = B = 0`;
- otherwise: each channel `round(c × 255 / A)`, capped at 255.

So 50 % red over a transparent background is `[128, 0, 0, 128]` in the raw frame and
`[255, 0, 0, 128]` in the PNG (it used to be written as `[128, 0, 0, 128]`, i.e. too dark).
`test/hardening.mjs` decodes PNGs (25 %, 50 %, 75 % and opaque fills, coloured translucent fills,
translucent background, translucent text) and compares every pixel with the expected straight-alpha
value. Unpremultiplying 8-bit values cannot recover precision lost to premultiplication: very low
alpha values quantize colour (inherent to premultiplied 8-bit sources).
