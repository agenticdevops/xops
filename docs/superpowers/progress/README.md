# Superpowers Progress Index

Durable record of brainstorm → spec → plan → subagent-driven execution for each feature. The live SDD ledgers live in `.superpowers/sdd/` (gitignored scratch); these are the committed snapshots so the history survives.

| Feature | Spec | Plan | Progress | Status |
|---|---|---|---|---|
| Phase 1 — Bots, Projects & Unified Sessions | [design](../specs/2026-08-12-bots-and-sessions-design.md) | [plan](../plans/2026-08-12-bots-and-sessions.md) | [progress](2026-08-12-bots-and-sessions.md) | ✅ merged to main |
| Web Chat UI (streaming) | [design](../specs/2026-08-14-web-chat-ui-design.md) | [plan](../plans/2026-08-14-web-chat-ui.md) | [progress](2026-08-14-web-chat-ui.md) | ✅ merged to main |

## Workflow used

superpowers: `brainstorming` → `writing-plans` → `subagent-driven-development` (fresh implementer subagent per task, per-task spec+quality review, fix loop for Critical/Important findings, opus whole-branch review before merge) → `finishing-a-development-branch`. TDD throughout; commits are atomic per task.

## Open follow-ups (deferred, non-blocking)

- **Web UI:** abort the goose turn when the WS client disconnects (an `auto`-mode write shouldn't continue after the browser closes); `try/finally` leak-safety in `streamBotTurn` on early generator `.return()`.
- **Role editor:** define a role via `agent.md` + attach skills + tools in the UI — the originally-requested next phase after chat-first.
- **Minor (deferred from reviews):** `stream-parse.ts` `ev: any`; `ws-chat.ts` `let project` implicit-any; guard-log field narrowing in `drainToResult`; `renderBotRecipe`/`renderRecipe` duplication; `poc-telegram` `adapter.send` missing `OutgoingMessage.channel` (pre-existing).
- **Env:** gateway default port 18789 was occupied by a leftover OpenClaw process on the dev machine — free it or use another port.
