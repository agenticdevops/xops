# xops CLI - Quick Start Guide

## Installation & Setup

```bash
# Install dependencies
bun install

# Run setup wizard
bun run cli setup

# Check status
bun run cli status
```

## Common Commands

```bash
# Setup (interactive wizard)
bun run cli setup                    # Quickstart mode
bun run cli setup --advanced         # Advanced mode
bun run cli setup --reset            # Reset config

# Status
bun run cli status                   # Show configuration status

# Gateway
bun run cli gateway start            # Start the gateway server
bun run cli gateway status          # Check if gateway is running
bun run cli gateway stop            # Stop gateway (Ctrl+C in terminal)

# Chat
bun run cli chat "your message"      # Send message (requires gateway running)

# Help
bun run cli --help                   # Show all commands
bun run cli <command> --help         # Show command-specific help
```

## Quick Test Workflow

```bash
# 1. Setup (first time only)
bun run cli setup

# 2. Start gateway
bun run cli gateway start

# 3. In another terminal, test chat
bun run cli chat "Hello, xops!"

# 4. Check status
bun run cli status
bun run cli gateway status
```

## Development

```bash
# Run CLI directly (no build needed)
bun run cli <command>

# Watch mode (auto-reload on changes)
cd apps/cli && bun run dev

# Build CLI
bun run build

# Run tests
bun run test
```

## Configuration Location

- Config file: `~/.xops/config.yaml`
- Workspace: `~/.xops/workspace/`
- Memory DB: `~/.xops/workspace/memory/memory.db`

## Troubleshooting

**"Not configured" error:**
```bash
bun run cli setup
```

**Gateway not running:**
```bash
bun run cli gateway start
```

**Reset everything:**
```bash
rm -rf ~/.xops
bun run cli setup
```

**Using wrong xops binary (global vs local):**
If `bun run cli` is using a globally installed version instead of the local one:

```bash
# Check if global xops exists
which xops

# Uninstall global npm package
npm uninstall -g @xops/cli

# Verify it's gone
which xops  # Should return nothing

# Now use local version
bun run cli <command>
```

**Note:** Always use `bun run cli` from the project root to ensure you're using the local development version, not a globally installed one.

## Full Documentation

See [docs/docs/cli-usage-and-testing.md](./docs/docs/cli-usage-and-testing.md) for complete guide.
