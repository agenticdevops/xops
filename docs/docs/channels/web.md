---
sidebar_position: 3
---

# Web Chat

> **Status: no UI yet.** The gateway exposes HTTP/WebSocket chat endpoints, but there is no web interface. A config + chat web UI is on the roadmap. The description below is the target design.

Use xops through a web browser interface.

## Overview

The web channel provides:

- **Real-time Chat** - WebSocket-based instant messaging
- **Streaming Responses** - See answers as they're generated
- **Local Access** - No external dependencies
- **API Access** - REST endpoints for integration

## Quick Start

Web chat is enabled by default. Start the gateway:

```bash
xops gateway start
```

Open your browser to:
```
http://localhost:18789
```

## Configuration

### Basic Setup

```yaml
channels:
  web:
    enabled: true
    port: 8080  # Web UI port (separate from gateway)
```

### Gateway Port

The gateway server runs on its own port:

```yaml
gateway:
  bind: "127.0.0.1"  # localhost only
  port: 18789
```

## API Endpoints

### Health Check

```bash
curl http://localhost:18789/health
```

```json
{
  "status": "healthy",
  "timestamp": "2025-01-26T12:00:00.000Z"
}
```

### Send a Message

```bash
curl -X POST http://localhost:18789/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "List pods in default namespace"}'
```

```json
{
  "conversationId": "abc123",
  "response": "Here are the pods in the default namespace...",
  "memoryUsed": true
}
```

### Streaming Responses

```bash
curl -X POST http://localhost:18789/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"message": "Explain Kubernetes networking"}'
```

Returns Server-Sent Events:
```
data: {"text": "Kubernetes "}
data: {"text": "networking "}
data: {"text": "consists of..."}
data: {"done": true, "conversationId": "abc123"}
```

### Search Memory

```bash
curl -X POST http://localhost:18789/memory/search \
  -H "Content-Type: application/json" \
  -d '{"query": "Redis connection issues", "limit": 5}'
```

### Get Status

```bash
curl http://localhost:18789/status
```

```json
{
  "status": "running",
  "stats": {
    "uptime": 3600000,
    "messagesProcessed": 42,
    "activeConversations": 3,
    "memoryChunks": 156
  },
  "config": {
    "engine": {
      "runner": "goose",
      "provider": "ollama",
      "model": "qwen25-32k"
    },
    "channels": {
      "telegram": true,
      "slack": false,
      "web": true
    }
  }
}
```

## WebSocket Chat

Connect via WebSocket for real-time chat:

```javascript
const ws = new WebSocket('ws://localhost:18789');

ws.onopen = () => {
  console.log('Connected');
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);

  switch (data.type) {
    case 'connected':
      console.log('Session ID:', data.conversationId);
      break;
    case 'start':
      console.log('Response starting...');
      break;
    case 'chunk':
      process.stdout.write(data.text);
      break;
    case 'done':
      console.log('\nResponse complete');
      break;
    case 'error':
      console.error('Error:', data.message);
      break;
  }
};

// Send a message
ws.send(JSON.stringify({
  type: 'chat',
  message: 'Hello!'
}));
```

## Conversation Management

### List Conversations

```bash
curl http://localhost:18789/conversations
```

```json
{
  "conversations": [
    {
      "id": "abc123",
      "channel": "web",
      "messageCount": 10,
      "startedAt": "2025-01-26T10:00:00.000Z",
      "lastActivity": "2025-01-26T12:00:00.000Z"
    }
  ]
}
```

### Delete Conversation

```bash
curl -X DELETE http://localhost:18789/conversations/abc123
```

### Continue Conversation

Include `conversationId` to continue a conversation:

```bash
curl -X POST http://localhost:18789/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What about the second option?",
    "conversationId": "abc123"
  }'
```

## Network Access

### Local Only (Default)

```yaml
gateway:
  bind: "127.0.0.1"  # Only accessible from localhost
  port: 18789
```

### LAN Access

```yaml
gateway:
  bind: "0.0.0.0"  # Accessible from any network interface
  port: 18789
```

:::warning Security
When binding to `0.0.0.0`, anyone on your network can access xops. Consider:
- Using a firewall
- Setting up authentication (coming soon)
- Using a VPN or tunnel
:::

### Remote Access via Tunnel

For secure remote access, use a tunnel:

```yaml
gateway:
  bind: "127.0.0.1"
  port: 18789
  tunnel:
    provider: tailscale  # or ngrok, cloudflare
```

See [Self-Hosting](../advanced/self-hosting) for tunnel setup.

## Integration Examples

### Python Client

```python
import requests

class xopsClient:
    def __init__(self, base_url="http://localhost:18789"):
        self.base_url = base_url
        self.conversation_id = None

    def chat(self, message):
        response = requests.post(
            f"{self.base_url}/chat",
            json={
                "message": message,
                "conversationId": self.conversation_id
            }
        )
        data = response.json()
        self.conversation_id = data["conversationId"]
        return data["response"]

# Usage
client = xopsClient()
print(client.chat("Hello!"))
print(client.chat("What pods are running?"))
```

### Bash Script

```bash
#!/bin/bash

xops_chat() {
    curl -s -X POST http://localhost:18789/chat \
        -H "Content-Type: application/json" \
        -d "{\"message\": \"$1\"}" | jq -r '.response'
}

# Usage
xops_chat "Check cluster health"
```

### Node.js Client

```javascript
const WebSocket = require('ws');

async function chat(message) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://localhost:18789');
    let response = '';

    ws.on('message', (data) => {
      const msg = JSON.parse(data);
      if (msg.type === 'chunk') {
        response += msg.text;
      } else if (msg.type === 'done') {
        ws.close();
        resolve(response);
      } else if (msg.type === 'error') {
        ws.close();
        reject(new Error(msg.message));
      } else if (msg.type === 'connected') {
        ws.send(JSON.stringify({ type: 'chat', message }));
      }
    });
  });
}

// Usage
chat('List deployments').then(console.log);
```

## Troubleshooting

### "Connection refused"

Gateway is not running:
```bash
xops gateway start
```

### "CORS error" in browser

Add your origin to allowed CORS:
```yaml
# Currently configured for localhost:3000 and localhost:8080
# Custom CORS configuration coming soon
```

### WebSocket disconnects

Check for:
1. Network issues
2. Gateway crashes (check logs)
3. Idle timeout (reconnect automatically)

## Next Steps

- [Set up Telegram](./telegram) for mobile access
- [Configure Memory](../features/memory) for context
- [Build a custom UI](../advanced/architecture) using the API
