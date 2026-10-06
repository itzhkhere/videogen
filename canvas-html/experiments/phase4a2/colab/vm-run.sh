#!/bin/bash
# Phase 4A.2 hardware regression on a Colab T4 (short): output regression 4A.1 → 4A.2 (render and
# renderInto) on Ganesh GL and Vulkan, Phase 4A's GPU correctness subset with the 4A.2 GPU build,
# the small render()/renderInto() sanity matrix, and the renderInto tests on the GPU backends.
cd /content/canvas-html/experiments/phase4a2
export PATH=/content/node24/bin:$PATH
mkdir -p evidence/t4
nvidia-smi --query-gpu=name,driver_version,clocks.max.sm,temperature.gpu --format=csv | tee evidence/t4/nvidia-smi.txt
for b in gpu-gl gpu-vulkan; do node output-regression.mjs ../phase4a1/build/gpu.node build/gpu.node $b t4; echo "REGRESSION_$b=$?"; done
cd ../phase4a && CANVAS_HTML_NODE=../phase4a2/build/gpu.node PHASE4A_TAG=colab-t4-4a2 PHASE4A_RES=720p,1080p node correctness.mjs > ../phase4a2/evidence/t4/correctness-4a.log 2>&1; echo "CORRECTNESS_EXIT=$?"
cp results/colab-t4-4a2/correctness.json ../phase4a2/evidence/t4/correctness-4a.json; cd ../phase4a2
PHASE4A2_BACKENDS=cpu,gpu-gl,gpu-vulkan node sanity-bench.mjs t4; echo "BENCH_EXIT=$?"
for b in gpu-gl gpu-vulkan; do
  CANVAS_HTML_NODE=$PWD/build/gpu.node CANVAS_HTML_BACKEND=$b node --expose-gc ../../test/render-into.mjs; echo "RENDER_INTO_$b=$?"
  CANVAS_HTML_NODE=$PWD/build/gpu.node CANVAS_HTML_BACKEND=$b node ../../test/render-into-workers.mjs; echo "WORKERS_$b=$?"
done > evidence/t4/tests.log 2>&1; cat evidence/t4/tests.log | grep -E 'passed|=|Error'
mv evidence/output-regression-*-t4.json evidence/sanity-bench-t4.json evidence/t4/ 2>/dev/null
tar -czf /content/results-4a2.tgz evidence/t4 && ls -l /content/results-4a2.tgz
echo ALL_DONE
