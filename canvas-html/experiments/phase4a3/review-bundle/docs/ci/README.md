# CI (inactive draft)

There is no hosted CI: Rust builds of Stylo and Skia make it slow, so checks run locally with
`scripts/check.sh` (and `scripts/check-gpu.sh` for the experimental GPU backends) before every
commit. `check.yml` is a draft kept **outside** `.github/workflows/`, so GitHub does not run it.
To enable it, copy it to `.github/workflows/check.yml`; expect 20–40 minutes for a cold build
(the cargo cache brings later runs down).
