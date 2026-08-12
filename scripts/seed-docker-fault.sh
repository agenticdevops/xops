#!/usr/bin/env bash
# Seed a deliberately broken local container for docker-triage testing.
# Faults:
#   oom   (default) — python allocator with a tiny memory limit → OOM-kill loop.
#                     Fixable per decision table: raise memory limit + restart.
#   exit0           — one-shot clean exit; triage should restart, observe exit 0
#                     again, and report one-shot (no loop).
# Usage: seed-docker-fault.sh [oom|exit0]
set -euo pipefail

FAULT="${1:-oom}"
NAME="xops-victim"

docker rm -f "$NAME" >/dev/null 2>&1 || true

case "$FAULT" in
  oom)
    docker run -d --name "$NAME" --memory 16m --memory-swap 16m --restart on-failure:3 \
      python:3.12-alpine python3 -c 'b = bytearray(24 * 1024 * 1024); import time; time.sleep(3600)'
    ;;
  exit0)
    docker run -d --name "$NAME" alpine:3 sh -c 'echo done'
    ;;
  *)
    echo "unknown fault: $FAULT (use oom|exit0)" >&2; exit 1
    ;;
esac

sleep 8
docker ps -a --filter "name=$NAME" --format '{{.Names}} {{.Status}}'
echo "SEEDED $FAULT as $NAME"
