---
name: docker-container-triage
description: 'Diagnose and fix Docker containers that are unhealthy, restarting,
  or exited unexpectedly. Use when: a container flaps, healthcheck fails, or a
  service container is down.'
metadata:
  xops:
    version: 0.1.0
    tier: worker
    risk: medium
    grants: [ps, inspect, logs, stats, events, restart, update]
    escalate_when: "root cause not in decision table; fix fails verification twice; fix would require rm/rmi/prune or data loss"
---
# Docker Container Triage

## Procedure
1. Collect evidence FIRST — run exactly:
   `bash <skill-dir>/scripts/diagnose.sh <CONTAINER_NAME_OR_PATTERN>`
   The skill directory is where this SKILL.md lives; scripts/ sits beside it.
   Do not run other discovery commands before reading its JSON output.
2. Classify the root cause using the Decision Table below against the JSON.
3. Apply ONLY the mapped fix using `docker`.
4. Verify: wait 20s, re-run diagnose.sh; container must be running and healthy
   (or running with no healthcheck), restart count stable.
   If still failing, retry classification ONCE with the new evidence.
5. Report: root cause, fix applied, exact commands, verification result.

## Decision Table
| Evidence pattern (from diagnose JSON) | Root cause | Fix |
|---|---|---|
| `state.status == "exited"` AND `exit_code != 0` AND logs show an application error (missing env/config, connection refused) | App crashed on startup misconfig | Inspect env (`docker inspect <c> --format '{{json .Config.Env}}'`). If the container is restartable as-is is unclear, `docker restart <c>`; if it exits again with same error, ESCALATE with the log evidence |
| `state.status == "restarting"` or high `restart_count` AND `health.failing_streak > 0` AND healthcheck cmd targets a port/path the app does not serve | Misconfigured healthcheck | Healthcheck lives in image/run config — cannot patch in place. `docker update --restart=no <c>` to stop the flap, then ESCALATE reporting the correct port/path evidence |
| `state.oom_killed == true` or exit code 137 with memory limit set | Memory limit too low | `docker update --memory <2x current> --memory-swap <2x current> <c>` then `docker restart <c>` |
| `state.status == "exited"` AND `exit_code == 0` | Clean exit (one-shot or stopped) | `docker restart <c>`; if it exits 0 again it is a one-shot container — report, do not loop |
| Running but unhealthy, none of the above match | Unknown | ESCALATE (see criteria) |

## Escalation
Stop and report — do not guess — when: no decision-table row matches; the same fix
fails verification twice; the only candidate fix deletes a container, image, or
volume (rm/rmi/prune are never permitted).

## Safety
Never remove containers, images, volumes, or networks. Allowed commands: ps,
inspect, logs, stats, events, restart, update.
