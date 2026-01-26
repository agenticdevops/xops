---
sidebar_position: 2
---

# CLI Usage and Testing Guide

This guide covers how to use and test the OpsPilot CLI application.

## Prerequisites

- **Bun** runtime (version 1.1.0 or later)
- **Node.js** (version 20.0 or later)
- Dependencies installed: `bun install`

## Running the CLI

### Development Mode

Run the CLI directly from source (no build required):

```bash
# From project root
bun run cli <command>

# Examples
bun run cli --help
bun run cli status
bun run cli setup
```

### Built/Production Mode

First build the CLI, then run it:

```bash
# Build all packages (including CLI)
bun run build

# Run the built CLI
bun run apps/cli/src/index.ts <command>
```

### Watch Mode (Development)

For active development with auto-reload:

```bash
cd apps/cli
bun run dev
```

This runs the CLI in watch mode, automatically restarting when files change.

## Available Commands

### 1. Setup Wizard

Interactive setup wizard to configure OpsPilot:

```bash
# Quickstart mode (default, recommended)
bun run cli setup

# Advanced mode (full control)
bun run cli setup --advanced

# Reset existing configuration
bun run cli setup --reset

# Quickstart with reset
bun run cli setup --quickstart --reset
```

**What it does:**
- Configures AI provider (Anthropic, OpenAI, etc.)
- Detects and configures available tools (kubectl, docker, etc.)
- Sets up channels (Telegram, Slack, Web)
- Configures skills
- Sets up automation (heartbeat, cron)
- Configures remote access (tunnels)

**Output:**
- Creates `~/.opspilot/config.yaml`
- Creates `~/.opspilot/workspace/` directory
- Initializes `MEMORY.md` file
- Optionally creates `HEARTBEAT.md` if enabled

### 2. Status

Check OpsPilot configuration and status:

```bash
bun run cli status
```

**Output:**
- Configuration status (loaded/not configured)
- AI provider and model
- Memory system status
- Gateway bind address and port

### 3. Gateway

Manage the gateway server:

```bash
# Start the gateway server
bun run cli gateway start

# Check gateway status
bun run cli gateway status

# Stop (via Ctrl+C or systemctl if running as service)
bun run cli gateway stop
```

**Gateway Start:**
- Initializes memory system if enabled
- Starts Hono server on configured port (default: 18789)
- Connects configured channel adapters (Telegram, Slack)
- Runs until interrupted (Ctrl+C)

**Gateway Status:**
- Checks if gateway is responding
- Shows uptime, messages processed, active conversations

### 4. Memory

Manage memory system (currently placeholder commands):

```bash
# Search memory
bun run cli memory search "your query"

# Sync memory index
bun run cli memory sync

# Check memory status
bun run cli memory status

# Reindex memory
bun run cli memory reindex
```

**Note:** These commands are currently placeholders and will be implemented in future versions.

### 5. Cron

Manage cron jobs (currently placeholder):

```bash
# List cron jobs
bun run cli cron list

# Add a cron job
bun run cli cron add --name "daily-check" --schedule "0 9 * * *" --message "Check system health"

# Remove a cron job
bun run cli cron remove --name "daily-check"

# Run a cron job manually
bun run cli cron run --name "daily-check"
```

**Note:** These commands are currently placeholders and will be implemented in future versions.

### 6. Heartbeat

Manage heartbeat automation (currently placeholder):

```bash
# Run heartbeat check
bun run cli heartbeat run

# Check heartbeat status
bun run cli heartbeat status

# Enable heartbeat
bun run cli heartbeat enable

# Disable heartbeat
bun run cli heartbeat disable
```

**Note:** These commands are currently placeholders and will be implemented in future versions.

### 7. Chat

Send a quick message to OpsPilot (requires gateway running):

```bash
bun run cli chat "What's the status of my Kubernetes cluster?"
```

**Requirements:**
- Configuration must exist (`opspilot setup` completed)
- Gateway must be running (`opspilot gateway start`)

**Output:**
- Sends message to gateway
- Returns AI response

## Testing the CLI

### Manual Testing

#### 1. Test Setup Wizard

```bash
# Test quickstart mode
bun run cli setup --quickstart

# Test advanced mode
bun run cli setup --advanced

# Test reset
bun run cli setup --reset
```

**Verify:**
- Config file created at `~/.opspilot/config.yaml`
- Workspace directory created
- MEMORY.md file exists
- Configuration values are correct

#### 2. Test Status Command

```bash
# Before setup (should show "Not configured")
bun run cli status

# After setup (should show configuration details)
bun run cli status
```

#### 3. Test Gateway

```bash
# Start gateway
bun run cli gateway start

# In another terminal, check status
bun run cli gateway status

# Test chat (requires gateway running)
bun run cli chat "Hello, OpsPilot!"

# Stop gateway with Ctrl+C
```

#### 4. Test Error Handling

```bash
# Test without configuration
rm ~/.opspilot/config.yaml
bun run cli status  # Should show "Not configured"
bun run cli gateway start  # Should show error

# Test with invalid config
echo "invalid: yaml" > ~/.opspilot/config.yaml
bun run cli status  # Should show error
```

### Automated Testing

#### Unit Tests

The CLI uses Bun's built-in test runner. Create test files:

```bash
# Create test file
touch apps/cli/src/index.test.ts
```

Example test structure:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { execSync } from "child_process";

describe("CLI", () => {
  beforeEach(() => {
    // Setup: ensure clean state
  });

  afterEach(() => {
    // Cleanup: remove test configs
  });

  it("should show help", () => {
    const output = execSync("bun run cli --help", { encoding: "utf-8" });
    expect(output).toContain("opspilot");
  });

  it("should show not configured when no config exists", () => {
    // Remove config if exists
    // Run status command
    // Assert output contains "Not configured"
  });
});
```

Run tests:

```bash
# Run CLI tests
cd apps/cli
bun test

# Run all tests
bun run test
```

#### Integration Tests

Test the full workflow:

```bash
# 1. Setup
bun run cli setup --quickstart

# 2. Verify config
bun run cli status

# 3. Start gateway (in background)
bun run cli gateway start &

# 4. Wait for startup
sleep 5

# 5. Test gateway status
bun run cli gateway status

# 6. Test chat
bun run cli chat "test message"

# 7. Stop gateway
pkill -f "gateway start"
```

### Testing Checklist

- [ ] Setup wizard completes successfully
- [ ] Configuration file is created correctly
- [ ] Status command shows correct information
- [ ] Gateway starts without errors
- [ ] Gateway connects to configured channels
- [ ] Chat command works when gateway is running
- [ ] Error messages are clear when config is missing
- [ ] Error messages are clear when gateway is not running
- [ ] All commands show help with `--help`
- [ ] Invalid command arguments show helpful errors

## Common Issues and Solutions

### Issue: CLI is using wrong opspilot binary (global vs local)

**Symptoms:**
- `bun run cli setup` refers to a different opspilot installation
- Commands behave differently than expected
- Configuration from a different project is being used

**Solution:**
```bash
# Check if global opspilot exists
which opspilot

# Uninstall global npm package
npm uninstall -g @opspilot/cli

# Uninstall global bun package (if exists)
bun pm remove -g @opspilot/cli

# Verify it's gone
which opspilot  # Should return nothing or "not found"

# Always use the local version
bun run cli <command>
```

**Prevention:**
- Always use `bun run cli` from the project root
- Never install this package globally during development
- If you need a global install, use a different package name or version

### Issue: "Not configured" when config exists

**Solution:**
- Check config file location: `~/.opspilot/config.yaml`
- Verify YAML syntax is valid
- Check file permissions

### Issue: Gateway fails to start

**Solution:**
- Check if port is already in use
- Verify AI API key is set correctly
- Check memory system initialization (if enabled)
- Review error messages for specific issues

### Issue: Channel adapters fail to connect

**Solution:**
- Verify tokens/credentials are correct
- Check network connectivity
- Review channel-specific error messages
- Ensure gateway is running first

### Issue: Chat command fails

**Solution:**
- Ensure gateway is running (`opspilot gateway status`)
- Check gateway URL in config matches running instance
- Verify network connectivity to gateway

## Development Tips

### Debugging

Enable verbose logging:

```bash
# Set debug environment variable
DEBUG=* bun run cli <command>
```

### Testing Specific Commands

Test individual commands in isolation:

```bash
# Test just the setup command
bun run apps/cli/src/index.ts setup

# Test with specific options
bun run apps/cli/src/index.ts setup --advanced --reset
```

### Inspecting Configuration

After setup, inspect the generated config:

```bash
cat ~/.opspilot/config.yaml
```

### Resetting for Testing

Clean slate for testing:

```bash
# Remove config and workspace
rm -rf ~/.opspilot

# Run setup again
bun run cli setup
```

## Next Steps

After testing the CLI:

1. **Start the Gateway**: `bun run cli gateway start`
2. **Test Channels**: Connect via Telegram, Slack, or Web
3. **Test Skills**: Use DevOps skills like `k8s-debug`
4. **Configure Automation**: Set up heartbeat and cron jobs
5. **Add Memory**: Populate `MEMORY.md` with important information

## Related Documentation

- [Setup Guide](./setup-guide.md) - Detailed setup instructions
- [Configuration Reference](./configuration.md) - Config file format
- [Skills Guide](./skills.md) - Using and creating skills
- [Architecture](./architecture.md) - System architecture overview
