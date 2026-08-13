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

## Talking to a bot (Telegram)

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
