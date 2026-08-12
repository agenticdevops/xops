---
sidebar_position: 2
---

# Safe Kubernetes Triage with Scoped RBAC

This time, you are going to give the agent access to a Kubernetes cluster — and that changes the safety question entirely. A container on your laptop is disposable; a cluster is shared infrastructure. In this lab you build the **hard boundary**: a ServiceAccount jailed inside one namespace, so the agent's credentials physically cannot touch anything else, no matter what the model decides to try.

## What will you learn

- Why the guard shim alone is not enough for shared infrastructure
- How OpsPilot provisions a namespace-scoped kubeconfig (RBAC as the hard boundary)
- The full flow: break a workload → agent fixes it under both boundaries → independent verification

## Pre Requisites

- Completed the [Docker tutorial](fix-docker-container.md)
- `kubectl` and [kind](https://kind.sigs.k8s.io/) installed
- A local test cluster:

```
kind create cluster --name opspilot-lab
```

## Two boundaries, not one

```
        agent's kubectl command
                 │
                 ▼
   ┌──────────────────────────────┐
   │  Guard shim (defense-in-depth)│   verb allowlist from skill grants,
   │                              │   risk taxonomy, namespace pinning
   └──────────────┬───────────────┘
                  ▼
   ┌──────────────────────────────┐
   │  Scoped kubeconfig (HARD)    │   RBAC enforced by the API server —
   │                              │   a token that only works in one ns
   └──────────────┬───────────────┘
                  ▼
            your cluster
```

where,

- **Guard shim** — OpsPilot's process-level filter. Fast, auditable, but it lives on the same machine as the agent.
- **Scoped kubeconfig** — enforced by Kubernetes itself. Even a fully compromised agent process holding this file can only act inside its namespace.

## Break a workload

Create a namespace and a deployment with a deliberately wrong liveness probe:

`file: k8s/lab/broken-liveness.yaml`

```
apiVersion: apps/v1
kind: Deployment
metadata:
  name: liveness-probe-test
spec:
  replicas: 2
  selector:
    matchLabels: {app: liveness-probe-test}
  template:
    metadata:
      labels: {app: liveness-probe-test}
    spec:
      containers:
        - name: web
          image: nginx:alpine
          ports: [{containerPort: 80}]
          livenessProbe:
            httpGet: {port: 9999, path: /nonexistent-health-endpoint}
            initialDelaySeconds: 5
            periodSeconds: 5
```

To **apply** it:

```
kubectl create ns opspilot-lab-ns
kubectl -n opspilot-lab-ns apply -f k8s/lab/broken-liveness.yaml
```

Wait a minute, then **observe**:

```
kubectl -n opspilot-lab-ns get pods
```

```
[ Expected output ]
NAME                                   READY   STATUS             RESTARTS      AGE
liveness-probe-test-77464549fd-dpvmg   0/1     CrashLoopBackOff   5 (58s ago)   4m4s
liveness-probe-test-77464549fd-dxxmf   0/1     CrashLoopBackOff   5 (53s ago)   4m4s
```

nginx serves on port 80; the probe checks port 9999. Every probe failure kills the container. Why does the pod show `Running` briefly before each kill?

## Provision the scoped credential

```
bash scripts/provision-poc-rbac.sh opspilot-lab-ns kind-opspilot-lab
```

This creates a ServiceAccount, a Role limited to the verbs the triage skill needs (get, list, watch, patch on workloads — no delete, no secrets), a RoleBinding, and writes a kubeconfig with a 2-hour token to `~/.opspilot/workspace/kubeconfig-opspilot-lab-ns`.

**Prove the jail works** before trusting it:

```
KUBECONFIG=~/.opspilot/workspace/kubeconfig-opspilot-lab-ns kubectl get pods
KUBECONFIG=~/.opspilot/workspace/kubeconfig-opspilot-lab-ns kubectl get pods -n kube-system
```

```
[ Expected output ]
NAME                                   READY   STATUS             RESTARTS   AGE
liveness-probe-test-77464549fd-dpvmg   0/1     CrashLoopBackOff   6          6m
...
Error from server (Forbidden): pods is forbidden: User "system:serviceaccount:opspilot-lab-ns:opspilot-agent" cannot list resource "pods" in API group "" in the namespace "kube-system"
```

The first command works; the second is refused by the API server itself. That refusal is the hard boundary.

## Run the agent

```
bun scripts/poc-run.ts k8s opspilot-lab-ns
```

While it runs, note that the k8s runbook (`packages/skills/bundled/k8s-pod-restart-triage/SKILL.md`) has a decision-table row exactly for this: liveness probe targeting a port no container serves → patch the probe to the real port.

```
[ Expected output (guard log) ]
  ALLOW kubectl get pods -n opspilot-lab-ns -o wide
  ALLOW kubectl describe pod -n opspilot-lab-ns -l app=liveness-probe-test
  ALLOW kubectl get deployment liveness-probe-test -n opspilot-lab-ns -o json
  ALLOW kubectl patch deployment liveness-probe-test -n opspilot-lab-ns --type=json -p=[
  {"op": "replace", "path": "/spec/template/spec/containers/0/livenessProbe/httpGet/port", "value": 80},
  ...
  ALLOW kubectl rollout status deployment/liveness-probe-test -n opspilot-lab-ns --timeout=120s
```

## Verify the real state

```
kubectl -n opspilot-lab-ns get pods
```

```
[ Expected output ]
NAME                                   READY   STATUS    RESTARTS   AGE
liveness-probe-test-577cf6fdf5-ghlpx   1/1     Running   0          50s
liveness-probe-test-577cf6fdf5-tf9hd   1/1     Running   0          42s
```

A fresh ReplicaSet, both pods `1/1 Running`, zero restarts.

#### Exercise

The guard pins every command to the run's namespace. Test it: with the scoped kubeconfig active, try to make the *agent* act outside its namespace by editing the target in the run command:

```
bun scripts/poc-run.ts k8s kube-system
```

**Observe** where this fails. Which boundary stops it first — the guard shim or the RBAC token? Check `~/.opspilot/workspace/goose-poc/guard.jsonl` for the answer.

## Cleanup

```
kubectl delete ns opspilot-lab-ns
kind delete cluster --name opspilot-lab
rm -f ~/.opspilot/workspace/kubeconfig-opspilot-lab-ns
```

#### Summary

You built the two-boundary model that makes an autonomous ops agent tolerable on shared infrastructure: a guard shim that filters every command against the runbook's grants, and an RBAC-scoped credential the cluster itself enforces. The agent fixed a real CrashLoopBackOff without ever holding the power to do anything worse. Coming up on the roadmap, the same guarded pipeline runs unattended — scheduled heartbeats and morning briefings — which is exactly when you will be glad the boundary is enforced by the API server and not by a prompt.

##### Reading List

- [Kubernetes RBAC](https://kubernetes.io/docs/reference/access-authn-authz/rbac/)
- [Configure liveness probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)

**Search Keywords**

- CrashLoopBackOff liveness probe
- namespace-scoped ServiceAccount kubeconfig
- AI agent RBAC boundary
- fail-closed guardrails
