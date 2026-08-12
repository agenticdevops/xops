---
sidebar_position: 3
---

# Security

Security considerations and best practices for OpsPilot.

## Security Model

OpsPilot is designed with a **local-first** security model:

- Runs on YOUR machine
- Data stays on YOUR infrastructure
- No cloud dependencies (except AI API)
- You control access

## Authentication

### Telegram Access Control

Restrict bot access to specific users:

```yaml
channels:
  telegram:
    accounts:
      default:
        token: ${TELEGRAM_BOT_TOKEN}
        allowFrom:
          - "admin_username"
          - "oncall_username"
```

Without `allowFrom`, anyone who discovers your bot can use it.

### Slack Authentication

Slack uses workspace-bound tokens:

- **App Token**: Identifies your app
- **Bot Token**: Authorizes actions
- **Socket Mode**: No public endpoints

Only users in your Slack workspace can interact.

### Web/API Access

By default, binds to localhost only:

```yaml
gateway:
  bind: "127.0.0.1"  # Local only
  port: 18789
```

For remote access, use a tunnel (see below).

## Secrets Management

### Environment Variables

Never commit secrets to git. Use environment variables:

```yaml
# config.yaml
ai:
  apiKey: ${ANTHROPIC_API_KEY}

channels:
  telegram:
    accounts:
      default:
        token: ${TELEGRAM_BOT_TOKEN}
```

```bash
# .env or shell
export ANTHROPIC_API_KEY="sk-ant-..."
export TELEGRAM_BOT_TOKEN="123456:ABC..."
```

### File Permissions

Protect your config:

```bash
chmod 600 ~/.opspilot/config.yaml
chmod 700 ~/.opspilot
```

### Secrets in CI/CD

Use your CI/CD platform's secrets management:

```yaml
# GitHub Actions
env:
  ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

## Network Security

### Local-Only Binding

Default and recommended for personal use:

```yaml
gateway:
  bind: "127.0.0.1"
```

### Secure Remote Access

For remote access, use encrypted tunnels:

#### Tailscale (Recommended)

```yaml
gateway:
  tunnel:
    provider: tailscale
```

Benefits:
- WireGuard encryption
- Zero-trust networking
- No public endpoints
- MFA support

#### VPN

Access via corporate VPN - no changes needed if you can reach localhost.

#### SSH Tunnel

```bash
ssh -L 18789:localhost:18789 user@server
```

Then access `http://localhost:18789` locally.

### HTTPS

For public endpoints, always use HTTPS:

```nginx
server {
    listen 443 ssl http2;
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:18789;
    }
}
```

## Data Security

### Data at Rest

- Config: YAML file with optional env var expansion
- Memory: SQLite database with embeddings
- Conversations: In-memory (not persisted)

Encrypt your disk for sensitive environments.

### Data in Transit

- AI API: HTTPS to Anthropic/OpenAI
- Telegram: HTTPS to Telegram servers
- Slack: Encrypted WebSocket (Socket Mode)
- Local: HTTP (use HTTPS proxy for remote)

### Data Retention

Conversations are in-memory only - they don't persist across restarts.

Memory database persists your indexed files. Review what you add:

```bash
# See what's indexed
ls ~/.opspilot/workspace/memory/
```

## Tool Security

### Command Execution

OpsPilot can execute commands via detected tools. Understand the risks:

- Commands run as YOUR user
- Full access to YOUR credentials (kubectl, aws, etc.)
- Can modify YOUR infrastructure

### Sandboxing

Currently, there's no sandboxing. Commands run directly.

Best practices:
- Use read-only credentials where possible
- Review suggested commands before approval
- Don't run as root

### Credential Access

OpsPilot uses existing credentials:

| Tool | Credentials |
|------|-------------|
| kubectl | ~/.kube/config |
| aws | ~/.aws/credentials |
| docker | ~/.docker/config.json |
| gh | gh auth token |

It does NOT request or store these credentials separately.

## AI Security

### Data Sent to AI

Every message includes:
- Your message
- Conversation history
- Relevant memory context
- System prompt

### Data NOT Sent

- Your credentials
- Full config file
- Raw file contents (only indexed chunks)

### AI Provider Trust

You're trusting your AI provider with:
- Your queries
- Context about your infrastructure
- Memory content

Review your provider's data policies:
- [Anthropic Privacy](https://www.anthropic.com/privacy)
- [OpenAI Privacy](https://openai.com/privacy)

## Audit Logging

Currently basic - messages logged to stdout.

For production, consider:

```bash
# Redirect logs
opspilot gateway start 2>&1 | tee -a /var/log/opspilot.log
```

Future: Structured audit logging with user, action, timestamp.

## Security Checklist

### Initial Setup

- [ ] Use environment variables for secrets
- [ ] Set file permissions (600/700)
- [ ] Configure access control (allowFrom)
- [ ] Review detected tools

### Ongoing

- [ ] Rotate API keys periodically
- [ ] Review memory content
- [ ] Monitor for unusual activity
- [ ] Keep OpsPilot updated

### Production

- [ ] Use Tailscale or VPN for access
- [ ] Enable HTTPS if exposing publicly
- [ ] Run as non-root user
- [ ] Implement backup strategy
- [ ] Set up monitoring/alerting

## Incident Response

If you suspect compromise:

1. **Stop the gateway**
   ```bash
   opspilot gateway stop
   # or kill the process
   ```

2. **Revoke credentials**
   - Regenerate Telegram bot token
   - Rotate AI API key
   - Revoke Slack tokens

3. **Review access**
   - Check conversation history
   - Review executed commands
   - Audit infrastructure changes

4. **Restore**
   - Clean config
   - Fresh token setup
   - Verify access controls

## Reporting Security Issues

Found a vulnerability?

- Email: security@opspilot.sh
- GitHub: Private security advisory

Please don't disclose publicly until patched.
