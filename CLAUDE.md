# OpsPilot - Personal DevOps AI Agent

> "Your 24/7 DevOps Copilot that actually does the work"

## Project Overview

OpsPilot is a personal DevOps AI agent that runs 24/7 on your infrastructure. It provides:
- **5-minute setup wizard** for instant deployment
- **Multi-channel chat** (Telegram, Slack, Web)
- **Proactive automation** (morning briefings, heartbeats, cron jobs)
- **Memory system** for context-aware operations
- **DevOps-specific skills** (k8s-debug, incident-response, etc.)

## Architecture

```
opspilot/
├── packages/
│   ├── @opspilot/core/       # Config, types, utils
│   ├── @opspilot/wizard/     # Setup wizard (Clack)
│   ├── @opspilot/channels/   # Telegram, Slack, Web adapters
│   ├── @opspilot/memory/     # Hybrid vector + keyword search
│   ├── @opspilot/skills/     # Skill loader + bundled skills
│   ├── @opspilot/automation/ # Heartbeat, cron, subagents
│   ├── @opspilot/tunnel/     # Tailscale, ngrok
│   └── @opspilot/gateway/    # Hono server + runtime
├── apps/
│   ├── cli/                  # opspilot CLI
│   ├── web/                  # React dashboard
│   └── tui/                  # Ink terminal UI
└── docs/                     # Docusaurus site
```

## Development Commands

```bash
# Install dependencies
bun install

# Run CLI
bun run cli setup
bun run cli status

# Development mode
bun run dev

# Build all packages
bun run build

# Run tests
bun run test
```

## Conventions

### Backend Development (Bun + Hono)

This project follows **contracts-first development**:

1. Define types in `@opspilot/core/types.ts` first
2. Validate with Zod schemas in `@opspilot/core/config.ts`
3. Implement packages following the type contracts
4. No duplicate types across packages

### Skills Format

Skills use standard SKILL.md format (Claude Code compatible):

```yaml
---
name: skill-name
description: "What this skill does"
metadata:
  emoji: "🎯"
  requires:
    bins: [kubectl]
    env: [KUBECONFIG]
---
# Skill content in markdown...
```

### Channel Adapters

Channel adapters implement the `ChannelAdapter` interface:
- `gateway`: Inbound message handling
- `outbound`: Message delivery
- Support text chunking per channel limits

### Memory System

- SQLite + sqlite-vec for hybrid search
- 400-token chunks with 80-token overlap
- 70% vector + 30% keyword scoring
- Port from clawdbot's proven implementation

## Key Files

- `/packages/core/src/types.ts` - All TypeScript types
- `/packages/core/src/config.ts` - Config loading/validation
- `/apps/cli/src/index.ts` - CLI entry point
- `/packages/skills/bundled/` - DevOps skills

## Related Projects

- **clawdbot**: Personal AI assistant (port memory, channels)
- **AOF**: Agentic Ops Framework (runtime engine)

## Do Not

- Create files in root directory
- Duplicate types across packages
- Add features without updating docs
- Skip contracts-first workflow
