---
sidebar_position: 5
---

# Running xops

xops is early-stage: today you drive it with a handful of scripts. A packaged `xops` CLI (setup wizard, supervised service) is on the roadmap; these scripts are what actually works right now.

## Run a bot from the terminal

The primary way to test a bot without Telegram. One bot turn against a scope (container or namespace):

```
# docker
bun scripts/bot-run.ts docker-ops <container> "<message>"

# kubernetes (needs a scoped kubeconfig first — see provision-poc-rbac.sh)
bun scripts/bot-run.ts k8s-sre <namespace> "<message>"
```

The bot answers, or loads the matching runbook and fixes the problem — every command through the fail-closed guard. Output shows `acted`/`verified`/wall time plus the bot's report. Provider is `XOPS_PROVIDER` (default `claude-acp`, your Claude subscription). See [Bots](features/bots.md) for a full walkthrough.

## Talk to a bot on Telegram

Start the bridge:

```
bun scripts/poc-telegram.ts
```

Then, in your chat:

| Command | Purpose |
|---|---|
| `/bots` | List available bots |
| `/use <name>` | Bind this chat to a bot (e.g. `/use docker-ops`) |
| `/project <scope>` | Set what the bot is scoped to (namespace or container) |

After binding a bot and project, just send messages — the bot answers or acts within its scoped, guarded session.

## Legacy single-skill runner

`scripts/poc-run.ts` runs one hardcoded triage skill directly (the pre-bot path), still handy for skill-level testing:

```
bun scripts/poc-run.ts docker <container>
bun scripts/poc-run.ts k8s <namespace> [kubeconfig]
```

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
