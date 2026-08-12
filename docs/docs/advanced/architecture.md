# Architecture

## The stack

```
  Telegram / CLI
        │
        ▼
  xops gateway (Bun + Hono)
        │
        ├── chat turn ────► goose run (tool-less recipe — cannot execute commands)
        │
        └── action run ──► goose run (skill recipe, --provider/--model per run)
                                │
                                ▼
                     PATH-shimmed kubectl / docker
                     (guard: risk taxonomy + skill grants + target pinning)
                                │
                                ▼
                     infrastructure (scoped credentials)
        ▲
        │
  independent verification (xops re-checks real state after the run)
```

## Engine: goose, always

Every LLM interaction — chat or action — is a `goose run` subprocess with a generated recipe. xops contains **no LLM client of its own**: no Anthropic SDK, no API keys in xops config. Providers and models are goose configuration, overridable per run.

Key modules (`packages/gateway/src/engine/`):

| Module | Role |
|---|---|
| `recipe.ts` | Generates goose recipe YAML per run — profile (k8s/docker) selects parameters and safety rules |
| `goose.ts` | Spawns goose, preps the workdir (skill copy, guard shims, baked policy), watchdog with process-group kill |
| `guard.ts` / `risk.ts` | Two-gate command guard: skill grants + risk-tier ceiling (186-command taxonomy) |
| `guard-cli.ts` | Shim entry point — policy arrives baked into the generated shim, never from env |
| `parse.ts` | Parses goose's stream-json (accumulates per-message text deltas) |
| `verify.ts` | Independent post-run verification against real cluster/container state |
| `chat.ts` | Tool-less chat recipes — conversation without execution rights |

## Skills = executable runbooks

`packages/skills/bundled/<name>/`:

- `SKILL.md` — procedure, decision table (evidence → root cause → exact fix), escalation criteria, and a `grants:` list declaring every command the skill may use
- `scripts/diagnose.sh` — deterministic evidence collection, JSON out, every external call timeout-bounded

The recipe directs the agent to read `SKILL.md` via shell — no dependence on any engine-specific skill registry.

## Why verification is separate

The agent's report is treated as a claim, never a result. After every action run, `verify.ts` inspects the actual system (pods Ready, container running/healthy) with xops's own credentials, and the verdict is attached to the reply. A run that "succeeded" per the model but left the system broken reports **NOT verified**.
