# OpsPilot

## What This Is

OpsPilot is a self-hosted, 24/7 personal DevOps AI agent: install via a 5-minute wizard, chat with it on Telegram (later Slack/Web), and it actually executes DevOps work — Kubernetes debugging, incident response, routine automation — safely, on your own infrastructure. It is the product/UX layer (wizard, channels, memory, docs) on top of Block's goose as the agentic execution engine.

## Core Value

A user messages OpsPilot on Telegram and it safely executes a Kubernetes operation end-to-end — with fail-closed guardrails and verification of actual cluster state, not model self-report.

## Requirements

### Validated

<!-- Inferred from existing codebase (.planning/codebase/) -->

- ✓ Monorepo scaffold: Bun + Turbo workspaces (`packages/*`, `apps/*`) — existing
- ✓ Config loading + Zod validation (`@opspilot/core`) — existing
- ✓ Setup wizard flow with Clack (`@opspilot/wizard`) — existing
- ✓ Telegram/Slack/Web channel adapters with chunking (`@opspilot/channels`) — existing
- ✓ Hybrid memory: SQLite + sqlite-vec, 400-token chunks, 70/30 vector/keyword (`@opspilot/memory`) — existing
- ✓ SKILL.md loader with gray-matter frontmatter parsing (`@opspilot/skills`) — existing
- ✓ Hono gateway server wiring channels + memory (`@opspilot/gateway`) — existing
- ✓ Docusaurus docs site (`docs/`) — existing

### Active

- [ ] goose engine integration: gateway spawns goose runs as subprocess from generated recipe YAMLs (openagentix pattern)
- [ ] Delete hand-rolled `AIRuntime` (`ClaudeCodeRuntime` + `AnthropicAPIRuntime`) — goose handles chat and actions
- [ ] Port openagentix skill format: SKILL.md + deterministic scripts + decision tables + escalation criteria; loader adapts skills into goose recipes
- [ ] Fail-closed k8s guardrails: kubectl/helm mutation-verb allowlist hook + scoped RBAC kubeconfig per role (aoh `claude_code.py` / `_k8s.py` pattern); RBAC is the hard boundary
- [ ] Post-run verification: check actual cluster/system state after every action (openagentix `bench/verify.sh` discipline), never trust model self-report
- [ ] Telegram → goose → verified k8s action end-to-end flow (core value slice)
- [ ] Memory context injection into goose runs (recipes carry retrieved memory context)
- [ ] Build out `@opspilot/automation`: recipe-driven scheduled runs (heartbeat, morning briefing, cron) on the same goose+verify pipeline
- [ ] Wizard installs/detects goose CLI and provisions scoped kubeconfig

### Out of Scope

- Hand-rolled agentic tool-use loop in `AnthropicAPIRuntime` — decided to adopt goose instead of maintaining a third parallel agent core
- Claude Code CLI / raw Anthropic API chat backends — replaced entirely by goose (single execution path; revisit only if goose becomes a blocker)
- aoh Org/Team/Role pack spec as canonical skill source — heavier than needed for v1; openagentix skill format wins; aoh adapter ideas may return post-v1
- goosed API-server integration — subprocess + recipes is looser coupling and enough for v1
- Slack + Web channels for v1 core flow — Telegram first; adapters exist but wiring/testing deferred
- Multi-user / team features — personal agent first
- Generic shell allowlist beyond k8s — v1 security is k8s-focused (kubectl/helm); other tools get basic guardrails only

## Context

- **Session research (2026-07-19):** Architectural comparison of three sibling projects concluded opspilot's value is the product shell; its engine was the weakest of the three attempts:
  - `/Users/gshah/work/agentic/devops/experiments/openagentix` — skills (`skills/*/SKILL.md` + scripts) + goose recipes (`recipes/*.yaml` with `load_skill` convention), `bench/verify.sh` verifies actual cluster state post-run. Primary pattern source for engine + skills + verification.
  - `/Users/gshah/work/opsflow-sh/experiments/aoh` — Python spec compiler (Org→Team→Role→Skill), runtime adapters, fail-closed PreToolUse kubectl guard layered on scoped RBAC kubeconfigs. Primary pattern source for security model.
- **Codebase map:** `.planning/codebase/` (7 docs). Known concerns include: relative cross-package imports bypassing `@opspilot/*` workspace names, duplicate message types between core and channels, runtime-breaking interface mismatch between `apps/cli/src/index.ts` and `packages/memory/src/manager.ts`, empty `@opspilot/automation` package.
- **Contracts-first convention:** types in `packages/core/src/types.ts` drive all packages; no duplicate types (currently violated — cleanup needed).
- **Docs-second convention:** Docusaurus site must be updated with every change.
- **Workflow:** GSD loop engineering for planning/roadmap/progress docs; superpowers discipline (TDD, verification-before-completion, systematic debugging) inside execution.

## Constraints

- **Tech stack**: Bun + TypeScript monorepo (Turbo) — existing investment; goose is an external CLI dependency, not a library port
- **Engine**: Block goose via subprocess + generated recipe YAMLs — decided; no parallel hand-rolled agent loop
- **Security**: Fail-closed by default for k8s mutations; scoped RBAC kubeconfig is the hard boundary, allowlist hook is defense-in-depth
- **Verification**: Every automated action verified against actual system state before reporting success
- **Self-hosted**: Runs on user's own infrastructure; wizard must handle goose install/detection
- **Docs**: Docusaurus site updated with every feature change (project convention)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Adopt goose as execution engine (subprocess + recipes) | Stop maintaining 3rd parallel agent core; openagentix proves the pattern; loose coupling via CLI | — Pending |
| Delete `AIRuntime`/`ClaudeCodeRuntime`/`AnthropicAPIRuntime` entirely | Single execution path; old backends were chat-only, couldn't act | — Pending |
| Port openagentix skill format (SKILL.md + scripts + decision tables) | Proven with goose recipes; richer than opspilot's current format; lighter than aoh pack spec | — Pending |
| k8s-focused security: RBAC-scoped kubeconfig + fail-closed verb allowlist | aoh's proven model; RBAC as hard boundary beats hook-only approaches | — Pending |
| Verify actual state post-run, never model self-report | openagentix bench discipline; core trust requirement for an ops agent | — Pending |
| Telegram → safe k8s action as v1 core slice | Proves entire stack end-to-end: channel → engine → guardrails → verify → reply | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-19 after initialization*
