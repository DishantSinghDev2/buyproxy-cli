#!/bin/sh
# BuyProxy CLI installer — https://github.com/DishantSinghDev2/buyproxy-cli
#
#   curl -fsSL https://raw.githubusercontent.com/DishantSinghDev2/buyproxy-cli/main/install.sh | sh
#
# Options (pass after `sh -s --`):
#   --standalone     install a single-file copy to ~/.local/bin instead of using npm
#   --version X.Y.Z  install a specific release (default: latest)
set -eu

REPO="DishantSinghDev2/buyproxy-cli"
PKG="buyproxy-cli"
MODE="auto"
VERSION="latest"

while [ $# -gt 0 ]; do
  case "$1" in
    --standalone) MODE="standalone" ;;
    --version) shift; VERSION="${1:?--version needs a value}" ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

say()  { printf '\033[1;38;5;208m▸\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m✖\033[0m %s\n' "$*" >&2; exit 1; }

command -v node >/dev/null 2>&1 || fail "BuyProxy CLI needs Node.js 18 or newer. Install it from https://nodejs.org (or: brew install node), then re-run this script."
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 18 ] || fail "Node.js $NODE_MAJOR is too old — BuyProxy CLI needs 18 or newer."

if [ "$MODE" = "auto" ]; then
  if command -v npm >/dev/null 2>&1; then MODE="npm"; else MODE="standalone"; fi
fi

if [ "$MODE" = "npm" ]; then
  say "Installing $PKG@$VERSION with npm…"
  if ! npm install -g "$PKG@$VERSION" >/dev/null 2>&1; then
    say "Global install needs elevated permissions — installing to ~/.local instead."
    npm install -g --prefix "$HOME/.local" "$PKG@$VERSION"
  fi
else
  DEST="${BUYPROXY_INSTALL_DIR:-$HOME/.local/bin}"
  mkdir -p "$DEST"
  if [ "$VERSION" = "latest" ]; then URL="https://github.com/$REPO/releases/latest/download/buyproxy.mjs"
  else URL="https://github.com/$REPO/releases/download/v${VERSION#v}/buyproxy.mjs"; fi
  say "Downloading $URL"
  if command -v curl >/dev/null 2>&1; then curl -fsSL "$URL" -o "$DEST/buyproxy"
  elif command -v wget >/dev/null 2>&1; then wget -q "$URL" -O "$DEST/buyproxy"
  else fail "Need curl or wget."; fi
  chmod +x "$DEST/buyproxy"
fi

if command -v buyproxy >/dev/null 2>&1; then
  say "Installed $(buyproxy --version). Run \033[1mbuyproxy\033[0m to get started."
else
  say "Installed. Add it to your PATH, e.g.:  export PATH=\"\$HOME/.local/bin:\$PATH\""
fi
