# Progress — Web Chat UI (streaming)

**Spec:** [../specs/2026-08-14-web-chat-ui-design.md](../specs/2026-08-14-web-chat-ui-design.md)
**Plan:** [../plans/2026-08-14-web-chat-ui.md](../plans/2026-08-14-web-chat-ui.md)
**Base:** `b3252c4` (branch `web-chat-ui` off main) · **Status:** ✅ all tasks complete, merged to main.

## Task log

| Task | Commit | Review | Notes |
|---|---|---|---|
| 1 — Incremental stream-json parser | `6c94c05` | clean | partial-line buffering verified; minor: `ev: any` |
| 2 — `onStdout` callback on `runGooseProcess` | `a0222db` | clean | buffered return intact |
| 3 — `streamBotTurn` generator + `runBotTurn` on top | `230d062` | Needs work → fixed `6322111` | live streaming confirmed (2 text events 0.8s apart); fixed a real `tsc` narrowing bug. **Important finding:** `drainToResult` flat-concatenated all-turn text vs old last-message-wins → fixed so `reply` = clean final message while text still streams live |
| 4 — Gateway `GET /bots` | `cfbde2b` | self-verified | 200 + both bots |
| 5 — Gateway WS `/ws` chat forwarder | `486816a` | clean | error paths + server rewiring verified; fixed a pre-existing barrel bug (`evaluateKubectl` exported but deleted in the guard rewrite); minor: `let project` implicit-any |
| 6 — Scaffold `apps/web` (Vite+React) | `1ccba9f` | self-verified | build ok, `dist/` generated, `@xops/web`, dist gitignored |
| 7 — Streaming chat UI | `0dc78d6` | Needs work → fixed `e814a04` | **Important finding:** WS reconnect timer not cancelled on unmount (leak) → fixed with a `cancelled` guard + `clearTimeout`; dropped a redundant cast; minor: `String(verified)` label, no runtime event validation |
| 8 — Dev script + docs + port fix | `4f3d447` | DONE_WITH_CONCERNS | docs+web build ok; surfaced the gateway-start blocker below |

## Make-it-runnable fixes (beyond the 8 planned tasks)

Task 8 surfaced that the gateway wouldn't start and `/ws` never connected — two pre-existing bugs blocking the whole feature end-to-end. Fixed in `ca5357f`:

- **CLI gateway-start:** called `memoryManager.initialize()` (method is `init()`) with a wrong single-object constructor → `createMemoryManager(config, workspaceDir).init()`, made memory non-fatal (web chat works without it).
- **WebSocket upgrade:** Bun `serve` wired a `websocket` handler but never called `server.upgrade()`, so `/ws` never connected → `fetch` now upgrades `/ws`, hands the rest to Hono.

Verified live on a free port: gateway starts, `GET /bots` serves both bots, `/ws` connects and forwards chat events (`{"type":"error","message":"unknown bot ..."}` on the error path).

## Final whole-branch review

`READY TO MERGE` (opus). No correctness blockers; all type contracts coherent across engine ↔ gateway ↔ web; memory-init/WS-upgrade fixes correct. Two recommended non-blocking follow-ups (deferred): abort the goose turn on WS disconnect; `try/finally` leak-safety in `streamBotTurn` on early `.return()`.

## How to run

```
kill <leftover OpenClaw pid on :18789>   # free the port if occupied
bun run cli gateway start                # terminal 1
XOPS_PROVIDER=claude-acp bun run web      # terminal 2 — open the Vite URL
```
