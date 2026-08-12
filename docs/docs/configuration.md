---
sidebar_position: 4
---

# Configuration

Complete reference for OpsPilot configuration.

## Config File Location

```
~/.opspilot/config.yaml
```

## Full Configuration Example

```yaml
version: "1"

meta:
  lastUpdated: "2025-01-26T12:00:00.000Z"
  wizardVersion: "0.1.0"

ai:
  provider: anthropic
  model: claude-sonnet-4-20250514
  apiKey: ${ANTHROPIC_API_KEY}
  maxTokens: 4096

channels:
  telegram:
    enabled: true
    accounts:
      default:
        token: ${TELEGRAM_BOT_TOKEN}
        allowFrom:
          - "yourusername"
  slack:
    enabled: true
    accounts:
      default:
        appToken: ${SLACK_APP_TOKEN}
        botToken: ${SLACK_BOT_TOKEN}
  web:
    enabled: true
    port: 8080

tools:
  builtin:
    - shell
    - http
    - filesystem
  detected:
    kubectl:
      enabled: true
      path: /usr/local/bin/kubectl
    aws:
      enabled: true
      path: /usr/local/bin/aws
    docker:
      enabled: true
      path: /usr/local/bin/docker

skills:
  enabled:
    - k8s-debug
    - incident-diagnose
    - prometheus-query
    - loki-search

memory:
  enabled: true
  provider: auto
  store:
    driver: sqlite
    path: ~/.opspilot/memory.db
  chunking:
    tokens: 400
    overlap: 80
  search:
    maxResults: 6
    minScore: 0.35
    hybrid:
      enabled: true
      vectorWeight: 0.7
      textWeight: 0.3

automation:
  heartbeat:
    enabled: true
    every: 30m
    checklist: ~/.opspilot/workspace/HEARTBEAT.md
  cron:
    jobs:
      - name: morning-briefing
        schedule: "0 8 * * 1-5"
        message: "Summarize overnight alerts"
        deliver: telegram

gateway:
  bind: "127.0.0.1"
  port: 18789
  tunnel:
    provider: tailscale

agent:
  name: OpsPilot
  workspace: ~/.opspilot/workspace
```

---

## Configuration Sections

### version

**Required.** Configuration schema version.

```yaml
version: "1"
```

---

### ai

AI provider configuration.

```yaml
ai:
  provider: anthropic    # Required
  model: claude-sonnet-4-20250514  # Required
  apiKey: ${ANTHROPIC_API_KEY}     # Required (except Ollama)
  maxTokens: 4096        # Optional
```

#### Supported Providers

| Provider | Models | API Key Env Var |
|----------|--------|-----------------|
| `anthropic` | claude-sonnet-4-*, claude-opus-4-* | `ANTHROPIC_API_KEY` |
| `openai` | gpt-4o, gpt-4-turbo | `OPENAI_API_KEY` |
| `bedrock` | anthropic.claude-3-* | `AWS_ACCESS_KEY_ID` |
| `gemini` | gemini-2.0-flash-exp | `GEMINI_API_KEY` |
| `ollama` | llama3.2, codellama | (none) |
| `openrouter` | anthropic/claude-3.5-sonnet | `OPENROUTER_API_KEY` |

#### Example: Anthropic

```yaml
ai:
  provider: anthropic
  model: claude-sonnet-4-20250514
  apiKey: ${ANTHROPIC_API_KEY}
```

#### Example: Ollama (Local)

```yaml
ai:
  provider: ollama
  model: llama3.2
  # No API key needed
```

---

### channels

Communication channel configuration.

#### Telegram

```yaml
channels:
  telegram:
    enabled: true
    accounts:
      default:
        token: ${TELEGRAM_BOT_TOKEN}
        allowFrom:
          - "username1"
          - "username2"
```

| Field | Description |
|-------|-------------|
| `token` | Bot token from @BotFather |
| `allowFrom` | List of allowed usernames (without @) |

#### Slack

```yaml
channels:
  slack:
    enabled: true
    accounts:
      default:
        appToken: ${SLACK_APP_TOKEN}
        botToken: ${SLACK_BOT_TOKEN}
```

| Field | Description |
|-------|-------------|
| `appToken` | App-level token (xapp-...) |
| `botToken` | Bot user token (xoxb-...) |

#### Web

```yaml
channels:
  web:
    enabled: true
    port: 8080
```

---

### tools

Tool configuration.

```yaml
tools:
  builtin:
    - shell
    - http
    - filesystem
  detected:
    kubectl:
      enabled: true
      path: /usr/local/bin/kubectl
    aws:
      enabled: true
    docker:
      enabled: false  # Disabled
```

#### Builtin Tools

| Tool | Description |
|------|-------------|
| `shell` | Execute shell commands |
| `http` | Make HTTP requests |
| `filesystem` | Read/write files |

#### Detected Tools

Auto-detected during setup:
- kubectl
- aws
- docker
- gh (GitHub CLI)
- terraform
- helm
- gcloud
- az

---

### skills

Skill configuration.

```yaml
skills:
  enabled:
    - k8s-debug
    - incident-diagnose
    - prometheus-query
    - loki-search
    - argocd-sync
```

#### Available Skills

| Skill | Description |
|-------|-------------|
| `k8s-debug` | Kubernetes debugging and troubleshooting |
| `incident-diagnose` | Incident response workflow |
| `prometheus-query` | Prometheus metrics querying |
| `loki-search` | Loki log searching |
| `argocd-sync` | ArgoCD sync operations |

---

### memory

Memory system configuration.

```yaml
memory:
  enabled: true
  provider: auto          # auto, openai, gemini, local
  store:
    driver: sqlite
    path: ~/.opspilot/memory.db
  chunking:
    tokens: 400           # Chunk size
    overlap: 80           # Overlap between chunks
  search:
    maxResults: 6         # Max search results
    minScore: 0.35        # Minimum relevance score
    hybrid:
      enabled: true
      vectorWeight: 0.7   # Weight for vector search
      textWeight: 0.3     # Weight for keyword search
```

#### Embedding Providers

| Provider | Model | Notes |
|----------|-------|-------|
| `auto` | Detects from AI provider | Recommended |
| `openai` | text-embedding-3-small | Best quality |
| `gemini` | embedding-001 | Google Cloud |
| `local` | all-MiniLM-L6-v2 | No API needed |

---

### automation

Automation configuration.

#### Heartbeat

```yaml
automation:
  heartbeat:
    enabled: true
    every: 30m            # Interval
    checklist: ~/.opspilot/workspace/HEARTBEAT.md
```

| Interval | Description |
|----------|-------------|
| `15m` | Every 15 minutes |
| `30m` | Every 30 minutes (recommended) |
| `1h` | Every hour |

#### Cron Jobs

```yaml
automation:
  cron:
    jobs:
      - name: morning-briefing
        schedule: "0 8 * * 1-5"   # 8am weekdays
        message: "Summarize overnight alerts"
        deliver: telegram

      - name: cost-report
        schedule: "0 9 * * 1"     # 9am Mondays
        message: "Weekly AWS cost report"
        deliver: slack
```

---

### gateway

Gateway server configuration.

```yaml
gateway:
  bind: "127.0.0.1"      # Bind address
  port: 18789            # Port number
  tunnel:
    provider: tailscale  # Tunnel provider
```

#### Bind Options

| Value | Access |
|-------|--------|
| `127.0.0.1` | Localhost only |
| `0.0.0.0` | All interfaces |

#### Tunnel Providers

| Provider | Description |
|----------|-------------|
| `tailscale` | Zero-config VPN (recommended) |
| `ngrok` | Quick public URL |
| `cloudflare` | Enterprise tunnel |
| `none` | No tunnel |

---

### agent

Agent configuration.

```yaml
agent:
  name: OpsPilot
  workspace: ~/.opspilot/workspace
```

---

## Environment Variables

Use `${VAR_NAME}` syntax to reference environment variables:

```yaml
ai:
  apiKey: ${ANTHROPIC_API_KEY}

channels:
  telegram:
    accounts:
      default:
        token: ${TELEGRAM_BOT_TOKEN}
```

---

## Workspace Structure

```
~/.opspilot/
├── config.yaml           # Main configuration
├── memory.db             # SQLite memory database
└── workspace/
    ├── MEMORY.md         # Persistent notes
    ├── HEARTBEAT.md      # Heartbeat checklist
    └── memory/           # Additional memory files
        ├── runbooks/
        ├── incidents/
        └── notes/
```

---

## Validation

OpsPilot validates configuration on startup. Invalid config will show errors:

```
✗ Failed to load config: Invalid config: [
  {
    "path": ["ai", "provider"],
    "message": "Required"
  }
]
```
