#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [ -f ".env.local" ]; then
  set -a
  . ./.env.local
  set +a
fi

for var in THINK_LLM_PROVIDER THINK_LLM_BASE_URL THINK_LLM_API_KEY THINK_LLM_MODEL; do
  eval "value=\${$var-}"
  if [ -z "${value}" ]; then
    echo "Missing required environment variable: $var" >&2
    exit 1
  fi
done

pnpm think:compare --goal "${1:-做一个医院实习轮转管理系统}"