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
Proceed only if: demo works repeatably; goose integration felt solid not fragile; latency acceptable for chat; you'd actually use it on a real cluster.
- **Go** → post-POC phases below
- **No-go** → write up learnings, wrap.

## Post-POC (only if go)

1. **Cleanup + hardening** — delete `AIRuntime` backends, fix known concerns (cross-package imports, duplicate types, cli/memory interface mismatch), port remaining openagentix skills
2. **Wizard v2** — goose install/detection, kubeconfig provisioning, Telegram token setup end-to-end
3. **Memory injection** — retrieved memory context into recipes
4. **Automation** — build `@opspilot/automation`: heartbeat, morning briefing, cron on same goose+verify pipeline
5. **Channels + docs** — Slack/Web wiring, Docusaurus updated per convention

---
*Created 2026-07-31. Status: POC not started.*
