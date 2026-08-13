---
sidebar_position: 1
---

# Bots

> **Status: new in this build.** Two bots ship: Kubernetes SRE Bot and Docker Ops Bot.

A **bot** is the specialist you talk to — modeled on a job role. You pick a bot, optionally point it at a **project** (a namespace or container it's scoped to), and talk to it. The bot answers questions directly, and when you ask it to fix something it loads the matching runbook (skill) and follows it — every command through the fail-closed guard, scoped to the project's credentials.

## Bundled bots

| Bot | Platform | Skills |
|---|---|---|
| Kubernetes SRE Bot (`k8s-sre`) | Kubernetes | k8s-pod-restart-triage |
| Docker Ops Bot (`docker-ops`) | Docker | docker-container-triage |

## Try it in 2 minutes (no cluster, no Telegram)

The fastest way to test a bot is the CLI runner against a throwaway local container.

**Break a container** — a process that allocates more memory than its limit, so it gets OOM-killed on a loop:

```
bash scripts/seed-docker-fault.sh oom
```

**Hand it to the Docker Ops Bot.** `claude-acp` uses your Claude subscription (no API key); any goose provider works:

```
XOPS_PROVIDER=claude-acp bun scripts/bot-run.ts docker-ops xops-victim "the container keeps dying, fix it"
```

The bot reads its runbook, diagnoses (OOM), raises the memory limit, restarts, and reports. Every `docker` command it runs passes through the fail-closed guard. A run takes one to a few minutes.

```
[bot-run] Docker Ops Bot on docker:xops-victim
[bot-run] acted=true verified=true wall=210s

**Root cause:** OOM kill (exit 137, 16 MB limit).
**Fix applied:** docker update --memory 33554432 ...; docker restart xops-victim
✅ verified: xops-victim running and healthy
```

**Confirm it yourself** — xops already verified independently, but don't take its word (it doesn't take the agent's):

```
docker inspect xops-victim --format '{{.State.Status}} oom={{.State.OOMKilled}}'   # running oom=false
```

**Cleanup:** `docker rm -f xops-victim`

### Chat instead of fix

The same bot answers questions without acting — no command runs, nothing is verified:

```
bun scripts/bot-run.ts docker-ops xops-victim "what does exit code 137 mean?"
```

### Kubernetes bot

`k8s-sre` needs a scoped kubeconfig for its namespace first (see the [Kubernetes tutorial](../tutorials/safe-k8s-triage.md)):

```
bash scripts/provision-poc-rbac.sh <namespace>
bun scripts/bot-run.ts k8s-sre <namespace> "pods are crashlooping, fix them"
```

## Talking to a bot on Telegram

Run the bridge (`bun scripts/poc-telegram.ts`), then in your chat:

- `/bots` — list bots
- `/use <name>` — bind this chat to a bot
- `/project <namespace-or-container>` — set what the bot is scoped to
- then just message it

A bot × project is one guarded, scoped session: it can answer or act, and xops verifies real state after any change.

## Bots vs skills vs projects

- **Skill** — a runbook (a capability). See [Skills](skills.md).
- **Bot** — a bundle of skills with a platform and identity.
- **Project** — the scope + credentials + brief a bot works within.

Squads (bots assigned to a project as a team), approval tiers, and richer personas are on the roadmap.
