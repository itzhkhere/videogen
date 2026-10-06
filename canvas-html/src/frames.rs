//! Output frame memory (Phase 4A.1): the size of a frame, fallible allocation, and the
//! experimental bounded pool. A rendered RGBA frame leaves the renderer by ownership: the `Vec`
//! is handed to Node as an external Buffer and freed by that Buffer's finalizer; the renderer
//! never touches it again.
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

/// Largest frame side, in device pixels (as large as any GPU texture; a 32767² RGBA frame is
/// 4 GiB).
pub(crate) const MAX_SIDE: u32 = 32767;

/// Bytes of a `pw` × `ph` RGBA frame, or why no frame can have that size.
pub(crate) fn frame_len(pw: u32, ph: u32) -> Result<usize, String> {
    if pw == 0 || ph == 0 || pw > MAX_SIDE || ph > MAX_SIDE {
        return Err(format!("frame of {pw}x{ph} device pixels is out of range (1..={MAX_SIDE} per side)"));
    }
    (pw as usize)
        .checked_mul(ph as usize)
        .and_then(|n| n.checked_mul(4))
        .filter(|&n| n <= isize::MAX as usize)
        .ok_or_else(|| format!("frame of {pw}x{ph} device pixels is too large"))
}

/// A zero-filled frame of `len` bytes. Allocation failure is an error, not an abort. The zeroed
/// memory comes from the allocator (`calloc`; for frames, fresh zero pages), so there is no
/// memset: pages are touched when Skia or the readback writes the frame.
pub(crate) fn alloc_frame(len: usize) -> Result<Vec<u8>, String> {
    if len == 0 {
        return Ok(Vec::new());
    }
    let layout = std::alloc::Layout::array::<u8>(len).map_err(|_| format!("frame of {len} bytes is too large"))?;
    // SAFETY: `layout` has a non-zero size. A non-null result is a zeroed allocation of exactly
    // `len` bytes with the global allocator and alignment 1, which is what `Vec<u8>` with
    // length and capacity `len` owns and later frees with the same layout.
    unsafe {
        let ptr = std::alloc::alloc_zeroed(layout);
        if ptr.is_null() {
            return Err(format!("could not allocate a {} MiB frame", len >> 20));
        }
        Ok(Vec::from_raw_parts(ptr, len, len))
    }
}

/// Like `alloc_frame`, then asks Linux to back the frame with transparent huge pages
/// (`MADV_HUGEPAGE` on its 2 MiB-aligned interior) before anything touches it, so Skia's first
/// writes fault in 2 MiB pages instead of 4 KiB pages. Advice only: if the kernel declines, the
/// frame is an ordinary one. Linux only; elsewhere the same as `alloc_frame`.
pub(crate) fn alloc_frame_huge(len: usize) -> Result<Vec<u8>, String> {
    let v = alloc_frame(len)?;
    #[cfg(target_os = "linux")]
    {
        const HUGE: usize = 2 << 20;
        let start = (v.as_ptr() as usize).div_ceil(HUGE) * HUGE;
        let end = (v.as_ptr() as usize + v.len()) / HUGE * HUGE;
        if end > start {
            // SAFETY: the range lies inside `v`'s allocation; MADV_HUGEPAGE only changes how the
            // kernel backs these pages, never their contents or validity.
            unsafe { libc::madvise(start as *mut libc::c_void, end - start, libc::MADV_HUGEPAGE) };
        }
    }
    Ok(v)
}

/// Design B: frames whose Node Buffer was finalized come back here and are reused. Shared by
/// `Arc` with every outstanding Buffer's finalizer, so it may outlive the renderer.
pub(crate) struct FramePool {
    len: usize,
    max_free: usize,
    free: Mutex<Vec<Vec<u8>>>,
    pub(crate) allocated: AtomicU64,
    pub(crate) reused: AtomicU64,
    pub(crate) returned: AtomicU64,
    pub(crate) discarded: AtomicU64,
}

impl FramePool {
    pub(crate) fn new(len: usize, max_free: usize) -> Arc<Self> {
        Arc::new(Self {
            len,
            max_free,
            free: Mutex::new(Vec::new()),
            allocated: AtomicU64::new(0),
            reused: AtomicU64::new(0),
            returned: AtomicU64::new(0),
            discarded: AtomicU64::new(0),
        })
    }

    pub(crate) fn len(&self) -> usize {
        self.len
    }

    pub(crate) fn max_free(&self) -> usize {
        self.max_free
    }

    pub(crate) fn free_count(&self) -> usize {
        self.free.lock().unwrap_or_else(|e| e.into_inner()).len()
    }

    /// A free frame, or a new one when every pooled frame is still owned by JS.
    pub(crate) fn take(&self) -> Result<Vec<u8>, String> {
        if let Some(v) = self.free.lock().unwrap_or_else(|e| e.into_inner()).pop() {
            self.reused.fetch_add(1, Ordering::Relaxed);
            return Ok(v);
        }
        self.allocated.fetch_add(1, Ordering::Relaxed);
        alloc_frame(self.len)
    }

    /// Called from a Buffer finalizer: keep the frame if there is room, else free it.
    pub(crate) fn give_back(&self, v: Vec<u8>) {
        let mut free = self.free.lock().unwrap_or_else(|e| e.into_inner());
        if v.len() == self.len && free.len() < self.max_free {
            free.push(v);
            self.returned.fetch_add(1, Ordering::Relaxed);
        } else {
            self.discarded.fetch_add(1, Ordering::Relaxed);
        }
    }
}
