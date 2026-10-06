#!/bin/bash
# Phase 4A.3 L4 subset (Colab, NVIDIA L4): on Ganesh GL and Vulkan, the frame API and hardening
# tests (raw RGBA, transparent alpha, straight-alpha PNG, render/renderInto), output regression
# baseline (4A.1, byte-identical to 4A.2) → 4A.3 (raw bytes of render() and renderInto()), GPU vs CPU correctness at 720p/1080p, and
# 1080p/4K timing of render()/renderInto() for both builds.
cd /content/engine
export PATH=/content/node24/bin:$PATH
TAG=${TAG:-l4}
E=experiments/phase4a3/evidence/$TAG; mkdir -p "$E"
OLD=$PWD/experiments/phase4a3/build/gpu-baseline.node NEW=$PWD/experiments/phase4a3/build/gpu-4a3.node
nvidia-smi --query-gpu=name,driver_version,clocks.max.sm,temperature.gpu --format=csv | tee "$E/nvidia-smi.txt"
for b in gpu-gl gpu-vulkan; do
  HTML_RENDERER_NODE=$NEW HTML_RENDERER_BACKEND=$b node --expose-gc test/render-into.mjs; echo "RENDER_INTO_$b=$?"
  HTML_RENDERER_NODE=$NEW HTML_RENDERER_BACKEND=$b node test/render-into-workers.mjs; echo "WORKERS_$b=$?"
  HTML_RENDERER_NODE=$NEW HTML_RENDERER_BACKEND=$b node test/hardening.mjs; echo "HARDENING_$b=$?"
done > "$E/tests.log" 2>&1; grep -E 'passed|=|Error' "$E/tests.log"
for b in gpu-gl gpu-vulkan; do node experiments/phase4a3/output-regression.mjs "$OLD" "$NEW" $b $TAG; echo "REGRESSION_$b=$?"; done
cd experiments/phase4a && HTML_RENDERER_NODE=$NEW PHASE4A_TAG=colab-$TAG-4a3 PHASE4A_RES=720p,1080p node correctness.mjs > ../phase4a3/evidence/$TAG/correctness-4a.log 2>&1; echo "CORRECTNESS_EXIT=$?"
cp results/colab-$TAG-4a3/correctness.json ../phase4a3/evidence/$TAG/correctness-4a.json; cd ../..
node experiments/phase4a3/timing.mjs "$OLD" "$NEW" cpu,gpu-gl,gpu-vulkan $TAG; echo "TIMING_EXIT=$?"
mv experiments/phase4a3/evidence/output-regression-*-$TAG.json experiments/phase4a3/evidence/timing-$TAG.json "$E/" 2>/dev/null
tar -czf /content/results-4a3-$TAG.tgz "$E" && ls -l /content/results-4a3-$TAG.tgz
echo ALL_DONE
