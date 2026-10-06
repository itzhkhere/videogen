//! Document, layout and paint. Depends on the shared host (for `HostDocument`), never on the
//! engine crate: the script adapter reaches it only through `HostDocument::base()`.
use std::sync::Arc;

use anyhow::Result;
use anyrender::{ImageRenderer, PaintScene as _};
use anyrender_skia::SkiaImageRenderer;
use blitz_dom::{BaseDocument, DocumentConfig, util::Color};
use blitz_html::HtmlDocument;
use blitz_paint::paint_scene;
use blitz_traits::shell::{ColorScheme, Viewport};
use parley::FontContext;
use parley::fontique::{Blob, Collection, CollectionOptions, SourceCache};
use peniko::{Fill, kurbo::Rect};
use canvas_dom_host::HostDocument;

pub struct Document {
    doc: HtmlDocument,
    painter: SkiaImageRenderer,
    width: u32,
    height: u32,
}

impl Document {
    /// Same font collection, viewport and backdrop as the Boa renderer created with
    /// `systemFonts: false` and `registerFont(Inter-Regular.otf)`, so frames can be compared.
    pub fn new(html: &str, width: u32, height: u32) -> Self {
        let mut collection = Collection::new(CollectionOptions { shared: false, system_fonts: false });
        collection.register_fonts(Blob::new(Arc::new(blitz_dom::BULLET_FONT) as _), None);
        collection.register_fonts(
            Blob::new(Arc::new(include_bytes!("../../../../test/assets/Inter-Regular.otf").to_vec()) as _),
            None,
        );
        let doc = HtmlDocument::from_html(
            html,
            DocumentConfig {
                base_url: Some("file:///".to_string()),
                viewport: Some(Viewport::new(width, height, 1.0, ColorScheme::Light)),
                font_ctx: Some(FontContext { source_cache: SourceCache::new_shared(), collection }),
                ..Default::default()
            },
        );
        Self { doc, painter: SkiaImageRenderer::new(width, height), width, height }
    }

    /// Style and lay out at visual time `ms` (the animation timeline's time).
    pub fn resolve(&mut self, ms: f64) {
        self.doc.resolve(ms / 1000.0);
    }

    pub fn paint(&mut self, png: bool) -> Result<Vec<u8>> {
        let (width, height) = (self.width, self.height);
        let doc = &mut self.doc;
        let mut bytes = Vec::new();
        self.painter.render_to_vec(
            |scene| {
                scene.fill(Fill::NonZero, Default::default(), Color::from_rgba8(255, 255, 255, 255), Default::default(), &Rect::new(0.0, 0.0, width as f64, height as f64));
                paint_scene(scene, doc, 1.0, width, height, 0, 0);
            },
            &mut bytes,
        );
        if !png {
            return Ok(bytes);
        }
        let mut output = Vec::new();
        {
            let mut enc = png::Encoder::new(&mut output, width, height);
            enc.set_color(png::ColorType::Rgba);
            enc.set_depth(png::BitDepth::Eight);
            enc.write_header()?.write_image_data(&bytes)?;
        }
        Ok(output)
    }
}

impl HostDocument for Document {
    fn base(&mut self) -> &mut BaseDocument {
        &mut self.doc
    }
}
