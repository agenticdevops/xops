---
sidebar_position: 5
---

# CLI Reference

Complete reference for the `opspilot` command-line interface.

## Installation

```bash
# Using Bun
bun install -g opspilot

# Or run from source
git clone https://github.com/agenticops/opspilot
cd opspilot && bun install
bun run cli <command>
```

## Commands Overview

| Command | Description |
|---------|-------------|
| `setup` | Interactive setup wizard |
| `status` | Show OpsPilot status |
| `gateway` | Manage the gateway server |
| `chat` | Send a quick message |
| `memory` | Manage memory and search |
| `cron` | Manage scheduled jobs |
| `heartbeat` | Manage heartbeat automation |

---

## opspilot setup

Run the interactive setup wizard.

```bash
opspilot setup [options]
```

### Options

| Option | Description |
|--------|-------------|
| `-q, --quickstart` | Use quickstart mode with sensible defaults |
| `--advanced` | Use advanced mode with full control |
| `--reset` | Reset existing configuration |

### Examples

```bash
# Quick setup with defaults
opspilot setup --quickstart

# Full control over all settings
opspilot setup --advanced

# Start fresh
opspilot setup --reset
```

### What It Configures

1. **AI Provider** - Anthropic, OpenAI, Bedrock, Gemini, Ollama, OpenRouter
2. **Tools** - Auto-detects kubectl, aws, docker, gh, terraform, helm
3. **Channels** - Telegram, Slack, Web
4. **Skills** - DevOps skills to enable
5. **Automation** - Heartbeat, cron jobs
6. **Tunnel** - Remote access via Tailscale, ngrok, Cloudflare

---

## opspilot status

Show current OpsPilot status and configuration.

```bash
opspilot status
```

### Output

```
📊 OpsPilot Status

✓ Configuration loaded
  AI Provider: anthropic
  Model: claude-sonnet-4-20250514
  Memory: enabled
  Gateway: 127.0.0.1:18789
```

### When Not Configured

```
📊 OpsPilot Status

Not configured. Run opspilot setup first.
```

---

## opspilot gateway

Manage the gateway server.

```bash
opspilot gateway <action> [options]
```

### Actions

| Action | Description |
|--------|-------------|
| `start` | Start the gateway server |
| `stop` | Stop the gateway server |
| `status` | Check gateway status |

### Options

| Option | Description |
|--------|-------------|
| `-f, --foreground` | Run in foreground (default) |

### Examples

```bash
# Start gateway
opspilot gateway start

# Check if running
opspilot gateway status

# Stop (use Ctrl+C or systemctl)
opspilot gateway stop
```

### Output on Start

```
🌐 Starting Gateway

✓ Memory system initialized
✓ Gateway running on http://127.0.0.1:18789
✓ Telegram bot connected
✓ Slack bot connected
  Press Ctrl+C to stop
```

---

## opspilot chat

Send a quick message to OpsPilot.

```bash
opspilot chat <message>
```

### Requirements

- Gateway must be running
- Valid configuration

### Examples

```bash
# Simple question
opspilot chat "What pods are running?"

# Multi-word message
opspilot chat "Check the status of the api-service deployment"

# Using quotes for special characters
opspilot chat "What's the CPU usage?"
```

### Output

```
💬 OpsPilot

Here are the running pods in the default namespace:

NAME                        READY   STATUS    AGE
api-service-7d4f8b6c9-x2k   1/1     Running   2d
web-frontend-5f8b7c6d4-k9m  1/1     Running   2d

All pods are healthy.
```

---

## opspilot memory

Manage memory system and search.

```bash
opspilot memory <action> [query] [options]
```

### Actions

| Action | Description |
|--------|-------------|
| `search` | Search memory for relevant content |
| `sync` | Sync memory index with workspace |
| `status` | Show memory status |
| `reindex` | Rebuild the memory index |

### Options

| Option | Description |
|--------|-------------|
| `-n, --max-results <n>` | Maximum results (default: 6) |

### Examples

```bash
# Search memory
opspilot memory search "Redis connection issues"

# Search with limit
opspilot memory search "deployment rollback" -n 10

# Sync index
opspilot memory sync

# Check status
opspilot memory status

# Full reindex
opspilot memory reindex
```

### Search Output

```
🔍 Searching memory for: "Redis connection issues"

Found 3 results:

1. [0.89] runbooks/redis.md
   "When Redis connections timeout, check the connection pool
   settings. Increase pool size to 50 for high-traffic services..."

2. [0.76] incidents/2024-01-15.md
   "Root cause: Redis maxclients limit reached. Fixed by
   increasing maxclients from 100 to 500..."

3. [0.71] notes/performance.md
   "Redis connection overhead can be reduced by using
   persistent connections and connection pooling..."
```

---

## opspilot cron

Manage scheduled jobs.

```bash
opspilot cron <action> [options]
```

### Actions

| Action | Description |
|--------|-------------|
| `list` | List all cron jobs |
| `add` | Add a new cron job |
| `remove` | Remove a cron job |
| `run` | Manually run a cron job |

### Options

| Option | Description |
|--------|-------------|
| `--name <name>` | Job name |
| `--schedule <cron>` | Cron schedule expression |
| `--message <msg>` | Job message/prompt |
| `--deliver <channel>` | Delivery channel |

### Examples

```bash
# List jobs
opspilot cron list

# Add morning briefing
opspilot cron add \
  --name "morning-briefing" \
  --schedule "0 8 * * 1-5" \
  --message "Summarize overnight alerts and system status" \
  --deliver telegram

# Remove a job
opspilot cron remove --name "morning-briefing"

# Run manually
opspilot cron run --name "morning-briefing"
```

---

## opspilot heartbeat

Manage heartbeat automation.

```bash
opspilot heartbeat <action>
```

### Actions

| Action | Description |
|--------|-------------|
| `run` | Run heartbeat check now |
| `status` | Show heartbeat status |
| `enable` | Enable heartbeat automation |
| `disable` | Disable heartbeat automation |

### Examples

```bash
# Run heartbeat check
opspilot heartbeat run

# Check status
opspilot heartbeat status

# Enable/disable
opspilot heartbeat enable
opspilot heartbeat disable
```

### Heartbeat Checklist

The heartbeat runs checks defined in `~/.opspilot/workspace/HEARTBEAT.md`:

```markdown
# OpsPilot Heartbeat Checklist

Run these checks every 30m.

## Priority Checks

- [ ] Check for any critical alerts
- [ ] Review any failed deployments
- [ ] Check system resource utilization

## Response Format

If everything is normal, respond with: HEARTBEAT_OK

If action is needed, explain what you found and recommend next steps.
```

---

## Global Options

These options work with all commands:

| Option | Description |
|--------|-------------|
| `-V, --version` | Output version number |
| `-h, --help` | Display help for command |

### Examples

```bash
# Show version
opspilot --version

# Get help
opspilot --help
opspilot setup --help
opspilot gateway --help
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | General error |
| `2` | Configuration error |

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `OPENAI_API_KEY` | OpenAI API key |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token |
| `SLACK_APP_TOKEN` | Slack app token |
| `SLACK_BOT_TOKEN` | Slack bot token |
| `OPSPILOT_CONFIG` | Custom config path |

### Example

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
export TELEGRAM_BOT_TOKEN="123456:ABC..."
opspilot gateway start
```
