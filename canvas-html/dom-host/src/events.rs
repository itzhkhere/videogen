//! Minimal engine-neutral event model.
//!
//! The registry stores listener *metadata* only. The adapter assigns a [`CallbackKey`] to
//! each distinct JS callback object and keeps the callback itself (Boa: a rooted `JsObject`
//! in the Boa runtime state; Deno: a `Map` inside the V8 isolate on the renderer thread).
//! When [`ListenerRegistry::callback_in_use`] turns false after a removal, the adapter
//! releases its callback.
//!
//! Dispatch algorithm (both adapters run exactly this loop):
//! 1. `path` = [`DomHost::event_path`](crate::DomHost::event_path) (target, then ancestors), then
//!    [`EventTarget::Window`] when the target is connected. Without `bubbles` only the target.
//! 2. For each `current` in the path: snapshot [`ListenerRegistry::listener_ids`]; for each id,
//!    [`ListenerRegistry::begin_invoke`] (skips listeners removed meanwhile and removes `once`
//!    listeners before the call), set `currentTarget`, call it with `this = currentTarget`.
//!    `stopImmediatePropagation()` ends the dispatch; `stopPropagation()` ends it after
//!    `current`.
//! 3. `dispatchEvent` returns `!defaultPrevented`; `preventDefault()` only counts for
//!    cancelable events.
//!
//! Deviation: no capture phase. Capture listeners are stored (and deduplicated separately, as
//! in the DOM), but run in the same order as other listeners.

use std::collections::HashMap;

use crate::NodeHandle;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash)]
pub enum EventTarget {
    Node(NodeHandle),
    Window,
}

/// Adapter-assigned identity of a JS callback object.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash, PartialOrd, Ord)]
pub struct CallbackKey(pub u64);

#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash, PartialOrd, Ord)]
pub struct ListenerId(pub u64);

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Listener {
    pub id: ListenerId,
    pub callback: CallbackKey,
    pub capture: bool,
    pub once: bool,
}

#[derive(Default)]
pub struct ListenerRegistry {
    next_id: u64,
    map: HashMap<(EventTarget, String), Vec<Listener>>,
}

impl ListenerRegistry {
    /// `addEventListener`. Returns `None` for a duplicate (same callback and capture flag),
    /// which the DOM ignores.
    pub fn add(&mut self, target: EventTarget, event_type: &str, callback: CallbackKey, capture: bool, once: bool) -> Option<ListenerId> {
        let list = self.map.entry((target, event_type.to_string())).or_default();
        if list.iter().any(|l| l.callback == callback && l.capture == capture) {
            return None;
        }
        self.next_id += 1;
        let id = ListenerId(self.next_id);
        list.push(Listener { id, callback, capture, once });
        Some(id)
    }

    /// `removeEventListener`. Returns the removed listener.
    pub fn remove(&mut self, target: EventTarget, event_type: &str, callback: CallbackKey, capture: bool) -> Option<Listener> {
        let key = (target, event_type.to_string());
        let list = self.map.get_mut(&key)?;
        let index = list.iter().position(|l| l.callback == callback && l.capture == capture)?;
        let removed = list.remove(index);
        if list.is_empty() {
            self.map.remove(&key);
        }
        Some(removed)
    }

    pub fn has_listeners(&self, target: EventTarget, event_type: &str) -> bool {
        self.map.get(&(target, event_type.to_string())).is_some_and(|l| !l.is_empty())
    }

    /// Snapshot of the listeners for one dispatch step, in registration order.
    pub fn listener_ids(&self, target: EventTarget, event_type: &str) -> Vec<ListenerId> {
        self.map
            .get(&(target, event_type.to_string()))
            .map(|l| l.iter().map(|l| l.id).collect())
            .unwrap_or_default()
    }

    /// Called right before invoking a snapshotted listener. Returns `None` if it was removed
    /// since the snapshot. A `once` listener is removed here, before its callback runs.
    pub fn begin_invoke(&mut self, target: EventTarget, event_type: &str, id: ListenerId) -> Option<Listener> {
        let key = (target, event_type.to_string());
        let list = self.map.get_mut(&key)?;
        let index = list.iter().position(|l| l.id == id)?;
        let listener = list[index].clone();
        if listener.once {
            list.remove(index);
            if list.is_empty() {
                self.map.remove(&key);
            }
        }
        Some(listener)
    }

    /// Is any listener still using `callback`? When not, the adapter may release it.
    pub fn callback_in_use(&self, callback: CallbackKey) -> bool {
        self.map.values().flatten().any(|l| l.callback == callback)
    }

    /// Drop every listener of a target (for example when its native node is dropped).
    pub fn remove_target(&mut self, target: EventTarget) -> Vec<Listener> {
        let keys: Vec<_> = self.map.keys().filter(|(t, _)| *t == target).cloned().collect();
        keys.into_iter().flat_map(|k| self.map.remove(&k).unwrap_or_default()).collect()
    }

    /// Drop everything (renderer close).
    pub fn clear(&mut self) -> Vec<Listener> {
        self.map.drain().flat_map(|(_, l)| l).collect()
    }

    pub fn len(&self) -> usize {
        self.map.values().map(Vec::len).sum()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const T: EventTarget = EventTarget::Window;

    #[test]
    fn dedupe_and_capture() {
        let mut r = ListenerRegistry::default();
        assert!(r.add(T, "x", CallbackKey(1), false, false).is_some());
        assert!(r.add(T, "x", CallbackKey(1), false, false).is_none());
        assert!(r.add(T, "x", CallbackKey(1), true, false).is_some());
        assert_eq!(r.len(), 2);
        assert!(r.remove(T, "x", CallbackKey(1), false).is_some());
        assert!(r.callback_in_use(CallbackKey(1)));
        assert!(r.remove(T, "x", CallbackKey(1), true).is_some());
        assert!(!r.callback_in_use(CallbackKey(1)));
    }

    #[test]
    fn once_and_removed_during_dispatch() {
        let mut r = ListenerRegistry::default();
        let a = r.add(T, "x", CallbackKey(1), false, true).unwrap();
        let b = r.add(T, "x", CallbackKey(2), false, false).unwrap();
        let snapshot = r.listener_ids(T, "x");
        assert_eq!(snapshot, vec![a, b]);
        assert!(r.begin_invoke(T, "x", a).is_some());
        // listener a removed b while running
        r.remove(T, "x", CallbackKey(2), false);
        assert!(r.begin_invoke(T, "x", b).is_none());
        assert!(r.is_empty());
    }
}
