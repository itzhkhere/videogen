#!/bin/bash
# Prepares a Colab GPU VM for the Phase 4A.3 L4 subset (run as root in /content).
# Headless NVIDIA: EGL via libglvnd + libEGL_nvidia, Vulkan via the loader + NVIDIA ICD.
set -u
cd /content
echo "== system"; . /etc/os-release; echo "$PRETTY_NAME"; ldd --version | head -1; nproc; free -g | head -2
echo "== nvidia-smi"; nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv
NV=$(dirname "$(ldconfig -p | grep -m1 'libnvidia-ml.so.1' | awk '{print $NF}')" 2>/dev/null)
for d in /usr/lib64-nvidia /usr/lib/x86_64-linux-gnu; do [ -e "$d/libEGL_nvidia.so.0" ] && NV=$d; done
echo "NVIDIA libs: $NV"; ls "$NV" | grep -E "EGL_nvidia|GLX_nvidia|nvidia-glcore|nvidia-eglcore|nvidia-glsi" || true
echo "== packages"
DEBIAN_FRONTEND=noninteractive apt-get -qq update >/dev/null 2>&1
DEBIAN_FRONTEND=noninteractive apt-get -qq install -y libegl1 libvulkan1 vulkan-tools libfontconfig1 >/dev/null 2>&1; echo "apt exit $?"
# EGL vendor (libglvnd) and Vulkan ICD manifests for the NVIDIA driver, if the image lacks them
mkdir -p /usr/share/glvnd/egl_vendor.d /usr/share/vulkan/icd.d
ls /usr/share/glvnd/egl_vendor.d/ /etc/glvnd/egl_vendor.d/ 2>/dev/null
if ! grep -rqs EGL_nvidia /usr/share/glvnd/egl_vendor.d /etc/glvnd/egl_vendor.d; then
  printf '{"file_format_version":"1.0.0","ICD":{"library_path":"%s/libEGL_nvidia.so.0"}}\n' "$NV" > /usr/share/glvnd/egl_vendor.d/10_nvidia.json
  echo "wrote EGL vendor manifest"
fi
if ! grep -rqs GLX_nvidia /usr/share/vulkan/icd.d /etc/vulkan/icd.d; then
  printf '{"file_format_version":"1.0.0","ICD":{"library_path":"%s/libGLX_nvidia.so.0","api_version":"1.3.0"}}\n' "$NV" > /usr/share/vulkan/icd.d/nvidia_icd.json
  echo "wrote Vulkan ICD manifest"
fi
echo "$NV" > /etc/ld.so.conf.d/zz-nvidia.conf; ldconfig
echo "== vulkaninfo"; vulkaninfo --summary 2>&1 | grep -E "deviceName|driverName|driverInfo|apiVersion|ERROR" | head
echo "== node"
if [ ! -x /content/node24/bin/node ]; then
  curl -fsSL https://nodejs.org/dist/v24.19.0/node-v24.19.0-linux-x64.tar.xz -o /tmp/node.tar.xz && mkdir -p /content/node24 && tar -xJf /tmp/node.tar.xz -C /content/node24 --strip-components=1
fi
/content/node24/bin/node --version
echo "== bundle"
mkdir -p /content/engine && tar -xzf /content/bundle.tgz -C /content/engine && ls /content/engine
