//! Headless (offscreen) GPU rendering with Skia Ganesh, for servers: no window, no display
//! server. The scene is painted with the same [`SkiaScenePainter`] as the CPU
//! [`SkiaImageRenderer`](crate::SkiaImageRenderer); only the surface behind the canvas differs.
//!
//! - OpenGL: an EGL device (`EGL_EXT_platform_device`) and a surfaceless context. Works with
//!   NVIDIA's EGL and with Mesa (llvmpipe for testing without a GPU).
//! - Vulkan (feature `vulkan`): an instance and device without surface extensions.
//!
//! A [`GpuDevice`] owns the API objects and Skia's `DirectContext`. It is not `Send`: Skia's
//! context is single-threaded, and a GL context is current on one thread. Several renderers on
//! one thread may share a device (`Rc`); each thread needs its own.
use std::cell::RefCell;
use std::ffi::CString;
use std::rc::Rc;
use std::time::Instant;

use skia_safe::gpu::{self, DirectContext, SurfaceOrigin, SyncCpu};
use skia_safe::{AlphaType, Color, ColorType, ImageInfo, Surface, SurfaceProps, graphics};

use crate::{SkiaScenePainter, scene::SkiaSceneCache};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GpuApi {
    Gl,
    #[cfg(feature = "vulkan")]
    Vulkan,
}

impl GpuApi {
    pub fn parse(name: &str) -> Result<Self, GpuError> {
        match name {
            "gl" | "gpu-gl" => Ok(GpuApi::Gl),
            #[cfg(feature = "vulkan")]
            "vulkan" | "gpu-vulkan" => Ok(GpuApi::Vulkan),
            other => Err(GpuError(format!("unsupported GPU backend {other:?} in this build"))),
        }
    }

    pub fn name(self) -> &'static str {
        match self {
            GpuApi::Gl => "ganesh-gl",
            #[cfg(feature = "vulkan")]
            GpuApi::Vulkan => "ganesh-vulkan",
        }
    }
}

use crate::gpu_common::{GpuError, GpuFrameTimings, err};

/// Ganesh context options. Experiments only: `CANVAS_HTML_GANESH_OPTIONS` takes a comma-separated
/// list of `no-atlas-paths`, `no-path-mask-cache`, `no-tessellation`, `no-sdf-paths`, `msaa0`.
fn ganesh_options() -> gpu::ContextOptions {
    let mut o = gpu::ContextOptions::default();
    for flag in std::env::var("CANVAS_HTML_GANESH_OPTIONS").unwrap_or_default().split(',') {
        match flag.trim() {
            "no-atlas-paths" => o.disable_coverage_counting_paths = true,
            "no-path-mask-cache" => o.allow_path_mask_caching = false,
            "no-tessellation" => o.disable_tessellation_path_renderer = true,
            "no-sdf-paths" => o.disable_distance_field_paths = true,
            "msaa0" => o.internal_multisample_count = 0,
            _ => {}
        }
    }
    o
}

enum Api {
    Gl(GlDevice),
    #[cfg(feature = "vulkan")]
    Vulkan(#[allow(dead_code)] crate::gpu_common::VkDevice), // held for its Drop
}

/// The GPU, its API objects and Skia's context. Drop order: Skia's context first, then the API.
pub struct GpuDevice {
    context: std::mem::ManuallyDrop<RefCell<DirectContext>>,
    api: std::mem::ManuallyDrop<Api>,
    kind: GpuApi,
    description: String,
}

/// Cumulative and per-frame GPU statistics.
#[derive(Debug, Clone, Copy, Default)]
pub struct GpuResourceUsage {
    pub resource_count: usize,
    pub resource_bytes: usize,
    pub purgeable_bytes: usize,
    pub budget_bytes: usize,
}

impl GpuDevice {
    /// Create a headless device. `CANVAS_HTML_GPU_DEVICE` (index) selects a device when there
    /// are several; otherwise a hardware device is preferred over a software one.
    pub fn new(kind: GpuApi) -> Result<Rc<Self>, GpuError> {
        let (api, mut context, description) = match kind {
            GpuApi::Gl => {
                let (gl, context, description) = GlDevice::new()?;
                (Api::Gl(gl), context, description)
            }
            #[cfg(feature = "vulkan")]
            GpuApi::Vulkan => {
                let vk = crate::gpu_common::VkDevice::new(Some(ash::vk::API_VERSION_1_1), "ganesh-vulkan")?;
                let context = vk
                    .with_backend(Some(skia_safe::gpu::vk::Version::new(1, 1, 0)), |backend| {
                        gpu::direct_contexts::make_vulkan(backend, &ganesh_options())
                    })
                    .ok_or_else(|| GpuError("Skia Vulkan context creation failed".into()))?;
                let description = vk.description.clone();
                (Api::Vulkan(vk), context, description)
            }
        };
        // 256 MiB for textures, glyph atlases and render targets (Skia's default is 256 MiB too)
        context.set_resource_cache_limit(256 << 20);
        Ok(Rc::new(Self {
            context: std::mem::ManuallyDrop::new(RefCell::new(context)),
            api: std::mem::ManuallyDrop::new(api),
            kind,
            description,
        }))
    }

    pub fn kind(&self) -> GpuApi {
        self.kind
    }

    /// API, device name and driver, for logs and reports.
    pub fn description(&self) -> &str {
        &self.description
    }

    fn make_current(&self) -> Result<(), GpuError> {
        match &*self.api {
            Api::Gl(gl) => gl.make_current(),
            #[cfg(feature = "vulkan")]
            Api::Vulkan(_) => Ok(()),
        }
    }

    pub fn resource_usage(&self) -> GpuResourceUsage {
        let ctx = self.context.borrow();
        let usage = ctx.resource_cache_usage();
        GpuResourceUsage {
            resource_count: usage.resource_count,
            resource_bytes: usage.resource_bytes,
            purgeable_bytes: ctx.resource_cache_purgeable_bytes(),
            budget_bytes: ctx.resource_cache_limit(),
        }
    }

    /// Free every purgeable GPU resource (textures, atlases) now.
    pub fn free_resources(&self) {
        let _ = self.make_current();
        self.context.borrow_mut().free_gpu_resources();
    }

    /// Simulate a lost device (testing): Skia stops issuing commands; later renders fail.
    pub fn abandon_for_testing(&self) {
        let _ = self.make_current();
        self.context.borrow_mut().abandon();
    }

    pub fn is_abandoned(&self) -> bool {
        self.context.borrow_mut().abandoned()
    }
}

impl Drop for GpuDevice {
    fn drop(&mut self) {
        let _ = self.make_current();
        // Skia's context must go before the device/context it uses.
        unsafe {
            {
                let ctx = self.context.get_mut();
                if !ctx.abandoned() {
                    ctx.flush_submit_and_sync_cpu();
                }
            }
            std::mem::ManuallyDrop::drop(&mut self.context);
            std::mem::ManuallyDrop::drop(&mut self.api);
        }
    }
}

// ------------------------------------------------------------------------------------- OpenGL

struct GlDevice {
    context: glutin::api::egl::context::PossiblyCurrentContext,
    // keeps the EGL display alive for the context
    _display: glutin::api::egl::display::Display,
}

impl GlDevice {
    fn new() -> Result<(Self, DirectContext, String), GpuError> {
        use glutin::api::egl::{device::Device, display::Display};
        use glutin::config::{ConfigSurfaceTypes, ConfigTemplateBuilder};
        use glutin::context::ContextAttributesBuilder;
        use glutin::prelude::*;

        let devices: Vec<Device> = Device::query_devices()
            .map_err(|e| err("EGL device enumeration failed (no EGL_EXT_device_enumeration?)", e))?
            .collect();
        if devices.is_empty() {
            return Err(GpuError("no EGL device found".into()));
        }
        let software = |d: &Device| d.extensions().contains("EGL_MESA_device_software");
        let device = match std::env::var("CANVAS_HTML_GPU_DEVICE").ok().and_then(|s| s.parse::<usize>().ok()) {
            Some(i) => devices.get(i).ok_or_else(|| GpuError(format!("EGL device {i} does not exist ({} found)", devices.len())))?,
            None => devices.iter().find(|d| !software(d)).unwrap_or(&devices[0]),
        };
        let device_desc = format!(
            "{} {}{}",
            device.vendor().unwrap_or("?"),
            device.name().unwrap_or("?"),
            if software(device) { " (software)" } else { "" }
        );
        let display = unsafe { Display::with_device(device, None) }.map_err(|e| err("EGL display on device failed", e))?;
        let template = ConfigTemplateBuilder::new()
            .with_surface_type(ConfigSurfaceTypes::empty())
            .with_alpha_size(8)
            .build();
        let config = unsafe { display.find_configs(template) }
            .map_err(|e| err("EGL config query failed", e))?
            .next()
            .ok_or_else(|| GpuError("no EGL config without surfaces".into()))?;
        let attrs = ContextAttributesBuilder::new().build(None);
        let context = unsafe { display.create_context(&config, &attrs) }
            .map_err(|e| err("EGL context creation failed", e))?
            .make_current_surfaceless()
            .map_err(|e| err("EGL surfaceless make-current failed", e))?;

        // The `gl` crate's global function pointers, for the pipelined readback experiment
        // (pixel-pack buffers and fences); Skia keeps its own table.
        gl::load_with(|name| display.get_proc_address(CString::new(name).unwrap().as_c_str()));

        let interface = skia_safe::gpu::gl::Interface::new_load_with(|name| {
            if name == "eglGetCurrentDisplay" {
                return std::ptr::null();
            }
            display.get_proc_address(CString::new(name).unwrap().as_c_str())
        })
        .ok_or_else(|| GpuError("Skia could not load the GL interface".into()))?;
        let ctx = gpu::direct_contexts::make_gl(interface, &ganesh_options()).ok_or_else(|| GpuError("Skia GL context creation failed".into()))?;

        let gl_strings = {
            type GetString = unsafe extern "C" fn(u32) -> *const std::ffi::c_char;
            let f = display.get_proc_address(c"glGetString");
            if f.is_null() {
                String::new()
            } else {
                let get: GetString = unsafe { std::mem::transmute(f) };
                let s = |id: u32| unsafe {
                    let p = get(id);
                    if p.is_null() { String::from("?") } else { std::ffi::CStr::from_ptr(p).to_string_lossy().into_owned() }
                };
                // GL_RENDERER, GL_VERSION
                format!("; GL_RENDERER {}; GL_VERSION {}", s(0x1F01), s(0x1F02))
            }
        };
        let description = format!("ganesh-gl via EGL device: {device_desc}{gl_strings}");
        Ok((GlDevice { context, _display: display }, ctx, description))
    }

    fn make_current(&self) -> Result<(), GpuError> {
        use glutin::prelude::*;
        if self.context.is_current() {
            return Ok(());
        }
        self.context.make_current_surfaceless().map_err(|e| err("EGL make-current failed", e))
    }
}

// ---------------------------------------------------------------------------------- renderer

/// An offscreen GPU render target that paints AnyRender scenes with Skia Ganesh.
/// The surface, the scene cache and the device are reused across frames.
///
/// Field order is drop order: the surface holds a reference to Skia's context, so it must go
/// before the device (the last device reference destroys the context and then the API objects).
pub struct SkiaGpuImageRenderer {
    surface: Surface,
    /// Phase 4A.1 experiment: frames in flight (pipelined readback). Dropped before the device.
    pipeline: Option<GpuPipeline>,
    scene_cache: SkiaSceneCache,
    image_info: ImageInfo,
    device: Rc<GpuDevice>,
}

impl Drop for SkiaGpuImageRenderer {
    fn drop(&mut self) {
        // The surface frees GL objects as it drops: they must go to this renderer's context.
        let _ = self.device.make_current();
    }
}

impl SkiaGpuImageRenderer {
    pub fn new(device: Rc<GpuDevice>, width: u32, height: u32) -> Result<Self, GpuError> {
        // Same process-wide Skia limits as the CPU renderer
        graphics::set_font_cache_count_limit(100);
        graphics::set_typeface_cache_count_limit(100);
        graphics::set_resource_cache_total_bytes_limit(10485760);
        let image_info = ImageInfo::new((width as i32, height as i32), ColorType::RGBA8888, AlphaType::Opaque, None);
        let surface = Self::make_surface(&device, &image_info)?;
        Ok(Self { device, surface, pipeline: None, image_info, scene_cache: SkiaSceneCache::default() })
    }

    fn make_surface(device: &GpuDevice, image_info: &ImageInfo) -> Result<Surface, GpuError> {
        device.make_current()?;
        let mut ctx = device.context.borrow_mut();
        if ctx.abandoned() {
            return Err(GpuError("GPU context is lost (abandoned)".into()));
        }
        gpu::surfaces::render_target(
            &mut ctx,
            gpu::Budgeted::Yes,
            image_info,
            None,
            SurfaceOrigin::TopLeft,
            Some(&SurfaceProps::default()),
            false,
            None,
        )
        .ok_or_else(|| GpuError(format!("GPU surface {}x{} could not be created", image_info.width(), image_info.height())))
    }

    pub fn device(&self) -> &Rc<GpuDevice> {
        &self.device
    }

    pub fn width(&self) -> u32 {
        self.image_info.width() as u32
    }

    pub fn height(&self) -> u32 {
        self.image_info.height() as u32
    }

    /// Paint a frame on the GPU and wait for it. With `out`, read the RGBA pixels back into it
    /// (the same layout as the CPU renderer's output). Without, the frame stays on the GPU.
    pub fn render_timed<F: FnOnce(&mut SkiaScenePainter<'_>)>(
        &mut self,
        draw_fn: F,
        out: Option<&mut [u8]>,
    ) -> Result<GpuFrameTimings, GpuError> {
        self.device.make_current()?;
        if self.device.context.borrow_mut().abandoned() {
            return Err(GpuError("GPU context is lost (abandoned)".into()));
        }
        let mut t = GpuFrameTimings::default();

        let start = Instant::now();
        self.surface.canvas().clear(Color::TRANSPARENT);
        draw_fn(&mut SkiaScenePainter {
            inner: self.surface.canvas(),
            cache: &mut self.scene_cache,
            #[cfg(feature = "headless-graphite")]
            graphite_recorder: None,
        });
        self.scene_cache.next_gen();
        t.record_ns = start.elapsed().as_nanos();

        let start = Instant::now();
        {
            let mut ctx = self.device.context.borrow_mut();
            ctx.flush_surface(&mut self.surface);
            if !ctx.submit(SyncCpu::No) {
                return Err(GpuError("GPU submit failed".into()));
            }
        }
        t.submit_ns = start.elapsed().as_nanos();

        let start = Instant::now();
        {
            let mut ctx = self.device.context.borrow_mut();
            ctx.submit(SyncCpu::Yes);
            if ctx.oomed() {
                return Err(GpuError("GPU out of memory".into()));
            }
        }
        t.wait_ns = start.elapsed().as_nanos();

        if let Some(out) = out {
            let start = Instant::now();
            let row_bytes = self.image_info.min_row_bytes();
            if out.len() != self.image_info.compute_min_byte_size() {
                return Err(GpuError(format!("output buffer is {} bytes, the frame needs {}", out.len(), self.image_info.compute_min_byte_size())));
            }
            if !self.surface.read_pixels(&self.image_info, out, row_bytes, (0, 0)) {
                return Err(GpuError("GPU readback failed".into()));
            }
            t.readback_ns = start.elapsed().as_nanos();
        }
        Ok(t)
    }
}


// ------------------------------------------------------------------- pipelined readback (4A.1)

/// How frames in flight are read back.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PipelineMode {
    /// A ring of `depth` surfaces; frame N is read back with Skia's synchronous `readPixels`
    /// only after later frames were recorded and submitted. Any API.
    Deferred,
    /// OpenGL: right after frame N is submitted, `glReadPixels` into a pixel-pack buffer and a
    /// fence are queued; completing frame N waits for its fence and copies from the mapped buffer.
    /// One surface (GL orders the read before later draws), `depth` buffers.
    GlPbo,
}

struct InFlight {
    index: u64,
    slot: usize,
    submitted: Instant,
    fence: Option<gl::types::GLsync>,
}

/// Frames submitted to the GPU and not yet read back, in submission order.
pub struct GpuPipeline {
    mode: PipelineMode,
    depth: usize,
    surfaces: Vec<Surface>,
    pbos: Vec<u32>,
    inflight: std::collections::VecDeque<InFlight>,
    next_index: u64,
}

impl Drop for GpuPipeline {
    fn drop(&mut self) {
        // GL objects; the renderer made its context current before dropping fields.
        for f in self.inflight.drain(..) {
            if let Some(fence) = f.fence {
                // SAFETY: a fence this pipeline created and has not deleted (completion takes the
                // frame out of `inflight` before deleting its fence); the context is current.
                unsafe { gl::DeleteSync(fence) };
            }
        }
        if !self.pbos.is_empty() {
            // SAFETY: `pbos` holds `len` buffer names generated by this pipeline on the current
            // context; deleting them once, here, ends their lifetime.
            unsafe { gl::DeleteBuffers(self.pbos.len() as i32, self.pbos.as_ptr()) };
        }
    }
}

/// Timings of one completed pipelined frame (nanoseconds).
#[derive(Debug, Clone, Copy, Default)]
pub struct PipelineCompletion {
    pub index: u64,
    /// Waiting for the frame's GPU work (fence) — GlPbo only; Deferred waits inside readback.
    pub wait_ns: u128,
    /// Copy into the caller's memory (GlPbo: from the mapped buffer; Deferred: Skia readPixels).
    pub readback_ns: u128,
    /// From submission to completion.
    pub latency_ns: u128,
}

impl SkiaGpuImageRenderer {
    fn frame_bytes(&self) -> usize {
        self.image_info.compute_min_byte_size()
    }

    /// Starts a pipeline with up to `depth` frames in flight (1..=8). A running one is stopped.
    pub fn pipeline_start(&mut self, mode: PipelineMode, depth: usize) -> Result<(), GpuError> {
        if !(1..=8).contains(&depth) {
            return Err(GpuError(format!("pipeline depth must be 1..=8, got {depth}")));
        }
        self.pipeline_stop();
        self.device.make_current()?;
        if self.device.context.borrow_mut().abandoned() {
            return Err(GpuError("GPU context is lost (abandoned)".into()));
        }
        let mut p = GpuPipeline { mode, depth, surfaces: Vec::new(), pbos: Vec::new(), inflight: Default::default(), next_index: 0 };
        match mode {
            PipelineMode::Deferred => {
                for _ in 0..depth {
                    p.surfaces.push(Self::make_surface(&self.device, &self.image_info)?);
                }
            }
            PipelineMode::GlPbo => {
                if self.device.kind() != GpuApi::Gl {
                    return Err(GpuError("pipeline mode \"pbo\" needs the GL backend".into()));
                }
                p.pbos = vec![0; depth];
                // SAFETY: GenBuffers writes exactly `depth` names into `pbos` (len `depth`); each
                // buffer is then sized to one frame. The renderer's GL context is current.
                unsafe {
                    gl::GenBuffers(depth as i32, p.pbos.as_mut_ptr());
                    for &b in &p.pbos {
                        gl::BindBuffer(gl::PIXEL_PACK_BUFFER, b);
                        gl::BufferData(gl::PIXEL_PACK_BUFFER, self.frame_bytes() as isize, std::ptr::null(), gl::STREAM_READ);
                    }
                    gl::BindBuffer(gl::PIXEL_PACK_BUFFER, 0);
                    if gl::GetError() != gl::NO_ERROR {
                        gl::DeleteBuffers(depth as i32, p.pbos.as_ptr());
                        return Err(GpuError("could not allocate pixel-pack buffers".into()));
                    }
                }
                self.device.context.borrow_mut().reset(None);
            }
        }
        self.pipeline = Some(p);
        Ok(())
    }

    pub fn pipeline_in_flight(&self) -> usize {
        self.pipeline.as_ref().map_or(0, |p| p.inflight.len())
    }

    /// Records the frame and submits it without waiting. Fails when `depth` frames are already in
    /// flight (complete one first) — the pipeline never grows past its depth.
    pub fn pipeline_submit<F: FnOnce(&mut SkiaScenePainter<'_>)>(&mut self, draw_fn: F) -> Result<(u64, GpuFrameTimings), GpuError> {
        self.device.make_current()?;
        if self.device.context.borrow_mut().abandoned() {
            return Err(GpuError("GPU context is lost (abandoned)".into()));
        }
        let Some(p) = self.pipeline.as_mut() else {
            return Err(GpuError("no pipeline: call pipeline_start first".into()));
        };
        if p.inflight.len() >= p.depth {
            return Err(GpuError(format!("pipeline full ({} frames in flight): complete a frame first", p.depth)));
        }
        let index = p.next_index;
        let slot = (index % p.depth as u64) as usize;
        let mut t = GpuFrameTimings::default();
        let surface = match p.mode {
            PipelineMode::Deferred => &mut p.surfaces[slot],
            PipelineMode::GlPbo => &mut self.surface,
        };
        let start = Instant::now();
        surface.canvas().clear(Color::TRANSPARENT);
        draw_fn(&mut SkiaScenePainter {
            inner: surface.canvas(),
            cache: &mut self.scene_cache,
            #[cfg(feature = "headless-graphite")]
            graphite_recorder: None,
        });
        self.scene_cache.next_gen();
        t.record_ns = start.elapsed().as_nanos();

        let start = Instant::now();
        let mut fence = None;
        {
            let mut ctx = self.device.context.borrow_mut();
            ctx.flush_surface(surface);
            if !ctx.submit(SyncCpu::No) {
                return Err(GpuError("GPU submit failed".into()));
            }
            if p.mode == PipelineMode::GlPbo {
                let fbo = gpu::surfaces::get_backend_render_target(surface, skia_safe::surface::BackendHandleAccess::FlushRead)
                    .and_then(|rt| rt.gl_framebuffer_info())
                    .ok_or_else(|| GpuError("surface has no GL framebuffer".into()))?
                    .fboid;
                let (w, h) = (self.image_info.width(), self.image_info.height());
                // SAFETY: raw GL on the renderer's current context. With a PIXEL_PACK buffer bound,
                // ReadPixels' pointer argument is an offset (0) into that buffer, which holds one
                // `w * h * 4` frame, so no client memory is written. Skia's GL state is reset after.
                unsafe {
                    gl::BindFramebuffer(gl::READ_FRAMEBUFFER, fbo);
                    gl::BindBuffer(gl::PIXEL_PACK_BUFFER, p.pbos[slot]);
                    gl::PixelStorei(gl::PACK_ALIGNMENT, 1);
                    gl::PixelStorei(gl::PACK_ROW_LENGTH, 0);
                    gl::ReadPixels(0, 0, w, h, gl::RGBA, gl::UNSIGNED_BYTE, std::ptr::null_mut());
                    let f = gl::FenceSync(gl::SYNC_GPU_COMMANDS_COMPLETE, 0);
                    gl::BindBuffer(gl::PIXEL_PACK_BUFFER, 0);
                    gl::Flush();
                    if f.is_null() || gl::GetError() != gl::NO_ERROR {
                        if !f.is_null() {
                            gl::DeleteSync(f);
                        }
                        ctx.reset(None);
                        return Err(GpuError("queuing the GL readback failed".into()));
                    }
                    fence = Some(f);
                }
                // Skia caches GL state; it must not trust it after our calls.
                ctx.reset(None);
            }
        }
        t.submit_ns = start.elapsed().as_nanos();
        p.inflight.push_back(InFlight { index, slot, submitted: Instant::now(), fence });
        p.next_index += 1;
        Ok((index, t))
    }

    /// Completes the oldest frame in flight into `out` (exactly one frame). The frame is
    /// consumed even on error.
    pub fn pipeline_complete(&mut self, out: &mut [u8]) -> Result<PipelineCompletion, GpuError> {
        if out.len() != self.frame_bytes() {
            return Err(GpuError(format!("output buffer is {} bytes, the frame needs {}", out.len(), self.frame_bytes())));
        }
        self.device.make_current()?;
        let Some(p) = self.pipeline.as_mut() else {
            return Err(GpuError("no pipeline: call pipeline_start first".into()));
        };
        let Some(f) = p.inflight.pop_front() else {
            return Err(GpuError("no frame in flight".into()));
        };
        let mut c = PipelineCompletion { index: f.index, ..Default::default() };
        let abandoned = self.device.context.borrow_mut().abandoned();
        match p.mode {
            PipelineMode::Deferred => {
                if abandoned {
                    return Err(GpuError("GPU context is lost (abandoned)".into()));
                }
                let start = Instant::now();
                let row_bytes = self.image_info.min_row_bytes();
                if !p.surfaces[f.slot].read_pixels(&self.image_info, out, row_bytes, (0, 0)) {
                    return Err(GpuError("GPU readback failed".into()));
                }
                c.readback_ns = start.elapsed().as_nanos();
            }
            PipelineMode::GlPbo => {
                let fence = f.fence.expect("GlPbo frames carry a fence");
                let start = Instant::now();
                // SAFETY: `fence` was created by this pipeline for this frame and is deleted once,
                // here (the frame has left `inflight`); the context is current.
                let status = unsafe { gl::ClientWaitSync(fence, gl::SYNC_FLUSH_COMMANDS_BIT, 10_000_000_000) };
                unsafe { gl::DeleteSync(fence) };
                c.wait_ns = start.elapsed().as_nanos();
                if abandoned {
                    return Err(GpuError("GPU context is lost (abandoned)".into()));
                }
                if status != gl::ALREADY_SIGNALED && status != gl::CONDITION_SATISFIED {
                    return Err(GpuError(format!("waiting for the GL readback failed (status {status:#x})")));
                }
                let start = Instant::now();
                // SAFETY: the fence signalled, so the GPU finished writing this PBO. MapBufferRange
                // maps `out.len()` bytes (the PBO's size: one frame, checked above against
                // `out`) for reading; the copy reads that many bytes from the mapping and writes
                // that many into `out`, an exclusive slice of the same length, and the regions
                // cannot overlap (GL mapping vs. caller memory). The mapping ends at UnmapBuffer.
                let ok = unsafe {
                    gl::BindBuffer(gl::PIXEL_PACK_BUFFER, p.pbos[f.slot]);
                    let src = gl::MapBufferRange(gl::PIXEL_PACK_BUFFER, 0, out.len() as isize, gl::MAP_READ_BIT);
                    let ok = !src.is_null();
                    if ok {
                        std::ptr::copy_nonoverlapping(src as *const u8, out.as_mut_ptr(), out.len());
                        gl::UnmapBuffer(gl::PIXEL_PACK_BUFFER);
                    }
                    gl::BindBuffer(gl::PIXEL_PACK_BUFFER, 0);
                    ok
                };
                self.device.context.borrow_mut().reset(None);
                if !ok {
                    return Err(GpuError("mapping the GL readback buffer failed".into()));
                }
                c.readback_ns = start.elapsed().as_nanos();
            }
        }
        c.latency_ns = f.submitted.elapsed().as_nanos();
        Ok(c)
    }

    /// Cancels the pipeline: waits for the GPU (unless the context is lost), discards frames in
    /// flight and frees the pipeline's surfaces and buffers. Returns the frames discarded.
    pub fn pipeline_stop(&mut self) -> usize {
        let Some(p) = self.pipeline.take() else { return 0 };
        let n = p.inflight.len();
        let _ = self.device.make_current();
        {
            let mut ctx = self.device.context.borrow_mut();
            if !ctx.abandoned() {
                ctx.flush_submit_and_sync_cpu();
            }
        }
        drop(p);
        n
    }
}
