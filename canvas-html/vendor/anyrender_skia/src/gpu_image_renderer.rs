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
                        gpu::direct_contexts::make_vulkan(backend, &gpu::ContextOptions::default())
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

        let interface = skia_safe::gpu::gl::Interface::new_load_with(|name| {
            if name == "eglGetCurrentDisplay" {
                return std::ptr::null();
            }
            display.get_proc_address(CString::new(name).unwrap().as_c_str())
        })
        .ok_or_else(|| GpuError("Skia could not load the GL interface".into()))?;
        let ctx = gpu::direct_contexts::make_gl(interface, None).ok_or_else(|| GpuError("Skia GL context creation failed".into()))?;

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
        Ok(Self { device, surface, image_info, scene_cache: SkiaSceneCache::default() })
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
        out: Option<&mut Vec<u8>>,
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
            out.resize(self.image_info.compute_min_byte_size(), 0);
            if !self.surface.read_pixels(&self.image_info, &mut out[..], row_bytes, (0, 0)) {
                return Err(GpuError("GPU readback failed".into()));
            }
            t.readback_ns = start.elapsed().as_nanos();
        }
        Ok(t)
    }
}

