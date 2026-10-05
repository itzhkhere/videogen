//! Layout/paint consumes only engine-neutral values and DomHost requests.
use anyhow::{Context, Result, bail};
use anyrender::{ImageRenderer,PaintScene as _};
use anyrender_skia::SkiaImageRenderer;
use blitz_dom::{NodeId,DocumentConfig,QualName,LocalName,Namespace,util::Color};
use blitz_html::HtmlDocument;
use blitz_paint::paint_scene;
use blitz_traits::shell::{Viewport,ColorScheme};
use parley::{FontContext,fontique::{Blob,Collection,CollectionOptions,SourceCache}};
use peniko::{Fill,kurbo::Rect};
use phase2_host::DomHost;
use serde_json::{Value,json};
use std::{collections::BTreeMap,sync::Arc};

pub struct Document {
    doc:HtmlDocument,
    painter:SkiaImageRenderer,
    width:u32,height:u32,time:f64,
}
impl Document {
    pub fn new(html:&str,width:u32,height:u32)->Self {
        let mut collection=Collection::new(CollectionOptions{shared:false,system_fonts:false});
        collection.register_fonts(Blob::new(Arc::new(include_bytes!("../../../../test/assets/Inter-Regular.otf").to_vec()) as _),None);
        let doc=HtmlDocument::from_html(html,DocumentConfig{
            viewport:Some(Viewport::new(width,height,1.0,ColorScheme::Light)),
            font_ctx:Some(FontContext{source_cache:SourceCache::new_shared(),collection}),
            ..Default::default()
        });
        Self{doc,painter:SkiaImageRenderer::new(width,height),width,height,time:0.0}
    }
    pub fn render(&mut self,png:bool)->Result<Vec<u8>> {
        self.doc.resolve(self.time/1000.0);
        let (width,height)=(self.width,self.height);let doc=&mut self.doc;let mut bytes=Vec::new();
        self.painter.render_to_vec(|scene|{
            scene.fill(Fill::NonZero,Default::default(),Color::from_rgba8(255,255,255,255),Default::default(),&Rect::new(0.0,0.0,width as f64,height as f64));
            paint_scene(scene,doc,1.0,width,height,0,0);
        },&mut bytes);
        if !png{return Ok(bytes);}
        let mut output=Vec::new();{
            let mut enc=png::Encoder::new(&mut output,width,height);enc.set_color(png::ColorType::Rgba);enc.set_depth(png::BitDepth::Eight);
            enc.write_header()?.write_image_data(&bytes)?;
        }Ok(output)
    }
    fn style(&self,id:NodeId)->BTreeMap<String,String> {
        let css=self.doc.get_node(id).and_then(|n|n.attr(LocalName::from("style"))).unwrap_or("");
        css.split(';').filter_map(|part|part.split_once(':')).map(|(k,v)|(k.trim().into(),v.trim().into())).collect()
    }
}
impl DomHost for Document {
    fn set_time(&mut self,milliseconds:f64){self.time=milliseconds;}
    fn dispatch(&mut self,request:Value)->Result<Value>{
        let method=request["method"].as_str().context("method required")?;
        let args=request["args"].as_array().context("arguments required")?;
        let string=|i:usize|args.get(i).and_then(Value::as_str).context("string argument required");
        if method=="id" {return Ok(json!(self.doc.get_element_by_id(string(0)?).map(|n|n.as_u64().to_string())));}
        if method=="query" {return Ok(json!(self.doc.query_selector_all(string(0)?).map_err(|e|anyhow::anyhow!("invalid selector: {e:?}"))?.iter().map(|n|n.as_u64().to_string()).collect::<Vec<_>>()));}
        if method=="create" {
            let name=QualName::new(None,Namespace::from("http://www.w3.org/1999/xhtml"),LocalName::from(string(0)?));
            return Ok(json!(self.doc.mutate().create_element(name,vec![]).as_u64().to_string()));
        }
        let id=NodeId::from_u64(string(0)?.parse().context("invalid node id")?);
        self.doc.get_node(id).context("invalid node handle")?;
        match method {
            "textGet"=>Ok(json!(self.doc.get_node(id).unwrap().text_content())),
            "textSet"=>{
                let mut m=self.doc.mutate();for child in m.child_ids(id){m.remove_node(child);}
                let text=m.create_text_node(string(1)?);m.append_children(id,&[text]);Ok(Value::Null)
            }
            "tag"=>Ok(json!(self.doc.get_node(id).unwrap().element_data().map(|e|e.name.local.to_string()).unwrap_or_default())),
            "parent"=>Ok(json!(self.doc.get_node(id).unwrap().parent.map(|n|n.as_u64().to_string()))),
            "attributeGet"=>Ok(json!(self.doc.get_node(id).unwrap().attr(LocalName::from(string(1)?)))),
            "attributeSet"=>{
                let name=QualName::new(None,Namespace::from(""),LocalName::from(string(1)?));
                self.doc.mutate().set_attribute(id,name,string(2)?);Ok(Value::Null)
            }
            "styleNames"=>Ok(json!(self.style(id).keys().collect::<Vec<_>>())),
            "styleGet"=>Ok(json!(self.style(id).get(string(1)?).cloned().unwrap_or_default())),
            "styleSet"=>{
                let key=string(1)?.to_ascii_lowercase();
                if !key.chars().all(|c|c.is_ascii_alphanumeric()||c=='-') {bail!("invalid property name");}
                let mut style=self.style(id);let value=string(2)?;
                if value.is_empty(){style.remove(&key);}else{style.insert(key,value.to_owned());}
                let css=style.iter().map(|(k,v)|format!("{k}:{v}")).collect::<Vec<_>>().join(";");
                self.doc.mutate().set_attribute(id,blitz_dom::qual_name!("style"),&css);Ok(Value::Null)
            }
            "computed"=>{self.doc.resolve(self.time/1000.0);Ok(json!(self.doc.resolved_style_value(id,string(1)?)))},
            "bounds"=>{
                self.doc.resolve(self.time/1000.0);let n=self.doc.get_node(id).unwrap();let l=n.final_layout();
                Ok(json!({"x":l.location.x,"y":l.location.y,"width":l.size.width,"height":l.size.height}))
            }
            _=>bail!("unsupported host operation: {method}")
        }
    }
}
