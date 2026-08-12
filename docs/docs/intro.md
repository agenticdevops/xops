---
sidebar_position: 1
---

# What is OpsPilot?

**Runbooks-as-code, executed by an AI agent under guardrails, with verification — driven from chat.**

OpsPilot is a self-hosted DevOps AI agent. You message it on Telegram about a broken workload, and it actually fixes the problem on your infrastructure — safely. It diagnoses using your runbook, applies only the fixes your runbook maps to the evidence, and reports back only after independently verifying the real system state.

## The problem it solves

AI agents are already good enough to run `kubectl` and `docker` commands. That is exactly the problem. A raw agent will happily run whatever command the model dreams up, with whatever credentials you gave it, and then tell you it worked — whether or not it did.

OpsPilot exists to make an ops agent **trustworthy enough to act on its own**:

| Layer | What it does |
|-------|-------------|
| **Scoped credentials** | The agent gets a namespace-jailed kubeconfig, never your admin one. This is the hard security boundary — enforced by your cluster, not by prompts. |
| **Fail-closed command guard** | Every `kubectl`/`docker` call passes through a shim. Commands are checked against a risk taxonomy (186 commands classified LOW to CRITICAL) and the skill's declared grants. `delete`, `rm`, `prune` never execute — no mode, no prompt trick, no exception. |
| **Executable runbooks (skills)** | The agent does not freestyle. It reads your runbook: a diagnose script that collects evidence as JSON, a decision table mapping evidence to fixes, and explicit escalation criteria. |
| **Independent verification** | After every run, OpsPilot checks the actual cluster/container state itself. The agent's "fixed it" claim is never the answer you see. |
| **Audit trail** | Every command the agent attempted is logged with its allow/deny decision. |

## Architecture at a glance

```
Telegram message
      │
      ▼
  OpsPilot gateway ──► goose (agent engine, runs the LLM loop)
      │                    │
      │                    ▼
      │            guarded shell: kubectl / docker
      │            (risk taxonomy + skill grants + namespace pinning)
      │                    │
      │                    ▼
      │            your infrastructure (scoped credentials only)
      │
      ▼
  independent verification ──► verified reply to your phone
```

OpsPilot uses [Block's goose](https://github.com/block/goose) as the agent engine — the LLM loop, tool calls, and session handling are goose's job. OpsPilot is the **harness** around it (skills, guard, verification, credentials) plus the **product shell** (channels, memory, setup wizard, scheduled automation).

## What it looks like in practice

You send: *"pods are crashlooping in payments-staging, fix it"*

OpsPilot replies a couple of minutes later:

> **Root cause:** liveness probe targeted port 9999, path `/nonexistent-health-endpoint`; nginx only listens on port 80. Every probe failure killed the container.
>
> **Fix applied:** `kubectl patch deployment ... livenessProbe/httpGet/port: 80 ...`
>
> ✅ verified: 2/2 pods healthy
> guard: 6 kubectl calls, 0 denied · 94s

The verification line comes from OpsPilot checking the cluster itself, after the agent finished.

## Project status

OpsPilot is in active early development. The core spine — Telegram → goose → guarded action → independent verification — works end-to-end today for Kubernetes and Docker triage. Personas, richer intent routing, the setup wizard, memory-informed runs, and scheduled automation are on the [roadmap](https://github.com/opsflow-sh/opspilot).

## Where to go next

- [Getting Started](getting-started.md) — install and run your first guarded agent action
- [Tutorial: Fix a Crashing Docker Container](tutorials/fix-docker-container.md) — zero-infrastructure, fully local
- [Tutorial: Safe Kubernetes Triage with Scoped RBAC](tutorials/safe-k8s-triage.md) — the full harness on a kind cluster
