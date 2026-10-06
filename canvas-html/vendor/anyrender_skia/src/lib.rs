mod image_renderer;
mod scene;
mod window_renderer;

// Backends
mod cache;
#[cfg(any(target_os = "macos", target_os = "ios"))]
mod metal;
#[cfg(not(any(target_os = "macos", target_os = "ios")))]
mod opengl;
#[cfg(feature = "vulkan")]
mod vulkan;

pub use image_renderer::SkiaImageRenderer;

#[cfg(all(feature = "headless-gpu", not(any(target_os = "macos", target_os = "ios"))))]
mod gpu_image_renderer;
#[cfg(all(feature = "headless-gpu", not(any(target_os = "macos", target_os = "ios"))))]
pub use gpu_image_renderer::{GpuApi, GpuDevice, GpuError, GpuFrameTimings, GpuResourceUsage, SkiaGpuImageRenderer};
pub use scene::{SkiaSceneCache, SkiaScenePainter};
pub use window_renderer::*;

/// Purges Skia's process-wide glyph cache; returns its size in bytes before and after.
pub fn purge_font_cache() -> (usize, usize) {
    let before = skia_safe::graphics::font_cache_used();
    skia_safe::graphics::purge_font_cache();
    (before, skia_safe::graphics::font_cache_used())
}
