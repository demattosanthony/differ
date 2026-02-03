#!/usr/bin/env bash
set -euo pipefail

REPO="demattosanthony/differ"
VERSION="${DIFFER_VERSION:-latest}"

OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin) platform="darwin" ;;
  Linux) platform="linux" ;;
  *)
    echo "differ: unsupported OS: $OS" >&2
    exit 1
    ;;
esac

case "$ARCH" in
  x86_64) arch="x64" ;;
  arm64|aarch64) arch="arm64" ;;
  *)
    echo "differ: unsupported arch: $ARCH" >&2
    exit 1
    ;;
esac

if [ "$VERSION" = "latest" ]; then
  tag=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | sed -n 's/.*"tag_name": "\([^"]*\)".*/\1/p')
  if [ -z "$tag" ]; then
    echo "differ: failed to resolve latest release tag" >&2
    exit 1
  fi
else
  case "$VERSION" in
    v*) tag="$VERSION" ;;
    *) tag="v$VERSION" ;;
  esac
fi

asset="differ-${tag}-${platform}-${arch}.tar.gz"
url="https://github.com/$REPO/releases/download/$tag/$asset"

tmp="$(mktemp -d)"
cleanup() { rm -rf "$tmp"; }
trap cleanup EXIT

echo "differ: downloading $url"
curl -fsSL "$url" -o "$tmp/$asset"

mkdir -p "$tmp/payload"
tar -xzf "$tmp/$asset" -C "$tmp/payload"

prefix="${PREFIX:-/usr/local}"
if [ ! -w "$prefix" ]; then
  prefix="$HOME/.local"
fi

install_dir="${INSTALL_DIR:-$prefix/lib/differ}"
bin_dir="${BIN_DIR:-$prefix/bin}"

sudo_cmd=""
if [ ! -w "$(dirname "$install_dir")" ] || [ ! -w "$(dirname "$bin_dir")" ]; then
  if command -v sudo >/dev/null 2>&1; then
    sudo_cmd="sudo"
  else
    echo "differ: need write access to $install_dir and $bin_dir" >&2
    exit 1
  fi
fi

$sudo_cmd mkdir -p "$install_dir" "$bin_dir"
$sudo_cmd rm -rf "$install_dir"
$sudo_cmd mkdir -p "$install_dir"
$sudo_cmd cp -R "$tmp/payload/." "$install_dir/"
$sudo_cmd chmod +x "$install_dir/differ"
$sudo_cmd ln -sf "$install_dir/differ" "$bin_dir/differ"

echo "differ: installed to $install_dir"
echo "differ: symlinked to $bin_dir/differ"

if ! command -v differ >/dev/null 2>&1; then
  echo "differ: add $bin_dir to your PATH"
fi
