**colab-l4**: Ubuntu 24.04.4 LTS, Intel(R) Xeon(R) CPU @ 2.20GHz ×12, 53 GiB, Node v24.19.0, GPU NVIDIA L4, 580.82.07, 23034 MiB; gpu-gl: ganesh-gl via EGL device: NVIDIA NVIDIA L4; GL_RENDERER NVIDIA L4/PCIe/SSE2; GL_VERSION 3.3.0 NVIDIA 580.82.07; gpu-vulkan: ganesh-vulkan: NVIDIA L4 (DISCRETE_GPU), driver 0x911481c0, API 1.4.312

### Raw RGBA transport — gpu-gl (median ms per frame, wall time around the JS call)
| scene | res | old-render | render | clone | transfer | pool | pool-yield | into |
|---|---|---|---|---|---|---|---|---|
| A | 1080p | 6.67 | 6.12 | 6.80 | 6.11 | 6.13 | 3.49 | 2.40 |
| A | 4K | 27.86 | 23.16 | 27.75 | 23.09 | 23.04 | 7.70 | 8.03 |
| E | 1080p | 34.58 | 33.57 | 34.56 | 34.46 | 33.60 | 30.96 | 29.63 |
| E | 4K | 72.10 | 56.53 | 72.11 | 68.78 | 69.82 | 54.29 | 54.34 |
| G1000 | 1080p | 82.11 | 78.04 | 78.81 | 80.34 | 82.52 | 82.16 | 81.12 |
| G1000 | 4K | 125.28 | 106.78 | 109.38 | 109.41 | 110.59 | 106.31 | 100.60 |

Breakdown (median ms): paint (CPU raster or GPU record) · readback · alloc (frame memory) · copy (clone) · buffer (JS Buffer creation in the call)
| scene | res | mode | paint | gpuSubmit | gpuWait | readback | alloc | copy | buffer | rust total | wall |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A | 1080p | old-timed | 0.14 | 0.23 | 0.02 | 1.72 | – | 4.53 | (in copy) | 6.65 | 6.73 |
| A | 4K | old-timed | 0.17 | 0.21 | 0.04 | 6.79 | – | 20.17 | (in copy) | 27.48 | 27.95 |
| E | 1080p | old-timed | 19.54 | 8.29 | 0.08 | 1.75 | – | 4.72 | (in copy) | 34.53 | 34.75 |
| E | 4K | old-timed | 31.86 | 11.26 | 0.45 | 7.00 | – | 20.73 | (in copy) | 71.33 | 72.34 |
| G1000 | 1080p | old-timed | 17.03 | 56.92 | 0.20 | 1.92 | – | 4.65 | (in copy) | 82.59 | 82.75 |
| G1000 | 4K | old-timed | 17.23 | 61.45 | 15.07 | 10.35 | – | 20.45 | (in copy) | 125.66 | 126.42 |
| A | 1080p | clone | 0.14 | 0.22 | 0.02 | 1.75 | 0.00 | 4.54 | 0.02 | 6.74 | 6.80 |
| A | 1080p | transfer | 0.13 | 0.19 | 0.02 | 5.66 | 0.01 | – | 0.02 | 6.06 | 6.11 |
| A | 1080p | pool | 0.13 | 0.21 | 0.02 | 5.67 | 0.01 | – | 0.02 | 6.08 | 6.13 |
| A | 1080p | into | 0.12 | 0.18 | 0.02 | 2.01 | – | – | – | 2.36 | 2.40 |
| A | 4K | clone | 0.17 | 0.22 | 0.05 | 6.79 | 0.00 | 20.07 | 0.43 | 27.67 | 27.75 |
| A | 4K | transfer | 0.17 | 0.21 | 0.04 | 22.13 | 0.02 | – | 0.43 | 23.01 | 23.09 |
| A | 4K | pool | 0.16 | 0.21 | 0.05 | 22.10 | 0.02 | – | 0.42 | 22.96 | 23.04 |
| A | 4K | into | 0.14 | 0.18 | 0.04 | 7.57 | – | – | – | 7.97 | 8.03 |
| E | 1080p | clone | 19.11 | 8.53 | 0.09 | 1.83 | 0.00 | 4.66 | 0.03 | 34.48 | 34.56 |
| E | 1080p | transfer | 19.20 | 8.57 | 0.10 | 1.90 | 4.04 | – | 0.04 | 34.39 | 34.46 |
| E | 1080p | pool | 18.96 | 8.39 | 0.12 | 1.85 | 4.04 | – | 0.03 | 33.53 | 33.60 |
| E | 1080p | into | 18.89 | 8.34 | 0.13 | 1.86 | – | – | – | 29.55 | 29.63 |
| E | 4K | clone | 32.38 | 11.14 | 0.64 | 7.00 | 0.00 | 20.28 | 0.52 | 72.03 | 72.11 |
| E | 4K | transfer | 32.75 | 11.27 | 0.97 | 6.99 | 15.94 | – | 0.62 | 68.69 | 68.78 |
| E | 4K | pool | 32.72 | 11.19 | 2.13 | 7.01 | 16.01 | – | 0.64 | 69.74 | 69.82 |
| E | 4K | into | 32.18 | 11.27 | 3.53 | 7.02 | – | – | – | 54.25 | 54.34 |
| G1000 | 1080p | clone | 17.24 | 56.39 | 0.29 | 1.88 | 0.00 | 1.64 | 0.03 | 78.71 | 78.81 |
| G1000 | 1080p | transfer | 17.19 | 56.93 | 0.58 | 2.79 | 1.16 | – | 0.03 | 80.27 | 80.34 |
| G1000 | 1080p | pool | 17.24 | 58.60 | 1.50 | 2.79 | 1.17 | – | 0.04 | 82.44 | 82.52 |
| G1000 | 1080p | into | 17.13 | 58.52 | 1.58 | 2.80 | – | – | – | 81.04 | 81.12 |
| G1000 | 4K | clone | 17.37 | 61.25 | 12.45 | 10.36 | 0.00 | 6.29 | 0.54 | 109.29 | 109.38 |
| G1000 | 4K | transfer | 17.44 | 61.46 | 12.47 | 10.36 | 4.66 | – | 0.51 | 109.33 | 109.41 |
| G1000 | 4K | pool | 17.45 | 60.90 | 15.13 | 10.36 | 4.68 | – | 0.53 | 110.51 | 110.59 |
| G1000 | 4K | into | 17.29 | 61.32 | 10.64 | 10.36 | – | – | – | 100.51 | 100.60 |

### Raw RGBA transport — gpu-vulkan (median ms per frame, wall time around the JS call)
| scene | res | old-render | render | clone | transfer | pool | pool-yield | into |
|---|---|---|---|---|---|---|---|---|
| A | 1080p | 6.70 | 5.72 | 7.00 | 5.85 | 5.88 | 3.49 | 2.39 |
| A | 4K | 30.04 | 23.66 | 29.93 | 23.68 | 23.73 | 9.62 | 9.43 |
| E | 1080p | 27.43 | 24.91 | 27.37 | 27.04 | 26.62 | 23.50 | 22.40 |
| E | 4K | 84.56 | 74.98 | 85.42 | 81.57 | 83.93 | 68.49 | 69.49 |
| G1000 | 1080p | 69.86 | 65.50 | 65.98 | 65.30 | 68.97 | 69.68 | 71.42 |
| G1000 | 4K | 94.75 | 79.19 | 81.35 | 79.37 | 80.51 | 76.03 | 76.88 |

Breakdown (median ms): paint (CPU raster or GPU record) · readback · alloc (frame memory) · copy (clone) · buffer (JS Buffer creation in the call)
| scene | res | mode | paint | gpuSubmit | gpuWait | readback | alloc | copy | buffer | rust total | wall |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A | 1080p | old-timed | 0.16 | 0.17 | 0.09 | 1.98 | – | 4.34 | (in copy) | 6.74 | 6.84 |
| A | 4K | old-timed | 0.18 | 0.22 | 0.10 | 8.77 | – | 20.27 | (in copy) | 29.62 | 30.10 |
| E | 1080p | old-timed | 15.16 | 4.95 | 0.22 | 2.32 | – | 4.39 | (in copy) | 26.98 | 27.09 |
| E | 4K | old-timed | 29.14 | 11.20 | 2.46 | 20.37 | – | 20.58 | (in copy) | 83.91 | 84.72 |
| G1000 | 1080p | old-timed | 17.29 | 43.33 | 0.45 | 2.38 | – | 4.55 | (in copy) | 69.11 | 69.23 |
| G1000 | 4K | old-timed | 17.45 | 46.20 | 0.13 | 8.86 | – | 20.51 | (in copy) | 94.78 | 95.51 |
| A | 1080p | clone | 0.16 | 0.17 | 0.14 | 2.06 | 0.00 | 4.26 | 0.03 | 6.91 | 7.00 |
| A | 1080p | transfer | 0.14 | 0.14 | 0.13 | 5.30 | 0.02 | – | 0.02 | 5.79 | 5.85 |
| A | 1080p | pool | 0.14 | 0.14 | 0.13 | 5.32 | 0.02 | – | 0.02 | 5.81 | 5.88 |
| A | 1080p | into | 0.13 | 0.12 | 0.12 | 1.95 | – | – | – | 2.34 | 2.39 |
| A | 4K | clone | 0.17 | 0.22 | 0.14 | 8.70 | 0.00 | 20.11 | 0.44 | 29.84 | 29.93 |
| A | 4K | transfer | 0.17 | 0.21 | 0.14 | 22.61 | 0.02 | – | 0.41 | 23.59 | 23.68 |
| A | 4K | pool | 0.17 | 0.22 | 0.14 | 22.63 | 0.02 | – | 0.42 | 23.65 | 23.73 |
| A | 4K | into | 0.14 | 0.17 | 0.12 | 8.90 | – | – | – | 9.37 | 9.43 |
| E | 1080p | clone | 14.90 | 5.01 | 0.04 | 2.31 | 0.00 | 4.55 | 0.04 | 27.26 | 27.37 |
| E | 1080p | transfer | 14.95 | 4.88 | 0.22 | 2.47 | 4.05 | – | 0.04 | 26.95 | 27.04 |
| E | 1080p | pool | 14.69 | 4.75 | 0.23 | 2.47 | 4.05 | – | 0.03 | 26.54 | 26.62 |
| E | 1080p | into | 14.73 | 4.83 | 0.16 | 2.42 | – | – | – | 22.32 | 22.40 |
| E | 4K | clone | 29.77 | 11.24 | 2.33 | 20.24 | 0.00 | 20.54 | 0.56 | 85.33 | 85.42 |
| E | 4K | transfer | 29.75 | 11.28 | 2.50 | 20.39 | 16.19 | – | 0.71 | 81.45 | 81.57 |
| E | 4K | pool | 29.64 | 11.37 | 4.84 | 20.67 | 16.15 | – | 0.70 | 83.82 | 83.93 |
| E | 4K | into | 30.02 | 11.64 | 6.37 | 20.96 | – | – | – | 69.39 | 69.49 |
| G1000 | 1080p | clone | 17.20 | 43.07 | 0.47 | 2.48 | 0.00 | 1.46 | 0.04 | 65.90 | 65.98 |
| G1000 | 1080p | transfer | 17.20 | 42.95 | 0.46 | 2.46 | 1.18 | – | 0.03 | 65.23 | 65.30 |
| G1000 | 1080p | pool | 17.28 | 43.36 | 1.34 | 4.36 | 1.18 | – | 0.03 | 68.86 | 68.97 |
| G1000 | 1080p | into | 17.15 | 43.23 | 4.78 | 4.67 | – | – | – | 71.33 | 71.42 |
| G1000 | 4K | clone | 17.43 | 46.83 | 0.14 | 8.89 | 0.00 | 6.34 | 0.53 | 81.26 | 81.35 |
| G1000 | 4K | transfer | 17.50 | 46.33 | 0.13 | 8.84 | 4.71 | – | 0.49 | 79.27 | 79.37 |
| G1000 | 4K | pool | 17.48 | 46.77 | 0.15 | 9.08 | 4.73 | – | 0.53 | 80.40 | 80.51 |
| G1000 | 4K | into | 17.31 | 46.56 | 2.92 | 8.88 | – | – | – | 76.79 | 76.88 |

### Animated sequences, 1080p (frame = seek + output call)
| scene | frames | turns | backend | mode | avg | median | p95 | total s | fps | peak RSS MiB |
|---|---|---|---|---|---|---|---|---|---|---|
| effects | 120 | no | gpu-gl | old-render | 12.24 | 11.73 | 14.25 | 1.47 | 81.6 | 1174 |
| effects | 120 | no | gpu-gl | render | 11.41 | 10.88 | 13.24 | 1.37 | 87.5 | 1109 |
| effects | 120 | no | gpu-gl | render-clone | 12.16 | 11.65 | 14.17 | 1.46 | 82.1 | 1117 |
| effects | 120 | no | gpu-gl | into | 7.24 | 6.81 | 9.03 | 0.87 | 137.9 | 238 |
| effects | 120 | no | gpu-gl | into-ring3 | 7.31 | 6.80 | 9.08 | 0.88 | 136.5 | 254 |
| effects | 120 | yes | gpu-gl | old-render | 10.02 | 8.90 | 13.28 | 1.24 | 96.7 | 316 |
| effects | 120 | yes | gpu-gl | render | 9.42 | 8.58 | 12.68 | 1.17 | 102.6 | 309 |
| effects | 120 | yes | gpu-gl | render-clone | 9.67 | 8.87 | 12.06 | 1.19 | 100.7 | 318 |
| effects | 120 | yes | gpu-gl | into | 7.24 | 6.81 | 9.11 | 0.88 | 136.7 | 238 |
| effects | 120 | yes | gpu-gl | into-ring3 | 7.32 | 6.84 | 9.29 | 0.89 | 135.3 | 254 |
| gsap | 120 | no | gpu-gl | old-render | 9.30 | 8.84 | 12.25 | 1.12 | 107.3 | 1169 |
| gsap | 120 | no | gpu-gl | render | 8.41 | 7.91 | 11.79 | 1.01 | 118.7 | 1107 |
| gsap | 120 | no | gpu-gl | render-clone | 9.17 | 8.55 | 12.49 | 1.10 | 108.8 | 1115 |
| gsap | 120 | no | gpu-gl | into | 4.33 | 3.82 | 7.85 | 0.52 | 229.9 | 236 |
| gsap | 120 | no | gpu-gl | into-ring3 | 4.38 | 3.77 | 7.83 | 0.53 | 227.3 | 252 |
| effects | 120 | no | gpu-vulkan | old-render | 12.29 | 11.62 | 14.48 | 1.48 | 81.2 | 1177 |
| effects | 120 | no | gpu-vulkan | render | 10.73 | 10.14 | 12.54 | 1.29 | 93.0 | 1157 |
| effects | 120 | no | gpu-vulkan | render-clone | 12.06 | 11.53 | 14.15 | 1.45 | 82.8 | 1165 |
| effects | 120 | no | gpu-vulkan | into | 7.37 | 6.95 | 9.61 | 0.89 | 135.5 | 286 |
| effects | 120 | no | gpu-vulkan | into-ring3 | 7.65 | 7.11 | 9.52 | 0.92 | 130.4 | 302 |
| effects | 120 | yes | gpu-vulkan | old-render | 9.75 | 8.66 | 13.23 | 1.21 | 99.6 | 364 |
| effects | 120 | yes | gpu-vulkan | render | 9.13 | 8.31 | 12.02 | 1.13 | 106.0 | 357 |
| effects | 120 | yes | gpu-vulkan | render-clone | 9.63 | 8.68 | 12.78 | 1.19 | 100.8 | 365 |
| effects | 120 | yes | gpu-vulkan | into | 7.30 | 6.87 | 9.30 | 0.89 | 135.6 | 286 |
| effects | 120 | yes | gpu-vulkan | into-ring3 | 7.69 | 7.17 | 9.54 | 0.93 | 128.8 | 302 |
| gsap | 120 | no | gpu-vulkan | old-render | 9.23 | 8.82 | 12.35 | 1.11 | 108.1 | 1177 |
| gsap | 120 | no | gpu-vulkan | render | 8.12 | 7.48 | 11.41 | 0.98 | 122.9 | 1159 |
| gsap | 120 | no | gpu-vulkan | render-clone | 9.36 | 8.77 | 13.02 | 1.13 | 106.6 | 1165 |
| gsap | 120 | no | gpu-vulkan | into | 4.53 | 4.01 | 7.90 | 0.55 | 219.9 | 286 |
| gsap | 120 | no | gpu-vulkan | into-ring3 | 4.99 | 4.56 | 8.35 | 0.60 | 199.8 | 302 |

### Pipelined readback (120 frames, page seek per frame, no Node round-trips)
| backend | scene | res | mode | depth | fps | ms/frame | latency median | wait | readback | paint | submit | RSS MiB | GPU util % (mean/max) | GPU mem MiB | bound |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| gpu-gl | effects | 1080p | sync | 1 | 138.0 | 7.25 | – | 0.06 | 1.88 | 1.23 | 0.63 | 238 | – | – | 1.94 ms = 27% |
| gpu-gl | effects | 1080p | deferred | 1 | 140.2 | 7.13 | 4.8 | 0.00 | 1.93 | 1.22 | 0.61 | 238 | – | – |  |
| gpu-gl | effects | 1080p | deferred | 2 | 139.7 | 7.16 | 12.0 | 0.00 | 1.96 | 1.21 | 0.60 | 239 | – | – |  |
| gpu-gl | effects | 1080p | deferred | 3 | 140.1 | 7.14 | 19.8 | 0.00 | 1.97 | 1.21 | 0.60 | 244 | – | – |  |
| gpu-gl | effects | 1080p | deferred | 4 | 139.8 | 7.15 | 26.8 | 0.00 | 1.99 | 1.22 | 0.59 | 244 | – | – |  |
| gpu-gl | effects | 1080p | pbo | 1 | 139.1 | 7.19 | 4.7 | 0.01 | 1.78 | 1.25 | 0.66 | 252 | – | – |  |
| gpu-gl | effects | 1080p | pbo | 2 | 138.1 | 7.24 | 11.7 | 0.01 | 1.80 | 1.26 | 0.68 | 260 | – | – |  |
| gpu-gl | effects | 1080p | pbo | 3 | 137.8 | 7.26 | 19.8 | 0.01 | 1.80 | 1.26 | 0.67 | 269 | – | – |  |
| gpu-gl | effects | 1080p | pbo | 4 | 137.2 | 7.29 | 26.8 | 0.01 | 1.80 | 1.26 | 0.67 | 278 | – | – |  |
| gpu-gl | effects | 4K | sync | 1 | 65.2 | 15.34 | – | 0.39 | 7.13 | 3.16 | 0.73 | 405 | – | – | 7.53 ms = 49% |
| gpu-gl | effects | 4K | deferred | 1 | 66.5 | 15.03 | 10.4 | 0.00 | 7.28 | 3.21 | 0.72 | 405 | – | – |  |
| gpu-gl | effects | 4K | deferred | 2 | 66.5 | 15.04 | 25.2 | 0.00 | 7.33 | 3.21 | 0.71 | 406 | – | – |  |
| gpu-gl | effects | 4K | deferred | 3 | 66.4 | 15.06 | 40.9 | 0.00 | 7.40 | 3.20 | 0.70 | 410 | – | – |  |
| gpu-gl | effects | 4K | deferred | 4 | 66.2 | 15.12 | 55.7 | 0.00 | 7.49 | 3.16 | 0.71 | 411 | – | – |  |
| gpu-gl | effects | 4K | pbo | 1 | 63.1 | 15.84 | 9.9 | 0.46 | 6.21 | 3.17 | 0.78 | 443 | – | – |  |
| gpu-gl | effects | 4K | pbo | 2 | 70.4 | 14.20 | 23.2 | 0.01 | 6.23 | 3.18 | 0.76 | 476 | – | – |  |
| gpu-gl | effects | 4K | pbo | 3 | 70.0 | 14.29 | 38.3 | 0.01 | 6.29 | 3.23 | 0.77 | 509 | – | – |  |
| gpu-gl | effects | 4K | pbo | 4 | 70.5 | 14.19 | 51.5 | 0.01 | 6.24 | 3.16 | 0.76 | 543 | – | – |  |
| gpu-vulkan | effects | 1080p | sync | 1 | 132.6 | 7.54 | – | 0.27 | 2.40 | 0.97 | 0.39 | 286 | – | – | 2.68 ms = 36% |
| gpu-vulkan | effects | 1080p | deferred | 1 | 139.6 | 7.17 | 5.4 | 0.00 | 2.46 | 0.97 | 0.37 | 286 | – | – |  |
| gpu-vulkan | effects | 1080p | deferred | 2 | 138.2 | 7.24 | 12.5 | 0.00 | 2.47 | 0.99 | 0.37 | 287 | – | – |  |
| gpu-vulkan | effects | 1080p | deferred | 3 | 137.9 | 7.25 | 20.6 | 0.00 | 2.48 | 0.99 | 0.38 | 292 | – | – |  |
| gpu-vulkan | effects | 1080p | deferred | 4 | 138.2 | 7.24 | 27.5 | 0.00 | 2.48 | 0.99 | 0.37 | 292 | – | – |  |
| gpu-vulkan | effects | 4K | sync | 1 | 61.8 | 16.19 | – | 0.62 | 8.85 | 2.29 | 0.44 | 424 | – | – | 9.47 ms = 59% |
| gpu-vulkan | effects | 4K | deferred | 1 | 65.1 | 15.36 | 12.0 | 0.00 | 8.92 | 2.27 | 0.43 | 424 | – | – |  |
| gpu-vulkan | effects | 4K | deferred | 2 | 65.1 | 15.35 | 27.0 | 0.00 | 8.93 | 2.25 | 0.44 | 429 | – | – |  |
| gpu-vulkan | effects | 4K | deferred | 3 | 65.2 | 15.34 | 43.2 | 0.00 | 8.94 | 2.27 | 0.44 | 433 | – | – |  |
| gpu-vulkan | effects | 4K | deferred | 4 | 65.3 | 15.32 | 58.0 | 0.00 | 8.92 | 2.25 | 0.44 | 434 | – | – |  |

Order/identity check (30 frames vs sync): gpu-gl/effects: all identical; gpu-vulkan/effects: all identical

### Workers (effects 1080p, every frame delivered to the parent)
| backend | delivery | workers | fps | mismatches | missing | worker exits | process exit |
|---|---|---|---|---|---|---|---|
| gpu-gl | clone | 1 | 52.0 | 0 | 0 | 0 | 0 |
| gpu-gl | clone | 2 | 80.5 | 0 | 0 | 0,0 | 0 |
| gpu-gl | clone | 4 | 87.8 | 0 | 0 | 0,0,0,0 | 0 |
| gpu-gl | into-transfer | 1 | 75.3 | 0 | 0 | 0 | 0 |
| gpu-gl | into-transfer | 2 | 98.9 | 0 | 0 | 0,0 | 0 |
| gpu-gl | into-transfer | 4 | 94.5 | 0 | 0 | 0,0,0,0 | 0 |
| gpu-gl | shared | 1 | 66.6 | 0 | 0 | 0 | 0 |
| gpu-gl | shared | 2 | 119.7 | 0 | 0 | 0,0 | 0 |
| gpu-gl | shared | 4 | 69.3 | 0 | 0 | 0,0,0,0 | 0 |
| gpu-vulkan | clone | 1 | 44.6 | 0 | 0 | 0 | 0 |
| gpu-vulkan | clone | 2 | 57.7 | 0 | 0 | 0,0 | 0 |
| gpu-vulkan | clone | 4 | 57.3 | 0 | 0 | 0,0,0,0 | 0 |
| gpu-vulkan | into-transfer | 1 | 61.7 | 0 | 0 | 0 | 0 |
| gpu-vulkan | into-transfer | 2 | 70.2 | 0 | 0 | 0,0 | 0 |
| gpu-vulkan | into-transfer | 4 | 62.5 | 0 | 0 | 0,0,0,0 | 0 |
| gpu-vulkan | shared | 1 | 55.3 | 0 | 0 | 0 | 0 |
| gpu-vulkan | shared | 2 | 65.2 | 0 | 0 | 0,0 | 0 |
| gpu-vulkan | shared | 4 | 61.6 | 0 | 0 | 0,0,0,0 | 0 |

### Ownership, lifetime and failure probes
| probe | backend | process | result |
|---|---|---|---|
| buffer-outlives-renderer | gpu-gl | exit 0 | `{"afterRenders":true,"afterClose":true,"afterRendererGc":true,"pooledAfterRendererGc":true}` |
| pool-finalizers-after-close | gpu-gl | exit 0 | `{"statsBeforeClose":{"allocated":8,"discarded":0,"frameBytes":3686400,"free":0,"maxFree":3,"returned":0,"reused":0},"finalizedWithoutRenderer":true}` |
| many-retained-then-dropped | gpu-gl | exit 0 | `{"intact":true,"inUseMiBWhileRetained":1601,"inUseMiBAfterDrop":18}` |
| _renderInto-misuse | gpu-gl | exit 0 | `{"tooSmall":{"ok":false,"error":"target Buffer is 3686396 bytes, the frame needs 3686400"},"tooLarge":{"ok":false,"error":"target Buffer is 3686404 bytes, the frame needs 3686400"},"detachedView":{"ok":false,"error":"target Buffer is 0 bytes, the frame needs 3686400"},"plainUint8Array":{"ok":true,"v` |
| frame-size-limits | gpu-gl | exit 0 | `{"huge":{"ok":false,"error":"frame of 100000x100000 device pixels is out of range (1..=32767 per side)"},"hugeDpr":{"ok":false,"error":"frame of 40000x40000 device pixels is out of range (1..=32767 per side)"},"infiniteDpr":{"ok":false,"error":"frame of 4294967295x4294967295 device pixels is out of ` |
| full-pool | gpu-gl | exit 0 | `{"heldFrames":6,"distinctMemory":6,"stats":{"allocated":6,"discarded":0,"frameBytes":8294400,"free":0,"maxFree":1,"returned":0,"reused":0},"statsAfterRelease":{"allocated":6,"discarded":5,"frameBytes":8294400,"free":0,"maxFree":1,"returned":1,"reused":1},"renderAfter":8294400}` |
| buffer-outlives-renderer | gpu-vulkan | exit 0 | `{"afterRenders":true,"afterClose":true,"afterRendererGc":true,"pooledAfterRendererGc":true}` |
| pool-finalizers-after-close | gpu-vulkan | exit 0 | `{"statsBeforeClose":{"allocated":8,"discarded":0,"frameBytes":3686400,"free":0,"maxFree":3,"returned":0,"reused":0},"finalizedWithoutRenderer":true}` |
| many-retained-then-dropped | gpu-vulkan | exit 0 | `{"intact":true,"inUseMiBWhileRetained":1612,"inUseMiBAfterDrop":29}` |
| _renderInto-misuse | gpu-vulkan | exit 0 | `{"tooSmall":{"ok":false,"error":"target Buffer is 3686396 bytes, the frame needs 3686400"},"tooLarge":{"ok":false,"error":"target Buffer is 3686404 bytes, the frame needs 3686400"},"detachedView":{"ok":false,"error":"target Buffer is 0 bytes, the frame needs 3686400"},"plainUint8Array":{"ok":true,"v` |
| frame-size-limits | gpu-vulkan | exit 0 | `{"huge":{"ok":false,"error":"frame of 100000x100000 device pixels is out of range (1..=32767 per side)"},"hugeDpr":{"ok":false,"error":"frame of 40000x40000 device pixels is out of range (1..=32767 per side)"},"infiniteDpr":{"ok":false,"error":"frame of 4294967295x4294967295 device pixels is out of ` |
| full-pool | gpu-vulkan | exit 0 | `{"heldFrames":6,"distinctMemory":6,"stats":{"allocated":6,"discarded":0,"frameBytes":8294400,"free":0,"maxFree":1,"returned":0,"reused":0},"statsAfterRelease":{"allocated":6,"discarded":5,"frameBytes":8294400,"free":0,"maxFree":1,"returned":1,"reused":1},"renderAfter":8294400}` |

