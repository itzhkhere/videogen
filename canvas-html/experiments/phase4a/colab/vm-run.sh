#!/bin/bash
# Runs the Phase 4A suite on the Colab VM: Ganesh build (cpu, gpu-gl, gpu-vulkan), then the
# Graphite build (cpu, gpu-graphite). Results: /content/results.tgz
cd /content/canvas-html/experiments/phase4a
export PATH=/content/node24/bin:$PATH PHASE4A_REQUIRE_HW=1 PHASE4A_OOM=1
nvidia-smi --query-gpu=name,driver_version,clocks.sm,clocks.max.sm,temperature.gpu,power.draw --format=csv
PHASE4A_TAG=colab-t4 PHASE4A_BACKENDS=cpu,gpu-gl,gpu-vulkan CANVAS_HTML_NODE=build/canvas-html-gpu.node node run-all.mjs; echo "GANESH_EXIT=$?"
PHASE4A_TAG=colab-t4-graphite PHASE4A_BACKENDS=cpu,gpu-graphite CANVAS_HTML_NODE=build/canvas-html-graphite.node node run-all.mjs; echo "GRAPHITE_EXIT=$?"
nvidia-smi --query-gpu=name,clocks.sm,temperature.gpu,power.draw --format=csv
tar -czf /content/results.tgz results/colab-t4 results/colab-t4-graphite && ls -l /content/results.tgz
echo ALL_DONE
