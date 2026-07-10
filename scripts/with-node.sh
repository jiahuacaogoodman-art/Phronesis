#!/bin/sh
set -eu

if command -v node >/dev/null 2>&1; then
  NODE_BIN="$(command -v node)"
elif [ -x "/Users/caojiahua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node" ]; then
  NODE_BIN="/Users/caojiahua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
else
  echo "Node.js >=20 is required." >&2
  exit 1
fi

PATH="$(dirname "$NODE_BIN"):$PATH"
export PATH

exec "$@"