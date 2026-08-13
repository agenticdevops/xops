# Security Model

xops's safety design assumes the model **will** eventually emit a dangerous command — by hallucination, prompt injection, or a poisoned log line it read during diagnosis. Safety comes from boundaries around the agent, not from trusting the prompt.

## Boundaries, strongest first

### 1. Scoped credentials (hard boundary — Kubernetes)

Action runs get a kubeconfig for a ServiceAccount bound to a Role in **one namespace**, with only the verbs runbooks need. Enforced by the API server: even a fully compromised agent process holding this file cannot read secrets, touch other namespaces, or delete the namespace it's in. Tokens live 2 hours.

### 2. Command guard — read / write / dangerous (defense-in-depth)

Every `kubectl`/`docker` invocation is categorized by a risk taxonomy and gated by policy. A bot is a general-purpose operator (not locked to one container or namespace); the guard governs *what class of operation* it may perform, by **mode**:

| Category | Examples | Policy |
|---|---|---|
| **read** (LOW) | `docker ps`, `inspect`, `logs`; `kubectl get`, `describe`, `config view` | **allow** — no side effects |
| **write** (MEDIUM/HIGH) | `docker run`, `restart`, `update`; `kubectl patch`, `scale`, `config set-context` | **mode-gated** — `auto` allows, `safe` blocks (interactive `ask` is on the roadmap) |
| **dangerous** (CRITICAL) | `docker rm`, `rmi`, `prune`; `kubectl delete`, `drain` | **block** — always, in every mode |

- **Subcommand granularity** — categorization is at the subcommand level: `kubectl config view` is read but `config set-context` is write; `docker system df` is read but `system prune` is dangerous.
- **Verb detection can't be tricked** — leading global flags are handled so a hidden verb (`docker --debug rm x`) still surfaces and is blocked.
- Policy (tool + mode) is **baked into the shim/hook** at generation time, never read from environment variables the agent's shell could override.
- Every decision is appended to `guard.jsonl` — the audit trail.

Set the mode with `XOPS_MODE=auto|safe` (default `auto`).

### 3. Two enforcement paths, one policy

How commands reach the system depends on the goose provider, so the guard enforces at both layers with the same policy:

- **Native providers** (ollama, Anthropic API): goose runs tools through its own shell, so a per-run **PATH shim** (`bin/kubectl`, `bin/docker`) intercepts every call.
- **claude-acp** (Claude subscription): tool execution is delegated to Claude Code, whose Terminal runs in a shell that resets PATH — bypassing the shim. Here a generated **Claude Code PreToolUse hook** (`<workdir>/.claude/settings.json`) enforces the identical policy at Claude Code's own tool layer. It parses pipelines/sequences, evaluates every guarded stage, and denies genuine hiding (command substitution, wrapped invocations). Exit code 2 hard-blocks; the hook defaults to deny on any error (Claude Code fails open on hook crash).

Both paths write to the same `guard.jsonl`. This closed a real bypass found in testing where a `docker` mutation executed unguarded on claude-acp (fixed 2026-08-13).

## Known limitations (current, honest)

- **The guard is same-user, so it is defense-in-depth, not a sandbox.** Both the shim and the hook run as the same OS user as the agent. For Kubernetes the hard boundary is the RBAC-scoped kubeconfig (enforced by the API server, not by us). **For Docker there is no equivalent hard boundary** — the guard (shim + hook) is best-effort until a socket-proxy or rootless-context boundary ships. Treat docker runs accordingly.
- **RBAC token refresh is manual** (2-hour expiry, re-run the provision script).
- **No human-approval tier yet** — HIGH commands run when granted by a skill. Risk-tiered approval flow (queue HIGH for a Telegram approve/deny) is roadmap.

- **`write` currently has no interactive approval.** In `auto` mode writes run; in `safe` mode they are blocked. The `ask` tier — pause the run, request approval over the channel (Telegram approve/deny), resume on reply — is the next planned piece. Until then, use `safe` mode when you want a human gate on all mutations.

These are tracked from an adversarial security review of the guard (2026-08-12) and a claude-acp guard-bypass fix (2026-08-13). The confirmed issues found (env-override, flag-swallow, taxonomy gaps, and the claude-acp PATH-shim bypass) are fixed and regression-tested.
