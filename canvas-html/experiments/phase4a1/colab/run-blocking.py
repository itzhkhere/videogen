# Executed in the Colab kernel by `colab exec`: keeps the kernel busy (so the session stays
# alive) while a shell script runs; streams its log. Env: SCRIPT (path on the VM), LOG.
import os, subprocess, sys, time
script, log = os.environ["SCRIPT"], os.environ.get("LOG", "/content/run.log")
with open(log, "w") as f:
    p = subprocess.Popen(["bash", script], stdout=f, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, start_new_session=True)
pos = 0
while True:
    done = p.poll() is not None
    with open(log) as f:
        f.seek(pos); chunk = f.read(); pos = f.tell()
    if chunk:
        sys.stdout.write(chunk); sys.stdout.flush()
    if done:
        break
    time.sleep(10)
print(f"EXIT {p.returncode}", flush=True)
