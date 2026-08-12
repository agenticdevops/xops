---
sidebar_position: 2
---

# Getting Started

This guide takes you from a fresh clone to your first guarded agent run. You will set up the engine, seed a deliberately broken container on your own machine, and watch xops diagnose and fix it — with every command it runs passing through the guard.

## Pre Requisites

- **[Bun](https://bun.sh/)** v1.0+ — the runtime for xops itself
- **[goose](https://block.github.io/goose/)** v1.45+ — the agent engine. Install and configure a provider:
  - `claude-acp` provider rides an existing Claude subscription (no API key, no per-token bill), or
  - any goose-supported provider (Anthropic API, OpenAI, Ollama, ...)
- **Docker** — for the local tutorial (Docker Desktop, Rancher Desktop, or plain dockerd)
- **kubectl + a kind cluster** — only for the Kubernetes tutorial, optional to start

`verify goose is ready before proceeding:`

```
goose --version
```

Any version 1.45 or newer works. Older versions lack `--output-format stream-json`, which xops depends on.

## Install

To **install** xops, clone the repository and install dependencies:

```
git clone https://github.com/opsflow-sh/xops.git
cd xops
bun install
```

To **verify** the engine test suite passes on your machine:

```
bun test packages/gateway/src/engine/
```

```
[ Expected output ]
 40 pass
 0 fail
Ran 40 tests across 6 files.
```

## Configure

xops reads its configuration from `~/.xops/config.yaml`.

`file: ~/.xops/config.yaml`

```
channels:
  telegram:
    enabled: true
    accounts:
      default:
        token: "<your-bot-token-from-@BotFather>"
        allowFrom:
          - your_telegram_username
```

The `allowFrom` list is an access control — only listed usernames can talk to your bot. Leave `channels` out entirely if you only want to drive xops from the command line for now.

## Your first guarded run

Seed a broken container — a Python process that allocates more memory than its container limit allows, so it gets OOM-killed on a loop:

```
bash scripts/seed-docker-fault.sh oom
```

Now hand it to the agent:

```
bun scripts/poc-run.ts docker xops-victim
```

Watch the output. You will see every command the agent attempted, each one stamped with the guard's decision:

```
[ Expected output ]
[poc] guard decisions: 5
  ALLOW docker ps -a --filter name=xops-victim --format {{.ID}}
  ALLOW docker inspect 9982033976ac
  ALLOW docker logs --tail 20 9982033976ac
  ALLOW docker update --memory 33554432 --memory-swap 33554432 xops-victim
  ALLOW docker restart xops-victim
```

The agent read the runbook, ran its diagnose script, matched the OOM row in the decision table, doubled the memory limit, and restarted the container. Had it attempted `docker rm`, the guard would have denied it — `rm` is classified CRITICAL, and no mode permits CRITICAL commands.

**Verify for yourself** — never take an agent's word for it (xops doesn't either):

```
docker inspect xops-victim --format 'status={{.State.Status}} oom={{.State.OOMKilled}} mem={{.HostConfig.Memory}}'
```

```
[ Expected output ]
status=running oom=false mem=33554432
```

## Chat with it on Telegram

With the Telegram token configured, start the bridge:

```
bun scripts/poc-telegram.ts
```

Open your bot in Telegram, press **Start**, and send:

```
container xops-victim is broken, fix it
```

You get an immediate acknowledgement, then a verified report when the run completes — root cause, exact commands, and an independent verification line.

## Cleanup

```
docker rm -f xops-victim
```

#### Summary

You installed xops, ran a guarded agent action against a deliberately broken container, and verified the fix yourself. Notice what you did *not* have to do: give the agent unrestricted Docker access, trust its self-report, or review raw logs. The two tutorials go deeper — the [Docker tutorial](tutorials/fix-docker-container.md) walks the same flow with full explanations, and the [Kubernetes tutorial](tutorials/safe-k8s-triage.md) adds the RBAC hard boundary.
