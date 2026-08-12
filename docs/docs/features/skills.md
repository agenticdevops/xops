# Skills

Skills are xops's **executable runbooks** — the unit of knowledge an agent follows to diagnose and fix a specific class of problem. A skill is not a freeform prompt; it is a structured procedure the agent must follow, with the exact fixes and safety limits spelled out.

> **Status: core and working.** Two skills ship today: `k8s-pod-restart-triage` and `docker-container-triage`. Both are proven end-to-end. More skills (and converting prose runbooks to this format) are ongoing.

## Anatomy of a skill

A skill lives in `packages/skills/bundled/<name>/`:

```
docker-container-triage/
├── SKILL.md            # procedure, decision table, grants, escalation
└── scripts/
    └── diagnose.sh     # deterministic evidence collection → JSON
```

### SKILL.md

`file: packages/skills/bundled/docker-container-triage/SKILL.md`

```
---
name: docker-container-triage
description: 'Diagnose and fix Docker containers that are unhealthy or restarting.'
metadata:
  xops:
    grants: [ps, inspect, logs, stats, events, restart, update]
    escalate_when: "root cause not in decision table; fix fails twice; fix needs rm/prune"
---
# Docker Container Triage

## Procedure
1. Run diagnose.sh, read its JSON.
2. Match evidence to the Decision Table.
3. Apply ONLY the mapped fix.
4. Verify, then report.

## Decision Table
| Evidence | Root cause | Fix |
|---|---|---|
| oom_killed == true / exit 137 | Memory limit too low | Raise limit ~2x, restart |
```

Three parts do the work:

- **`grants`** — the exact commands this skill may run. The guard denies anything else, and denies CRITICAL commands (`rm`, `delete`, `prune`) even if listed. This is the skill declaring its own blast radius.
- **Decision table** — maps observed evidence to a specific fix. The agent matches, it doesn't improvise.
- **`escalate_when`** — when the agent must stop and hand back to a human instead of guessing.

### diagnose.sh

A deterministic script that collects evidence and emits JSON. The agent runs this first and reasons from its structured output — not from ad-hoc exploration. Every external call is timeout-bounded so a diagnose never hangs.

## How a skill runs

1. xops generates a goose recipe pointing at the skill and copies the skill into the run's workdir.
2. goose (the agent engine) reads `SKILL.md` via the shell, runs `diagnose.sh`, matches the decision table, and executes the mapped fix.
3. Every command passes through the fail-closed guard (grants + risk taxonomy).
4. xops verifies actual system state independently and reports.

See the [Architecture](../advanced/architecture.md) page for the full flow.

## Writing a new skill

1. Create `packages/skills/bundled/<name>/SKILL.md` with frontmatter `grants` and a decision table.
2. Add `scripts/diagnose.sh` emitting JSON evidence.
3. Add the target tool's commands to the risk taxonomy if not already present.

The [Fix a Crashing Container tutorial](../tutorials/fix-docker-container.md) walks through a real skill end to end.
