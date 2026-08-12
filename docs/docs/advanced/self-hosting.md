# Self-Hosting

OpsPilot is self-hosted by design: it runs on your machine or server, your credentials never leave your infrastructure, and the LLM is whatever you configure goose to use — including a fully local model.

## Requirements

- Bun v1.0+
- goose v1.45+ (`goose --version`)
- Docker (for the docker profile and local testing)
- Optional: ollama for a fully local, zero-API-cost setup

## Fully local setup (no API keys anywhere)

```
# 1. Install ollama and pull a capable model
ollama pull qwen2.5:32b

# 2. Point goose at it
goose configure   # choose ollama provider

# 3. Run OpsPilot with explicit provider selection
OPSPILOT_PROVIDER=ollama OPSPILOT_MODEL=qwen2.5:32b bun scripts/poc-telegram.ts
```

`note: small local models (7B and under) reliably run the diagnose flow but often narrate fixes instead of executing them. For dependable fix execution use a larger local model or configure a hosted provider in goose.`

## Hosted-model setup

Configure any goose-supported provider (`goose configure`) — Anthropic, OpenAI, Groq, and others. The API key lives in goose's keyring, not in OpsPilot's config.

## Running as a service

A supervised `opspilot start` service is on the roadmap. Today, run the Telegram bridge under your process manager of choice:

```
nohup bun scripts/poc-telegram.ts > ~/.opspilot/workspace/bridge.log 2>&1 &
```

## What leaves your machine

- Prompts and command output go to whichever LLM provider goose is configured with — **nothing** with a local ollama model.
- OpsPilot itself makes no external calls except the Telegram Bot API (when the bridge is running).
