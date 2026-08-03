# OpsPilot Roadmap — POC-First

*Mode: quick experiment. Prove the value fast, then decide: wrap up or build on.*
*Workflow: superpowers (brainstorm → plan → TDD → verify). GSD machinery retired; PROJECT.md + codebase map kept as context.*

## Goals

**What we're building:** a self-hosted 24/7 DevOps AI agent. You message it on Telegram; it executes real Kubernetes operations on your infrastructure — safely (fail-closed guardrails, scoped RBAC) — and reports back only after verifying actual cluster state.

**Why:** existing pieces don't compose into this product. Claude Code / goose are engines without a product shell (no channels, no always-on deployment, no memory, no setup story). opspilot has the product shell (wizard, channels, memory, docs) but its hand-rolled engine can't act. Marrying opspilot's shell to goose's engine — with the security model proven in aoh and the verification discipline proven in openagentix — gets a real "DevOps copilot that actually does the work."

**The bet being tested:** goose-as-subprocess (driven by generated recipe YAMLs from ported openagentix skills) can power a Telegram→k8s-action→verified-reply loop reliably enough to be worth building a product on.

## POC — prove the spine, ONE slice (target: days, not weeks)

**Demo that must work:** send OpsPilot a Telegram message about a broken workload in a local kind cluster (e.g. crashlooping deployment). It runs a goose recipe with the k8s skill under a scoped kubeconfig, the guard blocks non-allowlisted mutations, it fixes/diagnoses the issue, verifies actual cluster state, and replies with the verified result.

*2026-07-31: collapsed 3 slices into one full-spine POC (fail-fast preference). Multica (`../experiments/multica`) reviewed for pivot: validates driving CLI agents as subprocess workers at production scale; Claude-Code-headless pivot considered and rejected — goose bet stands. Multica's skill-sync/daemon patterns noted for post-POC.*

### The slice: Telegram → goose → guarded k8s action → verify → reply
- Spawn goose CLI from gateway as subprocess from generated recipe YAML (one ported openagentix skill, e.g. k8s-debug)
- Scoped kubeconfig (namespace-limited RBAC) + fail-closed kubectl/helm mutation-verb allowlist (aoh guard pattern)
- Post-run verify script checks actual cluster state; result attached to reply
- Existing Telegram adapter → gateway → engine → verified reply; old `AIRuntime` bypassed (deleted post-POC)
- **Kill signals:** goose subprocess flaky/unworkable; guard can't be fail-closed without breaking goose's loop; chat latency unusable

### Decision gate — after the slice
**✅ GO — decided 2026-08-03.** Live demo passed: Telegram message → goose run → guarded diagnose (1 deny, agent recovered) → real fix → pods 1/1 Running verified independently. Latency 1–3 min/run acceptable. Known product gap acknowledged: bridge is single-flow (every message → incident pipeline); intent routing/persona is the top post-POC item.

## Build phases (post-gate, reordered 2026-08-03)

1. **Product layer: agent routing + persona** — intent detection (chat vs incident vs command), general chat via goose session, namespace/skill selection, OpsPilot persona; fixes "one-trick script" gap from demo feedback
2. **Cleanup + hardening** — delete `AIRuntime` backends, guard accepts flags-before-verb, config schema matches accounts layout, fix known concerns (cross-package imports, duplicate types, cli/memory mismatch), port remaining openagentix skills
3. **Ops lifecycle** — auto-reprovision RBAC tokens (2h expiry bit us), kubeconfig port drift detection, bridge as supervised long-running service (`opspilot start`), reconnect/restart resilience
4. **Wizard v2** — goose install/detection, kubeconfig provisioning, Telegram token setup end-to-end
5. **Memory injection** — retrieved memory context into recipes
6. **Automation** — build `@opspilot/automation`: heartbeat, morning briefing, cron on same goose+verify pipeline
7. **Channels + docs** — Slack/Web wiring, Docusaurus updated per convention

## POC learnings (keep)

- goose 1.45 stream-json emits per-message-id text deltas; accumulate, don't take last block
- claude-acp bridge dilutes recipe `instructions`; put full directives in `prompt`, mark run non-interactive
- guard shim: agent recovers gracefully from DENY (retried verb-first after flag-first deny)
- RBAC tokens 2h-lived; kind API port can drift across docker restarts — regenerate scoped kubeconfig per run
- Never trust agent self-report: independent `verifyNamespace()` after every run (proved correct in demo)

---
*Created 2026-07-31. Status: POC not started.*
