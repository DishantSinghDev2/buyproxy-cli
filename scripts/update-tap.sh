#!/usr/bin/env bash
# Rewrites Formula/buyproxy.rb in the Homebrew tap for a freshly published version.
# Needs TAP_GITHUB_TOKEN (a token with contents:write on DishantSinghDev2/homebrew-tap).
set -euo pipefail
VERSION="${1:?usage: update-tap.sh <version>}"
: "${TAP_GITHUB_TOKEN:?TAP_GITHUB_TOKEN is not set}"

URL="https://registry.npmjs.org/buyproxy-cli/-/buyproxy-cli-${VERSION}.tgz"
for i in 1 2 3 4 5 6; do curl -fsSL "$URL" -o /tmp/buyproxy-cli.tgz && break || sleep 10; done
SHA=$(sha256sum /tmp/buyproxy-cli.tgz | cut -d' ' -f1)

git clone "https://x-access-token:${TAP_GITHUB_TOKEN}@github.com/DishantSinghDev2/homebrew-tap.git" /tmp/tap
cd /tmp/tap
sed -i -E "s|^  url \".*\"|  url \"${URL}\"|; s|^  sha256 \".*\"|  sha256 \"${SHA}\"|" Formula/buyproxy.rb
git config user.name "DishantSinghDev2"
git config user.email "dishantsinghdev@icloud.com"
git add Formula/buyproxy.rb
git commit -m "buyproxy ${VERSION}"
git push
