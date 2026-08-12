#!/usr/bin/env bash
# Deterministic evidence collector for docker container triage.
# Usage: diagnose.sh <container-name-or-pattern>
# Emits a single JSON document on stdout.
set -euo pipefail

PATTERN="${1:?usage: diagnose.sh <container-name-or-pattern>}"

CID=$(docker ps -a --filter "name=${PATTERN}" --format '{{.ID}}' | head -1)
if [ -z "$CID" ]; then
  echo "{\"error\": \"no container matching '${PATTERN}'\"}"
  exit 0
fi

INSPECT=$(docker inspect "$CID")

LOGS_CURRENT=$(docker logs --tail 20 "$CID" 2>&1 | tail -c 2000 | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')

echo "$INSPECT" | python3 - "$LOGS_CURRENT" <<'EOF'
import json, sys

inspect = json.load(sys.stdin)[0]
logs = json.loads(sys.argv[1])

state = inspect.get("State", {})
health = state.get("Health") or {}
host_cfg = inspect.get("HostConfig", {})
cfg = inspect.get("Config", {})

out = {
    "container": inspect.get("Name", "").lstrip("/"),
    "image": cfg.get("Image"),
    "state": {
        "status": state.get("Status"),
        "exit_code": state.get("ExitCode"),
        "oom_killed": state.get("OOMKilled"),
        "restarting": state.get("Restarting"),
        "started_at": state.get("StartedAt"),
        "finished_at": state.get("FinishedAt"),
    },
    "restart_count": inspect.get("RestartCount"),
    "restart_policy": host_cfg.get("RestartPolicy", {}).get("Name"),
    "memory_limit_bytes": host_cfg.get("Memory"),
    "health": {
        "status": health.get("Status"),
        "failing_streak": health.get("FailingStreak"),
        "last_output": (health.get("Log") or [{}])[-1].get("Output", "")[:500] if health.get("Log") else "",
        "healthcheck_cmd": (cfg.get("Healthcheck") or {}).get("Test"),
    },
    "exposed_ports": list((cfg.get("ExposedPorts") or {}).keys()),
    "logs_tail": logs,
}
print(json.dumps(out, indent=2))
EOF
