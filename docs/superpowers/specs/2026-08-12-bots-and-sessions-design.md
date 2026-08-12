# Phase 1 Design — Bots, Projects & Unified Sessions

*Status: approved 2026-08-12. Supersedes the earlier "intent routing + personas" framing of Phase 1.*

## Context

xops is the **experience + governance layer that goose does not provide**, riding goose as the agent engine. goose runs the LLM loop and executes tools; xops supplies the domain model (bots, skills, projects, guardrails), the safety boundaries (scoped credentials, fail-closed guard), independent verification, and the interfaces (Telegram now; TUI/desktop, WASM, Slack/WhatsApp/Teams later).

Today xops is single-flow: every message runs one hardcoded incident pipeline, with naive keyword routing in `scripts/poc-telegram.ts`. This phase replaces that with a real domain model inspired by how ops teams actually work.

## Domain model (real-world inspired)

- **Bot / Copilot** — the specialist you talk to, modeled on a job role (e.g. "Kubernetes SRE Bot", "CloudOps Copilot"). A bot is defined by its **skills** (specialties), its platform (tool + credential model), and later its identity/voice and risk posture. Called a bot/copilot, not "engineer".
- **Skill** — an executable runbook/capability that makes a bot a specialist (k8s-pod-triage, docker-triage; later Terraform, AWS-admin). Already implemented as SKILL.md + diagnose.sh + grants.
- **Project** — the assignment context a bot works within: scope (namespace / container prefix), scoped credentials (access level), and a brief (tech stack, responsibilities, environment).
- **Squad** — the set of bots assigned to a project. Modeled conceptually; **not built in this phase.**

A **running agent = Bot × Project**: "Kubernetes SRE Bot on project *payments-staging*" gets that project's scoped kubeconfig + the bot's skills + the guard.

## Interaction model — no routing, the human picks the specialist

Verb/keyword intent routing is abandoned; it is fragile and does not map to real job roles. Instead the user selects which bot they are talking to (Hermes-style profiles). Within a bot, the *agent* picks which skill to run from its own small bundle — the thing the model is genuinely good at, and already how recipes instruct ("load the best-matching skill").

Telegram, per-chat binding:
- `/bots` — list available bots
- `/use <bot>` — bind this chat to a bot (persists for the chat)
- `/project <name>` — set the project context for this chat
- default bot if none bound
- any other message → dispatched to the bound bot

## Unified scoped session

Talking to a bot is one guarded, scoped goose session — this merges the previous split between tool-less chat (`chat.ts`) and one-shot skill runs (`goose.ts`).

Per turn:
- one `goose run` with the bot's skills copied into `.goose/skills/`, guard shims on PATH for the bot's platform tools, the project's scoped credentials in the environment, and recent conversation history passed in
- the `shell` tool IS available (the bot can act) — unlike the retired tool-less chat
- recipe instructions = bot identity + "answer questions directly; when the user asks you to fix or diagnose something, load the matching runbook and follow it; never exceed your grants"
- the fail-closed guard + scoped credentials are the safety boundary. The prior "chat literally cannot execute" guarantee is retired: the guard was always the real boundary, and a scoped bot acting when asked is the entire point.

**Verification:** after a turn, if the guard log shows any **allowed command of tier HIGH** ran (a mutation), xops runs the platform's independent verification (`verifyNamespace` / `verifyContainer`) and attaches the verdict. Turns with only LOW/read commands, or no commands (pure chat), skip verification. The guard log already records tier per decision.

## Grant model

A bot bundles skills; before a turn, the guard shim is baked with the **union** of the bot's skills' grants (from SKILL.md frontmatter). The agent picks one skill at runtime; the guard enforces per-command and denies CRITICAL unconditionally. Union is safe: all grants are non-CRITICAL and skill-authored.

## Modules & boundaries

| Module | Responsibility | Depends on |
|---|---|---|
| `packages/core/src/bots.ts` | `Bot` / `Project` types + bundled registry + `grantsFor(bot)` | skills frontmatter |
| `packages/gateway/src/engine/session.ts` | Run one unified scoped bot-session turn (recipe gen, workdir prep, guard shims, spawn, parse). Evolves `goose.ts` + `chat.ts`. | recipe, guard, parse, verify |
| `packages/gateway/src/session-store.ts` | Per-chat binding of bot + project (in-memory now, persistable later) | core types |
| `packages/gateway/src/engine/recipe.ts` | Extended to render a bot-session recipe: identity + candidate skill list + act-or-answer instructions | — |
| `scripts/poc-telegram.ts` | `/bots`, `/use`, `/project`, dispatch bound bot | session-store, session engine |

Each unit is independently testable: registry lookups and grant-union are pure; recipe rendering is pure; the session-store is a small stateful map; the session engine is the only unit that spawns goose.

## Bundled content shipped this phase

- **Bots:** `k8s-sre` ("Kubernetes SRE Bot", platform k8s, skills [k8s-pod-restart-triage]); `docker-ops` ("Docker Ops Bot", platform docker, skills [docker-container-triage]).
- **Projects:** minimal — `{ name, scope, kubeconfig? , brief? }`. k8s bot needs a project (for scope + creds); docker bot works with a bare container target.

## Data flow

```
Telegram message in chat C
  → session-store: bot, project bound to C  (or /use, /bots, /project command)
  → session.runTurn(bot, project, message, history)
       recipe = identity + skills[bot] + act-or-answer
       workdir: copy bot skills, bake guard shims (union grants), set project creds
       goose run (shell available) → stream parsed
       if guardLog has a mutation → verify(platform, scope) → attach verdict
  → reply (answer, or fix report + verification line)
```

## Testing strategy

- `bots.ts`: registry lookup, unknown-bot handling, `grantsFor` union — pure, TDD
- `recipe.ts`: bot-session recipe renders identity, skill candidate list, act-or-answer instructions, correct param — pure, TDD
- `session-store.ts`: bind/get/switch per chat — unit
- `session.ts`: integration against goose (one chat turn, one action turn); verification-triggered-only-on-mutation logic unit-tested via guard-log inspection
- guard/risk/verify: unchanged, already covered (43 tests)

## Explicitly out of scope (YAGNI)

- Squads (bots-assigned-to-project grouping)
- Approval tiers / safety modes (own phase)
- Persona voice/identity prose (typed slot only)
- Non-Telegram interfaces (TUI, WASM, Slack, WhatsApp, Teams)
- LLM-based routing (the human picks the bot)
- Persistent session store (in-memory now)
- goose native sessions / resume (one-shot-per-turn with history now)

## Risks

- **Docker has no hard boundary.** The guard is defense-in-depth only for docker (no RBAC equivalent). A unified session that can act makes this more relevant — documented in security; socket-proxy boundary is a later phase.
- **Union grants are looser than per-skill.** Bounded: non-CRITICAL, skill-authored, guard still per-command. Acceptable.
- **Unified session retires tool-less-chat.** Accepted: guard + scoped creds are the real boundary; a scoped bot acting when asked is the goal.
