# Codebase Structure

**Analysis Date:** 2026-07-19

## Directory Layout

```
opspilot/
├── apps/
│   ├── cli/                  # Main CLI entry point (Commander)
│   │   ├── bin/opspilot      # Shell launcher script
│   │   └── src/index.ts      # All CLI commands
│   ├── tui/                  # Ink terminal UI (stub — empty src/)
│   └── web/                  # React dashboard (stub — empty src/)
├── packages/
│   ├── core/                 # @opspilot/core — types, config, utils (foundation)
│   ├── wizard/               # @opspilot/wizard — Clack setup wizard
│   ├── channels/             # @opspilot/channels — Telegram/Slack adapters
│   ├── memory/               # @opspilot/memory — SQLite hybrid search
│   ├── skills/               # @opspilot/skills — SKILL.md loader + bundled skills
│   ├── gateway/              # @opspilot/gateway — Hono server + AI runtime
│   ├── automation/           # @opspilot/automation — heartbeat/cron (stub — empty src/)
│   └── tunnel/               # @opspilot/tunnel — Tailscale/ngrok (stub — empty src/)
├── docs/                     # Docusaurus documentation site (separate lockfiles)
├── scripts/                  # Helper scripts
├── .planning/                # GSD planning documents (codebase/ maps)
├── package.json              # Workspace root: bun workspaces, turbo scripts, bin
├── turbo.json                # Turborepo task pipeline (build/dev/test/lint/typecheck)
├── tsconfig.json             # Shared TS config (ES2022, strict, bundler resolution)
├── bunfig.toml               # Bun configuration
├── bun.lock                  # Bun lockfile
├── CLAUDE.md                 # Project conventions (contracts-first, no root files)
├── CLI_QUICK_START.md        # CLI usage quick reference
└── README.md                 # Project overview
```

## Directory Purposes

**`packages/core/`:**
- Purpose: Foundation — all shared type contracts and config handling
- Contains: `src/types.ts` (every shared interface), `src/config.ts` (Zod schemas, load/save/defaults), `src/utils.ts`, `src/index.ts` (barrel)
- Key files: `packages/core/src/types.ts`, `packages/core/src/config.ts`

**`packages/gateway/`:**
- Purpose: HTTP/WebSocket server and AI runtime
- Contains: `src/server.ts` (Hono routes, WS, conversation state), `src/runtime.ts` (AIRuntime facade), `src/types.ts` (gateway-local types), `src/index.ts`
- Key files: `packages/gateway/src/server.ts`, `packages/gateway/src/runtime.ts`

**`packages/channels/`:**
- Purpose: Chat platform adapters
- Contains: `src/telegram.ts` (grammY), `src/slack.ts` (Bolt), `src/types.ts` (`ChannelAdapter` interface), `src/index.ts`
- Key files: `packages/channels/src/types.ts` (the adapter contract)

**`packages/memory/`:**
- Purpose: Persistent memory with hybrid vector + keyword search
- Contains: `src/manager.ts` (orchestrator, SQLite schema), `src/hybrid.ts` (score merging), `src/embeddings.ts` (provider factory), `src/internal.ts` (chunking, hashing, file listing), `src/types.ts`, `src/index.ts`
- Key files: `packages/memory/src/manager.ts`

**`packages/skills/`:**
- Purpose: Skill discovery, loading, and prompt formatting
- Contains: `src/loader.ts`, `src/types.ts`, `src/index.ts`, plus `bundled/` skill directories
- Key files: `packages/skills/src/loader.ts`, `packages/skills/bundled/*/SKILL.md`

**`packages/wizard/`:**
- Purpose: Interactive setup flow
- Contains: `src/wizard.ts` (flow orchestration), `src/steps.ts` (individual steps), `src/prompts.ts` (Clack wrappers), `src/types.ts` (`WizardState`), `src/index.ts`
- Key files: `packages/wizard/src/steps.ts`

**`packages/automation/` and `packages/tunnel/`:**
- Purpose: Planned heartbeat/cron and tunnel providers
- Contains: `package.json` + empty `src/` — no implementation yet

**`apps/cli/`:**
- Purpose: The `opspilot` command
- Contains: `bin/opspilot` launcher, `src/index.ts` with all Commander commands (setup, status, gateway, memory, cron, heartbeat, chat)
- Key files: `apps/cli/src/index.ts`

**`apps/tui/` and `apps/web/`:**
- Purpose: Planned Ink TUI and React dashboard
- Contains: empty `src/` — no implementation yet (no package.json in tui/web)

**`docs/`:**
- Purpose: Docusaurus site (developer + user documentation)
- Contains: `docs/docs/` markdown (getting-started, cli, configuration, channels/, features/, advanced/), `docs/src/` site components, own `package.json`/lockfiles
- Key files: `docs/docs/intro.md`, `docs/sidebars.ts`

**`.planning/`:**
- Purpose: GSD planning artifacts
- Contains: `codebase/` (these analysis documents)

## Key File Locations

**Entry Points:**
- `apps/cli/src/index.ts`: CLI commands and gateway/channel wiring
- `apps/cli/bin/opspilot`: Shell launcher (mapped via root `package.json` `bin`)
- `packages/gateway/src/server.ts`: HTTP/WS server (`GatewayServer.start`)
- `packages/wizard/src/wizard.ts`: `runWizard` setup flow

**Configuration:**
- `packages/core/src/config.ts`: Config schema, paths (`~/.opspilot/config.yaml`), defaults
- `turbo.json`: Task pipeline definition
- `tsconfig.json`: Shared compiler options (per-package `tsconfig.json` extend/override)
- `bunfig.toml`: Bun settings

**Core Logic:**
- `packages/core/src/types.ts`: All shared type contracts (edit here FIRST — contracts-first rule)
- `packages/gateway/src/runtime.ts`: LLM backend selection and prompting
- `packages/memory/src/manager.ts`: Indexing/search orchestration
- `packages/skills/src/loader.ts`: SKILL.md parsing and eligibility

**Testing:**
- No test files exist yet (`*.test.ts`/`*.spec.ts` absent). Per-package `test` script is `bun test`; turbo `test` task depends on `build`.

## Naming Conventions

**Files:**
- Lowercase single-word module names: `server.ts`, `runtime.ts`, `loader.ts`, `manager.ts`, `steps.ts`
- Every package has `src/index.ts` barrel and `src/types.ts` for package-local types
- Skill definitions: `bundled/<skill-name>/SKILL.md` with kebab-case directory names (`k8s-debug`, `incident-diagnose`)

**Directories:**
- Packages: kebab/lowercase npm-scoped `@opspilot/<name>` in `packages/<name>/`
- Apps: lowercase in `apps/<name>/`

**Code:**
- Classes: PascalCase (`GatewayServer`, `MemoryManager`, `TelegramAdapter`, `AIRuntime`)
- Interfaces: PascalCase with `Config`/`Options`/`Result` suffixes (`OpsPilotConfig`, `RuntimeOptions`, `DeliveryResult`)
- Functions: camelCase verbs (`loadConfig`, `runWizard`, `checkSkillEligibility`)
- Constants: SCREAMING_SNAKE_CASE (`DEFAULT_CONFIG_PATH`, `MAX_MESSAGE_LENGTH`)
- Zod schemas: `<Type>Schema` (`AIConfigSchema`, `OpsPilotConfigSchema`)

## Where to Add New Code

**New shared type/contract:**
- Types: `packages/core/src/types.ts` (define here FIRST, then implement — contracts-first workflow per `CLAUDE.md`)
- Validation: matching Zod schema in `packages/core/src/config.ts`

**New channel adapter:**
- Implementation: `packages/channels/src/<platform>.ts` implementing `ChannelAdapter` from `packages/channels/src/types.ts`
- Export: add to `packages/channels/src/index.ts`
- Wiring: add startup block in `apps/cli/src/index.ts` gateway-start action (follow the Telegram block at `apps/cli/src/index.ts:110-134`)

**New bundled skill:**
- Location: `packages/skills/bundled/<skill-name>/SKILL.md` with YAML frontmatter (`name`, `description`, `metadata.requires.bins/env`)

**New gateway endpoint:**
- Route: `setupRoutes()` in `packages/gateway/src/server.ts`
- Types: `packages/gateway/src/types.ts` for gateway-local shapes, `packages/core/src/types.ts` if shared

**New CLI command:**
- Add `program.command(...)` block in `apps/cli/src/index.ts`; heavy dependencies dynamically imported inside actions

**New automation/tunnel feature:**
- Implementation: `packages/automation/src/` or `packages/tunnel/src/` (currently empty stubs awaiting first module + `index.ts`)

**Tests:**
- Co-locate as `<module>.test.ts` next to source in each package's `src/`; runner is `bun test` (per-package `test` script)

**Documentation:**
- Update `docs/docs/` alongside every change ("docs second development" per project rules); features in `docs/docs/features/`, channels in `docs/docs/channels/`

**Do NOT:**
- Create files in repository root (per `CLAUDE.md`)
- Duplicate types across packages — import from `@opspilot/core`

## Special Directories

**`node_modules/`, `.turbo/`, `dist/` (per package):**
- Purpose: Dependencies, turbo cache, tsc build output
- Generated: Yes
- Committed: No (turbo `build` outputs `dist/**`)

**`packages/skills/bundled/`:**
- Purpose: Shipped DevOps skills (argocd-sync, incident-diagnose, k8s-debug, loki-search, prometheus-query)
- Generated: No
- Committed: Yes

**`.planning/`:**
- Purpose: GSD planning and codebase-map documents
- Generated: By GSD tooling/agents
- Committed: Yes

**`~/.opspilot/` (user home, outside repo):**
- Purpose: Runtime data — `config.yaml`, `workspace/`, `memory.db` (paths defined in `packages/core/src/config.ts:13-16`)
- Generated: Yes (by wizard/runtime)
- Committed: Not applicable

---

*Structure analysis: 2026-07-19*
