#!/bin/sh
set -eu

cd "$(dirname "$0")"
node_bin=node
if [ "$(uname -s):$(uname -m)" = 'Darwin:arm64' ] && [ -x ./runtime/macos-arm64/node ]; then
  if ./runtime/macos-arm64/node --version >/dev/null 2>&1; then
    node_bin=./runtime/macos-arm64/node
  fi
fi

if ! "$node_bin" -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 23) ? 0 : 1)' 2>/dev/null; then
  printf '%s\n' 'Для запуска нужен Node.js 22.23 или новее.' >&2
  exit 1
fi

NODE_ENV=development exec "$node_bin" demo/dev.js "$@"
