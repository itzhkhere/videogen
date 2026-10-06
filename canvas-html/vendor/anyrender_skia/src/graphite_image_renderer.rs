//! Headless (offscreen) GPU rendering with Skia Graphite on Vulkan. Same scene painter as the
//! CPU and Ganesh renderers; only the surface behind the canvas differs.
//!
//! Graphite separates recording from execution: each renderer owns a `Recorder` (its surface
//! records into it), and the device's `Context` executes the snapped `Recording`s. Several
//! renderers on one thread may share a device (one `Context`, one `Recorder` each).
//!
//! Built only with the `headless-graphite` feature, which needs Skia's Graphite+Vulkan binary
//! (no Ganesh, no GL): the pinned rust-skia publishes no binary with both engines.
use std::cell::RefCell;
use std::mem::ManuallyDrop;
use std::rc::Rc;
use std::time::Instant;

use skia_safe::gpu::graphite::{self, InsertRecordingInfo, InsertStatus, Recorder, vk as gvk};
use skia_safe::gpu::Mipmapped;
use skia_safe::{AlphaType, Color, ColorType, ImageInfo, Surface, SurfaceProps, graphics};

use crate::gpu_common::{GpuError, GpuFrameTimings, VkDevice};
use crate::{SkiaScenePainter, scene::SkiaSceneCache};

/// A Vulkan device and Graphite's `Context`. Drop order: the context first, then Vulkan.
pub struct GraphiteDevice {
    context: ManuallyDrop<RefCell<graphite::Context>>,
    vk: ManuallyDrop<VkDevice>,
}

impl GraphiteDevice {
    pub fn new() -> Result<Rc<Self>, GpuError> {
        // Graphite needs Vulkan 1.3 entry points: request the loader's highest instance version.
        let vk = VkDevice::new(None, "graphite-vulkan")?;
        let context = vk
            .with_backend(None, |backend| gvk::context_factory::make_vulkan(backend, None))
            .ok_or_else(|| GpuError("Skia Graphite Vulkan context creation failed".into()))?;
        Ok(Rc::new(Self { context: ManuallyDrop::new(RefCell::new(context)), vk: ManuallyDrop::new(vk) }))
    }

    pub fn name(&self) -> &'static str {
        "graphite-vulkan"
    }

    pub fn description(&self) -> &str {
        &self.vk.description
    }

    pub fn is_device_lost(&self) -> bool {
        self.context.borrow().is_device_lost()
    }
}

impl Drop for GraphiteDevice {
    fn drop(&mut self) {
        unsafe {
            {
                let ctx = self.context.get_mut();
                if !ctx.is_device_lost() {
                    ctx.submit_and_wait();
                }
            }
            ManuallyDrop::drop(&mut self.context);
            ManuallyDrop::drop(&mut self.vk);
        }
    }
}

/// An offscreen Graphite render target. Field order is drop order: the surface and the
/// recorder go before the device (whose `Context` they were made from).
pub struct SkiaGraphiteImageRenderer {
    surface: Surface,
    recorder: Recorder,
    scene_cache: SkiaSceneCache,
    image_info: ImageInfo,
    device: Rc<GraphiteDevice>,
}

impl SkiaGraphiteImageRenderer {
    pub fn new(device: Rc<GraphiteDevice>, width: u32, height: u32) -> Result<Self, GpuError> {
        // Same process-wide Skia limits as the CPU renderer
        graphics::set_font_cache_count_limit(100);
        graphics::set_typeface_cache_count_limit(100);
        graphics::set_resource_cache_total_bytes_limit(10485760);
        if device.is_device_lost() {
            return Err(GpuError("GPU device is lost".into()));
        }
        let mut recorder = device
            .context
            .borrow_mut()
            .make_recorder(None)
            .ok_or_else(|| GpuError("Graphite recorder creation failed".into()))?;
        let image_info = ImageInfo::new((width as i32, height as i32), ColorType::RGBA8888, AlphaType::Opaque, None);
        let surface = graphite::surfaces::render_target(&mut recorder, &image_info, Mipmapped::No, Some(&SurfaceProps::default()), Some("canvas-html"))
            .ok_or_else(|| GpuError(format!("GPU surface {width}x{height} could not be created")))?;
        Ok(Self { surface, recorder, scene_cache: SkiaSceneCache::default(), image_info, device })
    }

    pub fn device(&self) -> &Rc<GraphiteDevice> {
        &self.device
    }

    /// Paint a frame, submit it and wait for it; with `out`, read the RGBA pixels back.
    /// Timings: `record_ns` = painting into the recorder; `submit_ns` = snap + insert + submit;
    /// `wait_ns` = waiting for the GPU; `readback_ns` = GPU → CPU copy.
    pub fn render_timed<F: FnOnce(&mut SkiaScenePainter<'_>)>(
        &mut self,
        draw_fn: F,
        out: Option<&mut [u8]>,
    ) -> Result<GpuFrameTimings, GpuError> {
        if self.device.is_device_lost() {
            return Err(GpuError("GPU device is lost".into()));
        }
        let mut t = GpuFrameTimings::default();

        let start = Instant::now();
        self.surface.canvas().clear(Color::TRANSPARENT);
        draw_fn(&mut SkiaScenePainter {
            inner: self.surface.canvas(),
            cache: &mut self.scene_cache,
            graphite_recorder: Some(&mut self.recorder),
        });
        self.scene_cache.next_gen();
        t.record_ns = start.elapsed().as_nanos();

        let start = Instant::now();
        let mut recording = self.recorder.snap().ok_or_else(|| GpuError("Graphite snap failed".into()))?;
        {
            let mut ctx = self.device.context.borrow_mut();
            let status = ctx.insert_recording(&InsertRecordingInfo::new(&mut recording));
            if status != InsertStatus::Success {
                return Err(GpuError(format!("Graphite insertRecording failed: {status:?}")));
            }
            if !ctx.submit(None) {
                return Err(GpuError("GPU submit failed".into()));
            }
        }
        t.submit_ns = start.elapsed().as_nanos();

        let start = Instant::now();
        {
            let mut ctx = self.device.context.borrow_mut();
            ctx.submit_and_wait();
            if ctx.is_device_lost() {
                return Err(GpuError("GPU device is lost".into()));
            }
        }
        t.wait_ns = start.elapsed().as_nanos();
        drop(recording);

        if let Some(out) = out {
            let start = Instant::now();
            let row_bytes = self.image_info.min_row_bytes();
            if out.len() != self.image_info.compute_min_byte_size() {
                return Err(GpuError(format!("output buffer is {} bytes, the frame needs {}", out.len(), self.image_info.compute_min_byte_size())));
            }
            let ok = self.device.context.borrow_mut().read_pixels(&mut self.surface, &self.image_info, out, row_bytes, (0, 0));
            if !ok {
                return Err(GpuError("GPU readback failed".into()));
            }
            t.readback_ns = start.elapsed().as_nanos();
        }
        Ok(t)
    }
}
