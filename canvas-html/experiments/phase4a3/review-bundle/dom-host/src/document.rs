//! The shared document operations, implemented once on Blitz's `BaseDocument`.

use blitz_dom::node::NodeData;
use blitz_dom::{BaseDocument, LocalName, Node, NodeId, QualName, local_name, ns};

use crate::style::{css_property_name, declared_names};
use crate::{DomError, DomResult, NodeHandle};

/// A `DOMRect`-shaped value in CSS pixels, viewport-relative.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl Rect {
    pub fn top(&self) -> f64 {
        self.y
    }
    pub fn left(&self) -> f64 {
        self.x
    }
    pub fn right(&self) -> f64 {
        self.x + self.width
    }
    pub fn bottom(&self) -> f64 {
        self.y + self.height
    }
}

/// A renderer's document as seen by a script adapter: the adapter reaches the Blitz document
/// only through this, so the document/layout/paint side depends on the shared host and never on
/// an engine crate.
pub trait HostDocument {
    fn base(&mut self) -> &mut BaseDocument;
}

/// Engine-neutral DOM behaviour. Every method validates its handle first: a handle whose
/// native node was dropped fails with [`DomError::InvalidHandle`]. A node detached with
/// [`remove_node`](DomHost::remove_node) stays valid (as in browsers).
pub trait DomHost {
    // --- identity
    fn is_live(&self, node: NodeHandle) -> bool;
    fn document_node(&self) -> NodeHandle;
    fn document_element(&self) -> Option<NodeHandle>;
    fn body(&self) -> Option<NodeHandle>;
    fn is_element(&self, node: NodeHandle) -> DomResult<bool>;
    fn is_connected(&self, node: NodeHandle) -> DomResult<bool>;

    // --- lookup (named apart from BaseDocument's inherent methods, which would shadow them)
    fn element_by_id(&self, id: &str) -> Option<NodeHandle>;
    /// `root = None` searches the whole document; `Some(n)` searches `n`'s descendants.
    fn query_first(&self, root: Option<NodeHandle>, selector: &str) -> DomResult<Option<NodeHandle>>;
    /// A static list, in document order.
    fn query_all(&self, root: Option<NodeHandle>, selector: &str) -> DomResult<Vec<NodeHandle>>;

    // --- tree
    fn create_element(&mut self, tag: &str) -> NodeHandle;
    fn tag_name(&self, node: NodeHandle) -> DomResult<String>;
    fn parent_node(&self, node: NodeHandle) -> DomResult<Option<NodeHandle>>;
    fn parent_element(&self, node: NodeHandle) -> DomResult<Option<NodeHandle>>;
    fn element_children(&self, node: NodeHandle) -> DomResult<Vec<NodeHandle>>;
    fn append_child(&mut self, parent: NodeHandle, child: NodeHandle) -> DomResult<()>;
    /// `node.remove()`: detach; the handle stays valid.
    fn remove_node(&mut self, node: NodeHandle) -> DomResult<()>;
    /// Drop the native node and its subtree (embedder teardown, tests). Handles to it become
    /// stale.
    fn drop_node(&mut self, node: NodeHandle) -> DomResult<()>;
    /// The node, then its ancestors up to the root of its tree.
    fn event_path(&self, node: NodeHandle) -> DomResult<Vec<NodeHandle>>;

    // --- text
    fn text_content(&self, node: NodeHandle) -> DomResult<String>;
    fn set_text_content(&mut self, node: NodeHandle, text: &str) -> DomResult<()>;

    // --- attributes (names are ASCII-lowercased, as in HTML documents)
    fn get_attribute(&self, node: NodeHandle, name: &str) -> DomResult<Option<String>>;
    fn set_attribute(&mut self, node: NodeHandle, name: &str, value: &str) -> DomResult<()>;
    fn remove_attribute(&mut self, node: NodeHandle, name: &str) -> DomResult<()>;
    fn has_attribute(&self, node: NodeHandle, name: &str) -> DomResult<bool>;

    // --- classList (DOMTokenList over the `class` attribute)
    fn class_list(&self, node: NodeHandle) -> DomResult<Vec<String>>;
    fn class_list_add(&mut self, node: NodeHandle, tokens: &[&str]) -> DomResult<()>;
    fn class_list_remove(&mut self, node: NodeHandle, tokens: &[&str]) -> DomResult<()>;
    fn class_list_toggle(&mut self, node: NodeHandle, token: &str, force: Option<bool>) -> DomResult<bool>;
    fn class_list_contains(&self, node: NodeHandle, token: &str) -> DomResult<bool>;

    // --- inline style (see `style` module for the policy)
    fn style_get(&self, node: NodeHandle, property: &str) -> DomResult<String>;
    fn style_set(&mut self, node: NodeHandle, property: &str, value: &str, priority: &str) -> DomResult<()>;
    fn style_remove(&mut self, node: NodeHandle, property: &str) -> DomResult<String>;
    fn style_css_text(&self, node: NodeHandle) -> DomResult<String>;
    fn set_style_css_text(&mut self, node: NodeHandle, css: &str) -> DomResult<()>;
    fn style_names(&self, node: NodeHandle) -> DomResult<Vec<String>>;

    // --- layout-dependent queries (resolve style/layout first)
    fn ensure_layout(&mut self);
    fn computed_style(&mut self, node: NodeHandle, property: &str) -> DomResult<String>;
    fn bounding_client_rect(&mut self, node: NodeHandle) -> DomResult<Rect>;
    fn client_rects(&mut self, node: NodeHandle) -> DomResult<Vec<Rect>>;
    /// `offsetLeft/Top/Width/Height`, rounded like browsers.
    fn offset_box(&mut self, node: NodeHandle) -> DomResult<Rect>;
    /// `clientWidth/clientHeight`, rounded.
    fn client_size(&mut self, node: NodeHandle) -> DomResult<(f64, f64)>;
}

fn attr_qual_name(name: &str) -> QualName {
    QualName::new(None, ns!(), LocalName::from(name))
}

fn live_node(doc: &BaseDocument, node: NodeHandle) -> DomResult<&Node> {
    doc.get_node(NodeId::from(node)).ok_or(DomError::InvalidHandle)
}

fn live_element(doc: &BaseDocument, node: NodeHandle) -> DomResult<&Node> {
    let n = live_node(doc, node)?;
    if n.element_data().is_some() { Ok(n) } else { Err(DomError::NotAnElement) }
}

fn validate_token(token: &str) -> DomResult<()> {
    if token.is_empty() {
        return Err(DomError::EmptyToken);
    }
    if token.chars().any(|c| matches!(c, ' ' | '\t' | '\n' | '\u{c}' | '\r')) {
        return Err(DomError::InvalidCharacter(token.to_string()));
    }
    Ok(())
}

/// The ordered set of class tokens (duplicates removed, as DOMTokenList does).
fn token_set(class_attr: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for t in class_attr.split_ascii_whitespace() {
        if !out.iter().any(|x| x == t) {
            out.push(t.to_string());
        }
    }
    out
}

fn handles(ids: impl IntoIterator<Item = NodeId>) -> Vec<NodeHandle> {
    ids.into_iter().map(NodeHandle::from).collect()
}

fn rect(r: blitz_dom::BoundingRect) -> Rect {
    Rect { x: r.x, y: r.y, width: r.width, height: r.height }
}

impl DomHost for BaseDocument {
    fn is_live(&self, node: NodeHandle) -> bool {
        self.get_node(node.into()).is_some()
    }

    fn document_node(&self) -> NodeHandle {
        self.root_node().id.into()
    }

    fn document_element(&self) -> Option<NodeHandle> {
        let root = self.root_node();
        root.children.iter().copied().find(|id| self.get_node(*id).is_some_and(|n| n.element_data().is_some())).map(NodeHandle::from)
    }

    fn body(&self) -> Option<NodeHandle> {
        let html = self.document_element()?;
        self.get_node(html.into())?
            .children
            .iter()
            .copied()
            .find(|id| self.get_node(*id).is_some_and(|n| n.element_data().is_some_and(|e| e.name.local == local_name!("body"))))
            .map(NodeHandle::from)
    }

    fn is_element(&self, node: NodeHandle) -> DomResult<bool> {
        Ok(live_node(self, node)?.element_data().is_some())
    }

    fn is_connected(&self, node: NodeHandle) -> DomResult<bool> {
        let root = self.root_node().id;
        let mut current = Some(live_node(self, node)?);
        while let Some(n) = current {
            if n.id == root {
                return Ok(true);
            }
            current = n.parent.and_then(|p| self.get_node(p));
        }
        Ok(false)
    }

    fn element_by_id(&self, id: &str) -> Option<NodeHandle> {
        BaseDocument::get_element_by_id(self, id).map(NodeHandle::from)
    }

    fn query_first(&self, root: Option<NodeHandle>, selector: &str) -> DomResult<Option<NodeHandle>> {
        let result = match root {
            None => BaseDocument::query_selector(self, selector),
            Some(r) => {
                live_node(self, r)?;
                self.query_selector_in(r.into(), selector)
            }
        };
        result.map(|n| n.map(NodeHandle::from)).map_err(|_| DomError::InvalidSelector(selector.to_string()))
    }

    fn query_all(&self, root: Option<NodeHandle>, selector: &str) -> DomResult<Vec<NodeHandle>> {
        let result = match root {
            None => BaseDocument::query_selector_all(self, selector),
            Some(r) => {
                live_node(self, r)?;
                self.query_selector_all_in(r.into(), selector)
            }
        };
        result.map(handles).map_err(|_| DomError::InvalidSelector(selector.to_string()))
    }

    fn create_element(&mut self, tag: &str) -> NodeHandle {
        let name = QualName::new(None, ns!(html), LocalName::from(tag.to_ascii_lowercase()));
        self.mutate().create_element(name, Vec::new()).into()
    }

    fn tag_name(&self, node: NodeHandle) -> DomResult<String> {
        let n = live_element(self, node)?;
        let el = n.element_data().unwrap();
        Ok(if el.name.ns == ns!(html) { el.name.local.to_string().to_ascii_uppercase() } else { el.name.local.to_string() })
    }

    fn parent_node(&self, node: NodeHandle) -> DomResult<Option<NodeHandle>> {
        Ok(live_node(self, node)?.parent.filter(|p| self.get_node(*p).is_some()).map(NodeHandle::from))
    }

    fn parent_element(&self, node: NodeHandle) -> DomResult<Option<NodeHandle>> {
        Ok(live_node(self, node)?.parent.filter(|p| self.get_node(*p).is_some_and(|n| n.element_data().is_some())).map(NodeHandle::from))
    }

    fn element_children(&self, node: NodeHandle) -> DomResult<Vec<NodeHandle>> {
        let n = live_node(self, node)?;
        Ok(handles(n.children.iter().copied().filter(|c| self.get_node(*c).is_some_and(|n| n.element_data().is_some()))))
    }

    fn append_child(&mut self, parent: NodeHandle, child: NodeHandle) -> DomResult<()> {
        live_node(self, parent)?;
        live_node(self, child)?;
        if parent == child || self.event_path(parent)?.contains(&child) {
            return Err(DomError::InvalidState("the new child is an ancestor of the parent".into()));
        }
        let mut m = self.mutate();
        if m.node_has_parent(child.into()) {
            m.remove_node(child.into());
        }
        m.append_children(parent.into(), &[child.into()]);
        Ok(())
    }

    fn remove_node(&mut self, node: NodeHandle) -> DomResult<()> {
        live_node(self, node)?;
        let mut m = self.mutate();
        if m.node_has_parent(node.into()) {
            m.remove_node(node.into());
        }
        Ok(())
    }

    fn drop_node(&mut self, node: NodeHandle) -> DomResult<()> {
        live_node(self, node)?;
        if node == self.document_node() {
            return Err(DomError::InvalidState("the document node cannot be dropped".into()));
        }
        self.mutate().remove_and_drop_node(node.into());
        Ok(())
    }

    fn event_path(&self, node: NodeHandle) -> DomResult<Vec<NodeHandle>> {
        let mut out = vec![node];
        let mut current = live_node(self, node)?.parent;
        while let Some(p) = current {
            let Some(n) = self.get_node(p) else { break };
            out.push(p.into());
            current = n.parent;
        }
        Ok(out)
    }

    fn text_content(&self, node: NodeHandle) -> DomResult<String> {
        Ok(live_node(self, node)?.text_content())
    }

    fn set_text_content(&mut self, node: NodeHandle, text: &str) -> DomResult<()> {
        let text_like = matches!(live_node(self, node)?.data, NodeData::Text(_) | NodeData::Comment { .. });
        let mut m = self.mutate();
        if text_like {
            m.set_node_text(node.into(), text);
        } else {
            // Detach (not drop) old children so wrappers that reference them stay valid.
            for child in m.child_ids(node.into()) {
                m.remove_node(child);
            }
            if !text.is_empty() {
                let t = m.create_text_node(text);
                m.append_children(node.into(), &[t]);
            }
        }
        Ok(())
    }

    fn get_attribute(&self, node: NodeHandle, name: &str) -> DomResult<Option<String>> {
        let n = live_node(self, node)?;
        let name = name.to_ascii_lowercase();
        Ok(n.element_data().and_then(|el| el.attrs().iter().find(|a| *a.name.local == *name).map(|a| a.value.clone())))
    }

    fn set_attribute(&mut self, node: NodeHandle, name: &str, value: &str) -> DomResult<()> {
        live_element(self, node)?;
        self.mutate().set_attribute(node.into(), attr_qual_name(&name.to_ascii_lowercase()), value);
        Ok(())
    }

    fn remove_attribute(&mut self, node: NodeHandle, name: &str) -> DomResult<()> {
        live_element(self, node)?;
        self.mutate().clear_attribute(node.into(), attr_qual_name(&name.to_ascii_lowercase()));
        Ok(())
    }

    fn has_attribute(&self, node: NodeHandle, name: &str) -> DomResult<bool> {
        Ok(self.get_attribute(node, name)?.is_some())
    }

    fn class_list(&self, node: NodeHandle) -> DomResult<Vec<String>> {
        live_element(self, node)?;
        Ok(token_set(&self.get_attribute(node, "class")?.unwrap_or_default()))
    }

    fn class_list_add(&mut self, node: NodeHandle, tokens: &[&str]) -> DomResult<()> {
        for t in tokens {
            validate_token(t)?;
        }
        let mut list = self.class_list(node)?;
        for t in tokens {
            if !list.iter().any(|x| x == t) {
                list.push(t.to_string());
            }
        }
        self.set_attribute(node, "class", &list.join(" "))
    }

    fn class_list_remove(&mut self, node: NodeHandle, tokens: &[&str]) -> DomResult<()> {
        for t in tokens {
            validate_token(t)?;
        }
        let list: Vec<String> = self.class_list(node)?.into_iter().filter(|x| !tokens.contains(&x.as_str())).collect();
        self.set_attribute(node, "class", &list.join(" "))
    }

    fn class_list_toggle(&mut self, node: NodeHandle, token: &str, force: Option<bool>) -> DomResult<bool> {
        validate_token(token)?;
        let mut list = self.class_list(node)?;
        let has = list.iter().any(|x| x == token);
        let want = force.unwrap_or(!has);
        if want && !has {
            list.push(token.to_string());
        } else if !want && has {
            list.retain(|x| x != token);
        } else {
            return Ok(want);
        }
        self.set_attribute(node, "class", &list.join(" "))?;
        Ok(want)
    }

    fn class_list_contains(&self, node: NodeHandle, token: &str) -> DomResult<bool> {
        Ok(self.class_list(node)?.iter().any(|x| x == token))
    }

    fn style_get(&self, node: NodeHandle, property: &str) -> DomResult<String> {
        let attr = self.get_attribute(node, "style")?.unwrap_or_default();
        Ok(match css_property_name(property) {
            Some(name) => self.style_attr_get_property(&attr, &name),
            None => String::new(),
        })
    }

    fn style_set(&mut self, node: NodeHandle, property: &str, value: &str, priority: &str) -> DomResult<()> {
        live_element(self, node)?;
        let Some(name) = css_property_name(property) else { return Ok(()) };
        let important = priority.eq_ignore_ascii_case("important");
        if !important && !priority.is_empty() {
            return Ok(()); // CSSOM: an unknown priority is ignored
        }
        let attr = self.get_attribute(node, "style")?.unwrap_or_default();
        // `None`: invalid declaration, ignored (CSSOM)
        if let Some(new_attr) = self.style_attr_set_property(&attr, &name, value, important)
            && new_attr != attr
        {
            self.mutate().set_attribute(node.into(), attr_qual_name("style"), &new_attr);
        }
        Ok(())
    }

    fn style_remove(&mut self, node: NodeHandle, property: &str) -> DomResult<String> {
        live_element(self, node)?;
        let Some(name) = css_property_name(property) else { return Ok(String::new()) };
        let attr = self.get_attribute(node, "style")?.unwrap_or_default();
        let Some((new_attr, old)) = self.style_attr_remove_property(&attr, &name) else { return Ok(String::new()) };
        if new_attr != attr {
            self.mutate().set_attribute(node.into(), attr_qual_name("style"), &new_attr);
        }
        Ok(old)
    }

    fn style_css_text(&self, node: NodeHandle) -> DomResult<String> {
        let attr = self.get_attribute(node, "style")?.unwrap_or_default();
        Ok(self.style_attr_serialize(&attr))
    }

    fn set_style_css_text(&mut self, node: NodeHandle, css: &str) -> DomResult<()> {
        live_element(self, node)?;
        let css = self.style_attr_serialize(css);
        self.mutate().set_attribute(node.into(), attr_qual_name("style"), &css);
        Ok(())
    }

    fn style_names(&self, node: NodeHandle) -> DomResult<Vec<String>> {
        Ok(declared_names(&self.style_css_text(node)?))
    }

    fn ensure_layout(&mut self) {
        self.resolve_at_current_time();
    }

    fn computed_style(&mut self, node: NodeHandle, property: &str) -> DomResult<String> {
        live_element(self, node)?;
        let Some(name) = css_property_name(property) else { return Ok(String::new()) };
        self.ensure_layout();
        Ok(self.resolved_style_value(node.into(), &name))
    }

    fn bounding_client_rect(&mut self, node: NodeHandle) -> DomResult<Rect> {
        live_element(self, node)?;
        self.ensure_layout();
        // A detached node keeps its last layout data in Blitz; browsers report an empty rect.
        if !self.is_connected(node)? {
            return Ok(Rect::default());
        }
        Ok(self.get_client_bounding_rect(node.into()).map(rect).unwrap_or_default())
    }

    fn client_rects(&mut self, node: NodeHandle) -> DomResult<Vec<Rect>> {
        live_element(self, node)?;
        self.ensure_layout();
        if !self.is_connected(node)? || !live_node(self, node)?.has_boxes() {
            return Ok(Vec::new());
        }
        Ok(self.node_client_rects(node.into()).into_iter().map(rect).collect())
    }

    fn offset_box(&mut self, node: NodeHandle) -> DomResult<Rect> {
        live_element(self, node)?;
        self.ensure_layout();
        if !self.is_connected(node)? {
            return Ok(Rect::default());
        }
        let r = BaseDocument::offset_rect(self, node.into()).map(rect).unwrap_or_default();
        Ok(Rect { x: r.x.round(), y: r.y.round(), width: r.width.round(), height: r.height.round() })
    }

    fn client_size(&mut self, node: NodeHandle) -> DomResult<(f64, f64)> {
        live_element(self, node)?;
        self.ensure_layout();
        let n = self.get_node(node.into()).ok_or(DomError::InvalidHandle)?;
        let (w, h) = if NodeId::from(node) == self.root_element().id {
            // The root element reports the viewport minus scrollbars (no-quirks mode).
            let viewport = self.viewport();
            let scale = viewport.scale();
            let scrollbar = n.final_layout().scrollbar_size;
            (viewport.window_size.0 as f32 / scale - scrollbar.width, viewport.window_size.1 as f32 / scale - scrollbar.height)
        } else {
            (n.client_width(), n.client_height())
        };
        Ok((w.round() as f64, h.round() as f64))
    }
}
