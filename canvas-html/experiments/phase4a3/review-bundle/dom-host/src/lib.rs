//! Engine-neutral DOM/Web behaviour for html-renderer.
//!
//! The script runtimes (Boa in production, Deno/V8 experimentally) are adapters: they
//! expose this crate's behaviour to JavaScript and keep every engine object (wrappers,
//! callbacks, values) on their side. This crate owns the semantics:
//!
//! - [`NodeHandle`]: the canonical identity of a node. JS wrappers are caches keyed by it.
//! - [`DomHost`]: lookups, text, attributes, `classList`, inline style, computed style and
//!   geometry, implemented once on Blitz's [`BaseDocument`](blitz_dom::BaseDocument).
//! - [`DomError`]: one error model, with one mapping to JavaScript exception names.
//! - [`events::ListenerRegistry`]: listener metadata keyed by adapter-assigned callback keys.
//! - [`timers::TimerSchedule`]: deterministic timer ordering (deadline, then insertion).
//! - [`clock::ClockContract`]: `Date.now()`, `performance.now()` and `timeOrigin` from visual time.
//! - [`ScriptRuntime`]: the boundary a script engine adapter implements.
//!
//! Dependency rule: nothing here may name `boa_engine`, `deno_core` or `v8` types.
//!
//! Layout policy: a mutation only marks the document dirty (Blitz records restyle hints and
//! damage). Layout-dependent queries ([`DomHost::computed_style`],
//! [`DomHost::bounding_client_rect`], offset and client sizes) resolve style and layout at the
//! document's current animation time first; `render()` resolves at the render time. No
//! mutation triggers layout by itself.

#![forbid(unsafe_code)]

pub mod clock;
mod document;
mod errors;
pub mod events;
mod handles;
mod runtime;
pub mod style;
pub mod timers;

pub use document::{DomHost, HostDocument, Rect};
pub use errors::{DomError, DomResult, JsErrorKind};
pub use handles::NodeHandle;
pub use runtime::{ScriptError, ScriptRuntime};
