//! canvas-html: draw HTML + CSS + JavaScript to RGBA pixels, like Chrome's HTML-in-Canvas but
//! without a browser. Blitz (Stylo + Taffy + Parley) does style, layout and text, Skia paints,
//! and Boa runs scripts. The engine has no idea of video or frames: it draws the document as it
//! is now. Time only moves when the host says so (frozen clock), unless `clock: "real"`.

use std::sync::{Arc, Mutex};

use anyrender::{ImageRenderer, PaintScene as _};
use anyrender_skia::SkiaImageRenderer;
use base64::Engine as _;
use blitz_dom::{BaseDocument, DocumentConfig, util::Color};
use blitz_html::HtmlDocument;
use blitz_paint::paint_scene;
use blitz_traits::net::{Bytes, NetHandler, NetProvider, Request};
use blitz_traits::shell::{ColorScheme, Viewport};
use blitz_dom::Document as _;
use blitz_vibey_script::ScriptDocument;
use std::time::{Duration, Instant};
use napi::bindgen_prelude::*;
use napi_derive::napi;
use parley::FontContext;
use parley::fontique::{Blob, Collection, CollectionOptions, FallbackKey, Script, SourceCache};
use std::collections::HashMap;
use std::str::FromStr as _;
use peniko::Fill;
use peniko::kurbo::Rect;

/// Origin of the document's animation timeline (seconds). The clock starts at 0 at load, the
/// same origin that restyles triggered from script use.
const T0: f64 = 0.0;

// ---------------------------------------------------------------------------------------------
// Resources: local files and data: URLs only, loaded synchronously. Video renders should not
// depend on the network, and synchronous loading keeps every frame deterministic.
// ---------------------------------------------------------------------------------------------

struct LocalNet {
    errors: Arc<Mutex<Vec<String>>>,
}

fn decode_data_url(url: &str) -> Option<Vec<u8>> {
    let rest = url.strip_prefix("data:")?;
    let (meta, payload) = rest.split_once(',')?;
    if meta.ends_with(";base64") {
        let clean: String = payload.chars().filter(|c| !c.is_whitespace()).collect();
        base64::engine::general_purpose::STANDARD.decode(clean).ok()
    } else {
        Some(percent_encoding::percent_decode_str(payload).collect())
    }
}

impl NetProvider for LocalNet {
    fn fetch(&self, _doc_id: usize, request: Request, handler: Box<dyn NetHandler>) {
        let url = request.url.clone();
        let data = match url.scheme() {
            "data" => decode_data_url(url.as_str()),
            "file" => url.to_file_path().ok().and_then(|p| std::fs::read(p).ok()),
            _ => None,
        };
        match data {
            Some(bytes) => handler.bytes(url.to_string(), Bytes::from(bytes)),
            None => self.errors.lock().unwrap().push(format!("could not load {url}")),
        }
    }
}

// ---------------------------------------------------------------------------------------------

#[napi(object)]
pub struct RendererOptions {
    /// Output width in pixels.
    pub width: u32,
    /// Output height in pixels.
    pub height: u32,
    /// Device pixel ratio: CSS pixels are multiplied by this. Default 1.
    pub device_pixel_ratio: Option<f64>,
    /// Painted under the page, as "#rrggbb" or "#rrggbbaa". Default "#ffffff".
    pub background: Option<String>,
    /// Also use the fonts installed on this machine. Default true.
    /// Turn it off for renders that must look the same on every machine.
    pub system_fonts: Option<bool>,
    /// Font families to try, in order, for text in a script the element's own font lacks,
    /// keyed by ISO 15924 script tag, e.g. { Taml: ["Noto Sans Tamil"] }. Merged over the defaults.
    pub fallback_fonts: Option<HashMap<String, Vec<String>>>,
    /// Run the page's <script> tags (Boa JS engine). Default false.
    pub scripts: Option<bool>,
    /// "frozen" (default): the clock (Date, performance.now, timers, CSS animations) only moves
    /// when you call advanceClock(ms), so a page that reads the time by mistake still renders the
    /// same pixels every time. "real": the clock follows the wall clock, like a browser tab.
    pub clock: Option<String>,
    /// The epoch of JS time in milliseconds since the Unix epoch: `performance.timeOrigin`, and
    /// `Date.now()` at clock 0. With the frozen clock, `Date.now() = floor(epochMs + clock)` and
    /// `performance.now() = clock`, so pages that read the date render the same pixels on every
    /// run. Default: the wall-clock time at load (the previous behaviour).
    pub epoch_ms: Option<f64>,
    /// Experimental, private (Phase 4A): "cpu" (default), "gpu-gl" or "gpu-vulkan". GPU backends
    /// exist only in builds with the `experimental-gpu` cargo feature.
    pub experimental_backend: Option<String>,
    /// Experimental: "renderer" (default, one GPU device per renderer) or "thread" (renderers on
    /// the same thread share one device).
    pub experimental_gpu_share: Option<String>,
}

#[napi(object)]
pub struct RenderOptions {
    /// "rgba" (default): raw pixels, 4 bytes per pixel, row by row. "png": a PNG file.
    pub format: Option<String>,
}

/// Fallback order per script. On Linux, fontique asks fontconfig for one fallback family per
/// script and often gets Unifont (a bitmap-style font without shaping tables), which breaks
/// Arabic joining and Indic conjuncts. Families that are neither installed nor registered
/// with `registerFont` are skipped. canvas-html ships no fonts itself.
const DEFAULT_FALLBACKS: &[(&str, &[&str])] = &[
    ("Arab", &["Noto Sans Arabic", "Noto Naskh Arabic", "DejaVu Sans", "FreeSerif", "Unifont"]),
    ("Deva", &["Noto Sans Devanagari", "Lohit Devanagari", "FreeSerif", "Unifont"]),
    ("Taml", &["Noto Sans Tamil", "Lohit Tamil", "FreeSerif", "Unifont"]),
    ("Hebr", &["Noto Sans Hebrew", "DejaVu Sans", "FreeSans", "Unifont"]),
    ("Cyrl", &["Noto Sans", "DejaVu Sans", "FreeSans"]),
    ("Grek", &["Noto Sans", "DejaVu Sans", "FreeSans"]),
    ("Thai", &["Noto Sans Thai", "FreeSerif", "Unifont"]),
];

/// Safety valve: a page that keeps scheduling 0 ms timers would otherwise never let time advance.
const MAX_TIMER_RUNS: usize = 100_000;

/// Installed before the page's scripts run: performance.now, requestAnimationFrame and
/// Web Animations on top of CSS animations (see prelude.js).
const JS_PRELUDE: &str = include_str!("prelude.js");

/// Prefix of the messages that carry eval() results back from the page.
const RESULT_MARK: &str = "\u{1}canvas-html-result:";

enum Doc {
    Plain(HtmlDocument),
    Script(Box<ScriptDocument>),
}

impl Doc {
    fn with_base<R>(&mut self, f: impl FnOnce(&mut BaseDocument) -> R) -> R {
        match self {
            Doc::Plain(d) => f(d.as_mut()),
            Doc::Script(doc) => {
                let mut g = doc.inner_mut();
                f(&mut g)
            }
        }
    }
}

#[napi(object)]
pub struct MissingGlyphs {
    /// The element's id, or its tag name when it has none.
    pub element: String,
    /// The characters that no available font could draw (each listed once).
    pub chars: String,
    /// How many times they occur.
    pub count: u32,
}

#[napi(object)]
pub struct ElementBox {
    pub id: String,
    pub tag: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// Draws one HTML document, as it is now, into pixels.
#[napi]
pub struct HtmlRenderer {
    width: u32,
    height: u32,
    dpr: f64,
    background: Color,
    system_fonts: bool,
    fallbacks: HashMap<String, Vec<String>>,
    scripts: bool,
    real_clock: bool,
    fonts: Vec<Vec<u8>>,
    html: Option<String>,
    base_url: Option<String>,
    doc: Option<Doc>,
    /// Frozen clock: milliseconds since load, moved only by advanceClock().
    clock_ms: f64,
    /// When the document was loaded: the origin of the clock.
    loaded_at: Instant,
    /// The script clock's origin (virtual or real Instant).
    script_start: Option<Instant>,
    renderer: Painter,
    buffer: Vec<u8>,
    errors: Arc<Mutex<Vec<String>>>,
    js_errors: Vec<String>,
    epoch_ms: Option<f64>,
    /// Set by close(): the document and script runtime are dropped; every call then fails.
    closed: bool,
}

fn parse_hex(s: &str) -> Result<Color> {
    let h = s.trim().trim_start_matches('#');
    let p = |i: usize| u8::from_str_radix(&h[i..i + 2], 16);
    let bad = || Error::from_reason(format!("background must be #rrggbb or #rrggbbaa, got {s}"));
    match h.len() {
        6 => Ok(Color::from_rgba8(p(0).map_err(|_| bad())?, p(2).map_err(|_| bad())?, p(4).map_err(|_| bad())?, 255)),
        8 => Ok(Color::from_rgba8(p(0).map_err(|_| bad())?, p(2).map_err(|_| bad())?, p(4).map_err(|_| bad())?, p(6).map_err(|_| bad())?)),
        _ => Err(bad()),
    }
}

impl HtmlRenderer {
    fn build_document(&mut self) -> Result<Doc> {
        let html = self.html.as_ref().ok_or_else(|| Error::from_reason("call load(html) first"))?;
        let mut collection = Collection::new(CollectionOptions { shared: false, system_fonts: self.system_fonts });
        collection.register_fonts(Blob::new(Arc::new(blitz_dom::BULLET_FONT) as _), None);
        for f in &self.fonts {
            collection.register_fonts(Blob::new(Arc::new(f.clone()) as _), None);
        }
        for (tag, families) in &self.fallbacks {
            let Ok(script) = Script::from_str(tag) else { continue };
            let ids: Vec<_> = families.iter().filter_map(|name| collection.family_id(name)).collect();
            if !ids.is_empty() {
                collection.set_fallbacks(FallbackKey::new(script, None), ids.into_iter());
            }
        }
        let font_ctx = FontContext { source_cache: SourceCache::new_shared(), collection };
        let pw = (self.width as f64 * self.dpr).round() as u32;
        let ph = (self.height as f64 * self.dpr).round() as u32;
        let config = DocumentConfig {
            base_url: Some(self.base_url.clone().unwrap_or_else(|| "file:///".to_string())),
            viewport: Some(Viewport::new(pw, ph, self.dpr as f32, ColorScheme::Light)),
            net_provider: Some(Arc::new(LocalNet { errors: self.errors.clone() })),
            font_ctx: Some(font_ctx),
            ..Default::default()
        };
        let mut doc = if self.scripts {
            let mut sdoc = ScriptDocument::from_html(html, config).without_timer_thread();
            if !self.real_clock {
                sdoc = sdoc.with_virtual_time();
            }
            if let Some(epoch) = self.epoch_ms {
                sdoc = sdoc.with_epoch_ms(epoch);
            }
            self.script_start = Some(sdoc.clock_now());
            sdoc.eval(JS_PRELUDE);
            sdoc.execute_scripts();
            self.js_errors.extend(sdoc.take_js_errors());
            Doc::Script(Box::new(sdoc))
        } else {
            self.script_start = None;
            Doc::Plain(HtmlDocument::from_html(html, config))
        };
        self.clock_ms = 0.0;
        self.loaded_at = Instant::now();
        // Stylo starts every animation at the first resolve: that instant is time 0.
        doc.with_base(|b| b.resolve(T0));
        Ok(doc)
    }

    /// Milliseconds since load on the document's clock.
    fn now_ms(&self) -> f64 {
        if self.real_clock {
            self.loaded_at.elapsed().as_secs_f64() * 1000.0
        } else {
            self.clock_ms
        }
    }

    fn check_open(&self) -> Result<()> {
        if self.closed {
            return Err(Error::from_reason("renderer is closed"));
        }
        Ok(())
    }

    fn doc_mut(&mut self) -> Result<&mut Doc> {
        self.check_open()?;
        if self.doc.is_none() {
            self.doc = Some(self.build_document()?);
        }
        Ok(self.doc.as_mut().unwrap())
    }

    /// With a real clock, run the timers that are due by now.
    fn run_due_timers(&mut self) {
        if !self.real_clock {
            return;
        }
        if let Some(Doc::Script(doc)) = self.doc.as_mut() {
            let mut runs = 0;
            while doc.next_timer_deadline().is_some_and(|d| d <= Instant::now()) && runs < MAX_TIMER_RUNS {
                doc.poll(None);
                runs += 1;
            }
            self.js_errors.extend(doc.take_js_errors());
        }
    }

    /// Style and lay out the document for the current clock.
    fn resolve(&mut self) -> Result<()> {
        self.run_due_timers();
        let t = T0 + self.now_ms() / 1000.0;
        self.doc_mut()?.with_base(|b| b.resolve(t));
        Ok(())
    }

    /// Evaluate `code` in the page and return its result as JSON (functions, elements and other
    /// values JSON cannot hold come back as null). A thrown error becomes a napi error.
    fn eval_json(&mut self, code: &str) -> Result<serde_json::Value> {
        self.doc_mut()?;
        let Some(Doc::Script(doc)) = self.doc.as_mut() else {
            return Err(Error::from_reason("eval and call need a renderer created with scripts: true"));
        };
        let code_literal = serde_json::to_string(code).unwrap();
        let mark = serde_json::to_string(RESULT_MARK).unwrap();
        doc.eval(&format!(
            "(() => {{ let r; try {{ r = {{ ok: (0, eval)({code_literal}) }}; }} catch (e) {{ \
             const m = String(e), st = e && e.stack ? String(e.stack) : ''; \
             r = {{ error: st.startsWith(m) ? st : st ? m + '\\n' + st : m }}; }} let j; \
             try {{ j = JSON.stringify(r, (k, v) => (v === undefined ? null : v)); }} catch (e) {{ j = '{{\"ok\":null}}'; }} \
             __blitz_send_message({mark} + j); }})()"
        ));
        self.js_errors.extend(doc.take_js_errors());
        let result = doc
            .take_messages()
            .into_iter()
            .rev()
            .find_map(|m| m.strip_prefix(RESULT_MARK).map(str::to_string))
            .ok_or_else(|| Error::from_reason("eval produced no result"))?;
        let v: serde_json::Value =
            serde_json::from_str(&result).map_err(|e| Error::from_reason(format!("eval result: {e}")))?;
        if let Some(err) = v.get("error") {
            return Err(Error::from_reason(err.as_str().unwrap_or("error").to_string()));
        }
        Ok(v.get("ok").cloned().unwrap_or(serde_json::Value::Null))
    }

    /// Paint into `self.buffer` (with `readback`, always on CPU) and report where the time went.
    fn paint(&mut self, readback: bool) -> Result<PaintTimings> {
        let pw = (self.width as f64 * self.dpr).round() as u32;
        let ph = (self.height as f64 * self.dpr).round() as u32;
        let bg = self.background;
        let dpr = self.dpr;
        let doc = self.doc.as_mut().expect("document");
        let draw = |scene: &mut anyrender_skia::SkiaScenePainter<'_>| {
            scene.fill(Fill::NonZero, Default::default(), bg, Default::default(), &Rect::new(0.0, 0.0, pw as f64, ph as f64));
            doc.with_base(|b| paint_scene(scene, b, dpr, pw, ph, 0, 0));
        };
        match &mut self.renderer {
            Painter::Closed => Err(Error::from_reason("renderer is closed")),
            Painter::Cpu(renderer) => {
                let _ = readback; // the CPU rasterizes into memory: there is nothing to read back
                let start = Instant::now();
                renderer.render_to_vec(draw, &mut self.buffer);
                Ok(PaintTimings { record_ns: start.elapsed().as_nanos(), ..Default::default() })
            }
            #[cfg(feature = "experimental-gpu")]
            Painter::Gpu(renderer) => {
                let t = renderer
                    .render_timed(draw, readback.then_some(&mut self.buffer))
                    .map_err(|e| Error::from_reason(format!("GPU render failed ({}): {e}", renderer.device().kind().name())))?;
                Ok(PaintTimings { record_ns: t.record_ns, submit_ns: t.submit_ns, wait_ns: t.wait_ns, readback_ns: t.readback_ns })
            }
            #[cfg(feature = "experimental-graphite")]
            Painter::Graphite(renderer) => {
                let t = renderer
                    .render_timed(draw, readback.then_some(&mut self.buffer))
                    .map_err(|e| Error::from_reason(format!("GPU render failed (graphite-vulkan): {e}")))?;
                Ok(PaintTimings { record_ns: t.record_ns, submit_ns: t.submit_ns, wait_ns: t.wait_ns, readback_ns: t.readback_ns })
            }
        }
    }
}

#[derive(Default, Clone, Copy)]
struct PaintTimings {
    record_ns: u128,
    submit_ns: u128,
    wait_ns: u128,
    readback_ns: u128,
}

/// The surface the page is painted into. CPU (Skia raster into the output buffer) is the default
/// and the only backend of default builds.
enum Painter {
    /// After `close()`: the surface (and a GPU device reference) is released.
    Closed,
    Cpu(SkiaImageRenderer),
    #[cfg(feature = "experimental-gpu")]
    Gpu(anyrender_skia::SkiaGpuImageRenderer),
    #[cfg(feature = "experimental-graphite")]
    Graphite(anyrender_skia::SkiaGraphiteImageRenderer),
}

#[cfg(feature = "experimental-gpu")]
thread_local! {
    /// Devices shared by renderers of one thread (`experimentalGpuShare: "thread"`). Weak, so a
    /// device is released when its last renderer closes.
    static SHARED_GPU: std::cell::RefCell<Vec<std::rc::Weak<anyrender_skia::GpuDevice>>> = const { std::cell::RefCell::new(Vec::new()) };
}

#[cfg(feature = "experimental-graphite")]
thread_local! {
    static SHARED_GRAPHITE: std::cell::RefCell<Vec<std::rc::Weak<anyrender_skia::GraphiteDevice>>> = const { std::cell::RefCell::new(Vec::new()) };
}

impl Painter {
    fn new(backend: Option<&str>, share: Option<&str>, pw: u32, ph: u32) -> Result<Self> {
        let name = backend.unwrap_or("cpu");
        if name == "cpu" {
            return Ok(Painter::Cpu(SkiaImageRenderer::new(pw, ph)));
        }
        let shared = match share.unwrap_or("renderer") {
            "renderer" => false,
            "thread" => true,
            other => return Err(Error::from_reason(format!("experimentalGpuShare must be \"renderer\" or \"thread\", got {other:?}"))),
        };
        #[cfg(feature = "experimental-graphite")]
        if name == "gpu-graphite" || name == "gpu-graphite-vulkan" {
            use anyrender_skia::{GraphiteDevice, SkiaGraphiteImageRenderer};
            let existing = shared
                .then(|| SHARED_GRAPHITE.with(|s| s.borrow().iter().filter_map(|w| w.upgrade()).find(|d| !d.is_device_lost())))
                .flatten();
            let device = match existing {
                Some(d) => d,
                None => {
                    let d = GraphiteDevice::new().map_err(|e| Error::from_reason(format!("GPU initialization failed (graphite-vulkan): {e}")))?;
                    if shared {
                        SHARED_GRAPHITE.with(|s| {
                            let mut s = s.borrow_mut();
                            s.retain(|w| w.strong_count() > 0);
                            s.push(std::rc::Rc::downgrade(&d));
                        });
                    }
                    d
                }
            };
            let r = SkiaGraphiteImageRenderer::new(device, pw, ph).map_err(|e| Error::from_reason(e.to_string()))?;
            return Ok(Painter::Graphite(r));
        }
        #[cfg(feature = "experimental-gpu")]
        {
            use anyrender_skia::{GpuApi, GpuDevice, SkiaGpuImageRenderer};
            let api = GpuApi::parse(name).map_err(|e| Error::from_reason(e.to_string()))?;
            let existing = shared
                .then(|| SHARED_GPU.with(|s| s.borrow().iter().filter_map(|w| w.upgrade()).find(|d| d.kind() == api && !d.is_abandoned())))
                .flatten();
            let device = match existing {
                Some(d) => d,
                None => {
                    let d = GpuDevice::new(api).map_err(|e| Error::from_reason(format!("GPU initialization failed ({}): {e}", api.name())))?;
                    if shared {
                        SHARED_GPU.with(|s| {
                            let mut s = s.borrow_mut();
                            s.retain(|w| w.strong_count() > 0);
                            s.push(std::rc::Rc::downgrade(&d));
                        });
                    }
                    d
                }
            };
            let r = SkiaGpuImageRenderer::new(device, pw, ph).map_err(|e| Error::from_reason(e.to_string()))?;
            return Ok(Painter::Gpu(r));
        }
        #[allow(unreachable_code)]
        {
            let _ = shared;
            Err(Error::from_reason(format!("unsupported GPU backend {name:?} in this build (experimentalBackend needs an experimental GPU feature)")))
        }
    }

    fn name(&self) -> &'static str {
        match self {
            Painter::Closed => "closed",
            Painter::Cpu(_) => "cpu-raster",
            #[cfg(feature = "experimental-gpu")]
            Painter::Gpu(r) => r.device().kind().name(),
            #[cfg(feature = "experimental-graphite")]
            Painter::Graphite(r) => r.device().name(),
        }
    }
}

#[napi(object)]
pub struct TimedRenderOptions {
    /// "rgba" (default), "png", or "none" (render without returning pixels).
    pub format: Option<String>,
    /// GPU only: copy the pixels back to the CPU (default true). False keeps the frame on the GPU.
    pub readback: Option<bool>,
    /// Also time Blitz's paint-command generation alone (an extra pass into a no-op painter),
    /// reported as `paintPrep`. Default false.
    pub measure_paint_prep: Option<bool>,
}

#[napi(object)]
pub struct TimedRender {
    /// The backend that rendered this frame: "cpu-raster", "ganesh-gl" or "ganesh-vulkan".
    pub backend: String,
    /// Nanoseconds per step: frameJs (rAF + animations), resolve (style + layout), paint
    /// (CPU: command generation + rasterization; GPU: command generation + Skia recording),
    /// gpuSubmit, gpuWait, readback, buffer (Node Buffer creation), png, total.
    pub timings_ns: HashMap<String, f64>,
    pub pixels: Option<Buffer>,
}

#[napi]
impl HtmlRenderer {
    #[napi(constructor)]
    pub fn new(options: RendererOptions) -> Result<Self> {
        if options.width == 0 || options.height == 0 {
            return Err(Error::from_reason("width and height must be > 0"));
        }
        let dpr = options.device_pixel_ratio.unwrap_or(1.0);
        if !(dpr > 0.0) {
            return Err(Error::from_reason("devicePixelRatio must be > 0"));
        }
        let pw = (options.width as f64 * dpr).round() as u32;
        let ph = (options.height as f64 * dpr).round() as u32;
        Ok(Self {
            width: options.width,
            height: options.height,
            dpr,
            background: parse_hex(options.background.as_deref().unwrap_or("#ffffff"))?,
            system_fonts: options.system_fonts.unwrap_or(true),
            fallbacks: {
                let mut m: HashMap<String, Vec<String>> = DEFAULT_FALLBACKS
                    .iter()
                    .map(|(k, v)| (k.to_string(), v.iter().map(|s| s.to_string()).collect()))
                    .collect();
                if let Some(user) = options.fallback_fonts {
                    for (k, v) in user {
                        m.insert(k, v);
                    }
                }
                m
            },
            scripts: options.scripts.unwrap_or(false),
            real_clock: match options.clock.as_deref() {
                None | Some("frozen") => false,
                Some("real") => true,
                Some(other) => {
                    return Err(Error::from_reason(format!("clock must be \"frozen\" or \"real\", got {other:?}")));
                }
            },
            fonts: Vec::new(),
            html: None,
            base_url: None,
            doc: None,
            clock_ms: 0.0,
            loaded_at: Instant::now(),
            script_start: None,
            renderer: Painter::new(options.experimental_backend.as_deref(), options.experimental_gpu_share.as_deref(), pw, ph)?,
            buffer: Vec::with_capacity((pw * ph * 4) as usize),
            errors: Arc::new(Mutex::new(Vec::new())),
            js_errors: Vec::new(),
            epoch_ms: match options.epoch_ms {
                None => None,
                Some(e) => Some(canvas_dom_host::clock::ClockContract::validate_epoch(e).map_err(Error::from_reason)?),
            },
            closed: false,
        })
    }

    /// Registers a font file (TTF/OTF/TTC/WOFF). Use its family name in CSS.
    /// Applies to documents loaded after this call.
    #[napi]
    pub fn register_font(&mut self, data: Buffer) {
        if self.closed {
            return;
        }
        self.fonts.push(data.to_vec());
        self.doc = None;
    }

    /// Loads an HTML document. `baseUrl` resolves relative URLs (images, @font-face, CSS);
    /// pass a file:// URL of the folder the assets live in.
    #[napi]
    pub fn load(&mut self, html: String, base_url: Option<String>) -> Result<()> {
        self.check_open()?;
        if let Some(b) = &base_url {
            url::Url::parse(b).map_err(|e| Error::from_reason(format!("invalid baseUrl {b}: {e}")))?;
        }
        self.html = Some(html);
        self.base_url = base_url;
        self.errors.lock().unwrap().clear();
        self.js_errors.clear();
        self.doc = Some(self.build_document()?);
        Ok(())
    }

    /// Draws the document as it is now. Like a browser's rendering step, it first updates running
    /// Web Animations and runs requestAnimationFrame callbacks, then styles, lays out and paints.
    /// Returns RGBA pixels (`pixelWidth` x `pixelHeight`, 4 bytes each, row by row) or a PNG.
    #[napi]
    pub fn render(&mut self, options: Option<RenderOptions>) -> Result<Buffer> {
        let png = match options.and_then(|o| o.format).as_deref() {
            None | Some("rgba") => false,
            Some("png") => true,
            Some(other) => return Err(Error::from_reason(format!("format must be \"rgba\" or \"png\", got {other:?}"))),
        };
        self.doc_mut()?;
        self.run_due_timers();
        if let Some(Doc::Script(doc)) = self.doc.as_mut() {
            doc.eval("globalThis.__canvasHtml.frame();");
            self.js_errors.extend(doc.take_js_errors());
        }
        self.resolve()?;
        self.paint(true)?;
        if !png {
            return Ok(Buffer::from(self.buffer.clone()));
        }
        let pw = (self.width as f64 * self.dpr).round() as u32;
        let ph = (self.height as f64 * self.dpr).round() as u32;
        let mut out = Vec::new();
        {
            let mut enc = png::Encoder::new(&mut out, pw, ph);
            enc.set_color(png::ColorType::Rgba);
            enc.set_depth(png::BitDepth::Eight);
            let mut w = enc.write_header().map_err(|e| Error::from_reason(e.to_string()))?;
            w.write_image_data(&self.buffer).map_err(|e| Error::from_reason(e.to_string()))?;
        }
        Ok(Buffer::from(out))
    }

    /// Moves the frozen clock forward by `ms`: Date, performance.now, CSS animations that are not
    /// controlled from script, and the timers that come due on the way (in order).
    #[napi]
    pub fn advance_clock(&mut self, ms: f64) -> Result<()> {
        if !(ms >= 0.0 && ms.is_finite()) {
            return Err(Error::from_reason(format!("advanceClock needs a finite number >= 0, got {ms}")));
        }
        if self.real_clock {
            return Err(Error::from_reason("advanceClock is for clock: \"frozen\"; this renderer uses the real clock"));
        }
        self.doc_mut()?;
        let target_ms = self.clock_ms + ms;
        if let (Some(Doc::Script(doc)), Some(start)) = (self.doc.as_mut(), self.script_start) {
            let target = start + Duration::from_secs_f64(target_ms / 1000.0);
            let mut runs = 0;
            while let Some(deadline) = doc.next_timer_deadline() {
                if deadline > target {
                    break;
                }
                doc.advance_clock_to(deadline);
                doc.poll(None);
                runs += 1;
                if runs > MAX_TIMER_RUNS {
                    return Err(Error::from_reason(format!(
                        "more than {MAX_TIMER_RUNS} timer callbacks within {ms} ms: does the page schedule 0 ms timers in a loop?"
                    )));
                }
            }
            doc.advance_clock_to(target);
            doc.poll(None);
            self.js_errors.extend(doc.take_js_errors());
        }
        self.clock_ms = target_ms;
        Ok(())
    }

    /// The document's clock, in milliseconds since load.
    #[napi(getter)]
    pub fn clock_time(&self) -> f64 {
        self.now_ms()
    }

    /// Layout boxes (CSS pixels, page coordinates, before transforms) of every element with an
    /// `id`, as the document is now.
    #[napi]
    pub fn boxes(&mut self) -> Result<Vec<ElementBox>> {
        self.resolve()?;
        let mut out = Vec::new();
        self.doc.as_mut().unwrap().with_base(|doc| {
            let root = doc.root_element();
            let mut stack = vec![(root.id, 0.0f64, 0.0f64)];
            while let Some((id, px, py)) = stack.pop() {
                let node = doc.get_node(id).unwrap();
                let l = node.final_layout();
                let (x, y) = (px + l.location.x as f64, py + l.location.y as f64);
                if let Some(el) = node.element_data() {
                    if let Some(eid) = el.id.as_ref() {
                        out.push(ElementBox {
                            id: eid.to_string(),
                            tag: el.name.local.to_string(),
                            x,
                            y,
                            width: l.size.width as f64,
                            height: l.size.height as f64,
                        });
                    }
                }
                for &child in node.layout_children.borrow().as_ref().map(|c| c.as_slice()).unwrap_or(&[]) {
                    stack.push((child, x, y));
                }
            }
        });
        out.reverse();
        Ok(out)
    }

    /// Text that is drawn as empty boxes (".notdef", tofu) because no registered, installed or
    /// fallback font has the characters, as the document is now. Register a font that covers them.
    #[napi]
    pub fn missing_glyphs(&mut self) -> Result<Vec<MissingGlyphs>> {
        self.resolve()?;
        let mut out = Vec::new();
        self.doc.as_mut().unwrap().with_base(|doc| {
            let mut stack = vec![doc.root_element().id];
            while let Some(id) = stack.pop() {
                let node = doc.get_node(id).unwrap();
                if let Some(el) = node.element_data() {
                    if let Some(text_layout) = el.inline_layout_data.as_ref() {
                        // A character is drawn when it belongs to a shaped cluster whose glyphs are
                        // all real (id != 0). Text with no usable font at all gets no run, so we
                        // check coverage of the text rather than look for .notdef glyphs only.
                        let text = &text_layout.text;
                        let mut covered = vec![false; text.len()];
                        for line in text_layout.layout.lines() {
                            for item in line.items() {
                                let parley::PositionedLayoutItem::GlyphRun(run) = item else { continue };
                                for cluster in run.run().clusters() {
                                    if cluster.glyphs().all(|g| g.id != 0) {
                                        let range = cluster.text_range();
                                        for b in covered.get_mut(range).into_iter().flatten() {
                                            *b = true;
                                        }
                                    }
                                }
                            }
                        }
                        let mut chars = String::new();
                        let mut count = 0u32;
                        for (i, c) in text.char_indices() {
                            if covered[i] || c.is_whitespace() || c.is_control() || c == '\u{FFFC}' {
                                continue;
                            }
                            count += 1;
                            if !chars.contains(c) {
                                chars.push(c);
                            }
                        }
                        if count > 0 {
                            out.push(MissingGlyphs {
                                element: el.id.as_ref().map(|i| i.to_string()).unwrap_or_else(|| el.name.local.to_string()),
                                chars,
                                count,
                            });
                        }
                    }
                }
                for &child in node.layout_children.borrow().as_ref().map(|c| c.as_slice()).unwrap_or(&[]) {
                    stack.push(child);
                }
            }
        });
        Ok(out)
    }

    /// Runs JavaScript in the page (needs `scripts: true`) and returns the value of the last
    /// expression, converted through JSON. Throws if the code throws.
    #[napi]
    pub fn eval(&mut self, code: String) -> Result<serde_json::Value> {
        self.run_due_timers();
        self.eval_json(&code)
    }

    /// Uncaught JavaScript errors so far (script loading, timers, callbacks).
    #[napi(getter)]
    pub fn js_errors(&self) -> Vec<String> {
        self.js_errors.clone()
    }

    /// Resources (images, fonts, stylesheets) that could not be loaded so far.
    #[napi(getter)]
    pub fn load_errors(&self) -> Vec<String> {
        self.errors.lock().unwrap().clone()
    }

    /// Experimental (Phase 4A): render like `render()` and report the time of every step. The
    /// backend that drew the frame is named in the result; nothing falls back silently.
    #[napi(js_name = "_renderTimed")]
    pub fn render_timed(&mut self, options: Option<TimedRenderOptions>) -> Result<TimedRender> {
        let total = Instant::now();
        let (format, readback, measure_prep) = match options {
            Some(o) => (o.format.unwrap_or_else(|| "rgba".into()), o.readback.unwrap_or(true), o.measure_paint_prep.unwrap_or(false)),
            None => ("rgba".into(), true, false),
        };
        let readback = readback || format != "none";
        let mut t: HashMap<String, f64> = HashMap::new();
        self.doc_mut()?;
        self.run_due_timers();
        let start = Instant::now();
        if let Some(Doc::Script(doc)) = self.doc.as_mut() {
            doc.eval("globalThis.__canvasHtml.frame();");
            self.js_errors.extend(doc.take_js_errors());
        }
        t.insert("frameJs".into(), start.elapsed().as_nanos() as f64);
        let start = Instant::now();
        self.resolve()?;
        t.insert("resolve".into(), start.elapsed().as_nanos() as f64);
        if measure_prep {
            let pw = (self.width as f64 * self.dpr).round() as u32;
            let ph = (self.height as f64 * self.dpr).round() as u32;
            let dpr = self.dpr;
            let doc = self.doc.as_mut().expect("document");
            let start = Instant::now();
            doc.with_base(|b| paint_scene(&mut anyrender::NullScenePainter, b, dpr, pw, ph, 0, 0));
            t.insert("paintPrep".into(), start.elapsed().as_nanos() as f64);
        }
        let p = self.paint(readback)?;
        t.insert("paint".into(), p.record_ns as f64);
        t.insert("gpuSubmit".into(), p.submit_ns as f64);
        t.insert("gpuWait".into(), p.wait_ns as f64);
        t.insert("readback".into(), p.readback_ns as f64);
        let pixels = match format.as_str() {
            "none" => None,
            "rgba" => {
                let start = Instant::now();
                let b = Buffer::from(self.buffer.clone());
                t.insert("buffer".into(), start.elapsed().as_nanos() as f64);
                Some(b)
            }
            "png" => {
                let start = Instant::now();
                let pw = (self.width as f64 * self.dpr).round() as u32;
                let ph = (self.height as f64 * self.dpr).round() as u32;
                let mut out = Vec::new();
                {
                    let mut enc = png::Encoder::new(&mut out, pw, ph);
                    enc.set_color(png::ColorType::Rgba);
                    enc.set_depth(png::BitDepth::Eight);
                    let mut w = enc.write_header().map_err(|e| Error::from_reason(e.to_string()))?;
                    w.write_image_data(&self.buffer).map_err(|e| Error::from_reason(e.to_string()))?;
                }
                t.insert("png".into(), start.elapsed().as_nanos() as f64);
                let start = Instant::now();
                let b = Buffer::from(out);
                t.insert("buffer".into(), start.elapsed().as_nanos() as f64);
                Some(b)
            }
            other => return Err(Error::from_reason(format!("format must be \"rgba\", \"png\" or \"none\", got {other:?}"))),
        };
        t.insert("total".into(), total.elapsed().as_nanos() as f64);
        Ok(TimedRender { backend: self.renderer.name().into(), timings_ns: t, pixels })
    }

    /// Experimental: the backend, the GPU device description and Skia's GPU resource cache.
    #[napi(js_name = "_backendInfo")]
    pub fn backend_info(&self) -> serde_json::Value {
        match &self.renderer {
            Painter::Closed => serde_json::json!({ "backend": "closed" }),
            Painter::Cpu(_) => serde_json::json!({ "backend": "cpu-raster" }),
            #[cfg(feature = "experimental-gpu")]
            Painter::Gpu(r) => {
                let u = r.device().resource_usage();
                serde_json::json!({
                    "backend": r.device().kind().name(),
                    "device": r.device().description(),
                    "sharedDeviceRefs": std::rc::Rc::strong_count(r.device()),
                    "gpuResourceCount": u.resource_count,
                    "gpuResourceBytes": u.resource_bytes,
                    "gpuPurgeableBytes": u.purgeable_bytes,
                    "gpuBudgetBytes": u.budget_bytes,
                    "abandoned": r.device().is_abandoned(),
                })
            }
            #[cfg(feature = "experimental-graphite")]
            Painter::Graphite(r) => serde_json::json!({
                "backend": r.device().name(),
                "device": r.device().description(),
                "sharedDeviceRefs": std::rc::Rc::strong_count(r.device()),
                "abandoned": r.device().is_device_lost(),
            }),
        }
    }

    /// Experimental (font-retention probe): drop Skia's process-wide glyph/typeface caches.
    #[napi(js_name = "_purgeSkiaFontCache")]
    pub fn purge_skia_font_cache(&self) -> serde_json::Value {
        let (before, after) = anyrender_skia::purge_font_cache();
        serde_json::json!({ "fontCacheBytesBefore": before, "fontCacheBytesAfter": after })
    }

    /// Experimental: free purgeable GPU resources (no-op on CPU).
    #[napi(js_name = "_gpuFreeResources")]
    pub fn gpu_free_resources(&self) {
        #[cfg(feature = "experimental-gpu")]
        if let Painter::Gpu(r) = &self.renderer {
            r.device().free_resources();
        }
    }

    /// Testing only: make the GPU context unusable, as a lost device would. Later renders fail
    /// with an error; close() still works.
    #[napi(js_name = "_gpuAbandonForTesting")]
    pub fn gpu_abandon_for_testing(&self) -> Result<()> {
        match &self.renderer {
            Painter::Closed | Painter::Cpu(_) => Err(Error::from_reason("not a GPU renderer")),
            #[cfg(feature = "experimental-gpu")]
            Painter::Gpu(r) => {
                r.device().abandon_for_testing();
                Ok(())
            }
            #[cfg(feature = "experimental-graphite")]
            Painter::Graphite(_) => Err(Error::from_reason("Graphite has no abandon: device loss cannot be simulated")),
        }
    }

    /// Releases the document, the script runtime and their callbacks now instead of at garbage
    /// collection. Idempotent; every later call (except close) throws "renderer is closed".
    #[napi]
    pub fn close(&mut self) {
        self.closed = true;
        self.doc = None;
        self.html = None;
        self.fonts.clear();
        self.buffer = Vec::new();
        self.renderer = Painter::Closed;
    }

    /// Testing only: drop the native node matched by `selector` (and its subtree), as an
    /// embedder teardown would. JS wrappers of it become stale: using them throws an
    /// `InvalidStateError` DOMException (the shared stale-handle contract). Returns whether a
    /// node matched.
    #[napi(js_name = "_dropNodeForTesting")]
    pub fn drop_node_for_testing(&mut self, selector: String) -> Result<bool> {
        use canvas_dom_host::DomHost as _;
        let result = self.doc_mut()?.with_base(|b| {
            let Some(node) = b.query_first(None, &selector)? else { return Ok(false) };
            b.drop_node(node)?;
            Ok(true)
        });
        result.map_err(|e: canvas_dom_host::DomError| Error::from_reason(e.to_string()))
    }

    #[napi(getter)]
    pub fn pixel_width(&self) -> u32 {
        (self.width as f64 * self.dpr).round() as u32
    }

    #[napi(getter)]
    pub fn pixel_height(&self) -> u32 {
        (self.height as f64 * self.dpr).round() as u32
    }
}
