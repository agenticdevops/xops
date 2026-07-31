#!/usr/bin/env bash
# Provision a namespace-scoped ServiceAccount + Role and emit a kubeconfig
# whose only power is that namespace (aoh pattern: RBAC is the hard boundary,
# the kubectl shim allowlist is defense-in-depth on top).
#
# Usage: provision-poc-rbac.sh <namespace> [context] [outfile]
set -euo pipefail

NS="${1:?usage: provision-poc-rbac.sh <namespace> [context] [outfile]}"
CTX="${2:-kind-troublesim}"
OUT="${3:-$HOME/.opspilot/workspace/kubeconfig-${NS}}"
SA="opspilot-agent"

kubectl --context "$CTX" -n "$NS" apply -f - <<EOF
apiVersion: v1
kind: ServiceAccount
metadata:
  name: ${SA}
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: ${SA}
rules:
  - apiGroups: [""]
    resources: [pods, events, services, configmaps]
    verbs: [get, list, watch]
  - apiGroups: [""]
    resources: [pods/log]
    verbs: [get]
  - apiGroups: [apps]
    resources: [deployments, replicasets, statefulsets]
    verbs: [get, list, watch, patch, update]
  - apiGroups: [apps]
    resources: [deployments/scale]
    verbs: [get, patch, update]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: ${SA}
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: ${SA}
subjects:
  - kind: ServiceAccount
    name: ${SA}
    namespace: ${NS}
EOF

TOKEN=$(kubectl --context "$CTX" -n "$NS" create token "$SA" --duration=2h)
SERVER=$(kubectl config view --minify --context "$CTX" -o jsonpath='{.clusters[0].cluster.server}')
CA_DATA=$(kubectl config view --minify --context "$CTX" --raw -o jsonpath='{.clusters[0].cluster.certificate-authority-data}')

mkdir -p "$(dirname "$OUT")"
cat > "$OUT" <<EOF
apiVersion: v1
kind: Config
clusters:
  - name: scoped
    cluster:
      server: ${SERVER}
      certificate-authority-data: ${CA_DATA}
users:
  - name: ${SA}
    user:
      token: ${TOKEN}
contexts:
  - name: scoped
    context:
      cluster: scoped
      user: ${SA}
      namespace: ${NS}
current-context: scoped
EOF
chmod 600 "$OUT"
echo "scoped kubeconfig: $OUT"
