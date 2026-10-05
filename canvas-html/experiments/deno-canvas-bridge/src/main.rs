use anyhow::{Context, Result, bail};
use anyrender::{ImageRenderer, PaintScene as _};
use anyrender_skia::SkiaImageRenderer;
use blitz_dom::{BaseDocument, DocumentConfig, local_name, util::Color};
use blitz_html::HtmlDocument;
use blitz_paint::paint_scene;
use blitz_traits::shell::{ColorScheme, Viewport};
use parley::{FontContext, fontique::{Blob, Collection, CollectionOptions, SourceCache}};
use peniko::{Fill, kurbo::Rect};
use runtime_poc::{Mutation, MutationKind, Runtime};
use sha2::{Digest, Sha256};
use std::{path::Path, sync::Arc};

const WIDTH: u32 = 160;
const HEIGHT: u32 = 80;
const TIMES: [f64; 5] = [0.0,16.6667,500.0,1000.0,2500.0];
const HTML: &str = r#"<!doctype html><style>
body{margin:0;background:#111827;font:16px Inter;color:white}
#box{position:absolute;left:0;top:0;width:20px;height:20px;background:#ff0000}
#title{position:absolute;left:0;top:35px}
</style><div id="box"></div><div id="title">Before</div>"#;
const SCRIPT: &str = r#"
host.setText('title','Hello Deno');
setTimeout(()=>{
 host.setStyle('box','background-color','#00ff00');
 host.setStyle('box','width','60px');
 host.setText('title','At 500 ms');
},500);
function update(t){host.setStyle('box','left',(t/50)+'px');requestAnimationFrame(update)}
requestAnimationFrame(update); null
"#;

// Document operations accept plain Rust commands. No Deno/V8 handle reaches layout/paint.
fn apply(doc: &mut BaseDocument, commands: Vec<Mutation>) -> Result<()> {
    for command in commands {
        let id=doc.get_element_by_id(&command.id).context("unknown element")?;
        match command.kind {
            MutationKind::Text => {
                let mut m=doc.mutate();
                for child in m.child_ids(id) { m.remove_node(child); }
                let text=m.create_text_node(&command.value);m.append_children(id,&[text]);
            }
            MutationKind::Style(property) => {
                if !["background-color","width","left","opacity","transform"].contains(&property.as_str()) { bail!("unsupported POC property"); }
                let old=doc.get_node(id).and_then(|n|n.attr(local_name!("style"))).unwrap_or("");
                let new=format!("{old};{property}:{}",command.value);
                doc.mutate().set_attribute(id,blitz_dom::qual_name!("style"),&new);
            }
        }
    }
    Ok(())
}
fn document() -> HtmlDocument {
    let mut collection=Collection::new(CollectionOptions {shared:false,system_fonts:false});
    collection.register_fonts(Blob::new(Arc::new(include_bytes!("../../../test/assets/Inter-Regular.otf").to_vec()) as _),None);
    HtmlDocument::from_html(HTML,DocumentConfig {
        viewport:Some(Viewport::new(WIDTH,HEIGHT,1.0,ColorScheme::Light)),
        font_ctx:Some(FontContext{source_cache:SourceCache::new_shared(),collection}),
        ..Default::default()
    })
}
fn render(doc: &mut BaseDocument, time: f64) -> Vec<u8> {
    doc.resolve(time/1000.0);
    let mut renderer=SkiaImageRenderer::new(WIDTH,HEIGHT);
    let mut bytes=Vec::new();
    renderer.render_to_vec(|scene| {
        scene.fill(Fill::NonZero,Default::default(),Color::from_rgba8(0,0,0,255),Default::default(),&Rect::new(0.0,0.0,WIDTH as f64,HEIGHT as f64));
        paint_scene(scene,doc,1.0,WIDTH,HEIGHT,0,0);
    },&mut bytes);
    bytes
}
fn png(path: &Path, data: &[u8]) -> Result<()> {
    let mut encoder=png::Encoder::new(std::fs::File::create(path)?,WIDTH,HEIGHT);
    encoder.set_color(png::ColorType::Rgba);encoder.set_depth(png::BitDepth::Eight);
    encoder.write_header()?.write_image_data(data)?;Ok(())
}
fn run(out: Option<&Path>) -> Result<Vec<String>> {
    let mut doc=document();let mut runtime=Runtime::new()?;
    let before=render(&mut doc,0.0);
    if let Some(out)=out {png(&out.join("before.png"),&before)?;}
    runtime.eval(SCRIPT)?;runtime.drain_jobs()?;apply(&mut doc,runtime.take_mutations())?;
    let mut hashes=Vec::new();
    for (i,t) in TIMES.iter().enumerate() {
        runtime.advance_to(*t)?;apply(&mut doc,runtime.take_mutations())?;
        let bytes=render(&mut doc,*t);
        assert_eq!(bytes.len(),(WIDTH*HEIGHT*4) as usize);
        if i==0 { assert_ne!(bytes,before,"text mutation must change pixels"); }
        if *t==500.0 {
            // Timer changed both visible width and color. Pixel x=50 lies outside the old box.
            let px=&bytes[50*4..50*4+4];assert_eq!(px,[0,255,0,255]);
        }
        hashes.push(format!("{:x}",Sha256::digest(&bytes)));
        if let Some(out)=out {png(&out.join(format!("frame-{i}.png")),&bytes)?;}
    }
    Ok(hashes)
}
fn main() -> Result<()> {
    let out=std::env::args().nth(1).unwrap_or_else(||"results/bridge".into());
    let out=Path::new(&out);std::fs::create_dir_all(out)?;
    let hashes=run(Some(out))?;
    for _ in 0..4 {assert_eq!(run(None)?,hashes,"fresh renderer replay");}
    println!("{}",serde_json::json!({"bridge":"passed","times":TIMES,"hashes":hashes,"replays":5}));
    Ok(())
}
