#!/bin/sh
set -eu

exec sh scripts/with-node.sh pnpm exec tsx --test tests/*.test.ts