//! Shared by the headless GPU renderers (Ganesh: `gpu_image_renderer`, Graphite:
//! `graphite_image_renderer`): the error type and a headless Vulkan device.

#[derive(Debug, Clone)]
pub struct GpuError(pub String);

impl std::fmt::Display for GpuError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl std::error::Error for GpuError {}

pub(crate) fn err(context: &str, e: impl std::fmt::Display) -> GpuError {
    GpuError(format!("{context}: {e}"))
}

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

#[cfg(feature = "vulkan")]
pub(crate) use vk::VkDevice;

#[cfg(feature = "vulkan")]
mod vk {
    use super::{GpuError, err};
    use ash::vk::{self as avk, Handle};
    use skia_safe::gpu::vk::{BackendContext, GetProcOf, Version};
    use std::ffi::CStr;

    /// A Vulkan instance and logical device with one graphics queue; no surface extensions.
    /// `CANVAS_HTML_GPU_DEVICE` (index) selects a device; otherwise a non-CPU device is preferred.
    pub(crate) struct VkDevice {
        entry: ash::Entry,
        instance: ash::Instance,
        physical: avk::PhysicalDevice,
        device: ash::Device,
        queue: avk::Queue,
        queue_family: u32,
        pub(crate) description: String,
    }

    impl VkDevice {
        /// `instance_api`: `None` requests the highest version the loader supports.
        pub(crate) fn new(instance_api: Option<u32>, label: &str) -> Result<Self, GpuError> {
            let entry = unsafe { ash::Entry::load() }.map_err(|e| err("Vulkan loader not found", e))?;
            let api = instance_api.unwrap_or_else(|| {
                unsafe { entry.try_enumerate_instance_version() }.ok().flatten().unwrap_or(avk::API_VERSION_1_1)
            });
            let app = avk::ApplicationInfo::default().application_name(c"canvas-html").api_version(api);
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
            let device = match unsafe { instance.create_device(physical, &avk::DeviceCreateInfo::default().queue_create_infos(&queue_info), None) } {
                Ok(d) => d,
                Err(e) => {
                    unsafe { instance.destroy_instance(None) };
                    return Err(err("vkCreateDevice failed", e));
                }
            };
            let queue = unsafe { device.get_device_queue(queue_family, 0) };
            let name = unsafe { CStr::from_ptr(props.device_name.as_ptr()) }.to_string_lossy().into_owned();
            let description = format!(
                "{label}: {name} ({:?}), driver {:#x}, API {}.{}.{}",
                props.device_type,
                props.driver_version,
                avk::api_version_major(props.api_version),
                avk::api_version_minor(props.api_version),
                avk::api_version_patch(props.api_version)
            );
            Ok(VkDevice { entry, instance, physical, device, queue, queue_family, description })
        }

        /// Calls `f` with a Skia backend context for this device. Skia resolves the Vulkan
        /// functions it needs while creating its context, so the loader closure (which borrows
        /// the entry and the instance) only lives for this call.
        pub(crate) fn with_backend<R>(&self, max_api: Option<Version>, f: impl FnOnce(&BackendContext) -> R) -> R {
            let get_proc = |gpo: GetProcOf| unsafe {
                match gpo {
                    GetProcOf::Instance(i, name) => self.entry.get_instance_proc_addr(avk::Instance::from_raw(i as _), name),
                    GetProcOf::Device(d, name) => (self.instance.fp_v1_0().get_device_proc_addr)(avk::Device::from_raw(d as _), name),
                }
                .map(|f| f as _)
                .unwrap_or(std::ptr::null())
            };
            let backend = unsafe {
                BackendContext::new_builder(
                    self.instance.handle().as_raw() as _,
                    self.physical.as_raw() as _,
                    self.device.handle().as_raw() as _,
                    (self.queue.as_raw() as _, self.queue_family as usize),
                    &get_proc,
                    max_api,
                )
                .build()
            };
            f(&backend)
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
