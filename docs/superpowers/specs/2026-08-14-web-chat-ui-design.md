# Web Chat UI — Design (chat-first)

*Status: approved 2026-08-14. First slice of the role-based agent web interface. Role/agent.md authoring is a deliberate follow-on phase.*

## Context

xops today is driven from the CLI (`bot-run.ts`) and Telegram. This adds a browser UI to chat with a bot and watch it work in real time — the first step toward a role-based agent product where a user defines a role (agent.md), attaches skills, and grants tool access. We start chat-first to get the experience in hand and let it steer direction.

**Hard constraint:** the engine (goose + `docker`/`kubectl`) runs on a host, not in a browser. So this is a web SPA talking to the existing Hono gateway, which runs the engine. "wasm-only / standalone browser" is not possible for real execution and is not attempted.

## Scope

**In:** a React SPA (`apps/web`) that connects to the gateway over WebSocket, lets the user pick an existing bot (`docker-ops`, `k8s-sre`), set a scope + guard mode, send a message, and watch the turn stream — agent text, per-command guard decisions, and the final verification verdict.

**Out (v1):** role/agent.md editor (next phase), auth, multi-user, persistence across restarts, Slack/Telegram parity, interactive `write→ask` approval. Localhost-only.

## Architecture

```
browser (apps/web, React SPA)
   │  WebSocket /ws/chat  { bot, scope, mode, message }
   ▼
Hono gateway (packages/gateway)
   │  streamBotTurn(req) → AsyncGenerator<BotTurnEvent>
   ▼
goose subprocess (+ guard shim / claude-acp hook) → docker/kubectl
   │
   ├─ stdout stream-json  → text deltas
   ├─ guard.jsonl (tail)  → guard decisions
   └─ close → verify      → verdict
```

No auth (localhost). Conversation state in memory in the browser tab; the gateway is stateless per turn.

## Components & boundaries

| Unit | Responsibility | Depends on |
|---|---|---|
| `packages/gateway/src/engine/session.ts` — `streamBotTurn` | Run one bot turn as an async generator of `BotTurnEvent`s (text deltas, guard decisions, verify, done). Reuses workdir/shim/hook prep. | spawn, recipe, parse, verify, guard |
| `packages/gateway/src/engine/session.ts` — `runBotTurn` | Unchanged public contract; reimplemented as "drain `streamBotTurn` into a `BotTurnResult`" so there is one execution path. | streamBotTurn |
| `packages/gateway/src/engine/stream-parse.ts` | Incremental stream-json parser: fed stdout chunks, yields completed assistant text deltas. Pure, testable. | — |
| `packages/gateway/src/server.ts` — `GET /bots` | List bots for the picker. | @xops/core `listBots` |
| `packages/gateway/src/server.ts` — WS `/ws/chat` | Accept `{bot, scope, mode, message}`, run `streamBotTurn`, forward each event as a WS JSON message, end with `done`. Replaces the old `runGooseChat` WS path. | streamBotTurn, @xops/core |
| `apps/web/` (Vite + React + TS) | SPA: bot picker, scope+mode bar, streaming chat transcript with guard chips + verify banner, WS client. | gateway HTTP/WS |

### Event contract

```ts
type BotTurnEvent =
  | { type: 'text'; delta: string }
  | { type: 'guard'; tool: string; command: string; allowed: boolean; tier?: string; category?: string }
  | { type: 'verify'; healthy: boolean; summary: string }
  | { type: 'done'; wallSeconds: number; acted: boolean; verified: boolean | null }
  | { type: 'error'; message: string };
```

WS client → server message: `{ bot: string; scope: string; mode: 'auto'|'safe'; message: string }`.

## Data flow (one turn)

1. Browser opens WS, sends `{bot, scope, mode, message}`.
2. Gateway resolves the bot (`getBot`), builds a `Project` from scope (+ kubeconfig path for k8s), calls `streamBotTurn`.
3. `streamBotTurn` preps the workdir (skills, guard shim, claude-acp hook — mode baked), spawns goose, and concurrently: parses stdout stream-json → `text` events; watches `guard.jsonl` → `guard` events.
4. On goose close: runs verification if the turn ran ≥1 command with a project scope (`shouldVerify`) → `verify` event; then `done`.
5. Gateway forwards every event over WS. Browser renders incrementally.

## Error handling

- Bad/unknown bot, missing k8s kubeconfig, or spawn failure → `error` event, WS stays open for the next message.
- goose timeout → the existing watchdog fires; `streamBotTurn` emits `done` with a timed-out note (surfaced as an `error`/notice in the transcript).
- WS drop → browser auto-reconnects; an in-flight turn is abandoned (v1: no resume).
- Guard `fs.watch` unavailable → fall back to reading `guard.jsonl` once at end (events arrive at close instead of live); the turn still completes.

## Dev / serve

- Dev: `vite dev` for the SPA (HMR) with a WS/HTTP proxy to the running gateway; a `bun run` script starts the gateway. Two processes in dev.
- Prod (later): gateway serves `apps/web/dist` as static assets on the same origin. Out of scope for v1 beyond leaving the seam.

## Testing

- `stream-parse.ts`: feed chunked stream-json (including a delta split mid-JSON-line and a truncated tail) → assert the exact text-delta sequence. Pure, TDD.
- `streamBotTurn`: unit-test event ordering/gating logic where pure (e.g. verify-emitted-only-when-shouldVerify); the live goose path is covered by a manual smoke.
- `GET /bots`: shape matches `listBots()`.
- WS `/ws/chat`: a fake `streamBotTurn` yielding a scripted event list → assert each is forwarded as a WS message and `done` closes the turn.
- Frontend: render a scripted `BotTurnEvent[]` → assert transcript shows streamed text, guard chips, verify banner (light component test).
- Manual E2E: seed a broken container, open the UI, chat "fix it", watch text + guard chips + ✅ verify stream in.

## agent.md forward-note

The role editor (next phase) reads/writes `agent.md` → a `Bot` (name, display, platform, skills[], tools + default mode, persona/identity prose). This spec keeps `Bot` the single role model, so agent.md authoring produces bots the chat UI already knows how to talk to.

## Risks

- **Latency (2–5 min/turn on claude-acp).** Mitigated by live streaming — the whole point of the design. A slow provider still feels responsive because text/guard events flow continuously.
- **Streaming refactor of the engine.** `runBotTurn` must keep its contract; reimplementing it on top of `streamBotTurn` is the safe way (one path, existing tests guard it).
- **`fs.watch` portability** for guard-log tailing → documented fallback (read-at-close).
