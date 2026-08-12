---
sidebar_position: 1
---

# Architecture

Technical overview of OpsPilot's internal architecture.

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         OpsPilot                                 │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │  Telegram   │  │    Slack    │  │     Web     │  Channels   │
│  │  (grammY)   │  │   (Bolt)    │  │ (WebSocket) │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
│         │                │                │                     │
│         └────────────────┼────────────────┘                     │
│                          │                                      │
│                   ┌──────▼──────┐                               │
│                   │   Gateway   │  Hono HTTP Server             │
│                   │   Server    │  Port 18789                   │
│                   └──────┬──────┘                               │
│                          │                                      │
│         ┌────────────────┼────────────────┐                    │
│         │                │                │                     │
│  ┌──────▼──────┐  ┌──────▼──────┐  ┌─────▼──────┐             │
│  │   Memory    │  │ AI Runtime  │  │   Skills   │             │
│  │   Manager   │  │  (Claude)   │  │   Engine   │             │
│  └──────┬──────┘  └─────────────┘  └────────────┘             │
│         │                                                       │
│  ┌──────▼──────┐                                               │
│  │   SQLite    │  Vector + FTS5 Storage                        │
│  │  + Vec Ext  │                                               │
│  └─────────────┘                                               │
│                                                                  │
│  Tools: kubectl, aws, docker, gh, terraform, helm               │
└─────────────────────────────────────────────────────────────────┘
```

## Package Structure

```
opspilot/
├── packages/
│   ├── @opspilot/core/         # Config, types, utilities
│   ├── @opspilot/wizard/       # Setup wizard (Clack)
│   ├── @opspilot/channels/     # Channel adapters
│   ├── @opspilot/memory/       # Hybrid search system
│   ├── @opspilot/skills/       # Skill loader
│   ├── @opspilot/automation/   # Heartbeat, cron
│   ├── @opspilot/tunnel/       # Remote access
│   └── @opspilot/gateway/      # HTTP server + runtime
├── apps/
│   ├── cli/                    # CLI entry point
│   ├── web/                    # Web dashboard
│   └── tui/                    # Terminal UI
└── docs/                       # Documentation
```

## Core Components

### Gateway Server

The gateway is a Hono-based HTTP server that:

- Handles REST API requests
- Manages WebSocket connections
- Routes messages to channels
- Coordinates with AI runtime

```typescript
// packages/gateway/src/server.ts
export class GatewayServer {
  private app: Hono;
  private runtime: AIRuntime;
  private conversations: Map<string, ConversationContext>;

  async processMessage(options: ProcessMessageOptions): Promise<string> {
    // 1. Get/create conversation context
    // 2. Search memory for relevant context
    // 3. Call AI runtime
    // 4. Update conversation history
    // 5. Return response
  }
}
```

### AI Runtime

Handles communication with AI providers:

```typescript
// packages/gateway/src/runtime.ts
export class AIRuntime {
  async chat(
    context: ConversationContext,
    message: string,
    memoryContext?: string[]
  ): Promise<string>;

  async *chatStream(
    context: ConversationContext,
    message: string,
    memoryContext?: string[]
  ): AsyncGenerator<string>;
}
```

### Memory Manager

SQLite-based hybrid search:

```typescript
// packages/memory/src/manager.ts
export class MemoryManager {
  async search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
  async sync(): Promise<{ indexed: number; removed: number }>;
  async reindex(): Promise<void>;
}
```

### Channel Adapters

Unified interface for all channels:

```typescript
// packages/channels/src/types.ts
export interface ChannelAdapter {
  name: string;
  initialize(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  send(message: OutgoingMessage): Promise<void>;
  onMessage(handler: MessageHandler): void;
}
```

## Data Flow

### Message Processing

```
1. User sends message via Telegram/Slack/Web
           │
           ▼
2. Channel adapter receives message
           │
           ▼
3. Gateway.processMessage() called
           │
           ▼
4. Memory search for context
           │
           ▼
5. AI Runtime generates response
           │
           ▼
6. Response sent back via channel
```

### Memory Indexing

```
1. Markdown files in workspace
           │
           ▼
2. Chunking (400 tokens, 80 overlap)
           │
           ▼
3. Embedding generation (OpenAI/Gemini)
           │
           ▼
4. Store in SQLite with vector extension
           │
           ▼
5. FTS5 index for keyword search
```

### Hybrid Search

```
Query: "Redis connection timeout"
           │
      ┌────┴────┐
      ▼         ▼
   Vector    Keyword
   Search    Search
   (70%)     (30%)
      │         │
      └────┬────┘
           ▼
    Merge & Rank
           │
           ▼
    Top N Results
```

## Database Schema

```sql
-- Chunks table
CREATE TABLE chunks (
  id TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  content TEXT NOT NULL,
  hash TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Vector embeddings (sqlite-vec)
CREATE VIRTUAL TABLE chunk_embeddings USING vec0(
  chunk_id TEXT PRIMARY KEY,
  embedding FLOAT[1536]
);

-- Full-text search
CREATE VIRTUAL TABLE chunks_fts USING fts5(
  content,
  file_path,
  content='chunks',
  content_rowid='rowid'
);
```

## Configuration Flow

```
1. opspilot setup
           │
           ▼
2. Wizard collects preferences
           │
           ▼
3. Generate config.yaml
           │
           ▼
4. Create workspace directories
           │
           ▼
5. Initialize memory database
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/status` | GET | Server status |
| `/chat` | POST | Send message |
| `/chat/stream` | POST | Streaming response |
| `/memory/search` | POST | Search memory |
| `/conversations` | GET | List conversations |
| `/conversations/:id` | DELETE | Delete conversation |
| `/webhook/telegram` | POST | Telegram webhook |
| `/webhook/slack` | POST | Slack webhook |

## Security Model

### Authentication

- Telegram: Username allowlist
- Slack: Workspace-bound tokens
- Web: Local-only by default

### Secrets

- API keys in environment variables
- Config supports `${VAR}` expansion
- Tokens never logged

### Network

- Default bind to localhost
- Tunnel for remote access
- No public endpoints required

## Performance Considerations

### Memory

- Embedding cache (LRU, 1000 entries)
- Chunk deduplication by hash
- Lazy loading of embeddings

### Search

- Vector search: O(n) with HNSW index
- Keyword search: O(log n) with FTS5
- Combined: Sub-100ms typical

### Conversation

- In-memory conversation store
- Automatic context window management
- Old messages pruned by token count

## Extending OpsPilot

### Custom Channel

```typescript
import { ChannelAdapter } from '@opspilot/channels';

export class MyAdapter implements ChannelAdapter {
  name = 'mychannel';

  async initialize() { /* setup */ }
  async start() { /* begin listening */ }
  async stop() { /* cleanup */ }
  async send(msg) { /* deliver message */ }
  onMessage(handler) { /* register handler */ }
}
```

### Custom Skill

Create `~/.opspilot/workspace/skills/my-skill.md`:

```yaml
---
name: my-skill
description: "My custom skill"
---

# My Skill

Instructions for the AI...
```

### Custom Tool

Tools are currently built-in. Custom tool support coming soon.
