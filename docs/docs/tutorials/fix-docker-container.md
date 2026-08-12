---
sidebar_position: 1
---

# Fixing a Crashing Container with a Guarded Agent

In this lab, you are going to break a Docker container on purpose, hand it to OpsPilot, and study how a guarded agent run actually works — the runbook, the guard decisions, and the independent verification. Everything runs on your own machine; no cluster, no cloud account.

## What will you learn

- How an OpsPilot **skill** (executable runbook) is structured
- How the **fail-closed guard** decides which commands the agent may run
- Why OpsPilot verifies system state itself instead of trusting the agent's report

## Pre Requisites

- OpsPilot installed and `bun test` passing — see [Getting Started](../getting-started.md)
- Docker running locally
- goose 1.45+ with a configured provider

## Read the runbook first

Before running anything, look at the skill the agent will follow.

To **inspect** the runbook:

```
cat packages/skills/bundled/docker-container-triage/SKILL.md
```

Three parts matter:

**The grants** — in the frontmatter, the skill declares every command it is allowed to use:

```
grants: [ps, inspect, logs, stats, events, restart, update]
```

`rm`, `rmi`, and `prune` are absent. Even if the model decides removal is a good idea, the guard will refuse — a command must be both granted by the skill *and* below CRITICAL in the risk taxonomy.

**The diagnose script** — `scripts/diagnose.sh` collects evidence deterministically and emits JSON: container state, exit code, OOM flag, restart count, memory limit, health status, log tail. The agent is instructed to run this *first* and reason from its output, not from ad-hoc exploration.

**The decision table** — maps evidence patterns to fixes:

| Evidence | Root cause | Fix |
|---|---|---|
| `oom_killed == true` or exit 137 with memory limit set | Memory limit too low | Raise the limit ~2x and restart |

Anything that doesn't match a row escalates to a human instead of guessing.

## Break a container

To **seed** the fault:

```
bash scripts/seed-docker-fault.sh oom
```

This starts `opspilot-victim`: a Python process allocating 24MB inside a 16MB memory limit, with `--restart on-failure:3`.

**Observe** what happens over the next half minute:

```
docker ps -a --filter name=opspilot-victim --format '{{.Names}} {{.Status}}'
```

The container cycles through `Restarting (137)` and settles at `Exited (137)` once its restart budget is spent. Exit code 137 is the kernel's OOM kill. Why does it never reach `Up`?

## Run the diagnose script yourself

The agent will run this script — run it yourself first so you know what evidence it sees:

```
bash packages/skills/bundled/docker-container-triage/scripts/diagnose.sh opspilot-victim
```

```
[ Expected output (abridged) ]
{
  "state": {"status": "exited", "exit_code": 137, "oom_killed": true},
  "restart_count": 3,
  "memory_limit_bytes": 16777216
}
```

Match this against the decision table yourself: `oom_killed == true`, exit 137, memory limit set. That is the OOM row. The mapped fix is to raise the limit and restart. You have just done manually what the agent is about to do.

## Hand it to the agent

```
bun scripts/poc-run.ts docker opspilot-victim
```

The run takes one to three minutes. When it completes, study the guard log section:

```
[ Expected output ]
[poc] guard decisions: 5
  ALLOW docker ps -a --filter name=opspilot-victim --format {{.ID}}
  ALLOW docker inspect 9982033976ac
  ALLOW docker logs --tail 20 9982033976ac
  ALLOW docker update --memory 33554432 --memory-swap 33554432 opspilot-victim
  ALLOW docker restart opspilot-victim
```

Read it as a story: three read-only commands (that's the diagnose script executing under the shim), then exactly the fix the decision table mapped — memory doubled to 32MB, restart. No exploration, no improvisation, no destructive commands attempted.

Every one of these lines is also in `~/.opspilot/workspace/goose-poc/guard.jsonl` — the audit trail, one JSON record per decision, including the risk tier of each command.

## Verify the real state

OpsPilot already verified independently — but check yourself anyway:

```
docker inspect opspilot-victim --format 'status={{.State.Status}} oom={{.State.OOMKilled}} mem={{.HostConfig.Memory}} restarts={{.RestartCount}}'
```

```
[ Expected output ]
status=running oom=false mem=33554432 restarts=0
```

Running, no OOM kill, doubled limit, zero restarts since the fix.

#### Exercise

Seed the other fault the script supports and run the agent against it:

```
bash scripts/seed-docker-fault.sh exit0
bun scripts/poc-run.ts docker opspilot-victim
```

**Observe** the agent's report. `exit0` is a container that exits cleanly — a one-shot. Which decision-table row does the evidence match? Does the agent loop forever restarting it, and why not?

## Cleanup

```
docker rm -f opspilot-victim
```

#### Summary

You watched a guarded agent follow a runbook end to end: deterministic evidence collection, a decision-table match, a fix executed through a fail-closed shim, and verification against real state. The skill's grants plus the risk taxonomy meant the agent *could not* have removed your container even if it tried. In the next tutorial you add the layer this one didn't need: a scoped credential that jails the agent inside one Kubernetes namespace — you are going to need that boundary the moment an agent touches shared infrastructure.

##### Reading List

- [goose recipes](https://block.github.io/goose/docs/guides/recipes/) — how OpsPilot drives the engine
- [Docker restart policies](https://docs.docker.com/engine/containers/start-containers-automatically/)

**Search Keywords**

- OOM kill exit code 137
- docker memory limit update
- AI agent guardrails
- executable runbook
