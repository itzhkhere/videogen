# Moving the repository to the `harihkim` account

The repository was first pushed to `itzhkhere/harender` (private). Every commit is already
authored and committed by `Harikrishnan <hkupim@gmail.com>`, so moving it changes no history and
no hashes.

## Option A: transfer (keeps issues, settings, redirects)

1. On GitHub, `itzhkhere/harender` → Settings → General → Danger Zone → **Transfer ownership** →
   new owner `harihkim`, confirm the name.
2. `harihkim` accepts the transfer (email link) if it is a user account.
3. Locally: `git remote set-url origin https://github.com/harihkim/harender.git` (GitHub also
   redirects the old URL).

## Option B: fresh repository from the bundle or a clone

```sh
# as harihkim, after creating an empty private repository harihkim/harender
git clone --mirror https://github.com/itzhkhere/harender.git   # or: git clone harender.bundle
cd harender.git
git push --mirror https://github.com/harihkim/harender.git
```

`harender.bundle` (in the Phase 4A.3 review bundle) contains `main` and can be cloned without
network access: `git clone harender.bundle harender`.

## Afterwards

- Verify: `git log --format='%an <%ae> | %cn <%ce>' | sort -u` prints only Harikrishnan.
- Update `docs/PROJECT_IDENTITY.md` (repository row) and any clone URLs.
- The research repository (`itzhkhere/videogen`) is not moved; it keeps the scratch history and
  the archive tag described in `docs/GIT-HISTORY.md`.
