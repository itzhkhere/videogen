# Third-party notices

The engine is not licensed for distribution yet (`UNLICENSED`, private). This file lists what a
built addon contains, so the obligations are known before it is distributed. Nothing here
changes the licences of the third-party code; each component's own licence text applies.

## Summary

| component | how it is included | licence | what distribution needs |
|---|---|---|---|
| Rust crates (360 in the Linux build graph, listed below) | statically linked into the `.node` addon | mostly `MIT OR Apache-2.0` / `MIT`; see table | the licence texts and copyright notices of every crate |
| Stylo, cssparser, selectors and related Servo crates (14, `MPL-2.0`) | statically linked; **Stylo is vendored and patched** in `vendor/stylo` | MPL-2.0 (file-level copyleft) | the source of the MPL files as distributed, **including our patches** (`vendor/stylo`, `upstream-patches/stylo`), under MPL-2.0, and the notice that it is available |
| Blitz (`blitz-dom`, `blitz-html`, `blitz-paint`, `blitz-traits`, `blitz-vibey-script`, `debug_timer`) | statically linked; cloned and patched by `scripts/setup-blitz.sh` | MIT OR Apache-2.0 | licence texts; patches are ours (`upstream-patches/blitz`) |
| anyrender, anyrender_skia | statically linked; vendored (anyrender_skia patched) | MIT OR Apache-2.0 | licence texts |
| Boa (`boa_*`) | statically linked | Unlicense OR MIT | licence text (MIT) |
| ICU4X data and crates, `unicode-*` | statically linked | Unicode-3.0 | Unicode licence text |
| Skia (via `skia-bindings` 0.153.3, prebuilt `libskia.a`) | statically linked | BSD-3-Clause (`LICENSE` of Skia) | Skia's copyright notice and licence |
| libpng 1.6.56, zlib 1.3.0.1, libjpeg-turbo, wuffs (as built into `libskia.a`) | statically linked inside Skia | libpng (PNG Reference Library License v2), zlib, IJG + BSD-3 (libjpeg-turbo), Apache-2.0 (wuffs) | each library's notice |
| ICU data (`icudtl.dat`, `skia-bindings` feature `embed-icudtl`) | embedded in the addon | Unicode-3.0 / ICU licence | ICU licence text |
| fontconfig, FreeType, expat, zlib, libpng16, brotli | **dynamically** linked system libraries, not shipped | their own (MIT-style, FTL/GPL-2 dual, MIT, zlib, libpng, MIT) | nothing while they come from the target system |
| Mesa, GPU drivers (experimental GPU builds only) | loaded at run time from the system | their own | nothing; not shipped |
| fonts | **none shipped**; system fonts or fonts registered by the caller | — | — |

`skia-bindings` features in the default build: `binary-cache`, `embed-icudtl`, `ganesh`, `gl`,
`jpeg`, `pdf` (the GPU builds add `vulkan`).

Development-only tools (napi-rs CLI, TypeScript, Chrome for comparisons, Graphify for audits) are
not part of the addon.

## Rust crates in the build graph

Generated with `cargo metadata --filter-platform x86_64-unknown-linux-gnu` from `Cargo.lock`
(normal and build dependencies of the default features; the engine's own crates excluded). The
`license` field is the crate's own declaration.

| crate | version | licence | source |
|---|---|---|---|
| `accesskit` | 0.25.0 | MIT OR Apache-2.0 | crates.io |
| `adler2` | 2.0.1 | 0BSD OR MIT OR Apache-2.0 | crates.io |
| `aho-corasick` | 1.1.5 | Unlicense OR MIT | crates.io |
| `aligned-vec` | 0.6.4 | MIT | crates.io |
| `alloc-no-stdlib` | 2.0.4 | BSD-3-Clause | crates.io |
| `allocator-api2` | 0.2.21 | MIT OR Apache-2.0 | crates.io |
| `anyrender` | 0.14.0 | MIT OR Apache-2.0 | vendored |
| `anyrender_skia` | 0.12.0 | MIT OR Apache-2.0 | vendored |
| `anyrender_svg` | 0.15.0 | MIT OR Apache-2.0 | crates.io |
| `app_units` | 0.7.8 | MPL-2.0 | crates.io |
| `arrayref` | 0.3.9 | BSD-2-Clause | crates.io |
| `arrayvec` | 0.7.8 | MIT OR Apache-2.0 | crates.io |
| `ash` | 0.38.0+1.3.281 | MIT OR Apache-2.0 | crates.io |
| `ash-window` | 0.13.0 | MIT OR Apache-2.0 | crates.io |
| `async-channel` | 2.5.0 | Apache-2.0 OR MIT | crates.io |
| `atomic_refcell` | 0.1.14 | Apache-2.0 OR MIT | crates.io |
| `autocfg` | 1.5.1 | Apache-2.0 OR MIT | crates.io |
| `base64` | 0.22.1 | MIT OR Apache-2.0 | crates.io |
| `base64` | 0.23.1 | MIT OR Apache-2.0 | crates.io |
| `bindgen` | 0.72.1 | BSD-3-Clause | crates.io |
| `bitflags` | 2.13.1 | MIT OR Apache-2.0 | crates.io |
| `blitz-dom` | 0.3.0-beta.2 | MIT OR Apache-2.0 | blitz |
| `blitz-html` | 0.3.0-beta.2 | MIT OR Apache-2.0 | blitz |
| `blitz-paint` | 0.3.0-beta.2 | MIT OR Apache-2.0 | blitz |
| `blitz-traits` | 0.3.0-beta.2 | MIT OR Apache-2.0 | blitz |
| `blitz-vibey-script` | 0.3.0-beta.2 | MIT OR Apache-2.0 | blitz |
| `boa_ast` | 0.22.0 | Unlicense OR MIT | crates.io |
| `boa_engine` | 0.22.0 | Unlicense OR MIT | crates.io |
| `boa_gc` | 0.22.0 | Unlicense OR MIT | crates.io |
| `boa_interner` | 0.22.0 | Unlicense OR MIT | crates.io |
| `boa_macros` | 0.22.0 | Unlicense OR MIT | crates.io |
| `boa_parser` | 0.22.0 | Unlicense OR MIT | crates.io |
| `boa_runtime` | 0.22.0 | Unlicense OR MIT | crates.io |
| `boa_string` | 0.22.0 | Unlicense OR MIT | crates.io |
| `boa_wintertc` | 0.22.0 | Unlicense OR MIT | crates.io |
| `borsh` | 1.8.1 | MIT OR Apache-2.0 | crates.io |
| `brotli-decompressor` | 5.0.3 | BSD-3-Clause/MIT | crates.io |
| `bytemuck` | 1.25.2 | Zlib OR Apache-2.0 OR MIT | crates.io |
| `bytemuck_derive` | 1.12.0 | Zlib OR Apache-2.0 OR MIT | crates.io |
| `byteorder` | 1.5.0 | Unlicense OR MIT | crates.io |
| `byteorder-lite` | 0.1.0 | Unlicense OR MIT | crates.io |
| `bytes` | 1.12.1 | MIT | crates.io |
| `calendrical_calculations` | 0.2.4 | Apache-2.0 | crates.io |
| `cc` | 1.4.5 | MIT OR Apache-2.0 | crates.io |
| `cexpr` | 0.6.0 | Apache-2.0/MIT | crates.io |
| `cfg-if` | 1.0.4 | MIT OR Apache-2.0 | crates.io |
| `cfg_aliases` | 0.2.2 | MIT | crates.io |
| `chacha20` | 0.10.2 | MIT OR Apache-2.0 | crates.io |
| `clang-sys` | 1.9.1 | Apache-2.0 | crates.io |
| `color` | 0.3.3 | Apache-2.0 OR MIT | crates.io |
| `color_quant` | 1.1.0 | MIT | crates.io |
| `comfy-table` | 8.0.1 | MIT | crates.io |
| `concurrent-queue` | 2.5.0 | Apache-2.0 OR MIT | crates.io |
| `convert_case` | 0.12.0 | MIT | crates.io |
| `core_maths` | 0.1.1 | MIT | crates.io |
| `cow-utils` | 0.1.3 | MIT | crates.io |
| `cpufeatures` | 0.3.1 | MIT OR Apache-2.0 | crates.io |
| `crc32fast` | 1.5.1 | MIT OR Apache-2.0 | crates.io |
| `crossbeam-deque` | 0.8.7 | MIT OR Apache-2.0 | crates.io |
| `crossbeam-epoch` | 0.9.20 | MIT OR Apache-2.0 | crates.io |
| `crossbeam-utils` | 0.8.22 | MIT OR Apache-2.0 | crates.io |
| `cssparser` | 0.38.0 | MPL-2.0 | crates.io |
| `cssparser-macros` | 0.7.0 | MPL-2.0 | crates.io |
| `ctor` | 1.0.13 | Apache-2.0 OR MIT | crates.io |
| `cursor-icon` | 1.2.0 | MIT OR Apache-2.0 OR Zlib | crates.io |
| `darling` | 0.20.11 | MIT | crates.io |
| `darling_core` | 0.20.11 | MIT | crates.io |
| `darling_macro` | 0.20.11 | MIT | crates.io |
| `dashmap` | 6.2.1 | MIT | crates.io |
| `data-url` | 0.3.2 | MIT OR Apache-2.0 | crates.io |
| `debug_timer` | 0.1.3 | MIT OR Apache-2.0 | blitz |
| `debug_timer` | 0.1.3 | MIT OR Apache-2.0 | crates.io |
| `deranged` | 0.5.8 | MIT OR Apache-2.0 | crates.io |
| `derive_more` | 2.1.1 | MIT | crates.io |
| `derive_more-impl` | 2.1.1 | MIT | crates.io |
| `displaydoc` | 0.2.7 | MIT OR Apache-2.0 | crates.io |
| `dlib` | 0.5.3 | MIT | crates.io |
| `dtoa` | 1.0.11 | MIT OR Apache-2.0 | crates.io |
| `dtoa-short` | 0.3.5 | MPL-2.0 | crates.io |
| `dynify` | 0.1.2 | MIT OR Apache-2.0 | crates.io |
| `dynify-macros` | 0.1.2 | MIT OR Apache-2.0 | crates.io |
| `either` | 1.18.0 | MIT OR Apache-2.0 | crates.io |
| `encoding_rs` | 0.8.35 | (Apache-2.0 OR MIT) AND BSD-3-Clause | crates.io |
| `equator` | 0.4.2 | MIT | crates.io |
| `equator-macro` | 0.4.2 | MIT | crates.io |
| `equivalent` | 1.0.2 | Apache-2.0 OR MIT | crates.io |
| `errno` | 0.3.14 | MIT OR Apache-2.0 | crates.io |
| `euclid` | 0.22.14 | MIT OR Apache-2.0 | crates.io |
| `event-listener` | 5.4.2 | Apache-2.0 OR MIT | crates.io |
| `event-listener-strategy` | 0.5.4 | Apache-2.0 OR MIT | crates.io |
| `fast-float2` | 0.2.4 | MIT OR Apache-2.0 | crates.io |
| `fastrand` | 2.5.0 | Apache-2.0 OR MIT | crates.io |
| `fdeflate` | 0.3.7 | MIT OR Apache-2.0 | crates.io |
| `filetime` | 0.2.29 | MIT/Apache-2.0 | crates.io |
| `find-msvc-tools` | 0.1.12 | MIT OR Apache-2.0 | crates.io |
| `fixedbitset` | 0.5.7 | MIT OR Apache-2.0 | crates.io |
| `flate2` | 1.1.10 | MIT OR Apache-2.0 | crates.io |
| `float-cmp` | 0.9.0 | MIT | crates.io |
| `float16` | 0.1.7 | MIT OR Apache-2.0 | crates.io |
| `fnv` | 1.0.7 | Apache-2.0 / MIT | crates.io |
| `foldhash` | 0.2.0 | Zlib | crates.io |
| `font-types` | 0.11.3 | MIT OR Apache-2.0 | crates.io |
| `font-types` | 0.12.4 | MIT OR Apache-2.0 | crates.io |
| `fontconfig-parser` | 0.5.8 | MIT | crates.io |
| `fontdb` | 0.24.0 | MIT | crates.io |
| `fontique` | 0.11.0 | Apache-2.0 OR MIT | git: https://github.com/linebender/parley |
| `form_urlencoded` | 1.2.2 | MIT OR Apache-2.0 | crates.io |
| `futures` | 0.3.34 | MIT OR Apache-2.0 | crates.io |
| `futures-channel` | 0.3.34 | MIT OR Apache-2.0 | crates.io |
| `futures-concurrency` | 7.7.1 | MIT OR Apache-2.0 | crates.io |
| `futures-core` | 0.3.34 | MIT OR Apache-2.0 | crates.io |
| `futures-executor` | 0.3.34 | MIT OR Apache-2.0 | crates.io |
| `futures-io` | 0.3.34 | MIT OR Apache-2.0 | crates.io |
| `futures-lite` | 2.6.1 | Apache-2.0 OR MIT | crates.io |
| `futures-macro` | 0.3.34 | MIT OR Apache-2.0 | crates.io |
| `futures-sink` | 0.3.34 | MIT OR Apache-2.0 | crates.io |
| `futures-task` | 0.3.34 | MIT OR Apache-2.0 | crates.io |
| `futures-util` | 0.3.34 | MIT OR Apache-2.0 | crates.io |
| `getrandom` | 0.4.3 | MIT OR Apache-2.0 | crates.io |
| `gif` | 0.14.2 | MIT OR Apache-2.0 | crates.io |
| `gl` | 0.14.0 | Apache-2.0 | crates.io |
| `gl_generator` | 0.14.0 | Apache-2.0 | crates.io |
| `glob` | 0.3.4 | MIT OR Apache-2.0 | crates.io |
| `glutin` | 0.32.3 | Apache-2.0 | crates.io |
| `glutin_egl_sys` | 0.7.1 | Apache-2.0 | crates.io |
| `glutin_glx_sys` | 0.6.1 | Apache-2.0 | crates.io |
| `harfrust` | 0.12.0 | MIT | crates.io |
| `hashbrown` | 0.14.5 | MIT OR Apache-2.0 | crates.io |
| `hashbrown` | 0.17.1 | MIT OR Apache-2.0 | crates.io |
| `heck` | 0.5.0 | MIT OR Apache-2.0 | crates.io |
| `html-escape` | 0.2.15 | MIT | crates.io |
| `html5ever` | 0.40.1 | MIT OR Apache-2.0 | crates.io |
| `http` | 1.5.0 | MIT OR Apache-2.0 | crates.io |
| `icu_calendar` | 2.3.0 | Unicode-3.0 | crates.io |
| `icu_calendar_data` | 2.3.0 | Unicode-3.0 | crates.io |
| `icu_collections` | 2.3.0 | Unicode-3.0 | crates.io |
| `icu_locale_core` | 2.3.0 | Unicode-3.0 | crates.io |
| `icu_locale_fallback` | 2.3.0 | Unicode-3.0 | crates.io |
| `icu_locale_fallback_data` | 2.3.0 | Unicode-3.0 | crates.io |
| `icu_normalizer` | 2.3.0 | Unicode-3.0 | crates.io |
| `icu_normalizer_data` | 2.3.0 | Unicode-3.0 | crates.io |
| `icu_properties` | 2.3.0 | Unicode-3.0 | crates.io |
| `icu_properties_data` | 2.3.0 | Unicode-3.0 | crates.io |
| `icu_provider` | 2.3.1 | Unicode-3.0 | crates.io |
| `icu_segmenter` | 2.3.0 | Unicode-3.0 | crates.io |
| `icu_segmenter_data` | 2.3.0 | Unicode-3.0 | crates.io |
| `ident_case` | 1.0.1 | MIT/Apache-2.0 | crates.io |
| `idna` | 1.1.0 | MIT OR Apache-2.0 | crates.io |
| `idna_adapter` | 1.0.0 | Apache-2.0 OR MIT | crates.io |
| `image` | 0.25.10 | MIT OR Apache-2.0 | crates.io |
| `image-webp` | 0.2.4 | MIT OR Apache-2.0 | crates.io |
| `imagesize` | 0.15.0 | MIT | crates.io |
| `indexmap` | 2.14.1 | Apache-2.0 OR MIT | crates.io |
| `intrusive-collections` | 0.10.3 | MIT OR Apache-2.0 | crates.io |
| `itertools` | 0.13.0 | MIT OR Apache-2.0 | crates.io |
| `itertools` | 0.14.0 | MIT OR Apache-2.0 | crates.io |
| `itertools` | 0.15.0 | MIT OR Apache-2.0 | crates.io |
| `itoa` | 1.0.18 | MIT OR Apache-2.0 | crates.io |
| `ixdtf` | 0.6.6 | Unicode-3.0 | crates.io |
| `keyboard-types` | 0.7.0 | MIT OR Apache-2.0 | crates.io |
| `khronos_api` | 3.1.0 | Apache-2.0 | crates.io |
| `kurbo` | 0.13.1 | Apache-2.0 OR MIT | crates.io |
| `libc` | 0.2.189 | MIT OR Apache-2.0 | crates.io |
| `libloading` | 0.8.9 | ISC | crates.io |
| `libloading` | 0.9.0 | ISC | crates.io |
| `libm` | 0.2.16 | MIT | crates.io |
| `linebender_resource_handle` | 0.1.1 | Apache-2.0 OR MIT | crates.io |
| `linux-raw-sys` | 0.12.1 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | crates.io |
| `litemap` | 0.8.3 | Unicode-3.0 | crates.io |
| `lock_api` | 0.4.14 | MIT OR Apache-2.0 | crates.io |
| `log` | 0.4.34 | MIT OR Apache-2.0 | crates.io |
| `malloc_size_of_derive` | 0.1.3 | MIT OR Apache-2.0 | crates.io |
| `markup5ever` | 0.40.0 | MIT OR Apache-2.0 | crates.io |
| `memchr` | 2.8.3 | Unlicense OR MIT | crates.io |
| `memmap2` | 0.9.11 | MIT OR Apache-2.0 | crates.io |
| `mime` | 0.3.17 | MIT OR Apache-2.0 | crates.io |
| `minimal-lexical` | 0.2.1 | MIT/Apache-2.0 | crates.io |
| `miniz_oxide` | 0.8.9 | MIT OR Zlib OR Apache-2.0 | crates.io |
| `miniz_oxide` | 0.9.1 | MIT OR Zlib OR Apache-2.0 | crates.io |
| `moxcms` | 0.8.1 | BSD-3-Clause OR Apache-2.0 | crates.io |
| `napi` | 3.14.0 | MIT | crates.io |
| `napi-build` | 2.6.0 | MIT | crates.io |
| `napi-derive` | 3.6.10 | MIT | crates.io |
| `napi-derive-backend` | 6.1.4 | MIT | crates.io |
| `napi-sys` | 3.4.0 | MIT | crates.io |
| `new_debug_unreachable` | 1.0.6 | MIT | crates.io |
| `nohash-hasher` | 0.2.0 | Apache-2.0 OR MIT | crates.io |
| `nom` | 7.1.3 | MIT | crates.io |
| `num-bigint` | 0.5.1 | MIT OR Apache-2.0 | crates.io |
| `num-conv` | 0.2.2 | MIT OR Apache-2.0 | crates.io |
| `num-derive` | 0.4.2 | MIT OR Apache-2.0 | crates.io |
| `num-integer` | 0.1.47 | MIT OR Apache-2.0 | crates.io |
| `num-traits` | 0.2.19 | MIT OR Apache-2.0 | crates.io |
| `num_cpus` | 1.17.0 | MIT OR Apache-2.0 | crates.io |
| `num_enum` | 0.7.6 | BSD-3-Clause OR MIT OR Apache-2.0 | crates.io |
| `num_enum_derive` | 0.7.6 | BSD-3-Clause OR MIT OR Apache-2.0 | crates.io |
| `num_threads` | 0.1.7 | MIT OR Apache-2.0 | crates.io |
| `oaty` | 0.2.0 | Apache-2.0 OR MIT | crates.io |
| `once_cell` | 1.21.4 | MIT OR Apache-2.0 | crates.io |
| `oneshot` | 0.2.1 | MIT OR Apache-2.0 | crates.io |
| `parking` | 2.2.1 | Apache-2.0 OR MIT | crates.io |
| `parking_lot` | 0.12.5 | MIT OR Apache-2.0 | crates.io |
| `parking_lot_core` | 0.9.12 | MIT OR Apache-2.0 | crates.io |
| `parlance` | 0.1.0 | Apache-2.0 OR MIT | git: https://github.com/linebender/parley |
| `parley` | 0.11.0 | Apache-2.0 OR MIT | git: https://github.com/linebender/parley |
| `parley_data` | 0.11.0 | Apache-2.0 OR MIT | git: https://github.com/linebender/parley |
| `parley_emoji` | 0.11.0 | MIT | git: https://github.com/linebender/parley |
| `parley_engine` | 0.11.0 | Apache-2.0 OR MIT | git: https://github.com/linebender/parley |
| `pastey` | 0.2.3 | MIT OR Apache-2.0 | crates.io |
| `peniko` | 0.6.1 | Apache-2.0 OR MIT | crates.io |
| `percent-encoding` | 2.3.2 | MIT OR Apache-2.0 | crates.io |
| `phf` | 0.14.0 | MIT | crates.io |
| `phf_codegen` | 0.14.0 | MIT | crates.io |
| `phf_generator` | 0.14.0 | MIT | crates.io |
| `phf_macros` | 0.14.0 | MIT | crates.io |
| `phf_shared` | 0.14.0 | MIT | crates.io |
| `pico-args` | 0.5.0 | MIT | crates.io |
| `pin-project` | 1.1.13 | Apache-2.0 OR MIT | crates.io |
| `pin-project-internal` | 1.1.13 | Apache-2.0 OR MIT | crates.io |
| `pin-project-lite` | 0.2.17 | Apache-2.0 OR MIT | crates.io |
| `pkg-config` | 0.3.34 | MIT OR Apache-2.0 | crates.io |
| `png` | 0.18.1 | MIT OR Apache-2.0 | crates.io |
| `polycool` | 0.4.0 | MIT OR Apache-2.0 | crates.io |
| `portable-atomic` | 1.15.0 | Apache-2.0 OR MIT | crates.io |
| `potential_utf` | 0.1.6 | Unicode-3.0 | crates.io |
| `powerfmt` | 0.2.0 | MIT OR Apache-2.0 | crates.io |
| `precomputed-hash` | 0.1.1 | MIT | crates.io |
| `prettyplease` | 0.2.37 | MIT OR Apache-2.0 | crates.io |
| `proc-macro-crate` | 3.5.0 | MIT OR Apache-2.0 | crates.io |
| `proc-macro2` | 1.0.107 | MIT OR Apache-2.0 | crates.io |
| `pxfm` | 0.1.30 | BSD-3-Clause OR Apache-2.0 | crates.io |
| `quick-error` | 2.0.1 | MIT/Apache-2.0 | crates.io |
| `quote` | 1.0.47 | MIT OR Apache-2.0 | crates.io |
| `rand` | 0.10.3 | MIT OR Apache-2.0 | crates.io |
| `rand_core` | 0.10.1 | MIT OR Apache-2.0 | crates.io |
| `raw-window-handle` | 0.6.2 | MIT OR Apache-2.0 OR Zlib | crates.io |
| `rayon` | 1.12.0 | MIT OR Apache-2.0 | crates.io |
| `rayon-core` | 1.13.0 | MIT OR Apache-2.0 | crates.io |
| `read-fonts` | 0.41.0 | MIT OR Apache-2.0 | crates.io |
| `regex` | 1.13.1 | MIT OR Apache-2.0 | crates.io |
| `regex-automata` | 0.4.18 | MIT OR Apache-2.0 | crates.io |
| `regex-syntax` | 0.8.11 | MIT OR Apache-2.0 | crates.io |
| `regress` | 0.12.0 | MIT OR Apache-2.0 | crates.io |
| `roxmltree` | 0.20.0 | MIT OR Apache-2.0 | crates.io |
| `roxmltree` | 0.21.1 | MIT OR Apache-2.0 | crates.io |
| `rustc-hash` | 2.1.3 | Apache-2.0 OR MIT | crates.io |
| `rustc_version` | 0.4.1 | MIT OR Apache-2.0 | crates.io |
| `rustix` | 1.1.4 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | crates.io |
| `rustversion` | 1.0.23 | MIT OR Apache-2.0 | crates.io |
| `ryu-js` | 1.0.3 | Apache-2.0 OR BSL-1.0 | crates.io |
| `same-file` | 1.0.6 | Unlicense/MIT | crates.io |
| `scopeguard` | 1.2.0 | MIT OR Apache-2.0 | crates.io |
| `selectors` | 0.41.0 | MPL-2.0 | crates.io |
| `semver` | 1.0.28 | MIT OR Apache-2.0 | crates.io |
| `serde` | 1.0.229 | MIT OR Apache-2.0 | crates.io |
| `serde_core` | 1.0.229 | MIT OR Apache-2.0 | crates.io |
| `serde_derive` | 1.0.229 | MIT OR Apache-2.0 | crates.io |
| `serde_json` | 1.0.151 | MIT OR Apache-2.0 | crates.io |
| `serde_spanned` | 1.1.1 | MIT OR Apache-2.0 | crates.io |
| `servo_arc` | 0.5.0 | MIT OR Apache-2.0 | crates.io |
| `shlex` | 1.3.0 | MIT OR Apache-2.0 | crates.io |
| `shlex` | 2.0.1 | MIT OR Apache-2.0 | crates.io |
| `simd-adler32` | 0.3.10 | MIT | crates.io |
| `simplecss` | 0.2.2 | Apache-2.0 OR MIT | crates.io |
| `siphasher` | 1.0.3 | MIT/Apache-2.0 | crates.io |
| `skia-bindings` | 0.153.3 | MIT | crates.io |
| `skia-safe` | 0.153.3 | MIT | crates.io |
| `skrifa` | 0.44.0 | MIT OR Apache-2.0 | crates.io |
| `slab` | 0.4.12 | MIT | crates.io |
| `slotmap` | 1.1.1 | Zlib | crates.io |
| `small_btree` | 0.1.0 | Unlicense OR MIT | crates.io |
| `smallbitvec` | 2.6.1 | MIT OR Apache-2.0 | crates.io |
| `smallvec` | 1.16.0 | MIT OR Apache-2.0 | crates.io |
| `smol_str` | 0.3.6 | MIT OR Apache-2.0 | crates.io |
| `stable_deref_trait` | 1.2.1 | MIT OR Apache-2.0 | crates.io |
| `static_assertions` | 1.1.0 | MIT OR Apache-2.0 | crates.io |
| `strict-num` | 0.1.1 | MIT | crates.io |
| `string_cache` | 0.11.0 | MIT OR Apache-2.0 | crates.io |
| `string_cache_codegen` | 0.11.2 | MIT OR Apache-2.0 | crates.io |
| `strum` | 0.28.0 | MIT | crates.io |
| `strum_macros` | 0.28.0 | MIT | crates.io |
| `stylo` | 0.22.0 | MPL-2.0 | vendored |
| `stylo_atoms` | 0.22.0 | MPL-2.0 | crates.io |
| `stylo_derive` | 0.22.0 | MPL-2.0 | crates.io |
| `stylo_dom` | 0.22.0 | MPL-2.0 | crates.io |
| `stylo_malloc_size_of` | 0.22.0 | MIT OR Apache-2.0 | crates.io |
| `stylo_static_prefs` | 0.22.0 | MPL-2.0 | crates.io |
| `stylo_taffy` | 0.3.0-beta.2 | MIT OR Apache-2.0 OR MPL-2.0 | blitz |
| `stylo_traits` | 0.22.0 | MPL-2.0 | crates.io |
| `svgtypes` | 0.16.1 | Apache-2.0 OR MIT | crates.io |
| `syn` | 2.0.119 | MIT OR Apache-2.0 | crates.io |
| `syn` | 3.0.4 | MIT OR Apache-2.0 | crates.io |
| `synstructure` | 0.13.2 | MIT | crates.io |
| `synstructure` | 0.14.0 | MIT | crates.io |
| `taffy` | 0.14.0 | MIT | git: https://github.com/DioxusLabs/taffy |
| `tag_ptr` | 0.1.0 | Unlicense OR MIT | crates.io |
| `tap` | 1.0.1 | MIT | crates.io |
| `tar` | 0.4.46 | MIT OR Apache-2.0 | crates.io |
| `temporal_rs` | 0.2.6 | MIT OR Apache-2.0 | crates.io |
| `tendril` | 0.5.1 | MIT OR Apache-2.0 | crates.io |
| `thin-vec` | 0.2.19 | MIT OR Apache-2.0 | crates.io |
| `thiserror` | 2.0.21 | MIT OR Apache-2.0 | crates.io |
| `thiserror-impl` | 2.0.21 | MIT OR Apache-2.0 | crates.io |
| `thread_local` | 1.1.10 | MIT OR Apache-2.0 | crates.io |
| `time` | 0.3.55 | MIT OR Apache-2.0 | crates.io |
| `time-core` | 0.1.9 | MIT OR Apache-2.0 | crates.io |
| `time-macros` | 0.2.32 | MIT OR Apache-2.0 | crates.io |
| `timezone_provider` | 0.2.6 | MIT OR Apache-2.0 | crates.io |
| `tiny-skia-path` | 0.12.0 | BSD-3-Clause | crates.io |
| `tinystr` | 0.8.4 | Unicode-3.0 | crates.io |
| `tinyvec` | 1.13.2 | Zlib OR Apache-2.0 OR MIT | crates.io |
| `tinyvec_macros` | 0.1.1 | MIT OR Apache-2.0 OR Zlib | crates.io |
| `to_shmem` | 0.6.0 | MPL-2.0 | crates.io |
| `to_shmem_derive` | 0.2.0 | MPL-2.0 | crates.io |
| `toml` | 1.1.5+spec-1.1.0 | MIT OR Apache-2.0 | crates.io |
| `toml_datetime` | 1.1.1+spec-1.1.0 | MIT OR Apache-2.0 | crates.io |
| `toml_edit` | 0.25.15+spec-1.1.0 | MIT OR Apache-2.0 | crates.io |
| `toml_parser` | 1.1.3+spec-1.1.0 | MIT OR Apache-2.0 | crates.io |
| `toml_writer` | 1.1.2+spec-1.1.0 | MIT OR Apache-2.0 | crates.io |
| `uluru` | 3.1.0 | MPL-2.0 | crates.io |
| `unicode-bidi` | 0.3.18 | MIT OR Apache-2.0 | crates.io |
| `unicode-ident` | 1.0.24 | (MIT OR Apache-2.0) AND Unicode-3.0 | crates.io |
| `unicode-script` | 0.5.8 | MIT OR Apache-2.0 | crates.io |
| `unicode-segmentation` | 1.13.3 | MIT OR Apache-2.0 | crates.io |
| `unicode-vo` | 0.1.0 | MIT/Apache-2.0 | crates.io |
| `unicode-width` | 0.2.2 | MIT OR Apache-2.0 | crates.io |
| `url` | 2.5.8 | MIT OR Apache-2.0 | crates.io |
| `usvg` | 0.48.1 | Apache-2.0 OR MIT | crates.io |
| `utf16_iter` | 1.0.5 | Apache-2.0 OR MIT | crates.io |
| `utf8_iter` | 1.0.4 | Apache-2.0 OR MIT | crates.io |
| `uuid` | 1.26.0 | Apache-2.0 OR MIT | crates.io |
| `version_check` | 0.9.5 | MIT/Apache-2.0 | crates.io |
| `void` | 1.0.2 | MIT | crates.io |
| `walkdir` | 2.5.0 | Unlicense/MIT | crates.io |
| `wayland-sys` | 0.31.11 | MIT | crates.io |
| `web-time` | 1.1.0 | MIT OR Apache-2.0 | crates.io |
| `web_atoms` | 0.3.0 | MIT OR Apache-2.0 | crates.io |
| `weezl` | 0.1.12 | MIT OR Apache-2.0 | crates.io |
| `winnow` | 1.0.4 | MIT | crates.io |
| `write16` | 1.0.0 | Apache-2.0 OR MIT | crates.io |
| `writeable` | 0.6.4 | Unicode-3.0 | crates.io |
| `wuff` | 0.2.9 | MIT | crates.io |
| `x11-dl` | 2.21.0 | MIT | crates.io |
| `xattr` | 1.6.1 | MIT OR Apache-2.0 | crates.io |
| `xml-rs` | 0.8.29 | MIT | crates.io |
| `xml5ever` | 0.40.0 | MIT OR Apache-2.0 | crates.io |
| `xmlwriter` | 0.1.0 | MIT | crates.io |
| `xsum` | 0.1.6 | MIT | crates.io |
| `yeslogic-fontconfig-sys` | 6.0.1 | MIT | crates.io |
| `yoke` | 0.8.3 | Unicode-3.0 | crates.io |
| `yoke-derive` | 0.8.2 | Unicode-3.0 | crates.io |
| `zerofrom` | 0.1.8 | Unicode-3.0 | crates.io |
| `zerofrom-derive` | 0.1.7 | Unicode-3.0 | crates.io |
| `zerotrie` | 0.2.5 | Unicode-3.0 | crates.io |
| `zerovec` | 0.11.8 | Unicode-3.0 | crates.io |
| `zerovec-derive` | 0.11.6 | Unicode-3.0 | crates.io |
| `zlib-rs` | 0.6.7 | Zlib | crates.io |
| `zmij` | 1.0.23 | MIT | crates.io |
| `zune-core` | 0.5.3 | MIT OR Apache-2.0 OR Zlib | crates.io |
| `zune-jpeg` | 0.5.15 | MIT OR Apache-2.0 OR Zlib | crates.io |
