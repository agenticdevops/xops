---
sidebar_position: 1
---

# Telegram Setup

Connect OpsPilot to Telegram for mobile access from anywhere.

## Why Telegram?

- **Mobile Access** - Message your copilot from your phone
- **Push Notifications** - Get alerts and morning briefings
- **Rich Formatting** - Code blocks, markdown, and more
- **Free & Fast** - No additional costs, instant delivery

## Step 1: Create a Bot with BotFather

1. Open Telegram and search for [@BotFather](https://t.me/BotFather)
2. Send `/newbot`
3. Choose a name (e.g., "My OpsPilot")
4. Choose a username (must end in `bot`, e.g., `my_opspilot_bot`)
5. Copy the **API token** - you'll need this!

```
BotFather: Done! Congratulations on your new bot.

Use this token to access the HTTP API:
7123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw
```

:::caution Keep Your Token Secret
Never share your bot token publicly. Anyone with the token can control your bot.
:::

## Step 2: Configure OpsPilot

### During Setup

When running `opspilot setup`, select "Yes" when asked about Telegram:

```
? Enable Telegram bot? Yes
? Enter Telegram bot token (from @BotFather) ▪▪▪▪▪▪▪▪▪▪
? Your Telegram username @yourusername
```

### Manual Configuration

Edit `~/.opspilot/config.yaml`:

```yaml
channels:
  telegram:
    enabled: true
    accounts:
      default:
        token: "7123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw"
        allowFrom:
          - "yourusername"
          - "teammate1"
```

## Step 3: Start and Test

```bash
opspilot gateway start
```

Look for:
```
✓ Telegram bot connected
```

Now open Telegram and message your bot:

```
You: /start

OpsPilot: Hello! I'm OpsPilot, your 24/7 DevOps copilot.
```

## Access Control

### Allow Specific Users

Only users in the `allowFrom` list can interact with the bot:

```yaml
channels:
  telegram:
    accounts:
      default:
        token: "..."
        allowFrom:
          - "yourusername"      # Your username (without @)
          - "teammate"          # Team member
          - "123456789"         # User ID also works
```

### No Access Control (Not Recommended)

To allow anyone to use your bot, omit the `allowFrom` field:

```yaml
channels:
  telegram:
    accounts:
      default:
        token: "..."
        # No allowFrom = anyone can use it
```

:::warning Security Risk
Without access control, anyone who discovers your bot can use it to run commands on your infrastructure.
:::

## Bot Commands

OpsPilot responds to these built-in commands:

| Command | Description |
|---------|-------------|
| `/start` | Welcome message and capabilities |
| `/help` | Show available commands |
| `/status` | Check OpsPilot status |
| `/memory <query>` | Search memory |

You can also just send natural language messages:

```
You: Check if any pods are failing in production

OpsPilot: I'll check the pod status in the production namespace...
```

## Multiple Accounts

You can configure multiple Telegram bots (e.g., for different teams):

```yaml
channels:
  telegram:
    enabled: true
    accounts:
      default:
        token: "${TELEGRAM_BOT_TOKEN}"
        allowFrom: ["admin1", "admin2"]

      readonly:
        token: "${TELEGRAM_READONLY_TOKEN}"
        allowFrom: ["viewer1", "viewer2"]
        # Future: readonly mode
```

## Using Environment Variables

Keep tokens out of config files:

```yaml
channels:
  telegram:
    accounts:
      default:
        token: "${TELEGRAM_BOT_TOKEN}"
```

Then set the environment variable:

```bash
export TELEGRAM_BOT_TOKEN="7123456789:AAHdq..."
opspilot gateway start
```

## Webhook Mode (Advanced)

For production deployments, you can use webhooks instead of polling:

```yaml
channels:
  telegram:
    accounts:
      default:
        token: "..."
        webhookUrl: "https://your-domain.com/webhook/telegram"
```

This requires:
1. A public HTTPS endpoint
2. SSL certificate (Let's Encrypt works)
3. Configure your firewall/reverse proxy

## Troubleshooting

### "Access denied" message

Your username is not in the `allowFrom` list. Check:
1. Spelling (no `@` prefix needed)
2. Case sensitivity (usernames are case-insensitive)
3. Config file was saved and gateway restarted

### Bot not responding

1. Check gateway is running: `opspilot gateway status`
2. Verify token is correct
3. Check gateway logs for errors
4. Try `/start` to test basic connectivity

### "Conflict: terminated by other getUpdates request"

Another instance is using the same bot. Only one process can poll a bot at a time.

```bash
# Find and stop other instances
ps aux | grep opspilot
kill <pid>
```

### Messages are delayed

Polling mode checks for updates every few seconds. For real-time delivery, use webhook mode.

## Best Practices

1. **Use environment variables** for tokens
2. **Restrict access** to known usernames
3. **Use descriptive bot names** like "DevOps-Prod" or "K8s-Helper"
4. **Enable notifications** on your phone for the bot
5. **Create separate bots** for production vs development

## Next Steps

- [Set up Slack](./slack) for team-wide access
- [Configure Memory](../features/memory) to remember conversations
- [Enable Automation](../features/automation) for proactive alerts
