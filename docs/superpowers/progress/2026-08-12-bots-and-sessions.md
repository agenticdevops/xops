# Progress — Phase 1: Bots, Projects & Unified Sessions

**Spec:** [../specs/2026-08-12-bots-and-sessions-design.md](../specs/2026-08-12-bots-and-sessions-design.md)
**Plan:** [../plans/2026-08-12-bots-and-sessions.md](../plans/2026-08-12-bots-and-sessions.md)
**Base:** `eec7ddd` (branch `phase1-bots-sessions` off main) · **Status:** ✅ all tasks complete, merged to main.

## Task log

| Task | Commits | Review | Notes |
|---|---|---|---|
| 1 — Extract goose-spawn helpers | `eec7ddd..65294ba` | clean | — |
| 2 — Skill grants in `@xops/core` | `65294ba..cfcdcfb` | clean | minor(final): deep relative import `../../../core/src/skills` (pre-existing pattern); grants regex no multiline |
| 3 — Bot/Project model + registry | `cfcdcfb..53907a3` | clean | minor: `listBots()` returns live ref (spec-conformant) |
| 4 — Per-chat session store | `53907a3..57edcd2` | clean | minor: UI copy in a domain error message — revisit for non-Telegram channels |
| 5 — Bot-session recipe rendering | `57edcd2..4171570` | clean | minor(final): `renderBotRecipe` duplicates YAML/platform-branch logic from `renderRecipe` (deliberate per brief) |
| 6 — Unified scoped bot session engine | `4171570..57d5bd9` | clean | live smoke passed (acted+verified); minor(final): `session.ts` no-op ternary; `guardCli` path via `import.meta.dir` |
| 7 — Wire Telegram to bots | `57d5bd9..848a5ba` | clean | startup OK; minor(final): `poc-telegram` `adapter.send` missing `OutgoingMessage.channel` (pre-existing type gap, runtime-harmless) |
| 8 — Docs (bots page) | `848a5ba..5afa22b` | clean | docs build SUCCESS |

## Final whole-branch review

`FIX FIRST` → one Critical (C1): the `k8s-sre` bot resolved **zero grants** because `k8s-pod-restart-triage/SKILL.md` had no `metadata.xops.grants` key and `grantsFor` had no `LEGACY_GRANTS` fallback → every kubectl denied. Docker smoke had passed only because the docker skill *had* grants.

**C1 fix:** `7af8fcb` — added explicit grants to the k8s skill + an integration test asserting `grantsFor` is non-empty for every bundled bot (RED→GREEN). 59 tests pass. Then `READY TO MERGE`.

## Superseded note

This phase's guard model (skill-grants + target-pinning) was later replaced (2026-08-13) by the general-purpose read/write/dangerous mode-gated model — see the project ROADMAP and memory. The bots/projects/unified-session architecture from this phase stands.
