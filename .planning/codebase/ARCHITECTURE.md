<!-- refreshed: 2026-07-19 -->
# Architecture

**Analysis Date:** 2026-07-19

## System Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                        Entry Points                          │
├──────────────────┬──────────────────┬───────────────────────┤
│    CLI (main)    │   TUI (stub)     │    Web (stub)         │
│ `apps/cli/src/`  │ `apps/tui/src/`  │  `apps/web/src/`      │
└────────┬─────────┴──────────────────┴───────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│              Gateway (Hono HTTP/WS server)                   │
│  `packages/gateway/src/server.ts` — routes, conversations    │
│  `packages/gateway/src/runtime.ts` — AIRuntime facade        │
└───────┬──────────────────┬──────────────────┬───────────────┘
        │                  │                  │
        ▼                  ▼                  ▼
┌───────────────┐  ┌───────────────┐  ┌─────────────────────┐
│   Channels    │  │    Memory     │  │       Skills        │
│ `packages/    │  │ `packages/    │  │ `packages/skills/`  │
│  channels/`   │  │  memory/`     │  │  (SKILL.md loader)  │
│ Telegram/Slack│  │ SQLite hybrid │  │                     │
└───────────────┘  └───────────────┘  └─────────────────────┘
        │                  │
        ▼                  ▼
┌─────────────────────────────────────────────────────────────┐
│  Core (shared foundation): types + Zod config + utils        │
│  `packages/core/src/` — config at `~/.xops/config.yaml`  │
└─────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Core | Shared types, config load/validate/save (Zod + YAML), env var expansion | `packages/core/src/types.ts`, `packages/core/src/config.ts` |
| Wizard | Interactive setup (Clack prompts), provider/model selection, config generation | `packages/wizard/src/wizard.ts`, `packages/wizard/src/steps.ts` |
| Gateway | Hono HTTP/WS server, conversation state, message orchestration | `packages/gateway/src/server.ts` |
| AI Runtime | LLM backend facade (Claude Code CLI subprocess or Anthropic SDK) | `packages/gateway/src/runtime.ts` |
| Channels | Telegram (grammY) and Slack (Bolt) adapters implementing `ChannelAdapter` | `packages/channels/src/telegram.ts`, `packages/channels/src/slack.ts` |
| Memory | SQLite hybrid search (vector + FTS5 keyword), markdown chunking, embedding cache | `packages/memory/src/manager.ts`, `packages/memory/src/hybrid.ts` |
| Skills | SKILL.md discovery/loading (gray-matter frontmatter), eligibility checks | `packages/skills/src/loader.ts` |
| Automation | Heartbeat/cron (planned — empty `src/`) | `packages/automation/src/` |
| Tunnel | Tailscale/ngrok exposure (planned — empty `src/`) | `packages/tunnel/src/` |
| CLI | Commander-based entry point wiring gateway + memory + channels together | `apps/cli/src/index.ts` |

## Pattern Overview

**Overall:** Monorepo with layered plugin architecture — a central gateway server orchestrates pluggable channel adapters, an AI runtime facade, and a callback-injected memory system.

**Key Characteristics:**
- Bun workspaces + Turborepo (`turbo.json`) for build orchestration across `packages/*` and `apps/*`
- Contracts-first: types defined in `@xops/core` (`packages/core/src/types.ts`), validated with Zod (`packages/core/src/config.ts`)
- Adapter pattern for channels (`ChannelAdapter` interface in `packages/channels/src/types.ts`)
- Facade pattern for AI backends (`AIRuntime` in `packages/gateway/src/runtime.ts` delegates to `ClaudeCodeRuntime` or `AnthropicAPIRuntime`)
- Dependency inversion for memory: gateway receives `onMemorySearch` callback instead of importing `@xops/memory` directly (`packages/gateway/src/server.ts:15`)

## Layers

**Apps Layer:**
- Purpose: User-facing entry points
- Location: `apps/cli/`, `apps/tui/` (stub), `apps/web/` (stub)
- Contains: Commander CLI (`apps/cli/src/index.ts`), shell launcher (`apps/cli/bin/xops`)
- Depends on: `packages/core`, `packages/wizard`, `packages/gateway`, `packages/memory`, `packages/channels` (via dynamic imports)
- Used by: End users

**Gateway Layer:**
- Purpose: HTTP/WS server, conversation orchestration, AI runtime
- Location: `packages/gateway/src/`
- Contains: `server.ts` (Hono routes + WebSocket), `runtime.ts` (LLM backends), `types.ts`
- Depends on: `packages/core` types (via relative import), Hono, Bun `serve`, `@anthropic-ai/sdk` (lazy), `claude` CLI (subprocess)
- Used by: CLI (`apps/cli/src/index.ts:77`), channel adapters (via `processMessage`)

**Capability Layer (Channels / Memory / Skills):**
- Purpose: Pluggable capabilities consumed by gateway/CLI
- Location: `packages/channels/src/`, `packages/memory/src/`, `packages/skills/src/`
- Contains: Adapters, SQLite manager, skill loader
- Depends on: External SDKs (grammY, Slack Bolt, better-sqlite3, gray-matter), core types
- Used by: CLI wiring code; skills formatted into system prompt via `formatSkillsForPrompt` (`packages/skills/src/loader.ts:190`)

**Foundation Layer (Core / Wizard):**
- Purpose: Types, config contract, setup flow
- Location: `packages/core/src/`, `packages/wizard/src/`
- Contains: `types.ts` (all shared contracts), `config.ts` (Zod schemas, load/save, `getDefaultConfig`), wizard steps
- Depends on: zod, yaml, @clack/prompts
- Used by: Everything above

## Data Flow

### Primary Request Path (HTTP chat)

1. Client POSTs to `/chat` on Hono server (`packages/gateway/src/server.ts:100`)
2. `getOrCreateConversation` fetches in-memory `ConversationContext` (`packages/gateway/src/server.ts:296`)
3. `onMemorySearch` callback queries memory, filters results by score > 0.3 (`packages/gateway/src/server.ts:119-127`)
4. `AIRuntime.chat` builds prompt with system prompt + last 10 messages + memory context, invokes backend (`packages/gateway/src/runtime.ts:245`)
5. `ClaudeCodeRuntime` spawns `claude -p <prompt> --model <model>` subprocess (`packages/gateway/src/runtime.ts:48-77`) OR `AnthropicAPIRuntime` calls the Anthropic Messages API (`packages/gateway/src/runtime.ts:164`)
6. Response appended to conversation, stats incremented, JSON returned (`packages/gateway/src/server.ts:148-156`)

### Channel Message Path (Telegram/Slack)

1. Adapter receives platform event, applies allowlist access control (`packages/channels/src/telegram.ts:26-38`)
2. Adapter normalizes to `IncomingMessage`, invokes registered `MessageHandler` (`packages/channels/src/types.ts:25`)
3. CLI wiring routes handler to `gateway.processMessage` with `channel:userId` conversation key (`apps/cli/src/index.ts:119-127`, `packages/gateway/src/server.ts:426`)
4. Same memory-search → AI-runtime → conversation-update flow as HTTP path
5. Adapter chunks reply per channel limits (Telegram `MAX_MESSAGE_LENGTH = 4096`, `packages/channels/src/telegram.ts:8`)

### Memory Indexing/Search Flow

1. `MemoryManager.init` opens SQLite (WAL mode), creates `meta`/`files`/`chunks` tables + FTS5 (`packages/memory/src/manager.ts:61-89`)
2. Markdown files chunked (400 tokens, 80 overlap per `packages/core/src/config.ts:157-160`) via `chunkMarkdown` (`packages/memory/src/internal.ts`)
3. Embeddings generated via `createEmbeddingProvider` (`packages/memory/src/embeddings.ts`), cached in `embedding_cache` table
4. Search merges vector cosine similarity (70%) with BM25 keyword score (30%) via `mergeHybridResults` (`packages/memory/src/hybrid.ts`)

### Streaming Paths

- SSE: `/chat/stream` wraps `chatStream` async generator in a `ReadableStream` (`packages/gateway/src/server.ts:165-245`)
- WebSocket: Bun `serve({ websocket })` handlers stream `chunk` events per client (`packages/gateway/src/server.ts:319-407`)

**State Management:**
- Conversations held in an in-memory `Map<string, ConversationContext>` on `GatewayServer` — no persistence across restarts (`packages/gateway/src/server.ts:30`)
- Persistent config at `~/.xops/config.yaml`; memory DB at `~/.xops/memory.db` (`packages/core/src/config.ts:13-16`)
- Wizard accumulates `WizardState` mutably across steps (`packages/wizard/src/steps.ts`)

## Key Abstractions

**ChannelAdapter:**
- Purpose: Uniform lifecycle (`initialize`/`start`/`stop`/`send`/`onMessage`) for chat platforms
- Examples: `packages/channels/src/telegram.ts`, `packages/channels/src/slack.ts`
- Pattern: Interface implementation; adapters normalize platform messages to `IncomingMessage`

**AIRuntime:**
- Purpose: Provider-agnostic chat/chatStream over LLM backends
- Examples: `packages/gateway/src/runtime.ts` (`ClaudeCodeRuntime`, `AnthropicAPIRuntime`)
- Pattern: Facade selecting backend by `config.ai.provider`; Anthropic SDK lazy-loaded

**Skill:**
- Purpose: Markdown-defined capability (SKILL.md with YAML frontmatter) injected into system prompt
- Examples: `packages/skills/bundled/k8s-debug/`, `packages/skills/bundled/incident-diagnose/`, `packages/skills/bundled/argocd-sync/`, `packages/skills/bundled/loki-search/`, `packages/skills/bundled/prometheus-query/`
- Pattern: Directory scan + gray-matter parse; eligibility gated on required binaries/env vars (`packages/skills/src/loader.ts:117`)

**xopsConfig:**
- Purpose: Single config contract for the whole system
- Examples: `packages/core/src/types.ts:162`, Zod schema at `packages/core/src/config.ts:59`
- Pattern: YAML file → `${ENV_VAR}` expansion → Zod `safeParse` → typed config

**onMemorySearch callback:**
- Purpose: Decouple gateway from memory implementation
- Examples: Injected in `apps/cli/src/index.ts:94-99`, consumed in `packages/gateway/src/server.ts:119`
- Pattern: Function injection (dependency inversion)

## Entry Points

**CLI (`xops`):**
- Location: `apps/cli/src/index.ts` (launcher: `apps/cli/bin/xops`, root `package.json` `bin` field)
- Triggers: `bun run cli <command>` or installed `xops` binary
- Responsibilities: Commands `setup` (wizard), `status`, `gateway start|stop|status` (wires memory + gateway + channel adapters, handles SIGINT shutdown), `memory` (stubs), `cron` (stub), `heartbeat` (stub), `chat` (HTTP client to running gateway)

**Gateway HTTP server:**
- Location: `packages/gateway/src/server.ts:316` (`start()` via Bun `serve`)
- Triggers: `xops gateway start`; default bind `127.0.0.1:18789` (`packages/core/src/config.ts:177-180`)
- Responsibilities: Routes `/health`, `/status`, `/chat`, `/chat/stream`, `/memory/search`, `/conversations`, `/webhook/telegram`, `/webhook/slack`; WebSocket chat

**Setup wizard:**
- Location: `packages/wizard/src/wizard.ts` (`runWizard`), steps in `packages/wizard/src/steps.ts`
- Triggers: `xops setup [--quickstart|--advanced|--reset]`
- Responsibilities: AI provider selection (detects `claude` CLI), channel/tool/skill configuration, writes `~/.xops/config.yaml`

## Architectural Constraints

- **Runtime:** Bun-first (`serve` from `bun`, `bun test`, `packageManager: bun@1.1.0`); Node >= 20 engine floor. Gateway server code depends on Bun APIs and will not run on plain Node.
- **Threading:** Single-process event loop; LLM calls via `claude-code` provider spawn a child process per message (`packages/gateway/src/runtime.ts:50`)
- **Global state:** None module-level; all state on class instances (`GatewayServer.conversations`, `MemoryManager.db`). Conversations are process-lifetime only.
- **Circular imports:** None detected; dependency direction is apps → gateway/channels/memory/wizard → core
- **Build order:** Turbo `build` uses `dependsOn: ["^build"]` (`turbo.json`) — core must build before dependents; packages emit `dist/` via `tsc`
- **External binary dependency:** `claude-code` provider requires the `claude` CLI on PATH; skills eligibility also shells out to `which` (`packages/skills/src/loader.ts:180`)

## Anti-Patterns

### Relative cross-package imports instead of workspace names

**What happens:** Packages/apps import siblings via deep relative paths, e.g. `import type { AIConfig } from '../../core/src/types'` (`packages/gateway/src/runtime.ts:7`) and `import { runWizard } from '../../../packages/wizard/src'` (`apps/cli/src/index.ts:8-9`)
**Why it's wrong:** Bypasses each package's `exports`/`dist` contract, couples to source layout, and breaks if packages are published or moved
**Do this instead:** Import via workspace names (`@xops/core`, `@xops/wizard`) as declared in `packages/core/package.json` `exports`

### Duplicate message/config types across packages

**What happens:** `InboundMessage`/`OutboundMessage` exist in `packages/core/src/types.ts:179-201` while channels define parallel `IncomingMessage`/`OutgoingMessage` in `packages/channels/src/types.ts:5-22`; `GatewayConfig` is duplicated in `packages/core/src/types.ts:145` and `packages/gateway/src/types.ts:5`; `TelegramConfig`/`SlackConfig` also exist in both core and channels
**Why it's wrong:** Violates the project's contracts-first rule ("No duplicate types across packages" per `CLAUDE.md`); the parallel shapes have already drifted (e.g. `chatId` vs `to`)
**Do this instead:** Define the contract once in `packages/core/src/types.ts` and import it everywhere

### Interface drift between CLI wiring and MemoryManager

**What happens:** `apps/cli/src/index.ts:83-88` constructs `new MemoryManager({ dbPath, embeddingProvider })` and calls `initialize()`/`close()`, but `packages/memory/src/manager.ts:53` declares `constructor(config: MemoryConfig, workspaceDir: string)` with `init()`; CLI also reads `r.content` while `MemorySearchResult` exposes `snippet` (`packages/core/src/types.ts:210`)
**Why it's wrong:** The gateway-start path will fail at runtime whenever memory is enabled; the type contract is not being enforced across the boundary
**Do this instead:** Call `MemoryManager` per its actual signature from `packages/memory/src/manager.ts`, and align on the `MemorySearchResult` shape from core

### Loose Zod validation with record(z.any())

**What happens:** `xopsConfigSchema` validates `channels`, `tools`, `skills`, `automation`, `gateway`, `agent` as `z.record(z.any())` (`packages/core/src/config.ts:66-72`)
**Why it's wrong:** Invalid channel/gateway config passes validation and fails later at runtime (e.g. `config.gateway.port` accessed unchecked in `packages/gateway/src/server.ts:317`)
**Do this instead:** Define full Zod schemas mirroring the TypeScript interfaces in `packages/core/src/types.ts`

## Error Handling

**Strategy:** Throw `Error` at boundaries; catch at entry points and report to user (CLI prints via picocolors, HTTP routes return `{ error }` JSON with status codes)

**Patterns:**
- Config loading throws with actionable message ("Run 'xops setup' first") (`packages/core/src/config.ts:82`)
- Gateway routes wrap handlers in try/catch, return `c.json({ error }, 500|400|404)` (`packages/gateway/src/server.ts:157-161`)
- Degrade gracefully: memory search failures log and continue without context (`packages/gateway/src/server.ts:123-126`); channel adapter startup failures warn but do not abort gateway (`apps/cli/src/index.ts:130-132`); embedding provider failure falls back to keyword-only search (`packages/memory/src/manager.ts:82-86`)
- Subprocess errors surfaced with install hints ("Is Claude Code installed?") (`packages/gateway/src/runtime.ts:75`)

## Cross-Cutting Concerns

**Logging:** `console.log`/`console.error` with picocolors in CLI; Hono `logger()` middleware for HTTP requests (`packages/gateway/src/server.ts:69`). No structured logging framework.
**Validation:** Zod at config-load time only (`packages/core/src/config.ts:92`); request bodies validated manually (presence checks) in routes.
**Authentication:** Channel-level allowlists (`allowFrom` usernames/IDs in `packages/channels/src/telegram.ts:30-38`); gateway binds `127.0.0.1` by default; CORS restricted to `localhost:3000`/`localhost:8080` (`packages/gateway/src/server.ts:60-66`). No HTTP auth on gateway endpoints.
**Secrets:** Config supports `${ENV_VAR}` expansion (`packages/core/src/config.ts:191`); runtime resolves `${...}` API keys from env (`packages/gateway/src/runtime.ts:261`).

---

*Architecture analysis: 2026-07-19*
