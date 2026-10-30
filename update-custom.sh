#!/usr/bin/env bash
set -Eeuo pipefail

repo_url="https://github.com/powerfooI/roamgate.git"
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
patch_file="$script_dir/patches/0001-omp-and-update.patch"

usage() {
  printf 'Usage: %s [release-tag]\n' "${0##*/}" >&2
  printf 'Builds the latest official release by default; installs to %s unless ROAMGATE_CUSTOM_TARGET is set.\n' "$HOME/.local/bin/roamgate" >&2
}

if [[ ${1-} == -h || ${1-} == --help ]]; then usage; exit 0; fi
if (( $# > 1 )); then usage; exit 2; fi
[[ -f "$patch_file" ]] || { printf 'Required patch not found: %s\n' "$patch_file" >&2; exit 1; }

command -v git >/dev/null || { echo 'git is required' >&2; exit 1; }
command -v bun >/dev/null || { echo 'bun is required' >&2; exit 1; }
command -v mktemp >/dev/null || { echo 'mktemp is required' >&2; exit 1; }
command -v curl >/dev/null || { echo 'curl is required' >&2; exit 1; }
command -v jq >/dev/null || { echo 'jq is required' >&2; exit 1; }

if (( $# == 1 )); then
  tag=$1
else
  latest_release=$(curl --fail --silent --show-error --location https://api.github.com/repos/powerfooI/roamgate/releases/latest)
  tag=$(jq -er '.tag_name | select(type == "string" and test("^v[0-9]+\\.[0-9]+\\.[0-9]+$"))' <<<"$latest_release") || {
    echo 'GitHub latest release returned an invalid or missing version tag' >&2
    exit 1
  }
fi
[[ $tag =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || { printf 'Invalid release tag: %s (expected vX.Y.Z)\n' "$tag" >&2; exit 2; }

install_target=${ROAMGATE_CUSTOM_TARGET:-$HOME/.local/bin/roamgate}
target_dir=$(dirname -- "$install_target")
mkdir -p -- "$target_dir"
tmp_root=$(mktemp -d "${TMPDIR:-/tmp}/roamgate-custom.XXXXXX")
cleanup() { rip "$tmp_root" >/dev/null 2>&1 || true; }
trap cleanup EXIT

source_dir="$tmp_root/source"
git clone --quiet --depth 1 --branch "$tag" "$repo_url" "$source_dir"
git -C "$source_dir" apply --check "$patch_file"
git -C "$source_dir" apply "$patch_file"

cd -- "$source_dir"
bun install --frozen-lockfile
bun test server/src/agent/session-resolver.test.ts server/src/agent/session-trajectory.test.ts server/src/agent/session-utils.test.ts server/src/cli/update.test.ts server/src/http/update.test.ts server/src/http/update-install.test.ts
bun run build:web
bun x tsc --noEmit -p server/tsconfig.json

# Invoke bun directly, avoiding package-script postcompile hooks which remove build artifacts.
cd -- "$source_dir/server"
if [[ $(uname -s) == Darwin ]]; then
  case $(uname -m) in
    arm64) bun_target=bun-darwin-arm64 ;;
    x86_64) bun_target=bun-darwin-x64 ;;
    *) printf 'Unsupported macOS architecture: %s\n' "$(uname -m)" >&2; exit 1 ;;
  esac
  bun build --compile --minify --asset ./public --no-compile-autoload-dotenv --no-compile-autoload-bunfig --target="$bun_target" src/index.ts --outfile "$tmp_root/roamgate"
  codesign --force --sign - "$tmp_root/roamgate"
else
  bun build --compile --minify --asset ./public --no-compile-autoload-dotenv --no-compile-autoload-bunfig src/index.ts --outfile "$tmp_root/roamgate"
fi
"$tmp_root/roamgate" --version
"$tmp_root/roamgate" --help

chmod 0755 "$tmp_root/roamgate"
install_tmp="$target_dir/.roamgate-custom.$$"
previous_target="$install_target.previous"
backup_tmp="$target_dir/.roamgate-custom-previous.$$"
previous_stash="$target_dir/.roamgate-custom-old-previous.$$"
cleanup_install_files() {
  rip "$install_tmp" "$backup_tmp" "$previous_stash" >/dev/null 2>&1 || true
  cleanup
}
trap cleanup_install_files EXIT

if [[ -e $install_target || -L $install_target ]]; then
  [[ -f $install_target && ! -L $install_target ]] || {
    printf 'Install target is not a regular file: %s\n' "$install_target" >&2
    exit 1
  }
  if [[ -e $previous_target || -L $previous_target ]]; then
    [[ -f $previous_target && ! -L $previous_target ]] || {
      printf 'Previous target is not a regular file: %s\n' "$previous_target" >&2
      exit 1
    }
    cp -p -- "$previous_target" "$previous_stash"
  fi
  cp -p -- "$install_target" "$backup_tmp"
  mv -f -- "$backup_tmp" "$previous_target"
  previous_updated=1
else
  previous_updated=0
fi

if ! cp -- "$tmp_root/roamgate" "$install_tmp"; then
  if (( previous_updated )); then
    if [[ -e $previous_stash ]]; then mv -f -- "$previous_stash" "$previous_target"; else rip "$previous_target" >/dev/null 2>&1 || true; fi
  fi
  exit 1
fi
if ! mv -f -- "$install_tmp" "$install_target"; then
  if (( previous_updated )); then
    if [[ -e $previous_stash ]]; then mv -f -- "$previous_stash" "$previous_target"; else rip "$previous_target" >/dev/null 2>&1 || true; fi
  fi
  exit 1
fi
printf 'Installed %s from %s. No service was restarted; restart it manually when ready.\n' "$install_target" "$tag"
