---
name: k8s-pod-restart-triage
description: 'Diagnose and fix Kubernetes pods that keep restarting (CrashLoopBackOff,
  liveness-probe kills, OOM). Use when: pods restart repeatedly, workloads flap, or
  restart counts climb.'
metadata:
  aof:
    version: 0.1.0
    tier: worker
    risk: medium
    escalate_when: "root cause not in decision table; fix fails verification twice; any fix would delete data"
---
# Kubernetes Pod Restart Triage

## Procedure
1. Collect evidence FIRST — run exactly:
   `bash <skill-dir>/scripts/diagnose.sh -n <NAMESPACE> --focus restart`
   The skill directory is where this SKILL.md lives (shown when the skill loads); scripts/ sits beside it.
   Do not run other discovery commands before reading its JSON output.
2. Classify the root cause using the Decision Table below against the JSON.
3. Apply ONLY the mapped fix using `kubectl -n <NAMESPACE>`.
4. Verify: wait 30s, re-run diagnose.sh; pods must be Ready and restartCount stable.
   If still failing, retry classification ONCE with the new evidence.
5. Report: root cause, fix applied, exact commands, verification result.

## Decision Table
| Evidence pattern (from diagnose JSON) | Root cause | Fix |
|---|---|---|
| `containers[].terminated_exit` non-zero AND `logs.previous` shows an application error (e.g. cannot connect, missing config, exception) | App exits due to bad config/env | Inspect the deployment env (`kubectl get deploy <d> -o yaml`). If a value is clearly wrong (unreachable host, missing var), fix is context-dependent: if no correct value is derivable, make the container viable and REPORT the suspect env var (e.g. for a test app whose command exits deliberately, patch the command to a long-running healthy one) |
| Events show `Unhealthy ... liveness probe failed` AND `focus.probe_targets` liveness path/port ≠ any containerPort or a known-served path | Misconfigured liveness probe | Patch the probe to the real port/path: `kubectl -n <ns> patch deploy <d> --type=json -p='[{"op":"replace","path":"/spec/template/spec/containers/0/livenessProbe/httpGet/port","value":<containerPort>},{"op":"replace","path":"/spec/template/spec/containers/0/livenessProbe/httpGet/path","value":"/"}]'` (also fix readinessProbe if same defect) |
| `terminated_reason == "OOMKilled"` or exit 137 | Memory limit too low | Raise the memory limit ~2x current |
| Restarts but none of the above match | Unknown | ESCALATE (see criteria) |

## Escalation
Stop and report — do not guess — when: no decision-table row matches; the same fix fails
verification twice; the only candidate fix deletes a resource holding data.

## Safety
Never delete namespaces, deployments, PVCs, secrets. Allowed verbs: get, describe, logs,
patch, set, rollout, scale.
