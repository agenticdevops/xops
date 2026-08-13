# Security Model

xops's safety design assumes the model **will** eventually emit a dangerous command — by hallucination, prompt injection, or a poisoned log line it read during diagnosis. Safety comes from boundaries around the agent, not from trusting the prompt.

## Boundaries, strongest first

### 1. Scoped credentials (hard boundary — Kubernetes)

Action runs get a kubeconfig for a ServiceAccount bound to a Role in **one namespace**, with only the verbs runbooks need. Enforced by the API server: even a fully compromised agent process holding this file cannot read secrets, touch other namespaces, or delete the namespace it's in. Tokens live 2 hours.

### 2. Fail-closed command guard (defense-in-depth)

Every `kubectl`/`docker` invocation resolves to a generated shim that consults the guard before executing:

- **Risk taxonomy** — 186 commands classified LOW / MEDIUM / HIGH / CRITICAL. CRITICAL (`delete`, `rm`, `prune`, `drain`, ...) is denied unconditionally — no mode or grant permits it.
- **Skill grants** — the runbook's frontmatter declares its allowed commands; anything else is denied.
- **Pinning** — kubectl commands must target the run's namespace (`--all-namespaces`, `--kubeconfig`, `--context` are denied); docker mutations must name the run's target container.
- **Fail-closed parsing** — unknown leading flags are denied rather than skipped (flag-tricks like `docker --debug rm ...` don't get classified around).
- Policy is **baked into the shim file** at generation time, not read from environment variables the agent's shell could override.
- Every decision is appended to `guard.jsonl` — the audit trail.

### 3. Two enforcement paths, one policy

How commands reach the system depends on the goose provider, so the guard enforces at both layers with the same policy:

- **Native providers** (ollama, Anthropic API): goose runs tools through its own shell, so a per-run **PATH shim** (`bin/kubectl`, `bin/docker`) intercepts every call.
- **claude-acp** (Claude subscription): tool execution is delegated to Claude Code, whose Terminal runs in a shell that resets PATH — bypassing the shim. Here a generated **Claude Code PreToolUse hook** (`<workdir>/.claude/settings.json`) enforces the identical policy at Claude Code's own tool layer. It parses pipelines/sequences, evaluates every guarded stage, and denies genuine hiding (command substitution, wrapped invocations). Exit code 2 hard-blocks; the hook defaults to deny on any error (Claude Code fails open on hook crash).

Both paths write to the same `guard.jsonl`. This closed a real bypass found in testing where a `docker` mutation executed unguarded on claude-acp (fixed 2026-08-13).

## Known limitations (current, honest)

- **The guard is same-user, so it is defense-in-depth, not a sandbox.** Both the shim and the hook run as the same OS user as the agent. For Kubernetes the hard boundary is the RBAC-scoped kubeconfig (enforced by the API server, not by us). **For Docker there is no equivalent hard boundary** — the guard (shim + hook) is best-effort until a socket-proxy or rootless-context boundary ships. Treat docker runs accordingly.
- **RBAC token refresh is manual** (2-hour expiry, re-run the provision script).
- **No human-approval tier yet** — HIGH commands run when granted by a skill. Risk-tiered approval flow (queue HIGH for a Telegram approve/deny) is roadmap.

These are tracked from an adversarial security review of the guard (2026-08-12); the confirmed bypasses found there (env-override, flag-swallow, taxonomy gaps, cluster-escape flags, target scoping) are fixed and regression-tested.
