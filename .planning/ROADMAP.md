# OpsPilot Roadmap — POC-First

*Mode: quick experiment. Prove the value fast, then decide: wrap up or build on.*
*Workflow: superpowers (brainstorm → plan → TDD → verify). GSD machinery retired; PROJECT.md + codebase map kept as context.*

## Goals

**What we're building:** a self-hosted 24/7 DevOps AI agent. You message it on Telegram; it executes real Kubernetes operations on your infrastructure — safely (fail-closed guardrails, scoped RBAC) — and reports back only after verifying actual cluster state.

**Why:** existing pieces don't compose into this product. Claude Code / goose are engines without a product shell (no channels, no always-on deployment, no memory, no setup story). opspilot has the product shell (wizard, channels, memory, docs) but its hand-rolled engine can't act. Marrying opspilot's shell to goose's engine — with the security model proven in aoh and the verification discipline proven in openagentix — gets a real "DevOps copilot that actually does the work."

**The bet being tested:** goose-as-subprocess (driven by generated recipe YAMLs from ported openagentix skills) can power a Telegram→k8s-action→verified-reply loop reliably enough to be worth building a product on.

## POC — prove the spine (target: days, not weeks)

**Demo that must work:** send OpsPilot a Telegram message about a broken workload in a local kind cluster (e.g. crashlooping deployment). It runs a goose recipe with the k8s skill under a scoped kubeconfig, the guard blocks non-allowlisted mutations, it fixes/diagnoses the issue, verifies actual cluster state, and replies with the verified result.

### Slice 1: Engine spike — goose subprocess from TypeScript *(riskiest first)*
- Spawn goose CLI from gateway as subprocess; capture output
- Generate recipe YAML from one ported openagentix skill (k8s-debug or similar)
- Run against local kind cluster; get coherent result back
- **Kill signal:** goose subprocess integration is flaky/unworkable → rethink engine choice before any more investment

### Slice 2: Safety + verification
- Scoped kubeconfig (namespace-limited RBAC) generated for the run
- Fail-closed kubectl/helm mutation-verb allowlist (aoh guard pattern)
- Post-run verify script checks actual cluster state; result attached to reply
- **Kill signal:** guardrails can't be made fail-closed without breaking goose's loop

### Slice 3: Wire Telegram end-to-end
- Existing Telegram adapter → gateway → engine → verified reply
- Old `AIRuntime` bypassed (deleted post-POC, not during)
- **Demo day:** run the full flow live

### Decision gate — after Slice 3
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
