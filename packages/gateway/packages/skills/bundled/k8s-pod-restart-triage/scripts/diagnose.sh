#!/usr/bin/env bash
# Generic k8s workload evidence collector. Read-only. Output: one JSON doc.
set -euo pipefail
NS=""; FOCUS=""
while [ $# -gt 0 ]; do case "$1" in
  -n) NS="$2"; shift 2;;
  --focus) FOCUS="$2"; shift 2;;
  *) echo "usage: diagnose.sh -n NAMESPACE [--focus image|scheduling|restart]" >&2; exit 2;;
esac; done
[ -n "$NS" ] || { echo "namespace required (-n)" >&2; exit 2; }
K="kubectl -n $NS"

deployments=$($K get deploy -o json | jq '[.items[] | {name:.metadata.name,
  replicas:.spec.replicas, ready:(.status.readyReplicas//0),
  conditions:[.status.conditions[]? | {type,status,reason,message}]}]')

pods=$($K get pods -o json | jq '[.items[] | {name:.metadata.name, phase:.status.phase,
  conditions:[.status.conditions[]? | select(.status!="True") | {type,reason,message}],
  containers:[.status.containerStatuses[]? | {name, ready, restartCount,
    waiting:.state.waiting.reason?, terminated_exit:.lastState.terminated.exitCode?,
    terminated_reason:.lastState.terminated.reason?}],
  images:[.spec.containers[].image],
  probes:[.spec.containers[] | {name, liveness:.livenessProbe?, readiness:.readinessProbe?}],
  resources:[.spec.containers[] | {name, requests:.resources.requests?, limits:.resources.limits?}],
  volumes:[.spec.volumes[]? | {name, configMap:.configMap.name?, secret:.secret.secretName?}]}]')

events=$($K get events --sort-by=.lastTimestamp -o json | jq '[.items[-15:][] |
  {type, reason, object:.involvedObject.name, message}]')

logs="{}"
for p in $($K get pods -o name | head -5); do
  cur_txt=$($K logs "$p" --tail=20 2>/dev/null || true)
  prev_txt=$($K logs "$p" --previous --tail=20 2>/dev/null || true)
  cur=$(printf '%s' "$cur_txt" | jq -Rs .)
  prev=$(printf '%s' "$prev_txt" | jq -Rs .)
  logs=$(echo "$logs" | jq --arg p "${p#pod/}" --argjson c "$cur" --argjson v "$prev" '. + {($p): {current:$c, previous:$v}}')
done

focus_data="{}"
case "$FOCUS" in
  scheduling)
    focus_data=$(kubectl get nodes -o json | jq '{nodes:[.items[] |
      {name:.metadata.name, allocatable:{cpu:.status.allocatable.cpu, memory:.status.allocatable.memory}}]}');;
  image)
    focus_data=$($K get pods -o json | jq '{images:[.items[].spec.containers[].image] | unique,
      imagePullSecrets:[.items[].spec.imagePullSecrets[]?.name] | unique}');;
  restart)
    focus_data=$($K get pods -o json | jq '{probe_targets:[.items[].spec.containers[] |
      {name, ports:[.ports[]?.containerPort], livenessProbe, readinessProbe}]}');;
esac

jq -n --argjson d "$deployments" --argjson p "$pods" --argjson e "$events" \
      --argjson l "$logs" --argjson f "$focus_data" \
      '{deployments:$d, pods:$p, events:$e, logs:$l, focus:$f}'
