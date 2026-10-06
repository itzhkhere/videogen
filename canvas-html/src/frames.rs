//! Output frame memory: the size of a frame and fallible allocation. A frame from `render()`
//! leaves the renderer by ownership: the `Vec` is handed to Node as an external Buffer and freed
//! by that Buffer's finalizer; the renderer never touches it again.

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

/// Experiment (Phase 4A.2, time-boxed): a frame in its own anonymous mapping, so freeing it
/// returns the pages to the OS at once (glibc may keep freed heap frames). Unix only.
#[cfg(unix)]
pub(crate) struct MmapFrame {
    ptr: std::ptr::NonNull<u8>,
    len: usize,
}

#[cfg(unix)]
impl MmapFrame {
    pub(crate) fn new(len: usize) -> Result<Self, String> {
        if len == 0 {
            return Err("frame of 0 bytes".into());
        }
        // SAFETY: a fresh private anonymous mapping; no existing memory is affected.
        let p = unsafe {
            libc::mmap(std::ptr::null_mut(), len, libc::PROT_READ | libc::PROT_WRITE, libc::MAP_PRIVATE | libc::MAP_ANONYMOUS, -1, 0)
        };
        if p == libc::MAP_FAILED {
            return Err(format!("could not allocate a {} MiB frame", len >> 20));
        }
        let ptr = std::ptr::NonNull::new(p.cast::<u8>()).ok_or_else(|| "mmap returned null".to_string())?;
        Ok(Self { ptr, len })
    }

    pub(crate) fn as_mut_ptr(&mut self) -> *mut u8 {
        self.ptr.as_ptr()
    }

    pub(crate) fn len(&self) -> usize {
        self.len
    }

    pub(crate) fn as_mut_slice(&mut self) -> &mut [u8] {
        // SAFETY: the mapping is `len` readable/writable bytes (zero-filled by the kernel), owned
        // by `self`, and only reachable through `&mut self` here.
        unsafe { std::slice::from_raw_parts_mut(self.ptr.as_ptr(), self.len) }
    }
}

#[cfg(unix)]
impl Drop for MmapFrame {
    fn drop(&mut self) {
        // SAFETY: unmaps exactly the mapping created in `new`, once.
        unsafe { libc::munmap(self.ptr.as_ptr().cast(), self.len) };
    }
}
