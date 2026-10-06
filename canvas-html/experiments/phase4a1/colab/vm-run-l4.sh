#!/bin/bash
# Phase 4A.1 validation on an L4 (smaller matrix; the T4 run is the canonical one): GPU backends
# only; transport A/E/G1000 at 1080p and 4K; animated effects + gsap, 120 frames; pipelined
# readback on effects at 1080p and 4K; workers; lifetimes.
cd /content/canvas-html/experiments/phase4a1
export PATH=/content/node24/bin:$PATH PHASE4A1_REQUIRE_HW=1
nvidia-smi --query-gpu=name,driver_version,clocks.sm,clocks.max.sm,temperature.gpu,power.draw --format=csv
PHASE4A1_TAG=colab-l4 PHASE4A1_BACKENDS=gpu-gl,gpu-vulkan PHASE4A1_SCENES=A,E,G1000 PHASE4A1_RES=1080p,4K \
  PHASE4A1_ANIM=effects,gsap PHASE4A1_ANIM_FRAMES=120 PHASE4A1_PIPE_SCENES=effects \
  node run-all.mjs transport animated pipeline workers lifetimes; echo "SUITE_EXIT=$?"
tar -czf /content/results-4a1-l4.tgz results/colab-l4 && ls -l /content/results-4a1-l4.tgz
echo ALL_DONE
