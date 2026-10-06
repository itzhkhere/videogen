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

#[derive(Debug, Clone)]
pub struct GpuError(pub String);

impl std::fmt::Display for GpuError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl std::error::Error for GpuError {}

fn err(context: &str, e: impl std::fmt::Display) -> GpuError {
    GpuError(format!("{context}: {e}"))
}

enum Api {
    Gl(GlDevice),
    #[cfg(feature = "vulkan")]
    Vulkan(#[allow(dead_code)] vk::VkDevice), // held for its Drop
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
                let (vk, context, description) = vk::VkDevice::new()?;
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

// ------------------------------------------------------------------------------------- Vulkan

#[cfg(feature = "vulkan")]
mod vk {
    use super::{GpuError, err};
    use ash::vk::{self as avk, Handle};
    use skia_safe::gpu::{
        ContextOptions, DirectContext, direct_contexts,
        vk::{BackendContext, GetProcOf, Version},
    };
    use std::ffi::CStr;

    pub(super) struct VkDevice {
        _entry: ash::Entry,
        instance: ash::Instance,
        device: ash::Device,
    }

    impl VkDevice {
        pub(super) fn new() -> Result<(Self, DirectContext, String), GpuError> {
            let entry = unsafe { ash::Entry::load() }.map_err(|e| err("Vulkan loader not found", e))?;
            let app = avk::ApplicationInfo::default()
                .application_name(c"canvas-html")
                .api_version(avk::make_api_version(0, 1, 1, 0));
            let instance = unsafe { entry.create_instance(&avk::InstanceCreateInfo::default().application_info(&app), None) }
                .map_err(|e| err("vkCreateInstance failed", e))?;
            let devices = unsafe { instance.enumerate_physical_devices() }.map_err(|e| err("no Vulkan devices", e))?;
            let candidates: Vec<(avk::PhysicalDevice, u32, avk::PhysicalDeviceProperties)> = devices
                .into_iter()
                .filter_map(|pd| {
                    let props = unsafe { instance.get_physical_device_properties(pd) };
                    let q = unsafe { instance.get_physical_device_queue_family_properties(pd) }
                        .iter()
                        .position(|q| q.queue_flags.contains(avk::QueueFlags::GRAPHICS))?;
                    Some((pd, q as u32, props))
                })
                .collect();
            if candidates.is_empty() {
                unsafe { instance.destroy_instance(None) };
                return Err(GpuError("no Vulkan device with a graphics queue".into()));
            }
            let pick = match std::env::var("CANVAS_HTML_GPU_DEVICE").ok().and_then(|s| s.parse::<usize>().ok()) {
                Some(i) if i < candidates.len() => i,
                Some(i) => {
                    unsafe { instance.destroy_instance(None) };
                    return Err(GpuError(format!("Vulkan device {i} does not exist")));
                }
                None => candidates.iter().position(|c| c.2.device_type != avk::PhysicalDeviceType::CPU).unwrap_or(0),
            };
            let (physical, queue_family, props) = candidates[pick];
            let priorities = [1.0f32];
            let queue_info = [avk::DeviceQueueCreateInfo::default().queue_family_index(queue_family).queue_priorities(&priorities)];
            let device = unsafe { instance.create_device(physical, &avk::DeviceCreateInfo::default().queue_create_infos(&queue_info), None) }
                .map_err(|e| err("vkCreateDevice failed", e))?;
            let queue = unsafe { device.get_device_queue(queue_family, 0) };

            // Skia resolves the Vulkan functions it needs while creating the context, so the
            // loader closure (which borrows `entry` and `instance`) ends with this block.
            let ctx = {
                let get_proc = |gpo: GetProcOf| unsafe {
                    match gpo {
                        GetProcOf::Instance(i, name) => entry.get_instance_proc_addr(avk::Instance::from_raw(i as _), name),
                        GetProcOf::Device(d, name) => (instance.fp_v1_0().get_device_proc_addr)(avk::Device::from_raw(d as _), name),
                    }
                    .map(|f| f as _)
                    .unwrap_or(std::ptr::null())
                };
                let backend = unsafe {
                    BackendContext::new_builder(
                        instance.handle().as_raw() as _,
                        physical.as_raw() as _,
                        device.handle().as_raw() as _,
                        (queue.as_raw() as _, queue_family as usize),
                        &get_proc,
                        Some(Version::new(1, 1, 0)),
                    )
                    .build()
                };
                direct_contexts::make_vulkan(&backend, &ContextOptions::default())
                    .ok_or_else(|| GpuError("Skia Vulkan context creation failed".into()))
            };
            let ctx = match ctx {
                Ok(c) => c,
                Err(e) => {
                    unsafe {
                        device.destroy_device(None);
                        instance.destroy_instance(None);
                    }
                    return Err(e);
                }
            };
            let name = unsafe { CStr::from_ptr(props.device_name.as_ptr()) }.to_string_lossy().into_owned();
            let description = format!(
                "ganesh-vulkan: {name} ({:?}), driver {:#x}, API {}.{}.{}",
                props.device_type,
                props.driver_version,
                avk::api_version_major(props.api_version),
                avk::api_version_minor(props.api_version),
                avk::api_version_patch(props.api_version)
            );
            Ok((VkDevice { _entry: entry, instance, device }, ctx, description))
        }
    }

    impl Drop for VkDevice {
        fn drop(&mut self) {
            unsafe {
                let _ = self.device.device_wait_idle();
                self.device.destroy_device(None);
                self.instance.destroy_instance(None);
            }
        }
    }
}

// ---------------------------------------------------------------------------------- renderer

/// Where one GPU frame spends its time (nanoseconds, measured on the calling thread).
#[derive(Debug, Clone, Copy, Default)]
pub struct GpuFrameTimings {
    /// Painting into the canvas: AnyRender commands recorded into Skia's GPU op lists.
    pub record_ns: u128,
    /// `flush` + `submit`: Skia turns its ops into API commands and hands them to the driver.
    pub submit_ns: u128,
    /// Waiting for the GPU to finish the frame (`submit(SyncCpu::Yes)` after the flush).
    pub wait_ns: u128,
    /// GPU → CPU copy of the pixels (0 when not read back).
    pub readback_ns: u128,
}

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
        draw_fn(&mut SkiaScenePainter { inner: self.surface.canvas(), cache: &mut self.scene_cache });
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

