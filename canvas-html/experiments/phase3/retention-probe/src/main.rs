//! Which part of a new document's lifecycle retains native memory?
//!
//! Each variant creates and drops `CYCLES` documents and reports glibc `mallinfo2` allocated
//! bytes (all arenas, after `malloc_trim`) before and after. Variants change one ingredient at a
//! time relative to the Phase 3 renderer's document (Inter registered in a private collection,
//! `SourceCache::new_shared()`, 160x64 viewport, text in the page, initial resolve).
//!
//!   cargo run --release -p phase3-retention-probe -- [variant ...]
use std::sync::Arc;

use anyrender::{ImageRenderer, PaintScene as _};
use anyrender_skia::SkiaImageRenderer;
use blitz_dom::{DocumentConfig, util::Color};
use blitz_html::HtmlDocument;
use blitz_traits::shell::{ColorScheme, Viewport};
use parley::FontContext;
use parley::fontique::{Blob, Collection, CollectionOptions, SourceCache};
use peniko::{Fill, kurbo::Rect};
use serde_json::json;

const CYCLES: usize = 400;
const INTER: &[u8] = include_bytes!("../../../../test/assets/Inter-Regular.otf");
const TEXT: &str = r#"<style>body{margin:0;font-family:Inter;font-size:12px}#box{position:absolute;left:0;top:20px;width:16px;height:16px;background:red}</style><div id="date">0</div><div id="box"></div>"#;
const TAMIL: &[u8] = include_bytes!("../../../../test/assets/noto/NotoSansTamil-Regular.ttf");
const TAMIL_TEXT: &str = r#"<style>body{margin:0;font-family:'Noto Sans Tamil';font-size:12px}</style><div id="date">தமிழ்</div>"#;
const NO_TEXT: &str = r#"<style>body{margin:0}#box{position:absolute;left:0;top:20px;width:16px;height:16px;background:red}</style><div id="box"></div>"#;

fn allocated() -> f64 {
    unsafe {
        libc::malloc_trim(0);
        libc::mallinfo2().uordblks as f64 / 1048576.0
    }
}

struct Opts {
    html: &'static str,
    fonts: Fonts,
    resolve: bool,
    paint: bool,
    ua: bool,
    thread_per_doc: bool,
}

#[derive(Clone)]
enum Fonts {
    /// Fresh collection per document, Inter registered from a fresh Arc (Phase 3 renderer)
    FreshBlobEachDoc,
    /// Fresh collection per document, the same Inter blob (same font source id) every time
    SameBlobEachDoc(Blob<u8>),
    /// Fresh collection per document with a small font (Noto Sans Tamil, 41 KB)
    SmallFont,
    /// Blitz's default font context (no registered fonts, no system fonts)
    None,
}

fn one(o: &Opts) {
    let font_ctx = match &o.fonts {
        Fonts::None => {
            let collection = Collection::new(CollectionOptions { shared: false, system_fonts: false });
            Some(FontContext { source_cache: SourceCache::new_shared(), collection })
        }
        Fonts::SmallFont => {
            let mut collection = Collection::new(CollectionOptions { shared: false, system_fonts: false });
            collection.register_fonts(Blob::new(Arc::new(TAMIL.to_vec()) as _), None);
            Some(FontContext { source_cache: SourceCache::new_shared(), collection })
        }
        Fonts::FreshBlobEachDoc | Fonts::SameBlobEachDoc(_) => {
            let mut collection = Collection::new(CollectionOptions { shared: false, system_fonts: false });
            let blob = match &o.fonts {
                Fonts::SameBlobEachDoc(b) => b.clone(),
                _ => Blob::new(Arc::new(INTER.to_vec()) as _),
            };
            collection.register_fonts(blob, None);
            Some(FontContext { source_cache: SourceCache::new_shared(), collection })
        }
    };
    let mut doc = HtmlDocument::from_html(
        o.html,
        DocumentConfig {
            viewport: Some(Viewport::new(160, 64, 1.0, ColorScheme::Light)),
            font_ctx,
            ua_stylesheets: if o.ua { None } else { Some(vec![]) },
            ..Default::default()
        },
    );
    if o.resolve {
        doc.resolve(0.0);
    }
    if o.paint {
        let mut painter = SkiaImageRenderer::new(160, 64);
        let mut bytes = Vec::new();
        painter.render_to_vec(
            |scene| {
                scene.fill(Fill::NonZero, Default::default(), Color::from_rgba8(255, 255, 255, 255), Default::default(), &Rect::new(0.0, 0.0, 160.0, 64.0));
                blitz_paint::paint_scene(scene, &mut doc, 1.0, 160, 64, 0, 0);
            },
            &mut bytes,
        );
    }
}

fn run(name: &str, o: Opts) -> serde_json::Value {
    // warm up one-time process globals (UA cache, font DB, thread-locals) outside the measurement
    for _ in 0..5 {
        cycle(&o);
    }
    let before = allocated();
    let mut marks = Vec::new();
    for i in 0..CYCLES {
        cycle(&o);
        if (i + 1) % 100 == 0 {
            marks.push(allocated());
        }
    }
    let after = allocated();
    let per_cycle_kib = (after - before) * 1024.0 / CYCLES as f64;
    // Skia's process-wide caches (C++, outside the Graphify corpus)
    let skia_font = skia_safe::graphics::font_cache_used() as f64 / 1048576.0;
    let skia_font_limit = skia_safe::graphics::font_cache_limit() as f64 / 1048576.0;
    let skia_resource = skia_safe::graphics::resource_cache_total_bytes_used() as f64 / 1048576.0;
    let skia_resource_limit = skia_safe::graphics::resource_cache_total_bytes_limit() as f64 / 1048576.0;
    let strikes = skia_safe::graphics::font_cache_count_used();
    skia_safe::graphics::purge_all_caches();
    let after_purge = allocated();
    println!("{name:<28} skia strikes {strikes}, allocated after skia purge_all_caches {after_purge:.2} MiB");
    println!("{name:<28} before {before:7.2} MiB  after {after:7.2} MiB  marks {marks:?}  {per_cycle_kib:6.1} KiB/cycle  skia font cache {skia_font:.2}/{skia_font_limit:.0} MiB, resource cache {skia_resource:.2}/{skia_resource_limit:.0} MiB");
    json!({"variant": name, "beforeMiB": before, "afterMiB": after, "marksMiB": marks, "kibPerCycle": per_cycle_kib,
           "skiaFontCacheMiB": skia_font, "skiaFontCacheLimitMiB": skia_font_limit, "skiaResourceCacheMiB": skia_resource, "skiaResourceCacheLimitMiB": skia_resource_limit, "skiaStrikes": strikes, "afterSkiaPurgeMiB": after_purge})
}

fn cycle(o: &Opts) {
    if o.thread_per_doc {
        let o2 = Opts { html: o.html, fonts: o.fonts.clone(), resolve: o.resolve, paint: o.paint, ua: o.ua, thread_per_doc: false };
        std::thread::spawn(move || one(&o2)).join().unwrap();
    } else {
        one(o);
    }
}

fn main() {
    let shared_blob = Blob::new(Arc::new(INTER.to_vec()) as _);
    let base = || Opts { html: TEXT, fonts: Fonts::FreshBlobEachDoc, resolve: true, paint: false, ua: true, thread_per_doc: false };
    let all: Vec<(&str, Opts)> = vec![
        ("parse-only", Opts { resolve: false, ..base() }),
        ("resolve (phase3 doc)", base()),
        ("resolve+paint", Opts { paint: true, ..base() }),
        ("resolve, no UA stylesheet", Opts { ua: false, ..base() }),
        ("resolve, no text", Opts { html: NO_TEXT, ..base() }),
        ("resolve, no fonts", Opts { fonts: Fonts::None, ..base() }),
        ("resolve, same font blob", Opts { fonts: Fonts::SameBlobEachDoc(shared_blob.clone()), ..base() }),
        ("resolve, thread per doc", Opts { thread_per_doc: true, ..base() }),
        ("same blob, thread per doc", Opts { fonts: Fonts::SameBlobEachDoc(shared_blob.clone()), thread_per_doc: true, ..base() }),
        ("same blob, paint", Opts { fonts: Fonts::SameBlobEachDoc(shared_blob.clone()), paint: true, ..base() }),
        ("paint, 41 KB font", Opts { html: TAMIL_TEXT, fonts: Fonts::SmallFont, paint: true, ..base() }),
        ("tpd: parse-only", Opts { resolve: false, thread_per_doc: true, ..base() }),
        ("tpd: resolve, no text", Opts { html: NO_TEXT, thread_per_doc: true, ..base() }),
        ("tpd: resolve, no UA", Opts { ua: false, thread_per_doc: true, ..base() }),
        ("tpd: resolve, no fonts", Opts { fonts: Fonts::None, thread_per_doc: true, ..base() }),
        ("tpd: no text, no UA, no fonts", Opts { html: NO_TEXT, ua: false, fonts: Fonts::None, thread_per_doc: true, ..base() }),
    ];
    let only: Vec<String> = std::env::args().skip(1).collect();
    let mut results = Vec::new();
    for (name, o) in all {
        if only.is_empty() || only.iter().any(|w| name.contains(w.as_str())) {
            results.push(run(name, o));
        }
    }
    println!("{}", json!({"cycles": CYCLES, "results": results}));
}
