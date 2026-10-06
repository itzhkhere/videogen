**colab-t4**: Ubuntu 24.04.4 LTS, Intel(R) Xeon(R) CPU @ 2.00GHz ×8, 51 GiB, Node v24.19.0, GPU Tesla T4, 580.82.07, 15360 MiB, 1590 MHz; addon canvas-html-gpu.node (42.0 MiB)
- gpu-gl: ganesh-gl via EGL device: NVIDIA Tesla T4; GL_RENDERER Tesla T4/PCIe/SSE2; GL_VERSION 3.3.0 NVIDIA 580.82.07
- gpu-vulkan: ganesh-vulkan: Tesla T4 (DISCRETE_GPU), driver 0x911481c0, API 1.4.312

**colab-t4-graphite**: Ubuntu 24.04.4 LTS, Intel(R) Xeon(R) CPU @ 2.00GHz ×8, 51 GiB, Node v24.19.0, GPU Tesla T4, 580.82.07, 15360 MiB, 1590 MHz; addon canvas-html-graphite.node (40.4 MiB)
- gpu-graphite: graphite-vulkan: Tesla T4 (DISCRETE_GPU), driver 0x911481c0, API 1.4.312

### Correctness (CPU vs GPU, severity / % pixels differing / max delta / % pixels with delta > 32)

720p

| scene | gpu-gl | gpu-vulkan | gpu-graphite |
|---|---|---|---|
| A | minor / 0.74 / 53 / 0.005 | minor / 0.76 / 53 / 0.005 | minor / 0.76 / 53 / 0.005 |
| B | minor / 73.36 / 11 / 0.000 | minor / 73.59 / 11 / 0.000 | minor / 72.96 / 13 / 0.000 |
| C | minor / 83.86 / 53 / 0.009 | minor / 84.50 / 53 / 0.009 | minor / 84.68 / 84 / 0.016 |
| D | minor / 87.08 / 53 / 0.008 | minor / 87.90 / 53 / 0.008 | minor / 87.89 / 62 / 0.012 |
| E | minor / 89.90 / 66 / 0.010 | minor / 90.53 / 66 / 0.009 | minor / 90.08 / 75 / 0.012 |
| F | edge-aa / 52.07 / 122 / 1.712 | edge-aa / 52.09 / 122 / 1.711 | edge-aa / 52.16 / 136 / 2.388 |
| G100 | minor / 12.73 / 63 / 0.014 | minor / 12.85 / 63 / 0.014 | minor / 12.37 / 71 / 0.042 |
| G500 | minor / 45.52 / 66 / 0.046 | minor / 45.54 / 66 / 0.046 | edge-aa / 45.43 / 66 / 0.128 |
| G1000 | minor / 67.18 / 71 / 0.059 | minor / 67.12 / 71 / 0.059 | edge-aa / 66.97 / 84 / 0.166 |

1080p

| scene | gpu-gl | gpu-vulkan | gpu-graphite |
|---|---|---|---|
| A | minor / 0.47 / 64 / 0.004 | minor / 0.47 / 64 / 0.004 | minor / 0.47 / 64 / 0.004 |
| B | edge-aa / 72.32 / 169 / 0.766 | edge-aa / 72.53 / 169 / 0.761 | edge-aa / 71.85 / 168 / 0.760 |
| C | minor / 83.71 / 54 / 0.001 | minor / 84.37 / 55 / 0.001 | minor / 84.05 / 65 / 0.008 |
| D | minor / 87.17 / 68 / 0.002 | minor / 87.97 / 68 / 0.002 | minor / 87.97 / 76 / 0.018 |
| E | minor / 84.60 / 82 / 0.007 | minor / 85.52 / 82 / 0.007 | minor / 84.15 / 78 / 0.011 |
| F | edge-aa / 49.06 / 128 / 0.959 | edge-aa / 49.07 / 128 / 0.959 | edge-aa / 49.36 / 139 / 1.510 |
| G100 | minor / 12.49 / 70 / 0.014 | minor / 12.62 / 71 / 0.014 | minor / 12.13 / 76 / 0.029 |
| G500 | minor / 44.79 / 90 / 0.038 | minor / 44.84 / 91 / 0.038 | minor / 44.71 / 76 / 0.091 |
| G1000 | minor / 66.40 / 81 / 0.050 | minor / 66.36 / 81 / 0.051 | edge-aa / 66.13 / 76 / 0.112 |

4K

| scene | gpu-gl | gpu-vulkan | gpu-graphite |
|---|---|---|---|
| A | minor / 0.34 / 230 / 0.046 | minor / 0.34 / 231 / 0.046 | minor / 0.34 / 231 / 0.048 |
| B | edge-aa / 70.92 / 216 / 1.022 | edge-aa / 71.12 / 215 / 1.014 | edge-aa / 70.28 / 215 / 1.018 |
| C | minor / 83.65 / 42 / 0.000 | minor / 84.31 / 42 / 0.000 | minor / 83.37 / 70 / 0.002 |
| D | minor / 87.15 / 41 / 0.000 | minor / 87.94 / 41 / 0.000 | minor / 87.96 / 73 / 0.006 |
| E | minor / 70.77 / 38 / 0.000 | minor / 72.02 / 38 / 0.000 | minor / 72.08 / 79 / 0.003 |
| F | edge-aa / 45.57 / 104 / 0.116 | edge-aa / 45.58 / 104 / 0.116 | edge-aa / 46.36 / 151 / 0.726 |
| G100 | minor / 12.25 / 76 / 0.007 | minor / 12.38 / 76 / 0.007 | minor / 11.87 / 65 / 0.014 |
| G500 | minor / 44.09 / 85 / 0.020 | minor / 44.18 / 85 / 0.020 | minor / 44.00 / 89 / 0.046 |
| G1000 | minor / 65.64 / 91 / 0.025 | minor / 65.63 / 91 / 0.026 | minor / 65.29 / 90 / 0.057 |

Attribution (720p, by ablation)

| scene | colab-t4 | colab-t4-graphite |
|---|---|---|
| A | text rasterization difference (text removes 96%) | text rasterization difference (text removes 96%) |
| B | text rasterization difference (text removes 100%) | text rasterization difference (text removes 100%) |
| C | image sampling difference (images removes 100%) | image sampling difference (images removes 100%) |
| D | gradient interpolation difference (gradients removes 100%) | gradient interpolation difference (gradients removes 100%) |
| E | shadow/blur precision difference (shadows removes 41%) | shadow/blur precision difference (shadows removes 36%) |
| F | geometry antialiasing difference (text removes 0%) | geometry antialiasing difference (text removes 0%) |
| G100 | layer/opacity blending difference (opacity removes 70%) | layer/opacity blending difference (opacity removes 69%) |
| G500 | layer/opacity blending difference (opacity removes 70%) | layer/opacity blending difference (opacity removes 69%) |
| G1000 | layer/opacity blending difference (opacity removes 70%) | layer/opacity blending difference (opacity removes 70%) |

### 720p: median ms per frame, RGBA output (no-readback in brackets); speed-up vs CPU
| scene | CPU raster | Ganesh GL | Ganesh Vulkan | Graphite Vulkan |
|---|---|---|---|---|
| A | 2.6 [0.9] | 3.1 [0.2] ×0.85 | 2.9 [0.3] ×0.89 | 3.1 [0.3] ×0.84 |
| B | 127.9 [125.2] | 28.1 [24.3] ×4.56 | 26.3 [23.0] ×4.86 | 79.7 [75.6] ×1.60 |
| C | 116.6 [115.8] | 6.8 [3.9] ×17.23 | 6.1 [3.5] ×18.98 | 7.1 [4.3] ×16.44 |
| D | 83.0 [79.7] | 15.9 [12.1] ×5.20 | 12.8 [10.2] ×6.48 | 9.6 [6.9] ×8.65 |
| E | 98.5 [97.7] | 22.3 [19.9] ×4.41 | 18.0 [14.9] ×5.48 | 33.2 [28.5] ×2.97 |
| F | 173.0 [170.6] | 42.7 [38.4] ×4.06 | 35.8 [33.2] ×4.84 | 14.1 [10.8] ×12.28 |
| G100 | 12.0 [11.2] | 8.9 [6.1] ×1.34 | 7.6 [4.9] ×1.58 | 6.8 [4.1] ×1.75 |
| G500 | 53.7 [52.5] | 35.2 [31.6] ×1.52 | 27.8 [25.2] ×1.93 | 27.5 [24.6] ×1.95 |
| G1000 | 100.0 [98.1] | 76.2 [75.3] ×1.31 | 61.6 [58.3] ×1.62 | 49.7 [46.9] ×2.01 |

720p breakdown (median ms): resolve · paintPrep · paint(record) · submit · wait · readback · buffer · total · png encode · first frame · create
| scene | backend | resolve | prep | paint | submit | wait | readback | buffer | total | cv | png | first | create |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A | cpu | 0.01 | 0.04 | 0.88 | 0.00 | 0.00 | 0.00 | 1.71 | 2.60 | 0.03 | 15.1 | 6.8 | 4.4 |
| A | gpu-gl | 0.01 | 0.04 | 0.09 | 0.14 | 0.03 | 0.83 | 1.91 | 3.07 | 0.09 | 15.0 | 19.4 | 127.1 |
| A | gpu-vulkan | 0.01 | 0.04 | 0.09 | 0.08 | 0.13 | 0.80 | 1.79 | 2.92 | 0.02 | 14.5 | 22.9 | 141.2 |
| A | gpu-graphite | 0.01 | 0.04 | 0.29 | 0.08 | 0.14 | 0.83 | 1.75 | 3.09 | 0.08 | 14.0 | 30.3 | 269.7 |
| B | cpu | 0.30 | 0.91 | 126.52 | 0.00 | 0.00 | 0.00 | 1.88 | 127.88 | 0.04 | 203.7 | 126.5 | 4.6 |
| B | gpu-gl | 0.21 | 0.75 | 16.62 | 7.60 | 0.41 | 0.93 | 2.07 | 28.05 | 0.04 | 203.7 | 124.9 | 64.1 |
| B | gpu-vulkan | 0.22 | 0.75 | 17.39 | 4.89 | 1.00 | 0.89 | 1.92 | 26.29 | 0.05 | 205.1 | 116.1 | 194.3 |
| B | gpu-graphite | 0.27 | 0.82 | 64.63 | 3.17 | 7.75 | 1.05 | 2.23 | 79.70 | 0.04 | 201.1 | 139.5 | 264.2 |
| C | cpu | 0.11 | 0.28 | 115.13 | 0.00 | 0.00 | 0.00 | 1.74 | 116.57 | 0.02 | 327.0 | 119.6 | 4.4 |
| C | gpu-gl | 0.07 | 0.26 | 2.01 | 1.53 | 0.31 | 0.89 | 1.95 | 6.76 | 0.05 | 336.8 | 29.7 | 69.8 |
| C | gpu-vulkan | 0.06 | 0.26 | 1.79 | 0.70 | 0.93 | 0.86 | 1.77 | 6.14 | 0.04 | 333.9 | 42.7 | 182.3 |
| C | gpu-graphite | 0.06 | 0.25 | 1.14 | 0.70 | 2.39 | 0.85 | 1.81 | 7.09 | 0.04 | 261.0 | 40.7 | 269.3 |
| D | cpu | 0.14 | 0.69 | 81.01 | 0.00 | 0.00 | 0.00 | 0.64 | 83.00 | 0.04 | 294.9 | 83.0 | 4.9 |
| D | gpu-gl | 0.11 | 0.64 | 8.22 | 3.81 | 0.53 | 0.93 | 2.05 | 15.95 | 0.11 | 295.3 | 47.4 | 68.7 |
| D | gpu-vulkan | 0.09 | 0.66 | 6.07 | 1.80 | 2.12 | 0.87 | 1.86 | 12.82 | 0.05 | 284.2 | 78.7 | 184.5 |
| D | gpu-graphite | 0.07 | 0.67 | 2.42 | 1.33 | 3.02 | 0.85 | 1.82 | 9.60 | 0.03 | 280.6 | 51.0 | 264.0 |
| E | cpu | 0.07 | 0.40 | 97.03 | 0.00 | 0.00 | 0.00 | 1.77 | 98.50 | 0.01 | 301.5 | 101.9 | 4.5 |
| E | gpu-gl | 0.06 | 0.39 | 12.09 | 6.92 | 0.26 | 0.93 | 2.04 | 22.32 | 0.06 | 312.3 | 75.8 | 67.6 |
| E | gpu-vulkan | 0.06 | 0.34 | 9.24 | 3.20 | 2.68 | 0.86 | 1.86 | 17.96 | 0.03 | 309.1 | 114.2 | 201.8 |
| E | gpu-graphite | 0.07 | 0.43 | 9.06 | 5.87 | 14.12 | 0.93 | 2.13 | 33.20 | 0.04 | 298.3 | 120.4 | 265.9 |
| F | cpu | 0.02 | 0.28 | 171.14 | 0.00 | 0.00 | 0.00 | 1.80 | 172.98 | 0.01 | 98.0 | 172.6 | 4.8 |
| F | gpu-gl | 0.03 | 0.28 | 30.13 | 7.23 | 1.87 | 0.97 | 2.02 | 42.66 | 0.07 | 60.8 | 75.2 | 68.5 |
| F | gpu-vulkan | 0.02 | 0.17 | 20.80 | 5.08 | 6.81 | 0.89 | 1.84 | 35.76 | 0.03 | 59.8 | 94.1 | 187.1 |
| F | gpu-graphite | 0.01 | 0.11 | 3.21 | 2.81 | 5.13 | 0.85 | 1.86 | 14.09 | 0.05 | 56.0 | 40.8 | 268.7 |
| G100 | cpu | 0.07 | 0.41 | 11.26 | 0.00 | 0.00 | 0.00 | 0.59 | 11.97 | 0.01 | 34.0 | 13.1 | 4.9 |
| G100 | gpu-gl | 0.07 | 0.40 | 1.49 | 4.49 | 0.07 | 0.94 | 1.40 | 8.92 | 0.07 | 32.1 | 25.9 | 47.0 |
| G100 | gpu-vulkan | 0.07 | 0.41 | 1.48 | 2.83 | 0.48 | 0.84 | 1.83 | 7.56 | 0.06 | 31.6 | 30.0 | 186.6 |
| G100 | gpu-graphite | 0.07 | 0.41 | 1.66 | 1.13 | 1.15 | 0.83 | 1.79 | 6.85 | 0.05 | 32.5 | 36.9 | 169.1 |
| G500 | cpu | 0.40 | 2.03 | 51.52 | 0.00 | 0.00 | 0.00 | 1.82 | 53.68 | 0.02 | 93.6 | 51.6 | 4.7 |
| G500 | gpu-gl | 0.36 | 2.04 | 7.34 | 24.23 | 0.11 | 1.01 | 2.02 | 35.24 | 0.02 | 88.6 | 85.7 | 67.5 |
| G500 | gpu-vulkan | 0.34 | 2.06 | 7.55 | 16.46 | 0.81 | 0.86 | 1.78 | 27.76 | 0.05 | 88.9 | 79.1 | 164.9 |
| G500 | gpu-graphite | 0.32 | 2.01 | 8.07 | 5.82 | 10.02 | 0.89 | 1.89 | 27.48 | 0.03 | 88.6 | 86.8 | 262.4 |
| G1000 | cpu | 0.85 | 4.53 | 97.40 | 0.00 | 0.00 | 0.00 | 1.80 | 99.99 | 0.01 | 151.6 | 100.3 | 4.8 |
| G1000 | gpu-gl | 0.98 | 4.16 | 14.90 | 57.27 | 0.05 | 0.94 | 1.95 | 76.19 | 0.02 | 144.0 | 173.0 | 70.4 |
| G1000 | gpu-vulkan | 0.96 | 4.47 | 15.24 | 41.66 | 0.92 | 0.94 | 1.82 | 61.60 | 0.04 | 141.8 | 142.8 | 188.2 |
| G1000 | gpu-graphite | 0.96 | 4.21 | 16.71 | 13.94 | 14.13 | 1.08 | 1.96 | 49.71 | 0.07 | 139.6 | 142.5 | 259.3 |

### 1080p: median ms per frame, RGBA output (no-readback in brackets); speed-up vs CPU
| scene | CPU raster | Ganesh GL | Ganesh Vulkan | Graphite Vulkan |
|---|---|---|---|---|
| A | 5.8 [1.9] | 7.1 [0.3] ×0.82 | 6.1 [0.4] ×0.95 | 6.3 [0.4] ×0.92 |
| B | 210.5 [206.6] | 30.2 [23.5] ×6.98 | 27.9 [21.5] ×7.54 | 99.3 [92.2] ×2.12 |
| C | 253.0 [249.7] | 12.1 [5.6] ×20.92 | 11.4 [5.1] ×22.18 | 12.4 [5.4] ×20.48 |
| D | 205.1 [204.8] | 27.5 [21.1] ×7.45 | 23.8 [18.2] ×8.62 | 15.2 [9.3] ×13.46 |
| E | 167.8 [166.4] | 32.4 [25.7] ×5.18 | 27.3 [20.9] ×6.16 | 35.5 [28.1] ×4.72 |
| F | 328.2 [324.1] | 88.2 [82.2] ×3.72 | 91.5 [78.6] ×3.59 | 30.1 [21.4] ×10.91 |
| G100 | 20.4 [16.0] | 12.7 [6.9] ×1.60 | 11.4 [5.2] ×1.80 | 10.9 [4.9] ×1.88 |
| G500 | 77.4 [73.9] | 42.2 [33.6] ×1.83 | 33.5 [26.6] ×2.31 | 32.6 [26.1] ×2.37 |
| G1000 | 153.2 [145.7] | 76.9 [70.1] ×1.99 | 60.8 [52.8] ×2.52 | 58.4 [50.8] ×2.62 |

1080p breakdown (median ms): resolve · paintPrep · paint(record) · submit · wait · readback · buffer · total · png encode · first frame · create
| scene | backend | resolve | prep | paint | submit | wait | readback | buffer | total | cv | png | first | create |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A | cpu | 0.01 | 0.10 | 1.84 | 0.00 | 0.00 | 0.00 | 3.96 | 5.78 | 0.02 | 29.5 | 11.6 | 4.5 |
| A | gpu-gl | 0.01 | 0.05 | 0.11 | 0.19 | 0.04 | 1.91 | 4.70 | 7.07 | 0.13 | 31.5 | 22.7 | 59.0 |
| A | gpu-vulkan | 0.01 | 0.05 | 0.10 | 0.09 | 0.15 | 1.70 | 3.99 | 6.08 | 0.02 | 28.9 | 27.2 | 138.8 |
| A | gpu-graphite | 0.01 | 0.05 | 0.17 | 0.09 | 0.23 | 1.72 | 3.98 | 6.28 | 0.04 | 27.6 | 26.4 | 192.7 |
| B | cpu | 0.35 | 1.06 | 205.80 | 0.00 | 0.00 | 0.00 | 4.23 | 210.52 | 0.02 | 369.4 | 216.3 | 4.5 |
| B | gpu-gl | 0.23 | 0.83 | 14.98 | 7.70 | 0.92 | 1.89 | 4.38 | 30.17 | 0.01 | 369.8 | 154.5 | 65.7 |
| B | gpu-vulkan | 0.25 | 0.94 | 15.44 | 4.68 | 1.46 | 1.80 | 4.13 | 27.91 | 0.02 | 372.2 | 149.2 | 178.3 |
| B | gpu-graphite | 0.32 | 0.91 | 79.05 | 3.39 | 8.44 | 2.45 | 4.78 | 99.31 | 0.03 | 371.0 | 167.0 | 267.2 |
| C | cpu | 0.14 | 0.33 | 248.36 | 0.00 | 0.00 | 0.00 | 4.39 | 253.00 | 0.02 | 691.1 | 252.6 | 4.9 |
| C | gpu-gl | 0.07 | 0.27 | 3.61 | 1.61 | 0.48 | 1.87 | 4.39 | 12.10 | 0.03 | 688.6 | 41.0 | 64.2 |
| C | gpu-vulkan | 0.09 | 0.26 | 3.03 | 0.77 | 1.44 | 1.79 | 4.12 | 11.41 | 0.04 | 700.2 | 54.8 | 209.8 |
| C | gpu-graphite | 0.10 | 0.27 | 1.35 | 0.86 | 3.37 | 1.99 | 4.33 | 12.36 | 0.05 | 603.4 | 50.8 | 276.2 |
| D | cpu | 0.16 | 0.70 | 200.74 | 0.00 | 0.00 | 0.00 | 4.17 | 205.12 | 0.03 | 520.1 | 227.9 | 6.1 |
| D | gpu-gl | 0.13 | 0.67 | 16.45 | 3.96 | 0.78 | 1.85 | 4.44 | 27.55 | 0.04 | 524.4 | 65.2 | 70.3 |
| D | gpu-vulkan | 0.12 | 0.63 | 11.88 | 2.04 | 3.79 | 1.80 | 4.15 | 23.80 | 0.05 | 536.4 | 100.4 | 181.6 |
| D | gpu-graphite | 0.09 | 0.65 | 2.50 | 1.42 | 5.28 | 1.72 | 4.06 | 15.23 | 0.03 | 517.8 | 74.5 | 261.6 |
| E | cpu | 0.08 | 0.41 | 163.53 | 0.00 | 0.00 | 0.00 | 4.19 | 167.85 | 0.01 | 462.6 | 179.9 | 4.8 |
| E | gpu-gl | 0.07 | 0.36 | 17.52 | 7.98 | 0.35 | 1.93 | 4.48 | 32.43 | 0.04 | 492.6 | 97.2 | 69.8 |
| E | gpu-vulkan | 0.07 | 0.42 | 13.59 | 3.86 | 3.53 | 1.82 | 4.26 | 27.25 | 0.01 | 498.9 | 143.8 | 224.6 |
| E | gpu-graphite | 0.07 | 0.39 | 9.14 | 5.93 | 13.34 | 1.94 | 4.38 | 35.54 | 0.02 | 476.8 | 135.8 | 259.7 |
| F | cpu | 0.03 | 0.31 | 323.79 | 0.00 | 0.00 | 0.00 | 4.26 | 328.21 | 0.01 | 172.9 | 333.6 | 5.2 |
| F | gpu-gl | 0.03 | 0.35 | 60.81 | 18.27 | 3.08 | 1.86 | 4.49 | 88.25 | 0.03 | 117.2 | 139.3 | 69.0 |
| F | gpu-vulkan | 0.03 | 0.30 | 51.67 | 16.77 | 13.67 | 5.53 | 4.13 | 91.54 | 0.02 | 107.9 | 174.2 | 204.6 |
| F | gpu-graphite | 0.03 | 0.16 | 4.82 | 4.67 | 13.43 | 2.13 | 4.48 | 30.09 | 0.02 | 95.9 | 56.2 | 258.5 |
| G100 | cpu | 0.09 | 0.41 | 16.32 | 0.00 | 0.00 | 0.00 | 3.98 | 20.42 | 0.01 | 61.6 | 25.1 | 5.1 |
| G100 | gpu-gl | 0.08 | 0.42 | 1.47 | 4.79 | 0.11 | 1.82 | 4.38 | 12.74 | 0.04 | 67.2 | 30.6 | 55.6 |
| G100 | gpu-vulkan | 0.08 | 0.39 | 1.61 | 3.19 | 0.46 | 1.76 | 4.11 | 11.37 | 0.03 | 58.2 | 37.2 | 173.9 |
| G100 | gpu-graphite | 0.09 | 0.44 | 1.78 | 1.19 | 1.95 | 1.74 | 4.04 | 10.88 | 0.05 | 58.3 | 41.9 | 236.1 |
| G500 | cpu | 0.51 | 2.24 | 72.64 | 0.00 | 0.00 | 0.00 | 4.18 | 77.41 | 0.01 | 170.5 | 83.6 | 5.0 |
| G500 | gpu-gl | 0.48 | 2.13 | 8.02 | 26.81 | 0.14 | 1.90 | 4.52 | 42.23 | 0.04 | 161.2 | 96.3 | 68.0 |
| G500 | gpu-vulkan | 0.43 | 2.01 | 7.75 | 18.11 | 0.92 | 1.90 | 4.30 | 33.50 | 0.04 | 159.5 | 88.2 | 163.2 |
| G500 | gpu-graphite | 0.40 | 2.26 | 8.25 | 6.23 | 11.27 | 1.87 | 4.08 | 32.62 | 0.04 | 166.3 | 93.0 | 265.7 |
| G1000 | cpu | 1.23 | 4.49 | 147.73 | 0.00 | 0.00 | 0.00 | 4.43 | 153.17 | 0.04 | 279.5 | 155.6 | 5.3 |
| G1000 | gpu-gl | 1.16 | 4.41 | 15.57 | 54.03 | 0.07 | 1.87 | 4.54 | 76.86 | 0.06 | 269.0 | 131.6 | 69.3 |
| G1000 | gpu-vulkan | 1.07 | 4.12 | 15.67 | 36.84 | 0.91 | 2.11 | 4.12 | 60.79 | 0.02 | 261.0 | 125.1 | 190.7 |
| G1000 | gpu-graphite | 0.94 | 4.15 | 16.73 | 13.60 | 19.98 | 2.17 | 4.38 | 58.38 | 0.02 | 251.2 | 164.8 | 275.3 |

### 4K: median ms per frame, RGBA output (no-readback in brackets); speed-up vs CPU
| scene | CPU raster | Ganesh GL | Ganesh Vulkan | Graphite Vulkan |
|---|---|---|---|---|
| A | 29.1 [8.4] | 26.9 [0.3] ×1.08 | 29.0 [0.4] ×1.01 | 41.1 [0.9] ×0.71 |
| B | 569.8 [551.1] | 152.7 [124.9] ×3.73 | 153.3 [142.7] ×3.72 | 164.7 [121.8] ×3.46 |
| C | 957.1 [934.9] | 42.6 [14.5] ×22.48 | 42.4 [12.3] ×22.59 | 52.3 [11.8] ×18.29 |
| D | 661.8 [648.8] | 83.8 [55.2] ×7.90 | 104.6 [57.1] ×6.33 | 69.8 [26.6] ×9.48 |
| E | 370.0 [356.4] | 68.4 [42.0] ×5.41 | 86.6 [33.6] ×4.27 | 71.6 [27.9] ×5.17 |
| F | 1088.1 [1068.0] | 340.9 [323.8] ×3.19 | 544.0 [497.0] ×2.00 | 109.8 [68.0] ×9.91 |
| G100 | 60.5 [39.7] | 36.0 [7.4] ×1.68 | 36.9 [6.6] ×1.64 | 34.5 [6.1] ×1.75 |
| G500 | 174.4 [156.4] | 65.8 [35.7] ×2.65 | 60.7 [29.1] ×2.87 | 67.4 [24.0] ×2.59 |
| G1000 | 326.3 [306.7] | 100.6 [71.8] ×3.24 | 91.4 [58.8] ×3.57 | 107.0 [59.1] ×3.05 |

4K breakdown (median ms): resolve · paintPrep · paint(record) · submit · wait · readback · buffer · total · png encode · first frame · create
| scene | backend | resolve | prep | paint | submit | wait | readback | buffer | total | cv | png | first | create |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A | cpu | 0.02 | 0.06 | 9.66 | 0.00 | 0.00 | 0.00 | 19.32 | 29.14 | 0.03 | 103.9 | 46.2 | 4.4 |
| A | gpu-gl | 0.02 | 0.05 | 0.17 | 0.23 | 0.07 | 6.50 | 19.81 | 26.86 | 0.02 | 111.9 | 55.1 | 52.3 |
| A | gpu-vulkan | 0.02 | 0.06 | 0.18 | 0.22 | 0.12 | 8.66 | 19.78 | 28.96 | 0.01 | 108.7 | 59.9 | 140.0 |
| A | gpu-graphite | 0.03 | 0.06 | 0.40 | 2.21 | 0.75 | 18.45 | 19.14 | 41.10 | 0.02 | 106.4 | 77.2 | 267.4 |
| B | cpu | 0.36 | 1.04 | 554.90 | 0.00 | 0.00 | 0.00 | 14.51 | 569.78 | 0.01 | 885.9 | 609.1 | 5.0 |
| B | gpu-gl | 0.33 | 1.01 | 17.84 | 106.17 | 1.48 | 7.26 | 19.60 | 152.67 | 0.01 | 887.5 | 249.3 | 67.6 |
| B | gpu-vulkan | 0.51 | 1.06 | 17.99 | 100.13 | 6.00 | 8.89 | 20.20 | 153.28 | 0.01 | 878.9 | 278.6 | 191.2 |
| B | gpu-graphite | 0.37 | 0.98 | 83.66 | 18.95 | 21.42 | 19.04 | 19.69 | 164.73 | 0.02 | 845.2 | 208.0 | 263.6 |
| C | cpu | 0.17 | 0.30 | 937.11 | 0.00 | 0.00 | 0.00 | 19.87 | 957.10 | 0.01 | 2689.5 | 980.9 | 4.9 |
| C | gpu-gl | 0.16 | 0.30 | 11.37 | 2.50 | 1.61 | 6.86 | 19.89 | 42.57 | 0.01 | 2657.7 | 64.4 | 67.7 |
| C | gpu-vulkan | 0.15 | 0.30 | 8.23 | 1.05 | 3.88 | 8.87 | 20.29 | 42.37 | 0.01 | 2700.5 | 96.7 | 231.7 |
| C | gpu-graphite | 0.15 | 0.32 | 1.37 | 2.95 | 9.75 | 18.47 | 19.36 | 52.32 | 0.01 | 2609.0 | 83.9 | 265.3 |
| D | cpu | 0.18 | 0.71 | 642.06 | 0.00 | 0.00 | 0.00 | 19.64 | 661.82 | 0.01 | 1295.9 | 665.4 | 5.1 |
| D | gpu-gl | 0.18 | 0.75 | 48.76 | 5.56 | 2.38 | 7.02 | 19.58 | 83.76 | 0.02 | 1326.2 | 133.2 | 66.9 |
| D | gpu-vulkan | 0.18 | 0.71 | 47.34 | 4.36 | 11.19 | 20.73 | 20.27 | 104.61 | 0.02 | 1325.1 | 196.0 | 224.6 |
| D | gpu-graphite | 0.18 | 0.62 | 5.05 | 6.69 | 18.97 | 18.76 | 19.82 | 69.79 | 0.02 | 1268.5 | 106.8 | 269.6 |
| E | cpu | 0.10 | 0.47 | 350.31 | 0.00 | 0.00 | 0.00 | 19.61 | 370.01 | 0.01 | 920.2 | 419.2 | 5.5 |
| E | gpu-gl | 0.12 | 0.41 | 28.70 | 11.09 | 1.06 | 7.35 | 20.01 | 68.43 | 0.03 | 957.7 | 130.8 | 68.0 |
| E | gpu-vulkan | 0.12 | 0.48 | 27.97 | 10.25 | 7.56 | 20.30 | 20.03 | 86.58 | 0.01 | 942.8 | 182.7 | 224.5 |
| E | gpu-graphite | 0.13 | 0.49 | 8.38 | 7.10 | 16.18 | 18.60 | 20.52 | 71.58 | 0.01 | 951.9 | 171.7 | 259.3 |
| F | cpu | 0.03 | 0.35 | 1074.31 | 0.00 | 0.00 | 0.00 | 13.82 | 1088.09 | 0.02 | 436.3 | 1094.8 | 5.2 |
| F | gpu-gl | 0.03 | 0.51 | 208.66 | 114.57 | 3.82 | 7.38 | 6.81 | 340.91 | 0.02 | 396.5 | 497.1 | 68.0 |
| F | gpu-vulkan | 0.03 | 0.31 | 369.90 | 30.53 | 104.60 | 23.28 | 19.76 | 544.00 | 0.02 | 397.1 | 534.8 | 150.0 |
| F | gpu-graphite | 0.03 | 0.30 | 7.66 | 11.90 | 50.50 | 19.37 | 20.00 | 109.80 | 0.01 | 255.0 | 125.2 | 258.8 |
| G100 | cpu | 0.15 | 0.54 | 40.63 | 0.00 | 0.00 | 0.00 | 19.53 | 60.55 | 0.03 | 187.9 | 73.2 | 4.9 |
| G100 | gpu-gl | 0.16 | 0.43 | 1.79 | 6.42 | 0.23 | 7.17 | 19.95 | 35.97 | 0.02 | 198.5 | 58.1 | 56.1 |
| G100 | gpu-vulkan | 0.15 | 0.44 | 1.79 | 4.28 | 0.86 | 8.79 | 20.45 | 36.95 | 0.02 | 181.0 | 72.5 | 173.5 |
| G100 | gpu-graphite | 0.18 | 0.47 | 2.01 | 1.34 | 3.04 | 8.20 | 19.67 | 34.54 | 0.03 | 192.7 | 73.2 | 244.3 |
| G500 | cpu | 0.76 | 2.40 | 153.94 | 0.00 | 0.00 | 0.00 | 19.78 | 174.41 | 0.02 | 420.5 | 191.0 | 4.8 |
| G500 | gpu-gl | 0.68 | 2.08 | 8.23 | 28.59 | 0.12 | 7.35 | 21.00 | 65.84 | 0.04 | 411.0 | 93.0 | 68.6 |
| G500 | gpu-vulkan | 0.62 | 2.08 | 8.43 | 20.59 | 1.00 | 9.20 | 20.88 | 60.70 | 0.04 | 405.6 | 98.6 | 166.1 |
| G500 | gpu-graphite | 0.65 | 2.34 | 8.86 | 8.94 | 9.71 | 18.63 | 19.70 | 67.42 | 0.03 | 424.6 | 127.6 | 265.1 |
| G1000 | cpu | 1.29 | 4.57 | 305.05 | 0.00 | 0.00 | 0.00 | 19.86 | 326.33 | 0.01 | 653.7 | 337.9 | 5.7 |
| G1000 | gpu-gl | 1.17 | 4.31 | 15.91 | 56.02 | 0.09 | 7.30 | 20.03 | 100.59 | 0.02 | 634.3 | 135.7 | 69.3 |
| G1000 | gpu-vulkan | 1.31 | 4.46 | 16.27 | 41.35 | 2.03 | 9.10 | 21.05 | 91.42 | 0.03 | 627.8 | 140.9 | 176.4 |
| G1000 | gpu-graphite | 1.36 | 4.59 | 18.27 | 17.56 | 29.11 | 19.07 | 19.91 | 107.01 | 0.04 | 628.8 | 194.1 | 258.2 |

CPU repeat run (colab-t4-graphite) vs first run: median ratio 1.008, range 0.968–1.113 over 27 scene/resolution pairs.

### Animated sequences, 1080p, 30 fps (frame = seek + render; ms)
| scene | frames | backend | avg | median | p95 | total s | fps | no-readback median | png median (encode only) | vs CPU frames |
|---|---|---|---|---|---|---|---|---|---|---|
| css | 120 | cpu | 22.39 | 22.87 | 27.12 | 5.18 | 23.2 | 17.75 | 67.40 |  |
| css | 120 | gpu-gl | 12.16 | 11.72 | 15.45 | 3.99 | 30.1 | 5.74 | 68.71 | minor, minor, minor |
| css | 120 | gpu-vulkan | 12.60 | 12.00 | 16.70 | 4.07 | 29.5 | 5.93 | 67.48 | minor, minor, minor |
| css | 300 | cpu | 24.61 | 24.93 | 28.67 | 13.64 | 22.0 |  |  |  |
| css | 300 | gpu-gl | 13.59 | 13.63 | 16.97 | 10.35 | 29.0 |  |  | minor, minor, minor |
| css | 300 | gpu-vulkan | 14.22 | 14.30 | 17.98 | 10.51 | 28.6 |  |  | minor, minor, minor |
| gsap | 120 | cpu | 8.83 | 8.35 | 12.80 | 3.60 | 33.3 | 3.39 | 32.22 |  |
| gsap | 120 | gpu-gl | 9.22 | 8.72 | 13.16 | 3.63 | 33.0 | 1.66 | 32.36 | minor, minor, minor |
| gsap | 120 | gpu-vulkan | 8.94 | 8.42 | 12.29 | 3.58 | 33.5 | 1.65 | 32.17 | minor, minor, minor |
| gsap | 300 | cpu | 7.85 | 7.34 | 10.58 | 8.57 | 35.0 |  |  |  |
| gsap | 300 | gpu-gl | 9.29 | 9.29 | 11.79 | 9.04 | 33.2 |  |  | minor, minor, minor |
| gsap | 300 | gpu-vulkan | 9.99 | 10.17 | 12.22 | 9.28 | 32.3 |  |  | minor, minor, minor |
| effects | 120 | cpu | 35.33 | 35.22 | 39.57 | 6.75 | 17.8 | 29.37 | 110.38 |  |
| effects | 120 | gpu-gl | 13.25 | 12.91 | 17.33 | 4.13 | 29.1 | 6.96 | 108.29 | minor, minor, minor |
| effects | 120 | gpu-vulkan | 12.81 | 11.46 | 17.92 | 4.02 | 29.8 | 6.34 | 110.66 | minor, minor, minor |
| effects | 300 | cpu | 34.74 | 34.14 | 38.58 | 16.69 | 18.0 |  |  |  |
| effects | 300 | gpu-gl | 14.49 | 14.87 | 19.10 | 10.61 | 28.3 |  |  | minor, minor, minor |
| effects | 300 | gpu-vulkan | 14.44 | 14.90 | 19.11 | 10.59 | 28.3 |  |  | minor, minor, minor |
| css | 120 | gpu-graphite | 15.00 | 13.13 | 22.27 | 4.34 | 27.6 | 7.11 | 68.04 | minor, minor, minor |
| css | 300 | gpu-graphite | 17.99 | 19.65 | 23.71 | 11.65 | 25.8 |  |  | minor, minor, minor |
| gsap | 120 | gpu-graphite | 9.41 | 8.74 | 12.81 | 3.66 | 32.8 | 2.98 | 31.38 | minor, minor, minor |
| gsap | 300 | gpu-graphite | 11.21 | 11.91 | 14.03 | 9.61 | 31.2 |  |  | minor, minor, minor |
| effects | 120 | gpu-graphite | 13.42 | 11.90 | 19.77 | 4.09 | 29.3 | 5.26 | 108.27 | minor, minor, minor |
| effects | 300 | gpu-graphite | 16.77 | 18.12 | 22.46 | 11.38 | 26.4 |  |  | minor, minor, minor |

### Resource reuse, 1080p (median ms per frame; create/load/render/close for new renderers)
| scene | backend | mode | frame | create | load | render | close |
|---|---|---|---|---|---|---|---|
| A | cpu | reuse | 6.4 | – | – | 6.4 | – |
| A | cpu | new-renderer | 16.0 | 4.6 | 1.7 | 9.3 | 0.3 |
| A | gpu-gl | reuse | 6.7 | – | – | 6.7 | – |
| A | gpu-gl | new-renderer | 25.4 | 6.6 | 1.6 | 16.2 | 0.9 |
| A | gpu-gl | new-surface | 16.3 | 4.3 | 1.5 | 10.2 | 0.2 |
| A | gpu-vulkan | reuse | 6.5 | – | – | 6.5 | – |
| A | gpu-vulkan | new-renderer | 214.7 | 146.0 | 2.0 | 24.2 | 42.8 |
| A | gpu-vulkan | new-surface | 15.8 | 4.4 | 1.8 | 9.1 | 0.3 |
| E | cpu | reuse | 168.6 | – | – | 168.6 | – |
| E | cpu | new-renderer | 182.4 | 5.1 | 3.6 | 173.2 | 0.9 |
| E | gpu-gl | reuse | 32.9 | – | – | 32.9 | – |
| E | gpu-gl | new-renderer | 117.9 | 7.8 | 3.6 | 97.0 | 9.3 |
| E | gpu-gl | new-surface | 45.0 | 4.5 | 3.2 | 36.7 | 0.6 |
| E | gpu-vulkan | reuse | 27.3 | – | – | 27.3 | – |
| E | gpu-vulkan | new-renderer | 415.1 | 198.7 | 3.8 | 141.1 | 68.5 |
| E | gpu-vulkan | new-surface | 37.6 | 4.5 | 3.1 | 29.3 | 0.6 |
| A | gpu-graphite | reuse | 6.9 | – | – | 6.9 | – |
| A | gpu-graphite | new-renderer | 257.3 | 178.3 | 1.9 | 24.4 | 52.4 |
| A | gpu-graphite | new-surface | 16.7 | 4.6 | 1.6 | 9.7 | 0.5 |
| E | gpu-graphite | reuse | 35.7 | – | – | 35.7 | – |
| E | gpu-graphite | new-renderer | 393.0 | 189.8 | 3.3 | 132.1 | 67.9 |
| E | gpu-graphite | new-surface | 71.3 | 5.0 | 3.2 | 53.5 | 9.4 |

### Several renderers on one thread (scene E, 1080p, round-robin)
| backend | device | renderers | create all ms | fps | frame median | RSS MiB base→loaded→closed | GPU MiB (process, loaded→closed) | Skia GPU cache MiB | close all ms | exit |
|---|---|---|---|---|---|---|---|---|---|---|
| cpu | - | 1 | 9 | 5.9 | 169.4 | 61→166→157 | –→– | 0 | 1 | 0 |
| cpu | - | 2 | 16 | 5.6 | 175.3 | 62→256→238 | –→– | 0 | 2 | 0 |
| cpu | - | 4 | 31 | 5.8 | 171.0 | 61→436→400 | –→– | 0 | 4 | 0 |
| cpu | - | 8 | 67 | 5.7 | 172.9 | 62→797→724 | –→– | 0 | 8 | 0 |
| gpu-gl | renderer | 1 | 131 | 32.2 | 30.4 | 62→319→299 | –→– | 144 | 13 | 0 |
| gpu-gl | renderer | 2 | 133 | 30.8 | 32.2 | 61→439→393 | –→– | 287 | 27 | 0 |
| gpu-gl | renderer | 4 | 133 | 30.4 | 32.2 | 61→681→594 | –→– | 574 | 56 | 0 |
| gpu-gl | renderer | 8 | 168 | 29.3 | 33.4 | 61→1165→989 | –→– | 1149 | 108 | 0 |
| gpu-gl | thread | 1 | 109 | 31.8 | 31.0 | 61→318→297 | –→– | 144 | 13 | 0 |
| gpu-gl | thread | 2 | 116 | 31.4 | 31.6 | 62→408→378 | –→– | 151 | 15 | 0 |
| gpu-gl | thread | 4 | 127 | 31.7 | 30.8 | 61→588→539 | –→– | 167 | 18 | 0 |
| gpu-gl | thread | 8 | 158 | 31.3 | 31.2 | 61→948→863 | –→– | 199 | 26 | 0 |
| gpu-vulkan | renderer | 1 | 236 | 37.3 | 26.3 | 61→358→225 | 161→– | 169 | 86 | 0 |
| gpu-vulkan | renderer | 2 | 333 | 36.0 | 27.6 | 61→499→317 | 316→– | 337 | 130 | 0 |
| gpu-vulkan | renderer | 4 | 503 | 37.1 | 26.4 | 61→773→502 | 629→– | 674 | 236 | 0 |
| gpu-vulkan | renderer | 8 | 968 | 35.0 | 28.2 | 61→1323→872 | 1254→– | 1348 | 612 | 0 |
| gpu-vulkan | thread | 1 | 253 | 37.0 | 26.5 | 61→358→225 | 161→– | 169 | 88 | 0 |
| gpu-vulkan | thread | 2 | 243 | 35.4 | 27.8 | 61→448→307 | 171→– | 176 | 91 | 0 |
| gpu-vulkan | thread | 4 | 295 | 37.0 | 26.7 | 61→627→471 | 191→– | 192 | 93 | 0 |
| gpu-vulkan | thread | 8 | 295 | 35.0 | 28.2 | 61→987→800 | 231→– | 224 | 104 | 0 |
| gpu-graphite | renderer | 1 | 273 | 26.0 | 37.2 | 61→336→223 | 174→– | 0 | 72 | 0 |
| gpu-graphite | renderer | 2 | 326 | 26.8 | 37.1 | 62→454→314 | 342→– | 0 | 126 | 0 |
| gpu-graphite | renderer | 4 | 584 | 28.6 | 34.7 | 62→690→495 | 681→– | 0 | 206 | 0 |
| gpu-graphite | renderer | 8 | 943 | 26.6 | 37.6 | 61→1160→861 | 1359→– | 0 | 438 | 0 |
| gpu-graphite | thread | 1 | 247 | 25.3 | 38.6 | 61→336→222 | 174→– | 0 | 87 | 0 |
| gpu-graphite | thread | 2 | 262 | 25.9 | 38.5 | 62→428→306 | 250→– | 0 | 94 | 0 |
| gpu-graphite | thread | 4 | 251 | 27.2 | 36.2 | 61→611→474 | 401→– | 0 | 109 | 0 |
| gpu-graphite | thread | 8 | 300 | 24.9 | 39.7 | 61→978→808 | 710→– | 0 | 161 | 0 |

### Worker threads (effects scene, 1080p; each worker owns its renderer and device)
| backend | workers | wall ms | fps | create median ms | close median ms | frames ≠ 1-worker run | distinct devices |
|---|---|---|---|---|---|---|---|
| cpu | 1 | 6777 | 17.7 | 48 | 1.1 | 0 | 1 |
| cpu | 2 | 3546 | 33.8 | 40 | 0.5 | 0 | 1 |
| cpu | 4 | 1991 | 60.3 | 46 | 0.6 | 0 | 1 |
| cpu | 8 | 1675 | 71.6 | 64 | 0.7 | 0 | 1 |
| gpu-gl | 1 | 4345 | 27.6 | 169 | 3.4 | 0 | 1 |
| gpu-gl | 2 | 2311 | 51.9 | 142 | 2.2 | 0 | 1 |
| gpu-gl | 4 | 1470 | 81.6 | 214 | 5.5 | 0 | 1 |
| gpu-gl | 8 | 1742 | 68.9 | 322 | 5.0 | 0 | 1 |
| gpu-vulkan | 1 | 4493 | 26.7 | 282 | 129.6 | 0 | 1 |
| gpu-vulkan | 2 | 2640 | 45.5 | 348 | 48.8 | 0 | 1 |
| gpu-vulkan | 4 | 1939 | 61.9 | 592 | 37.3 | 0 | 1 |
| gpu-vulkan | 8 | 2108 | 56.9 | 774 | 74.1 | 0 | 1 |
| gpu-graphite | 1 | 4518 | 26.6 | 298 | 129.1 | 0 | 1 |
| gpu-graphite | 2 | 2749 | 43.7 | 394 | 67.2 | 0 | 1 |
| gpu-graphite | 4 | 1897 | 63.3 | 582 | 37.1 | 0 | 1 |
| gpu-graphite | 8 | 2164 | 55.5 | 791 | 47.3 | 0 | 1 |

- cpu: terminate() of 2 rendering workers → exit codes 1, 1; rendering afterwards correct: true; process exit 0
- gpu-gl: terminate() of 2 rendering workers → exit codes 1, 1; rendering afterwards correct: true; process exit 0
- gpu-vulkan: terminate() of 2 rendering workers → exit codes 1, 1; rendering afterwards correct: true; process exit 0
- gpu-graphite: terminate() of 2 rendering workers → exit codes 1, 1; rendering afterwards correct: true; process exit 0

### Determinism (1080p)
| backend | fresh instances | fresh processes (E) | long-lived, same document | long-lived, reloaded | GSAP replay mismatches |
|---|---|---|---|---|---|
| cpu | 5/5 identical: A B C D E F G1000 | 3/3 identical | B:same E:same F:same | B:same E:same F:same | 0/60 (first play vs replay: 30) |
| gpu-gl | 5/5 identical: A B C D E F G1000 | 3/3 identical | B:same E:same F:same | B:near-exact (max 2, 0.060%) E:same F:same | 0/60 (first play vs replay: 30) |
| gpu-vulkan | 5/5 identical: A B C D E F G1000 | 3/3 identical | B:same E:same F:same | B:near-exact (max 2, 0.095%) E:same F:same | 0/60 (first play vs replay: 30) |
| gpu-graphite | 5/5 identical: A B C D E F G1000 | 3/3 identical | B:DIFF E:same F:same | B:near-exact (max 2, 0.057%) E:same F:same | 0/60 (first play vs replay: 30) |

### Memory (scene C, 1080p): RSS MiB / GPU process MiB / Skia GPU cache MiB
| backend | device | baseline | gpu initialized (1 renderer, empty) | 1 renderer | 4 renderers | 8 renderers | after close | 300 anim frames (RSS) | 30 cycles (RSS) |
|---|---|---|---|---|---|---|---|---|---|
| cpu | - | 62 / – / 0 | 64 / – / 0 | 118 / – / 0 | 245 / – / 0 | 411 / – / 0 | 411 / – / 0 | 421→421→421→421 | 421→421→421 |
| gpu-gl | renderer | 62 / – / 0 | 157 / – / 0 | 245 / – / 97 | 424 / – / 389 | 654 / – / 777 | 646 / – / 0 | 665→667→667→667 | 687→687→687 |
| gpu-gl | thread | 62 / – / 0 | 157 / – / 0 | 245 / – / 97 | 394 / – / 146 | 593 / – / 212 | 593 / – / 0 | 608→610→610→610 | 620→621→620 |
| gpu-vulkan | renderer | 62 / – / 0 | 200 / 6 / 0 | 299 / 116 / 121 | 547 / 442 / 482 | 870 / 880 / 964 | 495 / – / 0 | 615→615→615→615 | 520→520→519 |
| gpu-vulkan | thread | 62 / – / 0 | 200 / 6 / 0 | 299 / 116 / 121 | 424 / 177 / 170 | 582 / 259 / 235 | 459 / – / 0 | 577→577→577→577 | 483→483→483 |
| gpu-graphite | renderer | 62 / – / 0 | 201 / 17 / 0 | 286 / 255 / 0 | 498 / 1003 / 0 | 767 / 2003 / 0 | 493 / – / 0 | 608→608→608→608 | 517→517→517 |
| gpu-graphite | thread | 62 / – / 0 | 201 / 17 / 0 | 286 / 255 / 0 | 431 / 494 / 0 | 620 / 813 / 0 | 463 / – / 0 | 578→578→578→578 | 487→487→487 |

### Font retention (scene B, 40 iterations): RSS MiB every 10 iterations
| backend | mode | RSS | after close | Skia font cache MiB | after purge |
|---|---|---|---|---|---|
| cpu | per-renderer | 64→91→91→91→92 | 92 | 1.4 | 92 |
| cpu | reused | 64→104→106→106→106 | 103 | 1.4 | 103 |
| gpu-gl | per-renderer | 64→295→311→311→312 | 312 | 1.4 | 307 |
| gpu-gl | reused | 64→261→264→264→264 | 245 | 1.4 | 245 |
| gpu-vulkan | per-renderer | 64→173→173→173→173 | 173 | 1.4 | 173 |
| gpu-vulkan | reused | 64→295→298→298→298 | 186 | 1.4 | 186 |
| gpu-graphite | per-renderer | 64→182→182→183→183 | 183 | 1.4 | 183 |
| gpu-graphite | reused | 64→284→287→287→287 | 168 | 1.4 | 168 |

### Failure probes
| probe | backend | process | result |
|---|---|---|---|
| init-failure | gpu-gl | exit 0 | `{"create":{"ok":false,"error":"GPU initialization failed (ganesh-gl): EGL device 99 does not exist (2 found)"},"cpuAfter":{"ok":true,"value":"6c466dc160e601c2"}}` |
| init-failure | gpu-vulkan | exit 0 | `{"create":{"ok":false,"error":"GPU initialization failed (ganesh-vulkan): Vulkan device 99 does not exist"},"cpuAfter":{"ok":true,"value":"6c466dc160e601c2"}}` |
| unsupported-backend | - | exit 0 | `{"create":{"ok":false,"error":"unsupported GPU backend \"gpu-metal\" in this build"},"shareOption":{"ok":false,"error":"experimentalGpuShare must be \"renderer\" or \"thread\", got \"process\""}}` |
| surface-failure | gpu-gl | exit 0 | `{"create":{"ok":false,"error":"GPU surface 70000x16 could not be created"},"gpuAfter":{"ok":true,"value":"2638fbe48a55204d"}}` |
| surface-failure | gpu-vulkan | exit 0 | `{"create":{"ok":false,"error":"GPU surface 70000x16 could not be created"},"gpuAfter":{"ok":true,"value":"8b908665323689ed"}}` |
| device-lost | gpu-gl | exit 0 | `{"render":{"ok":false,"error":"GPU render failed (ganesh-gl): GPU context is lost (abandoned)"},"renderNoReadback":{"ok":false,"error":"GPU render failed (ganesh-gl): GPU context is lost (abandoned)"},"siblingOnSameDevice":{"ok":false,"error":"GPU render faile` |
| device-lost | gpu-vulkan | exit 0 | `{"render":{"ok":false,"error":"GPU render failed (ganesh-vulkan): GPU context is lost (abandoned)"},"renderNoReadback":{"ok":false,"error":"GPU render failed (ganesh-vulkan): GPU context is lost (abandoned)"},"siblingOnSameDevice":{"ok":false,"error":"GPU rend` |
| use-after-close | gpu-gl | exit 0 | `{"render":{"ok":false,"error":"renderer is closed"},"info":{"backend":"closed"},"closeAgain":{"ok":true}}` |
| use-after-close | gpu-vulkan | exit 0 | `{"render":{"ok":false,"error":"renderer is closed"},"info":{"backend":"closed"},"closeAgain":{"ok":true}}` |
| gc-finalize | gpu-gl | exit 0 | `{"after":{"ok":true,"value":"2638fbe48a55204d"}}` |
| gc-finalize | gpu-vulkan | exit 0 | `{"after":{"ok":true,"value":"8b908665323689ed"}}` |
| exit-with-live-renderers | gpu-gl | exit 0 | `{"note":"process exits right after this line without close()"}` |
| exit-with-live-renderers | gpu-vulkan | exit 0 | `{"note":"process exits right after this line without close()"}` |
| out-of-memory | gpu-gl | exit 0 | `{"created":64,"failure":null,"after":{"ok":true,"value":"2638fbe48a55204d"}}` |
| out-of-memory | gpu-vulkan | exit 0 | `{"created":59,"failure":{"at":58,"error":"GPU render failed (ganesh-vulkan): GPU out of memory"},"after":{"ok":true,"value":"8b908665323689ed"}}` |
| init-failure | gpu-graphite | exit 0 | `{"create":{"ok":false,"error":"GPU initialization failed (graphite-vulkan): Vulkan device 99 does not exist"},"cpuAfter":{"ok":true,"value":"6c466dc160e601c2"}}` |
| unsupported-backend | - | exit 0 | `{"create":{"ok":false,"error":"unsupported GPU backend \"gpu-metal\" in this build (experimentalBackend needs an experimental GPU feature)"},"shareOption":{"ok":false,"error":"experimentalGpuShare must be \"renderer\" or \"thread\", got \"process\""}}` |
| surface-failure | gpu-graphite | exit 0 | `{"create":{"ok":false,"error":"GPU surface 70000x16 could not be created"},"gpuAfter":{"ok":true,"value":"defeff58bc992087"}}` |
| device-lost | gpu-graphite | exit 0 | `{"abandon":{"ok":false,"error":"Graphite has no abandon: device loss cannot be simulated"},"note":"device loss cannot be simulated on this backend"}` |
| use-after-close | gpu-graphite | exit 0 | `{"render":{"ok":false,"error":"renderer is closed"},"info":{"backend":"closed"},"closeAgain":{"ok":true}}` |
| gc-finalize | gpu-graphite | exit 0 | `{"after":{"ok":true,"value":"defeff58bc992087"}}` |
| exit-with-live-renderers | gpu-graphite | exit 0 | `{"note":"process exits right after this line without close()"}` |
| out-of-memory | gpu-graphite | exit 0 | `{"created":58,"failure":{"at":58,"error":"GPU surface 8192x8192 could not be created"},"after":{"ok":true,"value":"defeff58bc992087"}}` |

