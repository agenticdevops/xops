# Plan — Guard v2 + Docker Triage Slice

**Goal:** first non-k8s ops domain on the proven spine, zero new infra; xopsbot risk taxonomy becomes guard decision data.
**Verification:** deliberately broken local container → Telegram (or CLI runner) → goose fixes/escalates within guardrails → independent `verifyContainer` verdict.

## Tasks
1. ✅ Port risk taxonomy (xopsbot risk-classifications.json, 8 tools/186 cmds) + `risk.ts` classifier [TDD]
2. ✅ Guard v2: two-gate `evaluateCommand` (skill grant + CRITICAL ceiling), kubectl ns-pinning kept, flags-before-verb fixed [TDD]
3. ✅ `docker-container-triage` skill: SKILL.md (decision table, grants frontmatter, escalation) + deterministic diagnose.sh
4. ✅ Engine generalization: profiles (k8s|docker) in recipe.ts; goose.ts multi-tool shim + grants-from-frontmatter; verifyContainer [TDD verdict logic]
5. ✅ Update POC scripts to new target/profile API; docker CLI smoke runner
6. ✅ Seed broken container — OOM fault (fixable), settles to exited (on-failure:3)
7. ✅ End-to-end VERIFIED 2026-08-12: agent matched OOM decision row, `docker update --memory 32m` + restart, all calls guarded; independent check: running, oom=false, 0 restarts
8. ✅ Telegram bridge: naive routing (docker vs k8s keyword) — full intent routing stays phase 1
9. ◻ Code review pass on engine (superpowers requesting-code-review)

## Learnings
- claude-acp bridge exposes NO goose skill registry to Claude Code — runbooks must be read via shell (`cat SKILL.md`), engine-agnostic anyway
- heredoc + pipe = stdin clash (diagnose.sh); pass data via env vars
- `docker logs` blocks during rapid restart loops — every diagnose call bounded with `timeout 15`
- k8s POC "success" partially luck: agent never read our skill (registry gap), fixed from recipe prompt alone — direct-read convention now guarantees runbook actually loads

## Risks/notes
- docker shim guards agent's docker calls; diagnose.sh calls docker too — passes through same shim (grants cover its LOW verbs) ✓ by design
- healthcheck misconfig row intentionally escalates (can't patch healthcheck in place) — demo should use a fixable fault (exited container or OOM) for the happy path, unhealthy-healthcheck for the escalation path
