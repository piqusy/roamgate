# Custom Roamgate builds

`roamgate update` rebuilds this custom Roamgate version from an official upstream release. It runs `update-custom.sh` from this checkout. Web-based installs are blocked.

From this checkout, run:

```sh
./update-custom.sh
```
The script clones into a temporary directory, applies `patches/0001-omp-and-update.patch`, runs `bun install --frozen-lockfile`, six targeted session and updater test files, builds the web client, then type-checks the server before compiling its binary directly. It gets the default tag from GitHub's latest-release API and accepts only stable `vX.Y.Z` tags. Building requires `git`, `bun`, `curl`, `jq`, and `rip`; macOS builds also require `codesign`. The Bun security scanner remains enabled. Scanner or network errors stop the update.
This selects the latest versioned official release tag. To build a specific tag, pass it as the sole argument:

```sh
./update-custom.sh v0.8.11
```

The script does not invoke package build scripts that run cleanup hooks. On macOS it ad-hoc signs the binary.

After compilation, the script runs the binary with `--version` and `--help`, saves the current regular install target as `<target>.previous`, then atomically replaces the target. It does not modify the target if it cannot create the backup. By default the target is `~/.local/bin/roamgate`, used by the service. To install a test build elsewhere without changing that binary:

```sh
ROAMGATE_CUSTOM_TARGET="$HOME/.local/bin/roamgate-custom-test" ./update-custom.sh
```

The script never restarts a service. After updating the default service binary, restart the service manually when you choose; the running process keeps using its loaded executable until then. A failed clone, patch, install, test, build, signing, or version check leaves the existing target untouched.
