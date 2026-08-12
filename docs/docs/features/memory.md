---
sidebar_position: 1
---

# Memory System

OpsPilot remembers everything - solutions, runbooks, and context from past conversations.

## Overview

The memory system provides:

- **Persistent Storage** - Information survives restarts
- **Semantic Search** - Find content by meaning, not just keywords
- **Hybrid Search** - Combines vector embeddings with keyword matching
- **Auto-Indexing** - Watches your workspace for changes

## How It Works

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Workspace   │────▶│   Chunking   │────▶│  Embeddings  │
│  (Markdown)  │     │  (400 tokens)│     │  (OpenAI)    │
└──────────────┘     └──────────────┘     └──────────────┘
                                                 │
                                                 ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│    Query     │────▶│Hybrid Search │◀────│   SQLite     │
│   "Redis"    │     │ 70% + 30%    │     │  + Vec Ext   │
└──────────────┘     └──────────────┘     └──────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │   Results    │
                     │  (Ranked)    │
                     └──────────────┘
```

1. **Indexing**: Markdown files are chunked and embedded
2. **Storage**: Chunks stored in SQLite with vector extension
3. **Search**: Queries use hybrid vector + keyword matching
4. **Context**: Top results are passed to the AI

## Quick Start

Memory is enabled by default. Add content to your workspace:

```bash
# Create a runbook
cat > ~/.opspilot/workspace/memory/runbooks/redis.md << 'EOF'
# Redis Troubleshooting

## Connection Timeout

When connections timeout:
1. Check Redis server is running: `redis-cli ping`
2. Verify network connectivity
3. Increase pool size if at capacity

## Memory Issues

If Redis is OOMKilled:
1. Check memory usage: `redis-cli info memory`
2. Set maxmemory policy: `CONFIG SET maxmemory-policy allkeys-lru`
EOF
```

Now OpsPilot can answer questions about Redis:

```
You: How do I fix Redis connection timeouts?

OpsPilot: Based on your runbook, here's how to fix Redis connection timeouts:

1. First, verify Redis is running: `redis-cli ping`
2. Check network connectivity between your app and Redis
3. If connections are maxed out, increase the pool size

Would you like me to check the current Redis status?
```

## Workspace Structure

```
~/.opspilot/workspace/
├── MEMORY.md              # Quick notes (always indexed)
├── HEARTBEAT.md           # Heartbeat checklist
└── memory/                # Additional memory files
    ├── runbooks/
    │   ├── kubernetes.md
    │   ├── redis.md
    │   └── aws.md
    ├── incidents/
    │   ├── 2024-01-15.md
    │   └── 2024-02-20.md
    └── notes/
        ├── architecture.md
        └── contacts.md
```

## Writing Good Memory Content

### Use Clear Headers

```markdown
# Kubernetes Troubleshooting

## Pod CrashLoopBackOff

Causes:
- Application error
- Missing configuration
- Resource limits

Solutions:
1. Check logs: `kubectl logs <pod>`
2. Describe pod: `kubectl describe pod <pod>`
```

### Include Commands

```markdown
## Scaling a Deployment

To scale the api-service:
```bash
kubectl scale deployment api-service --replicas=5
```

Or with HPA:
```bash
kubectl autoscale deployment api-service --min=3 --max=10
```
```

### Add Context

```markdown
## AWS Cost Optimization

Last reviewed: 2025-01-15

### Unused Resources

We found these unused resources in production:
- 3 unattached EBS volumes ($45/month)
- 2 idle NAT gateways ($90/month)

### Reserved Instances

Consider RI for:
- production-db (m6i.xlarge) - 60% savings
```

## Search Commands

### CLI Search

```bash
# Basic search
opspilot memory search "Redis connection"

# Limit results
opspilot memory search "deployment rollback" -n 10
```

### API Search

```bash
curl -X POST http://localhost:18789/memory/search \
  -H "Content-Type: application/json" \
  -d '{"query": "Redis connection issues", "limit": 5}'
```

### In Conversation

Just ask naturally - OpsPilot automatically searches memory:

```
You: How did we fix the Redis issue last month?

OpsPilot: Based on your incident notes from January 15th:

The issue was Redis maxclients limit reached. The fix was:
1. Increased maxclients from 100 to 500
2. Implemented connection pooling in the API service
3. Added Redis connection monitoring

Do you want me to check current Redis connection counts?
```

## Configuration

```yaml
memory:
  enabled: true
  provider: auto              # Embedding provider
  store:
    driver: sqlite
    path: ~/.opspilot/memory.db
  chunking:
    tokens: 400               # Chunk size in tokens
    overlap: 80               # Overlap between chunks
  search:
    maxResults: 6             # Max results returned
    minScore: 0.35            # Minimum relevance score
    hybrid:
      enabled: true
      vectorWeight: 0.7       # 70% vector similarity
      textWeight: 0.3         # 30% keyword match
```

### Embedding Providers

| Provider | Notes |
|----------|-------|
| `auto` | Uses your AI provider's embeddings |
| `openai` | Best quality (text-embedding-3-small) |
| `gemini` | Google's embeddings |
| `local` | No API needed (all-MiniLM-L6-v2) |

### Chunking Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `tokens` | 400 | Target chunk size |
| `overlap` | 80 | Overlap for context |

Smaller chunks = more precise results, larger = more context.

### Search Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `maxResults` | 6 | Results per search |
| `minScore` | 0.35 | Minimum relevance (0-1) |

## Manual Operations

### Sync Index

Manually sync the index:

```bash
opspilot memory sync
```

### Full Reindex

Rebuild the entire index:

```bash
opspilot memory reindex
```

### Check Status

```bash
opspilot memory status

# Output:
📊 Memory Status

✓ Database: ~/.opspilot/memory.db
  Chunks: 156
  Files: 12
  Last sync: 2 minutes ago
```

## Best Practices

### 1. Organize by Topic

```
memory/
├── runbooks/        # How-to guides
├── incidents/       # Post-mortems
├── architecture/    # System design
└── contacts/        # Escalation paths
```

### 2. Use Markdown Formatting

- Headers for structure
- Code blocks for commands
- Lists for steps
- Links to related docs

### 3. Keep Content Current

- Update after incidents
- Remove outdated info
- Add timestamps to notes

### 4. Be Specific

```markdown
# Bad
Redis issues - increase memory

# Good
## Redis OOMKilled in Production (2025-01-15)

Root cause: Memory limit too low for traffic spike.

Fix:
1. Increased maxmemory from 2GB to 4GB
2. Set eviction policy to allkeys-lru
3. Added memory alerts at 80% threshold
```

## Troubleshooting

### "Memory search failed"

Check database exists:
```bash
ls -la ~/.opspilot/memory.db
```

Reindex if corrupted:
```bash
opspilot memory reindex
```

### Results not relevant

- Add more specific content
- Use better keywords in questions
- Lower minScore for broader results

### Index not updating

Check file permissions:
```bash
ls -la ~/.opspilot/workspace/
```

Manual sync:
```bash
opspilot memory sync
```
