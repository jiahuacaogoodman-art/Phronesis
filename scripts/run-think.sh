#!/bin/sh
set -eu

exec sh scripts/with-node.sh pnpm exec tsx src/cli.ts "$@"