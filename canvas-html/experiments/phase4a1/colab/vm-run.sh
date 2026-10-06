#!/bin/bash
# Phase 4A.1 on the Colab VM: the whole suite (CPU, Ganesh GL, Ganesh Vulkan), then Phase 4A's
# GPU correctness subset with the new GPU build (hashes compared with Phase 4A's T4 run later).
cd /content/canvas-html/experiments/phase4a1
export PATH=/content/node24/bin:$PATH PHASE4A1_REQUIRE_HW=1 PHASE4A1_AS_LIMIT_KIB=$((5*1024*1024))
nvidia-smi --query-gpu=name,driver_version,clocks.sm,clocks.max.sm,temperature.gpu,power.draw --format=csv
PHASE4A1_TAG=colab-t4 PHASE4A1_BACKENDS=cpu,gpu-gl,gpu-vulkan node run-all.mjs; echo "SUITE_EXIT=$?"
cd ../phase4a && CANVAS_HTML_NODE=../phase4a1/build/gpu.node PHASE4A_TAG=colab-t4-4a1 PHASE4A_RES=720p,1080p node correctness.mjs > ../phase4a1/results/colab-t4/correctness-4a.log 2>&1; echo "CORRECTNESS_EXIT=$?"
cp results/colab-t4-4a1/correctness.json ../phase4a1/results/colab-t4/correctness-4a.json
cd ../phase4a1 && tar -czf /content/results-4a1.tgz results/colab-t4 && ls -l /content/results-4a1.tgz
echo ALL_DONE
