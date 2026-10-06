//! Deno ops: a thin, typed bridge from V8 into canvas-dom-host. No DOM behaviour lives here;
//! every op validates nothing beyond argument decoding and calls the shared host.
//! Errors cross as `kind\u{1}name\u{1}message` (see `bootstrap.js`, `hostError`).

use std::cell::RefCell;
use std::rc::Rc;

use blitz_dom::BaseDocument;
use canvas_dom_host::clock::ClockContract;
use canvas_dom_host::events::{CallbackKey, EventTarget, ListenerId, ListenerRegistry};
use canvas_dom_host::timers::{TimerId, TimerSchedule};
use canvas_dom_host::{DomError, DomHost, JsErrorKind, NodeHandle, Rect};
use deno_core::{OpState, op2};
use deno_error::JsErrorBox;

/// The document as seen by the script adapter. Implemented by the renderer's document (the
/// addon), so this crate never depends on layout or paint.
pub trait HostDocument {
    fn base(&mut self) -> &mut BaseDocument;
}

/// Per-runtime host state, owned by the Deno `OpState` on the renderer thread.
pub struct HostState {
    pub now: f64,
    pub clock: ClockContract,
    pub doc: Rc<RefCell<dyn HostDocument>>,
    pub listeners: ListenerRegistry,
    pub timers: TimerSchedule<f64>,
    /// Interval (ms) of `setInterval` timers.
    pub intervals: std::collections::HashMap<u64, f64>,
    pub errors: Vec<String>,
}

const MAX_ERRORS: usize = 256;

impl HostState {
    pub fn record_error(&mut self, message: String) {
        match self.errors.len() {
            n if n < MAX_ERRORS => self.errors.push(message),
            n if n == MAX_ERRORS => self.errors.push("(further errors suppressed)".into()),
            _ => {}
        }
    }
}

fn host_error(e: DomError) -> JsErrorBox {
    let (kind, name) = match e.js_error() {
        JsErrorKind::DomException(name) => ("DOMException", name),
        JsErrorKind::TypeError => ("TypeError", "TypeError"),
    };
    JsErrorBox::generic(format!("{kind}\u{1}{name}\u{1}{e}"))
}

fn handle(text: &str) -> Result<NodeHandle, JsErrorBox> {
    NodeHandle::from_decimal(text).ok_or_else(|| host_error(DomError::InvalidHandle))
}

fn with_doc<T>(state: &mut OpState, f: impl FnOnce(&mut BaseDocument) -> Result<T, DomError>) -> Result<T, JsErrorBox> {
    let doc = state.borrow::<HostState>().doc.clone();
    let mut doc = doc.borrow_mut();
    f(doc.base()).map_err(host_error)
}

fn opt(h: Option<NodeHandle>) -> Option<String> {
    h.map(NodeHandle::to_decimal)
}

fn list(hs: Vec<NodeHandle>) -> Vec<String> {
    hs.into_iter().map(NodeHandle::to_decimal).collect()
}

fn target(text: &str) -> Result<EventTarget, JsErrorBox> {
    if text == "w" { Ok(EventTarget::Window) } else { handle(text).map(EventTarget::Node) }
}

fn rect_json(r: Rect) -> Vec<f64> {
    vec![r.x, r.y, r.width, r.height]
}

// --- clock

#[op2(fast)]
fn op_ch_perf_now(state: &mut OpState) -> f64 {
    let s = state.borrow::<HostState>();
    s.clock.performance_now(s.now)
}

#[op2(fast)]
fn op_ch_date_now(state: &mut OpState) -> f64 {
    let s = state.borrow::<HostState>();
    s.clock.date_now(s.now)
}

#[op2(fast)]
fn op_ch_time_origin(state: &mut OpState) -> f64 {
    state.borrow::<HostState>().clock.time_origin()
}

// --- timers (callbacks stay in JS, keyed by id)

#[op2(fast)]
fn op_ch_timer_add(state: &mut OpState, delay: f64, interval: f64) -> f64 {
    let s = state.borrow_mut::<HostState>();
    let delay = if delay.is_finite() && delay > 0.0 { delay } else { 0.0 };
    let id = s.timers.add(s.now + delay);
    if interval >= 0.0 {
        s.intervals.insert(id.0, interval);
    }
    id.0 as f64
}

#[op2(fast)]
fn op_ch_timer_clear(state: &mut OpState, id: f64) {
    if id.is_finite() && id >= 0.0 {
        let s = state.borrow_mut::<HostState>();
        s.timers.remove(TimerId(id as u64));
        s.intervals.remove(&(id as u64));
    }
}

#[op2(fast)]
fn op_ch_record_error(state: &mut OpState, #[string] message: String) {
    state.borrow_mut::<HostState>().record_error(message);
}

// --- document

#[op2]
#[string]
fn op_ch_document(state: &mut OpState) -> Result<String, JsErrorBox> {
    with_doc(state, |d| Ok(d.document_node().to_decimal()))
}

#[op2]
#[string]
fn op_ch_document_element(state: &mut OpState) -> Result<Option<String>, JsErrorBox> {
    with_doc(state, |d| Ok(opt(d.document_element())))
}

#[op2]
#[string]
fn op_ch_body(state: &mut OpState) -> Result<Option<String>, JsErrorBox> {
    with_doc(state, |d| Ok(opt(d.body())))
}

#[op2]
#[string]
fn op_ch_by_id(state: &mut OpState, #[string] id: &str) -> Result<Option<String>, JsErrorBox> {
    with_doc(state, |d| Ok(opt(d.element_by_id(id))))
}

#[op2]
#[string]
fn op_ch_query(state: &mut OpState, #[string] root: &str, #[string] selector: &str) -> Result<Option<String>, JsErrorBox> {
    let root = if root.is_empty() { None } else { Some(handle(root)?) };
    with_doc(state, |d| Ok(opt(d.query_first(root, selector)?)))
}

#[op2]
#[serde]
fn op_ch_query_all(state: &mut OpState, #[string] root: &str, #[string] selector: &str) -> Result<Vec<String>, JsErrorBox> {
    let root = if root.is_empty() { None } else { Some(handle(root)?) };
    with_doc(state, |d| Ok(list(d.query_all(root, selector)?)))
}

#[op2]
#[string]
fn op_ch_create_element(state: &mut OpState, #[string] tag: &str) -> Result<String, JsErrorBox> {
    with_doc(state, |d| Ok(d.create_element(tag).to_decimal()))
}

#[op2]
#[string]
fn op_ch_tag_name(state: &mut OpState, #[string] h: &str) -> Result<String, JsErrorBox> {
    let h = handle(h)?;
    with_doc(state, |d| d.tag_name(h))
}

#[op2(fast)]
fn op_ch_is_element(state: &mut OpState, #[string] h: &str) -> Result<bool, JsErrorBox> {
    let h = handle(h)?;
    with_doc(state, |d| d.is_element(h))
}

#[op2(fast)]
fn op_ch_is_connected(state: &mut OpState, #[string] h: &str) -> Result<bool, JsErrorBox> {
    let h = handle(h)?;
    with_doc(state, |d| d.is_connected(h))
}

#[op2]
#[string]
fn op_ch_parent_node(state: &mut OpState, #[string] h: &str) -> Result<Option<String>, JsErrorBox> {
    let h = handle(h)?;
    with_doc(state, |d| Ok(opt(d.parent_node(h)?)))
}

#[op2]
#[string]
fn op_ch_parent_element(state: &mut OpState, #[string] h: &str) -> Result<Option<String>, JsErrorBox> {
    let h = handle(h)?;
    with_doc(state, |d| Ok(opt(d.parent_element(h)?)))
}

#[op2]
#[serde]
fn op_ch_children(state: &mut OpState, #[string] h: &str) -> Result<Vec<String>, JsErrorBox> {
    let h = handle(h)?;
    with_doc(state, |d| Ok(list(d.element_children(h)?)))
}

#[op2(fast)]
fn op_ch_append_child(state: &mut OpState, #[string] parent: &str, #[string] child: &str) -> Result<(), JsErrorBox> {
    let (p, c) = (handle(parent)?, handle(child)?);
    with_doc(state, |d| d.append_child(p, c))
}

#[op2(fast)]
fn op_ch_remove(state: &mut OpState, #[string] h: &str) -> Result<(), JsErrorBox> {
    let h = handle(h)?;
    with_doc(state, |d| d.remove_node(h))
}

#[op2]
#[serde]
fn op_ch_event_path(state: &mut OpState, #[string] h: &str) -> Result<Vec<String>, JsErrorBox> {
    let h = handle(h)?;
    with_doc(state, |d| Ok(list(d.event_path(h)?)))
}

#[op2]
#[string]
fn op_ch_text_get(state: &mut OpState, #[string] h: &str) -> Result<String, JsErrorBox> {
    let h = handle(h)?;
    with_doc(state, |d| d.text_content(h))
}

#[op2(fast)]
fn op_ch_text_set(state: &mut OpState, #[string] h: &str, #[string] text: &str) -> Result<(), JsErrorBox> {
    let h = handle(h)?;
    with_doc(state, |d| d.set_text_content(h, text))
}

#[op2]
#[string]
fn op_ch_attr_get(state: &mut OpState, #[string] h: &str, #[string] name: &str) -> Result<Option<String>, JsErrorBox> {
    let h = handle(h)?;
    with_doc(state, |d| d.get_attribute(h, name))
}

#[op2(fast)]
fn op_ch_attr_set(state: &mut OpState, #[string] h: &str, #[string] name: &str, #[string] value: &str) -> Result<(), JsErrorBox> {
    let h = handle(h)?;
    with_doc(state, |d| d.set_attribute(h, name, value))
}

#[op2(fast)]
fn op_ch_attr_remove(state: &mut OpState, #[string] h: &str, #[string] name: &str) -> Result<(), JsErrorBox> {
    let h = handle(h)?;
    with_doc(state, |d| d.remove_attribute(h, name))
}

#[op2]
#[serde]
fn op_ch_class_list(state: &mut OpState, #[string] h: &str) -> Result<Vec<String>, JsErrorBox> {
    let h = handle(h)?;
    with_doc(state, |d| d.class_list(h))
}

/// `op`: "add" | "remove" | "contains" | "toggle" | "toggle-on" | "toggle-off"
#[op2]
fn op_ch_class_op(state: &mut OpState, #[string] h: &str, #[string] op: &str, #[serde] tokens: Vec<String>) -> Result<bool, JsErrorBox> {
    let h = handle(h)?;
    let tokens: Vec<&str> = tokens.iter().map(String::as_str).collect();
    let first = tokens.first().copied().unwrap_or("");
    with_doc(state, |d| match op {
        "add" => d.class_list_add(h, &tokens).map(|_| true),
        "remove" => d.class_list_remove(h, &tokens).map(|_| true),
        "contains" => d.class_list_contains(h, first),
        "toggle" => d.class_list_toggle(h, first, None),
        "toggle-on" => d.class_list_toggle(h, first, Some(true)),
        "toggle-off" => d.class_list_toggle(h, first, Some(false)),
        other => Err(DomError::UnsupportedOperation(format!("classList.{other}"))),
    })
}

#[op2]
#[string]
fn op_ch_style_get(state: &mut OpState, #[string] h: &str, #[string] name: &str) -> Result<String, JsErrorBox> {
    let h = handle(h)?;
    with_doc(state, |d| d.style_get(h, name))
}

#[op2(fast)]
fn op_ch_style_set(state: &mut OpState, #[string] h: &str, #[string] name: &str, #[string] value: &str, #[string] priority: &str) -> Result<(), JsErrorBox> {
    let h = handle(h)?;
    with_doc(state, |d| d.style_set(h, name, value, priority))
}

#[op2]
#[string]
fn op_ch_style_remove(state: &mut OpState, #[string] h: &str, #[string] name: &str) -> Result<String, JsErrorBox> {
    let h = handle(h)?;
    with_doc(state, |d| d.style_remove(h, name))
}

#[op2]
#[string]
fn op_ch_style_css_text(state: &mut OpState, #[string] h: &str) -> Result<String, JsErrorBox> {
    let h = handle(h)?;
    with_doc(state, |d| d.style_css_text(h))
}

#[op2(fast)]
fn op_ch_style_set_css_text(state: &mut OpState, #[string] h: &str, #[string] css: &str) -> Result<(), JsErrorBox> {
    let h = handle(h)?;
    with_doc(state, |d| d.set_style_css_text(h, css))
}

#[op2]
#[serde]
fn op_ch_style_names(state: &mut OpState, #[string] h: &str) -> Result<Vec<String>, JsErrorBox> {
    let h = handle(h)?;
    with_doc(state, |d| d.style_names(h))
}

#[op2(fast)]
fn op_ch_style_supported(#[string] name: &str) -> bool {
    canvas_dom_host::style::is_supported_property(name)
}

#[op2]
#[string]
fn op_ch_computed(state: &mut OpState, #[string] h: &str, #[string] name: &str) -> Result<String, JsErrorBox> {
    let h = handle(h)?;
    with_doc(state, |d| d.computed_style(h, name))
}

#[op2]
#[serde]
fn op_ch_rect(state: &mut OpState, #[string] h: &str) -> Result<Vec<f64>, JsErrorBox> {
    let h = handle(h)?;
    with_doc(state, |d| d.bounding_client_rect(h).map(rect_json))
}

#[op2]
#[serde]
fn op_ch_client_rects(state: &mut OpState, #[string] h: &str) -> Result<Vec<Vec<f64>>, JsErrorBox> {
    let h = handle(h)?;
    with_doc(state, |d| Ok(d.client_rects(h)?.into_iter().map(rect_json).collect()))
}

#[op2]
#[serde]
fn op_ch_offset(state: &mut OpState, #[string] h: &str) -> Result<Vec<f64>, JsErrorBox> {
    let h = handle(h)?;
    with_doc(state, |d| d.offset_box(h).map(rect_json))
}

#[op2]
#[serde]
fn op_ch_client_size(state: &mut OpState, #[string] h: &str) -> Result<Vec<f64>, JsErrorBox> {
    let h = handle(h)?;
    with_doc(state, |d| d.client_size(h).map(|(w, h)| vec![w, h]))
}

// --- events (callbacks stay in JS, keyed by CallbackKey)

#[op2(fast)]
fn op_ch_listener_add(state: &mut OpState, #[string] t: &str, #[string] event_type: &str, key: f64, capture: bool, once: bool) -> Result<bool, JsErrorBox> {
    let t = target(t)?;
    Ok(state.borrow_mut::<HostState>().listeners.add(t, event_type, CallbackKey(key as u64), capture, once).is_some())
}

#[op2(fast)]
fn op_ch_listener_remove(state: &mut OpState, #[string] t: &str, #[string] event_type: &str, key: f64, capture: bool) -> Result<bool, JsErrorBox> {
    let t = target(t)?;
    Ok(state.borrow_mut::<HostState>().listeners.remove(t, event_type, CallbackKey(key as u64), capture).is_some())
}

#[op2(fast)]
fn op_ch_callback_in_use(state: &mut OpState, key: f64) -> bool {
    state.borrow::<HostState>().listeners.callback_in_use(CallbackKey(key as u64))
}

#[op2]
#[serde]
fn op_ch_listener_ids(state: &mut OpState, #[string] t: &str, #[string] event_type: &str) -> Result<Vec<f64>, JsErrorBox> {
    let t = target(t)?;
    Ok(state.borrow::<HostState>().listeners.listener_ids(t, event_type).into_iter().map(|id| id.0 as f64).collect())
}

/// Returns `[callbackKey, once]`, or null if the listener was removed since the snapshot.
#[op2]
#[serde]
fn op_ch_listener_begin(state: &mut OpState, #[string] t: &str, #[string] event_type: &str, id: f64) -> Result<Option<(f64, bool)>, JsErrorBox> {
    let t = target(t)?;
    Ok(state
        .borrow_mut::<HostState>()
        .listeners
        .begin_invoke(t, event_type, ListenerId(id as u64))
        .map(|l| (l.callback.0 as f64, l.once)))
}

deno_core::extension!(
    canvas_dom_host_ops,
    ops = [
        op_ch_perf_now, op_ch_date_now, op_ch_time_origin, op_ch_timer_add, op_ch_timer_clear, op_ch_record_error,
        op_ch_document, op_ch_document_element, op_ch_body, op_ch_by_id, op_ch_query, op_ch_query_all,
        op_ch_create_element, op_ch_tag_name, op_ch_is_element, op_ch_is_connected, op_ch_parent_node,
        op_ch_parent_element, op_ch_children, op_ch_append_child, op_ch_remove, op_ch_event_path,
        op_ch_text_get, op_ch_text_set, op_ch_attr_get, op_ch_attr_set, op_ch_attr_remove, op_ch_class_list,
        op_ch_class_op, op_ch_style_get, op_ch_style_set, op_ch_style_remove, op_ch_style_css_text,
        op_ch_style_set_css_text, op_ch_style_names, op_ch_style_supported, op_ch_computed, op_ch_rect,
        op_ch_client_rects, op_ch_offset, op_ch_client_size, op_ch_listener_add, op_ch_listener_remove,
        op_ch_callback_in_use, op_ch_listener_ids, op_ch_listener_begin,
    ]
);
