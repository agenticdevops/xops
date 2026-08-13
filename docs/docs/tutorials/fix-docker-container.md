---
sidebar_position: 1
---

# Hands-on: A Docker Ops Bot That Fixes, Observes, and Obeys Guardrails

In this lab you drive the **Docker Ops Bot** against a deliberately broken container and watch the whole model in action: it answers read-only questions freely, applies a real fix, gets blocked when it reaches for a destructive command, and refuses to mutate at all when you put it in `safe` mode. Everything runs on your machine — no cluster, no cloud.

## What will you learn

- How a bot **fixes in place** and independently **verifies** the result
- The guard's three classes — **read** (allow), **write** (mode-gated), **dangerous** (always blocked)
- How **`auto` vs `safe` mode** changes what the bot may do

## Pre Requisites

- xops installed and `bun test` passing — see [Getting Started](../getting-started.md)
- Docker running locally
- goose 1.45+ with a provider configured (`claude-acp` uses your Claude subscription; any goose provider works)

`set XOPS_PROVIDER once so the commands below are shorter:`

```
export XOPS_PROVIDER=claude-acp
```

## PART I — Fix a broken container

To **break** a container — a process that allocates more memory than its limit, so the kernel OOM-kills it:

```
bash scripts/seed-docker-fault.sh oom
```

**Observe** the state:

```
docker inspect xops-victim --format '{{.State.Status}} oom={{.State.OOMKilled}} mem={{.HostConfig.Memory}}'
```

```
[ Expected output ]
exited oom=true mem=16777216
```

To **hand it to the bot** (default mode is `auto` — writes allowed):

```
bun scripts/bot-run.ts docker-ops xops-victim "the container keeps dying, fix it"
```

A run takes one to a few minutes. The bot reads its runbook, diagnoses OOM, raises the memory limit **in place** with `docker update`, restarts, and verifies. Expected tail:

```
[bot-run] acted=true verified=true wall=210s

**Root cause:** OOM kill (exit 137, 16 MB limit too low).
**Fix:** docker update --memory 33554432 ... ; docker restart xops-victim

---
✅ verified: xops-victim running
```

**Verify it yourself** — xops already did, independently, but don't take its word (it doesn't take the agent's):

```
docker inspect xops-victim --format '{{.State.Status}} oom={{.State.OOMKilled}} mem={{.HostConfig.Memory}}'
```

```
[ Expected output ]
running oom=false mem=33554432
```

## PART II — Watch the guardrails

### Reads run freely

Ask a read-only question. The bot runs `docker ps`, `stats`, `inspect` — all **read** class, allowed regardless of mode:

```
bun scripts/bot-run.ts docker-ops xops-victim "which of my containers is using the most memory right now?"
```

It answers from live `docker stats`/`ps` output. `acted=false` — nothing was changed, so no verification runs.

### Dangerous commands are blocked

Ask it to clean up. The bot's honest move would be `docker rm` / `docker prune` — both **dangerous**, blocked in every mode:

```
bun scripts/bot-run.ts docker-ops xops-victim "remove the old stopped containers to free space"
```

**Observe** the guard log for the run (each run has its own workdir under `~/.xops/workspace/bot-runs/`):

```
cat "$(ls -dt ~/.xops/workspace/bot-runs/turn-docker-ops-* | head -1)/guard.jsonl" | grep dangerous
```

You will see `docker rm ...` / `docker prune` logged with `"allowed":false` — the bot could not delete anything, and it reports that it's blocked rather than working around it.

### Safe mode gates every write

Re-break the container, then run the **same fix** in `safe` mode:

```
bash scripts/seed-docker-fault.sh oom
XOPS_MODE=safe bun scripts/bot-run.ts docker-ops xops-victim "fix it"
```

This time even the in-place `docker update`/`restart` (**write** class) is blocked — `safe` mode requires a human to approve mutations. The bot reports the fix it *would* apply, and the container stays broken until you approve. (Interactive approve/deny is on the roadmap; today `safe` is a hard gate, `auto` runs writes.)

#### Exercise

Run the OOM fix once in `auto` and once in `safe`, and diff the two runs' `guard.jsonl`. **Which** decisions differ, and which are identical? (Reads and the dangerous-block are identical; only the write class flips.)

## Cleanup

```
docker rm -f xops-victim
```

#### Summary

You saw the full guard model on one bot: **read** commands run freely so diagnosis is never handicapped, **write** commands are gated by mode (`auto` runs them, `safe` blocks them), and **dangerous** commands are refused outright. The bot fixes *in place* and xops verifies the real state itself. The [Kubernetes tutorial](safe-k8s-triage.md) adds the layer this one didn't need — an RBAC-scoped credential, the hard boundary the moment an agent touches shared infrastructure.

##### Reading List

- [Security model](../advanced/security.md) — how read/write/dangerous and the two enforcement paths work
- [Bots](../features/bots.md)

**Search Keywords**

- OOM kill exit code 137
- docker update memory limit in place
- AI agent guardrails read write dangerous
- safe mode command approval
