---
sidebar_position: 5
---

# Running xops

xops is early-stage: today you drive it with a handful of scripts. A packaged `xops` CLI (setup wizard, supervised service) is on the roadmap; these scripts are what actually works right now.

## Action runs

To **run** a guarded triage from the terminal:

```
# docker profile
bun scripts/poc-run.ts docker <container-name>

# kubernetes profile
bun scripts/poc-run.ts k8s <namespace> [kubeconfig]
```

Output includes the guard decision log (every command the agent attempted, with ALLOW/DENY and risk tier) and the agent's final report.

## Telegram bridge

To **start** the chat bridge:

```
bun scripts/poc-telegram.ts
```

Messages mentioning `docker` or `container <name>` route to the docker triage skill; messages naming a namespace route to k8s triage. Everything else gets a conversational reply — also through goose, with a tool-less recipe (chat turns cannot execute commands).

## Helper scripts

| Script | Purpose |
|---|---|
| `scripts/seed-docker-fault.sh [oom\|exit0]` | Create a deliberately broken local container to practice on |
| `scripts/provision-poc-rbac.sh <ns> [ctx]` | Generate a namespace-jailed kubeconfig (ServiceAccount + Role + 2h token) |

## Run artifacts

Every engine run leaves an audit trail in its workdir (`~/.xops/workspace/`):

| File | Contents |
|---|---|
| `guard.jsonl` | Every command attempted, one JSON decision per line |
| `run.stream.jsonl` | Full goose event stream |
| `run.stderr.log` | Engine stderr |
| `recipe.yaml` | The exact recipe this run executed |
