//! The shared host on a real Blitz document. These are the native halves of the JS contract
//! suite in experiments/phase3/contract: if they pass, both adapters start from the same state.

use blitz_dom::DocumentConfig;
use blitz_html::HtmlDocument;
use blitz_traits::shell::{ColorScheme, Viewport};
use canvas_dom_host::{DomError, DomHost, JsErrorKind};

const HTML: &str = r#"<!doctype html><html><head><style>
  body { margin: 0 }
  #box { position: absolute; left: 10px; top: 20px; width: 30px; height: 40px; opacity: 0.25 }
  #box.big { width: 100px }
</style></head><body><div id="box" class="a b a">hi</div><p class="item">one</p><p class="item">two</p></body></html>"#;

fn doc() -> HtmlDocument {
    let mut d = HtmlDocument::from_html(
        HTML,
        DocumentConfig { viewport: Some(Viewport::new(200, 100, 1.0, ColorScheme::Light)), ..Default::default() },
    );
    d.resolve(0.0);
    d
}

#[test]
fn lookup_and_identity() {
    let d = doc();
    let by_id = d.element_by_id("box").unwrap();
    assert_eq!(d.query_first(None, "#box").unwrap(), Some(by_id));
    assert_eq!(d.query_all(None, "#box").unwrap(), vec![by_id]);
    assert_eq!(d.query_all(None, ".item").unwrap().len(), 2);
    assert_eq!(d.query_first(None, "#missing").unwrap(), None);
    assert_eq!(d.element_by_id( "missing"), None);
    let err = d.query_first(None, "[").unwrap_err();
    assert!(matches!(err, DomError::InvalidSelector(_)));
    assert_eq!(err.js_error(), JsErrorKind::DomException("SyntaxError"));
    assert_eq!(d.tag_name(by_id).unwrap(), "DIV");
    let body = d.body().unwrap();
    assert_eq!(d.parent_element(by_id).unwrap(), Some(body));
    assert_eq!(d.element_children(body).unwrap().len(), 3);
}

#[test]
fn text_and_attributes() {
    let mut d = doc();
    let b = d.element_by_id("box").unwrap();
    d.set_text_content(b, "hello").unwrap();
    assert_eq!(d.text_content(b).unwrap(), "hello");
    d.set_attribute(b, "Data-X", "1").unwrap();
    assert_eq!(d.get_attribute(b, "data-x").unwrap().as_deref(), Some("1"));
    d.remove_attribute(b, "data-x").unwrap();
    assert_eq!(d.get_attribute(b, "data-x").unwrap(), None);
    assert!(!d.has_attribute(b, "data-x").unwrap());
}

#[test]
fn class_list() {
    let mut d = doc();
    let b = d.element_by_id("box").unwrap();
    assert_eq!(d.class_list(b).unwrap(), vec!["a", "b"]);
    d.class_list_add(b, &["c", "a"]).unwrap();
    assert_eq!(d.get_attribute(b, "class").unwrap().as_deref(), Some("a b c"));
    d.class_list_remove(b, &["a"]).unwrap();
    assert!(!d.class_list_contains(b, "a").unwrap());
    assert!(d.class_list_toggle(b, "a", None).unwrap());
    assert!(d.class_list_toggle(b, "a", Some(true)).unwrap());
    assert!(!d.class_list_toggle(b, "a", None).unwrap());
    assert_eq!(d.class_list_add(b, &[""]).unwrap_err(), DomError::EmptyToken);
    assert!(matches!(d.class_list_add(b, &["x y"]).unwrap_err(), DomError::InvalidCharacter(_)));
}

#[test]
fn inline_style_policy() {
    let mut d = doc();
    let b = d.element_by_id("box").unwrap();
    d.style_set(b, "opacity", "0.5", "").unwrap();
    d.style_set(b, "backgroundColor", "red", "").unwrap();
    d.style_set(b, "transform", "translateX(12px)", "").unwrap();
    assert_eq!(d.style_get(b, "opacity").unwrap(), "0.5");
    assert_eq!(d.style_get(b, "background-color").unwrap(), "red");
    assert_eq!(d.style_get(b, "backgroundColor").unwrap(), "red");
    assert_eq!(d.style_get(b, "transform").unwrap(), "translateX(12px)");
    // invalid values are ignored; empty removes
    d.style_set(b, "opacity", "banana", "").unwrap();
    assert_eq!(d.style_get(b, "opacity").unwrap(), "0.5");
    d.style_set(b, "opacity", "", "").unwrap();
    assert_eq!(d.style_get(b, "opacity").unwrap(), "");
    assert_eq!(d.style_names(b).unwrap(), vec!["background-color", "transform"]);
    assert_eq!(d.style_remove(b, "transform").unwrap(), "translateX(12px)");
    d.set_style_css_text(b, "width: 50px; nonsense: 1").unwrap();
    assert_eq!(d.style_css_text(b).unwrap(), "width: 50px;");
}

#[test]
fn computed_style_and_geometry_follow_mutations() {
    let mut d = doc();
    let b = d.element_by_id("box").unwrap();
    assert_eq!(d.computed_style(b, "opacity").unwrap(), "0.25");
    assert_eq!(d.computed_style(b, "width").unwrap(), "30px");
    let r = d.bounding_client_rect(b).unwrap();
    assert_eq!((r.x, r.y, r.width, r.height), (10.0, 20.0, 30.0, 40.0));
    assert_eq!((r.right(), r.bottom()), (40.0, 60.0));
    // mutation marks dirty; the next layout query resolves
    d.style_set(b, "width", "70px", "").unwrap();
    d.style_set(b, "transform", "translateX(5px)", "").unwrap();
    assert_eq!(d.computed_style(b, "width").unwrap(), "70px");
    assert_eq!(d.computed_style(b, "transform").unwrap(), "matrix(1, 0, 0, 1, 5, 0)");
    assert_eq!(d.bounding_client_rect(b).unwrap().width, 70.0);
    d.class_list_add(b, &["big"]).unwrap();
    d.style_remove(b, "width").unwrap();
    assert_eq!(d.computed_style(b, "width").unwrap(), "100px");
    let o = d.offset_box(b).unwrap();
    assert_eq!((o.x, o.y, o.width, o.height), (10.0, 20.0, 100.0, 40.0));
}

#[test]
fn stale_and_detached_handles() {
    let mut d = doc();
    let b = d.element_by_id("box").unwrap();
    let p = d.query_first(None, "p").unwrap().unwrap();
    // detached nodes stay valid
    d.remove_node(p).unwrap();
    assert!(!d.is_connected(p).unwrap());
    assert_eq!(d.text_content(p).unwrap(), "one");
    assert_eq!(d.bounding_client_rect(p).unwrap().width, 0.0);
    // a dropped native node makes its handle stale
    d.drop_node(b).unwrap();
    assert!(!d.is_live(b));
    for err in [
        d.text_content(b).unwrap_err(),
        d.get_attribute(b, "id").unwrap_err(),
        d.style_get(b, "opacity").unwrap_err(),
        d.computed_style(b, "opacity").unwrap_err(),
        d.bounding_client_rect(b).unwrap_err(),
    ] {
        assert_eq!(err, DomError::InvalidHandle);
        assert_eq!(err.js_error(), JsErrorKind::DomException("InvalidStateError"));
    }
    // a new node never aliases the stale handle
    let fresh = d.create_element("div");
    assert_ne!(fresh, b);
    assert!(!d.is_live(b));
}

#[test]
fn created_elements_and_event_path() {
    let mut d = doc();
    let body = d.body().unwrap();
    let el = d.create_element("SPAN");
    assert_eq!(d.tag_name(el).unwrap(), "SPAN");
    assert_eq!(d.event_path(el).unwrap(), vec![el]);
    d.append_child(body, el).unwrap();
    let path = d.event_path(el).unwrap();
    assert_eq!(path.first(), Some(&el));
    assert_eq!(path.last(), Some(&d.document_node()));
    assert!(d.is_connected(el).unwrap());
    assert!(d.append_child(el, body).is_err());
}
