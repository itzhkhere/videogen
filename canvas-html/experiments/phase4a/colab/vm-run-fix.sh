#!/bin/bash
# Re-runs correctness and determinism on the VM with the Ganesh build that frees its purgeable
# GPU resources on load() (reload determinism fix). Results: /content/results-fix.tgz
cd /content/canvas-html/experiments/phase4a
cp /content/canvas-html-gpu-fix.node build/canvas-html-gpu.node
export PATH=/content/node24/bin:$PATH PHASE4A_REQUIRE_HW=1
PHASE4A_TAG=colab-t4-fix PHASE4A_BACKENDS=cpu,gpu-gl,gpu-vulkan CANVAS_HTML_NODE=build/canvas-html-gpu.node node run-all.mjs correctness determinism; echo "FIX_EXIT=$?"
tar -czf /content/results-fix.tgz results/colab-t4-fix && ls -l /content/results-fix.tgz
echo ALL_DONE
