# xops

> Your 24/7 DevOps Copilot that actually does the work

xops is a personal DevOps AI agent that runs on your infrastructure, connects to your favorite chat apps, and proactively helps manage your systems.

## Features

- **5-Minute Setup** - Interactive wizard gets you running fast
- **Multi-Channel** - Telegram, Slack, Discord, Web Chat
- **Proactive AI** - Morning briefings, heartbeat monitoring, scheduled tasks
- **Memory System** - Remembers how you fixed issues months ago
- **DevOps Skills** - Kubernetes debugging, incident response, log analysis
- **Self-Hosted** - Your data stays on your infrastructure

## Quick Start

```bash
# Install
curl -sSL https://xops.sh/install | bash

# Setup (interactive wizard)
xops setup

# Check status
xops status
```

## Demo

### Morning Briefing
```
8:00 AM via Telegram:

Good morning! Overnight summary:
- 3 alerts fired, 2 auto-resolved
- prod-api had 2 pod restarts (OOMKilled)
- AWS cost: $156 (on budget)
No action needed. Have a great day!
```

### Memory Recall
```
You: How did we fix the Redis issue last month?

xops: Found 2 relevant memories:

1. 2024-12-15: Redis connection pooling fix
   - Increased pool size from 10 to 50
   - Added connection timeout retry

2. 2024-12-03: Redis failover incident
   - Sentinel was misconfigured
   - Fixed with redis-cli SENTINEL RESET

Want me to show the full notes?
```

### One-Command Rollback
```
You: rollback api-service

xops: I see api-service in prod-cluster.
Rollback to previous version? [Yes/No]

You: yes

xops:
$ kubectl rollout undo deployment/api-service -n prod
deployment.apps/api-service rolled back

Rollback complete. New pods healthy.
Error rate dropping. ✓
```

## Configuration

```yaml
# ~/.xops/config.yaml
version: "1"

ai:
  provider: anthropic
  model: claude-sonnet-4-20250514
  apiKey: ${ANTHROPIC_API_KEY}

channels:
  telegram:
    enabled: true
    token: ${TELEGRAM_BOT_TOKEN}
    allowFrom: ["@yourusername"]
  web:
    enabled: true
    port: 8080

memory:
  enabled: true
  provider: auto

automation:
  heartbeat:
    enabled: true
    every: 30m
    checklist: ~/.xops/HEARTBEAT.md
```

## Skills

xops comes with pre-built DevOps skills:

| Skill | Description |
|-------|-------------|
| `k8s-debug` | Kubernetes pod debugging and troubleshooting |
| `incident-response` | Systematic incident diagnosis and RCA |
| `prometheus-query` | Prometheus metrics queries |
| `loki-search` | Log analysis with Loki |
| `aws-cost` | AWS cost monitoring and alerts |

## Development

```bash
# Clone and install
git clone https://github.com/agenticops/xops
cd xops
bun install

# Run CLI
bun run cli status

# Development mode
bun run dev
```

## Architecture

xops is built on:
- **Bun** - Fast JavaScript runtime
- **Hono** - Lightweight web framework
- **grammY** - Telegram Bot API
- **@slack/bolt** - Slack integration
- **AOF** - Agentic Ops Framework (runtime)

## License

Apache 2.0

## Links

- [Documentation](https://xops.sh/docs)
- [Discord Community](https://discord.gg/xops)
- [GitHub Issues](https://github.com/agenticops/xops/issues)
