#!/bin/sh
set -eu

if command -v node >/dev/null 2>&1 && node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 20 ? 0 : 1)" >/dev/null 2>&1; then
  NODE_BIN="$(command -v node)"
elif [ -x "/Users/caojiahua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node" ]; then
  NODE_BIN="/Users/caojiahua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
else
  echo "Node.js >=20 is required to run tests." >&2
  exit 1
fi

LOADER_IMPORT='data:text/javascript,import { register } from "node:module"; import { pathToFileURL } from "node:url"; register("./scripts/ts-loader.mjs", pathToFileURL("./"));'

exec "$NODE_BIN" --import "$LOADER_IMPORT" --test tests/*.test.ts