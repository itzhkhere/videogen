**colab-t4-fix**: Ubuntu 24.04.4 LTS, Intel(R) Xeon(R) CPU @ 2.00GHz ×8, 51 GiB, Node v24.19.0, GPU Tesla T4, 580.82.07, 15360 MiB, 1590 MHz; addon canvas-html-gpu.node (42.0 MiB)
- gpu-gl: ganesh-gl via EGL device: NVIDIA Tesla T4; GL_RENDERER Tesla T4/PCIe/SSE2; GL_VERSION 3.3.0 NVIDIA 580.82.07
- gpu-vulkan: ganesh-vulkan: Tesla T4 (DISCRETE_GPU), driver 0x911481c0, API 1.4.312

### Correctness (CPU vs GPU, severity / % pixels differing / max delta / % pixels with delta > 32)

720p

| scene | gpu-gl | gpu-vulkan |
|---|---|---|
| A | minor / 0.74 / 53 / 0.005 | minor / 0.76 / 53 / 0.005 |
| B | minor / 73.36 / 11 / 0.000 | minor / 73.59 / 11 / 0.000 |
| C | minor / 83.86 / 53 / 0.009 | minor / 84.50 / 53 / 0.009 |
| D | minor / 87.08 / 53 / 0.008 | minor / 87.90 / 53 / 0.008 |
| E | minor / 89.90 / 66 / 0.010 | minor / 90.53 / 66 / 0.009 |
| F | edge-aa / 52.07 / 122 / 1.712 | edge-aa / 52.09 / 122 / 1.711 |
| G100 | minor / 12.73 / 63 / 0.014 | minor / 12.85 / 63 / 0.014 |
| G500 | minor / 45.52 / 66 / 0.046 | minor / 45.54 / 66 / 0.046 |
| G1000 | minor / 67.18 / 71 / 0.059 | minor / 67.12 / 71 / 0.059 |

1080p

| scene | gpu-gl | gpu-vulkan |
|---|---|---|
| A | minor / 0.47 / 64 / 0.004 | minor / 0.47 / 64 / 0.004 |
| B | edge-aa / 72.32 / 169 / 0.766 | edge-aa / 72.53 / 169 / 0.761 |
| C | minor / 83.71 / 54 / 0.001 | minor / 84.37 / 55 / 0.001 |
| D | minor / 87.17 / 68 / 0.002 | minor / 87.97 / 68 / 0.002 |
| E | minor / 84.60 / 82 / 0.007 | minor / 85.52 / 82 / 0.007 |
| F | edge-aa / 49.06 / 128 / 0.959 | edge-aa / 49.07 / 128 / 0.959 |
| G100 | minor / 12.49 / 70 / 0.014 | minor / 12.62 / 71 / 0.014 |
| G500 | minor / 44.79 / 90 / 0.038 | minor / 44.84 / 91 / 0.038 |
| G1000 | minor / 66.40 / 81 / 0.050 | minor / 66.36 / 81 / 0.051 |

4K

| scene | gpu-gl | gpu-vulkan |
|---|---|---|
| A | minor / 0.34 / 230 / 0.046 | minor / 0.34 / 231 / 0.046 |
| B | edge-aa / 70.92 / 216 / 1.022 | edge-aa / 71.12 / 215 / 1.014 |
| C | minor / 83.65 / 42 / 0.000 | minor / 84.31 / 42 / 0.000 |
| D | minor / 87.15 / 41 / 0.000 | minor / 87.94 / 41 / 0.000 |
| E | minor / 70.77 / 38 / 0.000 | minor / 72.02 / 38 / 0.000 |
| F | edge-aa / 45.57 / 104 / 0.116 | edge-aa / 45.58 / 104 / 0.116 |
| G100 | minor / 12.25 / 76 / 0.007 | minor / 12.38 / 76 / 0.007 |
| G500 | minor / 44.09 / 85 / 0.020 | minor / 44.18 / 85 / 0.020 |
| G1000 | minor / 65.64 / 91 / 0.025 | minor / 65.63 / 91 / 0.026 |

Attribution (720p, by ablation)

| scene | colab-t4-fix |
|---|---|
| A | text rasterization difference (text removes 96%) |
| B | text rasterization difference (text removes 100%) |
| C | image sampling difference (images removes 100%) |
| D | gradient interpolation difference (gradients removes 100%) |
| E | shadow/blur precision difference (shadows removes 41%) |
| F | geometry antialiasing difference (text removes 0%) |
| G100 | layer/opacity blending difference (opacity removes 70%) |
| G500 | layer/opacity blending difference (opacity removes 70%) |
| G1000 | layer/opacity blending difference (opacity removes 70%) |

### Determinism (1080p)
| backend | fresh instances | fresh processes (E) | long-lived, same document | long-lived, reloaded | GSAP replay mismatches |
|---|---|---|---|---|---|
| cpu | 5/5 identical: A B C D E F G1000 | 3/3 identical | B:same E:same F:same | B:same E:same F:same | 0/60 (first play vs replay: 30) |
| gpu-gl | 5/5 identical: A B C D E F G1000 | 3/3 identical | B:same E:same F:same | B:same E:same F:same | 0/60 (first play vs replay: 30) |
| gpu-vulkan | 5/5 identical: A B C D E F G1000 | 3/3 identical | B:same E:same F:same | B:same E:same F:same | 0/60 (first play vs replay: 30) |

