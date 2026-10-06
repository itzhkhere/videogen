mod image_renderer;
mod scene;
#[cfg(any(target_os = "macos", target_os = "ios", feature = "ganesh-gl"))]
mod window_renderer;

// Backends
mod cache;
#[cfg(any(target_os = "macos", target_os = "ios"))]
mod metal;
#[cfg(all(feature = "ganesh-gl", not(any(target_os = "macos", target_os = "ios"))))]
mod opengl;
#[cfg(all(feature = "vulkan", feature = "ganesh-gl"))]
mod vulkan;

pub use image_renderer::SkiaImageRenderer;

// canvas-html: headless GPU renderers (Phase 4A experiment)
#[cfg(all(any(feature = "headless-gpu", feature = "headless-graphite"), not(any(target_os = "macos", target_os = "ios"))))]
mod gpu_common;
#[cfg(all(any(feature = "headless-gpu", feature = "headless-graphite"), not(any(target_os = "macos", target_os = "ios"))))]
pub use gpu_common::{GpuError, GpuFrameTimings};
#[cfg(all(feature = "headless-gpu", not(any(target_os = "macos", target_os = "ios"))))]
mod gpu_image_renderer;
#[cfg(all(feature = "headless-gpu", not(any(target_os = "macos", target_os = "ios"))))]
pub use gpu_image_renderer::{GpuApi, GpuDevice, GpuResourceUsage, PipelineCompletion, PipelineMode, SkiaGpuImageRenderer};
#[cfg(all(feature = "headless-graphite", not(any(target_os = "macos", target_os = "ios"))))]
mod graphite_image_renderer;
#[cfg(all(feature = "headless-graphite", not(any(target_os = "macos", target_os = "ios"))))]
pub use graphite_image_renderer::{GraphiteDevice, SkiaGraphiteImageRenderer};
pub use scene::{SkiaSceneCache, SkiaScenePainter};
#[cfg(any(target_os = "macos", target_os = "ios", feature = "ganesh-gl"))]
pub use window_renderer::*;

/// Purges Skia's process-wide glyph cache; returns its size in bytes before and after.
pub fn purge_font_cache() -> (usize, usize) {
    let before = skia_safe::graphics::font_cache_used();
    skia_safe::graphics::purge_font_cache();
    (before, skia_safe::graphics::font_cache_used())
}
