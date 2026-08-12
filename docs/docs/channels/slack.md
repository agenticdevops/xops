---
sidebar_position: 2
---

# Slack Setup

> **Status: partial / untested.** A Slack adapter exists in code but is not wired to the goose engine or tested end-to-end. **Telegram is the only supported channel today.** The description below is the target design.

Connect xops to Slack for team-wide access.

## Why Slack?

- **Team Collaboration** - Everyone can interact with xops
- **Thread Support** - Keep conversations organized
- **Channel Integration** - Post to incident channels
- **Enterprise Ready** - SSO, compliance, audit logs

## Step 1: Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click **Create New App**
3. Choose **From scratch**
4. Name it "xops" and select your workspace
5. Click **Create App**

## Step 2: Configure App Permissions

### OAuth & Permissions

Navigate to **OAuth & Permissions** and add these **Bot Token Scopes**:

| Scope | Purpose |
|-------|---------|
| `app_mentions:read` | Respond when @mentioned |
| `chat:write` | Send messages |
| `im:history` | Read DM history |
| `im:read` | Access DMs |
| `im:write` | Send DMs |

### Event Subscriptions

Navigate to **Event Subscriptions**:

1. Toggle **Enable Events** to On
2. Add these **Bot Events**:
   - `app_mention` - When someone @mentions the bot
   - `message.im` - Direct messages to the bot

## Step 3: Enable Socket Mode

xops uses Socket Mode (no public URL needed):

1. Navigate to **Socket Mode**
2. Toggle **Enable Socket Mode** to On
3. Create an **App-Level Token**:
   - Name: "xops-socket"
   - Scope: `connections:write`
4. Copy the token (starts with `xapp-`)

## Step 4: Install to Workspace

1. Navigate to **Install App**
2. Click **Install to Workspace**
3. Authorize the permissions
4. Copy the **Bot User OAuth Token** (starts with `xoxb-`)

## Step 5: Configure xops

### During Setup

```
? Select channels to enable
  ✓ Telegram Bot
  ✓ Slack
  ✓ Web Chat

? Enter Slack App Token (xapp-...) ▪▪▪▪▪▪▪▪▪▪
? Enter Slack Bot Token (xoxb-...) ▪▪▪▪▪▪▪▪▪▪
```

### Manual Configuration

Edit `~/.xops/config.yaml`:

```yaml
channels:
  slack:
    enabled: true
    accounts:
      default:
        appToken: "xapp-1-A0123456789-1234567890123-abc..."
        botToken: "xoxb-1234567890-1234567890123-abc..."
```

## Step 6: Start and Test

```bash
xops gateway start
```

Look for:
```
✓ Slack bot connected
```

### Test in Slack

**Direct Message:**
```
You: Hello!

xops: Hello! I'm xops, your 24/7 DevOps copilot.
```

**In a Channel (mention the bot):**
```
You: @xops check pod status in production

xops: I'll check the pod status in the production namespace...
```

## Usage Patterns

### Direct Messages

Send a DM to xops for private conversations:

```
You: Show me the AWS costs for this month
xops: Here's your AWS cost breakdown for January...
```

### Channel Mentions

Mention @xops in any channel it's invited to:

```
#incidents
@xops what's the status of the api-service deployment?
```

### Thread Replies

xops replies in threads to keep channels organized:

```
#devops
@xops rollback the frontend deployment
  └── xops: I'll rollback the frontend deployment...
      └── xops: ✓ Rollback complete. Previous version restored.
```

## Slash Commands (Optional)

Add a `/xops` slash command for quick access:

1. Navigate to **Slash Commands**
2. Click **Create New Command**
3. Configure:
   - Command: `/xops`
   - Description: "Ask your DevOps copilot"
   - Usage Hint: `[your question]`
4. Since we use Socket Mode, no URL is needed

Usage:
```
/xops list failed pods
```

## Using Environment Variables

```yaml
channels:
  slack:
    accounts:
      default:
        appToken: "${SLACK_APP_TOKEN}"
        botToken: "${SLACK_BOT_TOKEN}"
```

```bash
export SLACK_APP_TOKEN="xapp-..."
export SLACK_BOT_TOKEN="xoxb-..."
xops gateway start
```

## Multiple Workspaces

Configure multiple Slack workspaces:

```yaml
channels:
  slack:
    enabled: true
    accounts:
      production:
        appToken: "${SLACK_PROD_APP_TOKEN}"
        botToken: "${SLACK_PROD_BOT_TOKEN}"

      staging:
        appToken: "${SLACK_STAGING_APP_TOKEN}"
        botToken: "${SLACK_STAGING_BOT_TOKEN}"
```

## Troubleshooting

### "not_authed" error

The bot token is invalid or expired:
1. Regenerate the Bot Token in Slack App settings
2. Update your config
3. Restart the gateway

### "missing_scope" error

The app needs additional permissions:
1. Add the required scope in **OAuth & Permissions**
2. Reinstall the app to your workspace
3. Restart the gateway

### Bot doesn't respond to @mentions

1. Invite the bot to the channel: `/invite @xops`
2. Check that `app_mention` event is subscribed
3. Verify Socket Mode is enabled

### "Connection closed" repeatedly

Socket Mode connection issues:
1. Regenerate the App-Level Token
2. Check your network/firewall
3. Ensure only one gateway instance is running

## Security Best Practices

1. **Use Socket Mode** - No public endpoints needed
2. **Limit channel access** - Only invite bot to necessary channels
3. **Audit regularly** - Review who interacts with the bot
4. **Rotate tokens** - Regenerate tokens periodically
5. **Use environment variables** - Never commit tokens to git

## Enterprise Features

For Slack Enterprise Grid:

1. Install the app at the **Organization** level
2. Enable **Org-Wide App** deployment
3. Configure allowed workspaces

Contact your Slack admin for Enterprise Grid setup.

## Next Steps

- [Configure Memory](../features/memory) for context-aware responses
- [Set up Automation](../features/automation) for scheduled updates
- [Enable Web Chat](./web) for a dashboard interface
