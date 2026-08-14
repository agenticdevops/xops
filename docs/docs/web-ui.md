# Web Chat UI

> **Status: new, dev-only.** A browser UI to chat with a bot and watch it work live. Localhost only, no auth yet.

Run the gateway, then the web app:

```
# terminal 1 — gateway (note the port it prints, default 18789)
bun run cli gateway start

# terminal 2 — web UI
XOPS_PROVIDER=claude-acp bun run web
```

Open the printed Vite URL. Pick a bot, set a scope (container name for Docker, namespace for Kubernetes), choose a mode (`auto` runs writes, `safe` blocks them), and chat. You watch the turn stream: the agent's text, each guarded command as a chip (read / write / dangerous, allow or block), and a final verification banner.

The engine runs on the host behind the gateway — the browser only talks to it over WebSocket. Defining your own roles (agent.md + skills + tools) in the UI is the next planned step.
