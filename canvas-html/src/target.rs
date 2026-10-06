//! Caller-owned output targets for `renderInto` (Phase 4A.2).
//!
//! A target is a JS `Buffer`, `Uint8Array` or `Uint8ClampedArray` over an ordinary (non-shared)
//! `ArrayBuffer`, of exactly one frame of bytes. The kind of the view is read with N-API directly
//! (`napi_get_typedarray_info`), not through napi-rs's buffer conversion, which accepts any
//! `ArrayBufferView` whose byte length fits. Everything else is rejected with a JS error before a
//! single byte is written.
//!
//! Aliasing model: the renderer turns a target into a `&mut [u8]` for the duration of one
//! synchronous native call. That is sound only if nothing else can read or write those bytes
//! while the slice lives:
//! - JS on this thread cannot run: the call is synchronous and canvas-html runs no Node JS
//!   (page scripts run in the renderer's own Boa engine, which cannot reach Node objects).
//! - JS on other threads cannot reach an ordinary `ArrayBuffer`: it belongs to one isolate. It
//!   can only move to another thread by transfer, which detaches it here first, and transfer
//!   needs JS to run on this thread.
//! - A `SharedArrayBuffer` breaks that: another worker may access the same bytes at any time, so
//!   an exclusive `&mut [u8]` over it would be a data race. Shared targets are therefore rejected.
//! - V8 never moves or frees an `ArrayBuffer`'s backing store while the buffer is reachable, and
//!   the target is a live argument of the current call, so the pointer stays valid until return.
//! - The renderer never hands out memory it still uses (`render()` gives its frame away), so a
//!   target cannot alias renderer-owned memory.
use napi::bindgen_prelude::{Env, Error, JsValue, Result, Status, Unknown};
use napi::sys;

/// A validated target: the view's bytes, valid for the current native call only.
pub(crate) struct ByteTarget {
    ptr: *mut u8,
    len: usize,
}

impl ByteTarget {
    /// Validates `value` as a target of exactly `frame_bytes` bytes.
    pub(crate) fn from_js(env: &Env, value: &Unknown<'_>, frame_bytes: usize, what: &str) -> Result<Self> {
        let raw_env = env.raw();
        let raw = value.raw();
        let mut is_typedarray = false;
        // SAFETY: `raw_env` and `raw` are the env and an argument of the current call.
        check(unsafe { sys::napi_is_typedarray(raw_env, raw, &mut is_typedarray) })?;
        if !is_typedarray {
            return Err(type_error(env, &format!("{what} must be a Buffer, Uint8Array or Uint8ClampedArray")));
        }
        let mut kind: sys::napi_typedarray_type = 0;
        let mut length = 0usize;
        let mut data: *mut std::ffi::c_void = std::ptr::null_mut();
        let mut arraybuffer: sys::napi_value = std::ptr::null_mut();
        let mut byte_offset = 0usize;
        // SAFETY: `raw` is a typed array (checked above); every out-pointer is a valid local.
        check(unsafe {
            sys::napi_get_typedarray_info(raw_env, raw, &mut kind, &mut length, &mut data, &mut arraybuffer, &mut byte_offset)
        })?;
        if kind != sys::TypedarrayType::uint8_array && kind != sys::TypedarrayType::uint8_clamped_array {
            return Err(type_error(env, &format!("{what} must be a Buffer, Uint8Array or Uint8ClampedArray, got another typed array")));
        }
        // `napi_is_arraybuffer` is V8's `IsArrayBuffer()`, which is false for a SharedArrayBuffer.
        let mut is_plain = false;
        // SAFETY: `arraybuffer` was just returned by napi_get_typedarray_info for this call.
        check(unsafe { sys::napi_is_arraybuffer(raw_env, arraybuffer, &mut is_plain) })?;
        if !is_plain {
            return Err(type_error(env, &format!("{what} must not be backed by a SharedArrayBuffer (not supported: renderInto writes without synchronization)")));
        }
        let mut detached = false;
        // SAFETY: as above; `arraybuffer` is an ArrayBuffer (checked).
        check(unsafe { sys::napi_is_detached_arraybuffer(raw_env, arraybuffer, &mut detached) })?;
        if detached {
            return Err(type_error_code(env, &format!("{what} is detached (its ArrayBuffer was transferred)"), "ERR_INVALID_ARG_VALUE"));
        }
        // For Uint8Array and Uint8ClampedArray, elements are bytes: `length` is the byte length.
        if length != frame_bytes {
            return Err(range_error(env, &format!("{what} is {length} bytes; the frame needs exactly {frame_bytes} (frameByteLength)")));
        }
        if data.is_null() {
            return Err(type_error_code(env, &format!("{what} has no memory"), "ERR_INVALID_ARG_VALUE"));
        }
        Ok(Self { ptr: data.cast(), len: length })
    }

    /// The target's bytes.
    ///
    /// # Safety
    /// Call only during the native call that validated the target, and do not keep two slices
    /// of targets that may alias (the same view passed twice) alive at once. The module docs
    /// explain why nothing else can touch the bytes meanwhile.
    pub(crate) unsafe fn bytes(&mut self) -> &mut [u8] {
        // SAFETY: `ptr` points to `len` initialized bytes (the view's range, offset applied by
        // N-API) of a non-shared, attached ArrayBuffer kept alive by the current call; the
        // caller upholds exclusivity as documented above.
        unsafe { std::slice::from_raw_parts_mut(self.ptr, self.len) }
    }
}

fn check(status: sys::napi_status) -> Result<()> {
    if status == sys::Status::napi_ok {
        Ok(())
    } else {
        Err(Error::new(Status::from(status), "N-API call failed while checking the target".to_string()))
    }
}

/// Throws a JS TypeError (code ERR_INVALID_ARG_TYPE) and returns the error that tells napi-rs
/// an exception is already pending.
pub(crate) fn type_error(env: &Env, msg: &str) -> Error {
    type_error_code(env, msg, "ERR_INVALID_ARG_TYPE")
}

fn type_error_code(env: &Env, msg: &str, code: &str) -> Error {
    match env.throw_type_error(msg, Some(code)) {
        Ok(()) => Error::from_status(Status::PendingException),
        Err(_) => Error::new(Status::InvalidArg, msg.to_string()),
    }
}

/// Throws a JS RangeError (code ERR_OUT_OF_RANGE), as `type_error`.
pub(crate) fn range_error(env: &Env, msg: &str) -> Error {
    match env.throw_range_error(msg, Some("ERR_OUT_OF_RANGE")) {
        Ok(()) => Error::from_status(Status::PendingException),
        Err(_) => Error::new(Status::InvalidArg, msg.to_string()),
    }
}
