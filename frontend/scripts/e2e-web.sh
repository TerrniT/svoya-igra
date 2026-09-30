#!/bin/sh
set -e
export PATH="/usr/local/go/bin:${PATH}"
ROOT="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"
go run -C "$ROOT/backend" ./cmd/server &
trap 'kill $! 2>/dev/null || true' EXIT
i=0
while [ "$i" -lt 50 ]; do
  if curl -sf http://127.0.0.1:8080/health >/dev/null; then
    break
  fi
  i=$((i + 1))
  sleep 0.1
done
exec pnpm exec vite --host 127.0.0.1 --port 4173 --strictPort
