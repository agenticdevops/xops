# External Integrations

**Analysis Date:** 2026-07-19

## APIs & External Services

**LLM Providers:**
- Claude (Claude Code CLI) - Primary AI provider via Claude Code subscription (no API key needed)
  - SDK/Client: Child process spawn (`packages/gateway/src/runtime.ts` lines 49-72)
  - Method: CLI invocation with `-p` flag, model selection, streaming support
  - Fallback: Anthropic API available as secondary provider
  
- Anthropic API - Direct API integration for Claude models
  - SDK/Client: @anthropic-ai/sdk 0.35.0
  - Auth: `ANTHROPIC_API_KEY` environment variable
  - Models: Configurable (claude-3-opus, claude-3-sonnet, etc.)
  - Implementation: `packages/gateway/src/runtime.ts` lines 144-225

- OpenAI - LLM fallback provider
  - Configuration: Supported in AIConfig via provider enum ('openai')
  - Auth: `apiKey` field in config or environment
  - Usage: Listed in `packages/core/src/types.ts` AIConfig provider options

**Embedding Providers:**
- OpenAI Embeddings - Vector embeddings for memory search
  - SDK/Client: openai 4.78.0
  - Auth: `OPENAI_API_KEY` environment variable
  - Model: `text-embedding-3-small` (default, 1536 dimensions)
  - Implementation: `packages/memory/src/embeddings.ts` lines 16-56
  - Batch support: Native via OpenAI API

- Google Gemini - Alternative vector embeddings provider
  - SDK/Client: HTTP fetch to `https://generativelanguage.googleapis.com/v1beta`
  - Auth: `GEMINI_API_KEY` in query params
  - Model: `text-embedding-004` (default, 768 dimensions)
  - Implementation: `packages/memory/src/embeddings.ts` lines 61-102
  - Fallback: Keyword-only search if no embedding provider available

## Data Storage

**Databases:**
- SQLite 3
  - Provider: better-sqlite3 11.7.0 (native bindings)
  - Connection: File-based database at `~/.xops/memory.db` (configurable)
  - Client: better-sqlite3 with WAL mode enabled
  - Schema: Memory chunks table, FTS (full-text search) index, embedding cache
  - Implementation: `packages/memory/src/manager.ts` lines 69-88

**File Storage:**
- Local filesystem only
  - Configuration: `~/.xops/` directory structure
  - Workspace: `~/.xops/workspace/` for agent files and context
  - Memory DB: `~/.xops/memory.db` for vector store

**Caching:**
- SQLite embedding cache table (`EMBEDDING_CACHE_TABLE`)
  - Purpose: Avoid re-embedding duplicate chunks
  - Implementation: `packages/memory/src/manager.ts`

## Authentication & Identity

**Auth Provider:**
- Custom implementation per channel:
  - Telegram: Token-based (BotFather token)
  - Slack: Socket Mode with app token + bot token
  - Web: Optional (token, password, or none)
- Implementation: `packages/channels/src/` adapters
- Configuration: `packages/core/src/types.ts` ChannelConfig structures

**Telegram Authentication:**
- Token Source: Environment variable or configuration file
- Token Format: BotFather-issued bot token
- Access Control: Optional allowlist via `allowFrom` field (usernames or user IDs)
- Adapter: `packages/channels/src/telegram.ts` lines 17-21

**Slack Authentication:**
- Bot Token: XOXB-* token for API calls
- App Token: XAPP-* token for Socket Mode
- Configuration: `packages/core/src/types.ts` SlackAccountConfig
- Adapter: `packages/channels/src/slack.ts` lines 18-23

## Monitoring & Observability

**Error Tracking:**
- None detected - Error logging via console.error

**Logs:**
- Console-based logging throughout codebase
- Telegram: `packages/channels/src/telegram.ts` lines 63-64, 96-97
- Slack: `packages/channels/src/slack.ts` lines 60, 104-105
- Memory: `packages/memory/src/manager.ts` line 83
- Slack LogLevel: WARN (configured in Bolt app)

**Debugging:**
- No external monitoring service integration
- Local file-based logging via console

## CI/CD & Deployment

**Hosting:**
- Self-hosted via Bun runtime
- Port: Configurable (default 18789 for gateway, 8080 for web)
- Bind: Configurable (default 127.0.0.1)

**Tunnel/Remote Access:**
- Tailscale - Zero-trust network tunnel
  - Configuration: `packages/core/src/types.ts` GatewayConfig tunnel provider enum
  - Package: Stub implementation in `packages/tunnel/` (no SDK dependency)
  
- ngrok - Public URL tunneling
  - Configuration: Listed in GatewayConfig tunnel provider options
  - Package: Stub implementation, no SDK imported
  
- Cloudflare - Tunnel/Pages deployment
  - Configuration: Listed in GatewayConfig tunnel provider options
  - Package: Stub implementation, no SDK imported

**CI Pipeline:**
- None detected - No GitHub Actions, GitLab CI, or other pipeline configuration

## Environment Configuration

**Required env vars for embeddings:**
- `OPENAI_API_KEY` - For OpenAI embeddings provider (auto-detected in `packages/memory/src/embeddings.ts` line 140)
- `GEMINI_API_KEY` - For Google Gemini embeddings provider (auto-detected line 150)
- `ANTHROPIC_API_KEY` - For Anthropic API-based LLM runtime (if using anthropic provider)

**Optional channel tokens:**
- Telegram token (from BotFather)
- Slack bot token and app token
- Discord token (placeholder, not yet implemented)
- WhatsApp token (placeholder, not yet implemented)

**Memory configuration:**
- Provider selection: 'auto' (tries OpenAI then Gemini) | 'openai' | 'gemini' | 'local' (keyword-only)
- Chunking: 400 tokens default, 80-token overlap
- Hybrid search: 70% vector weight, 30% keyword weight (configurable)

**Secrets location:**
- Default: `~/.xops/config.yaml` (user-readable YAML file)
- Alternative sources: Environment variables via `${VAR_NAME}` expansion syntax in config
- Token sources: 'env' (environment variable), 'file' (config file), 'keychain' (OS keychain - not implemented)

## Webhooks & Callbacks

**Incoming:**
- Telegram: Webhook URL support in config (optional webhook mode, otherwise polling)
  - Implementation: `packages/channels/src/telegram.ts` lines 101-112
  - Handler: `packages/channels/src/telegram.ts` lines 194-198
  
- Slack: Socket Mode WebSocket (always active, no webhook needed)
  - Implementation: `packages/channels/src/slack.ts` lines 145-152

**Outgoing:**
- No outgoing webhooks to external services detected
- Message delivery: Direct API calls to Telegram and Slack APIs only

**Gateway Endpoints:**
- Hono-based HTTP server in `packages/gateway/`
- Port configurable via GatewayConfig.port (default 18789)
- Accepts inbound messages from channels and delivers responses

---

*Integration audit: 2026-07-19*
