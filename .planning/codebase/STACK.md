# Technology Stack

**Analysis Date:** 2026-07-19

## Languages

**Primary:**
- TypeScript 5.7.0 - All application code across packages and apps
- JavaScript - Package.json scripts and tooling

**Secondary:**
- YAML - Configuration files and skill definitions
- Markdown - Documentation and skill content

## Runtime

**Environment:**
- Bun 1.1.0 - Primary JavaScript runtime and package manager
- Node.js 20.0.0+ - Minimum version requirement for compatibility

**Package Manager:**
- Bun 1.1.0 - Workspaces, task running, TypeScript transpilation
- Lockfile: `bun.lock` present (workspace resolution with pnpm-lock.yaml also present for docs)

## Frameworks

**Core Web:**
- Hono 4.7.0 - Lightweight HTTP server for gateway (`packages/gateway/src/`)
- @clack/prompts 0.9.0 - Terminal UI for wizard (`packages/wizard/src/`)

**Channel Adapters:**
- grammY 1.31.0 - Telegram bot framework (`packages/channels/src/telegram.ts`)
- @slack/bolt 4.2.0 - Slack bot framework (`packages/channels/src/slack.ts`)

**AI/LLM:**
- @anthropic-ai/sdk 0.35.0 - Anthropic Claude API client for gateway runtime (`packages/gateway/src/runtime.ts`)

**Build & Development:**
- TypeScript 5.7.0 - Type checking and transpilation
- Turbo 2.3.0 - Monorepo build orchestration (root `turbo.json`)

**Testing:**
- Bun test - Built-in test runner (configured in all package.json files)

## Key Dependencies

**Critical:**
- better-sqlite3 11.7.0 - SQLite database for memory storage (`packages/memory/`)
- zod 3.24.0 - Schema validation for configuration (`packages/core/src/config.ts`)
- yaml 2.6.0 - YAML parsing for config files (`packages/core/src/config.ts`)

**Embeddings & AI:**
- openai 4.78.0 - OpenAI API client for embeddings (`packages/memory/src/embeddings.ts`)

**CLI & Tooling:**
- commander 13.0.0 - CLI argument parsing (`apps/cli/src/`)
- picocolors 1.1.1 - Terminal colors for CLI and wizard (`apps/cli/`, `packages/wizard/`)
- gray-matter 4.0.3 - YAML front matter parsing for skills (`packages/skills/src/`)

**Automation:**
- croner 9.0.0 - Cron job scheduling (`packages/automation/`)

## Configuration

**Environment:**
- YAML-based configuration in `~/.xops/config.yaml` (default location `~/.xops/`)
- Environment variable expansion in config via `${VAR_NAME}` syntax
- Default config generator in `packages/core/src/config.ts` with defaults for all services

**Build:**
- `tsconfig.json` - TypeScript compiler configuration with ES2022 target, strict mode enabled
- `bunfig.toml` - Bun-specific configuration for workspace peer dependencies
- `turbo.json` - Turbo monorepo task configuration for build/dev/test/lint pipelines

**Workspace Structure:**
- Bun workspaces configured in root `package.json` with:
  - `packages/*` - Core libraries and domain packages
  - `apps/*` - CLI, TUI, and web applications

## Platform Requirements

**Development:**
- Node.js 20.0.0 or higher
- Bun 1.1.0 (installed via `packageManager` field)
- TypeScript 5.7.0
- For Telegram channel: Claude CLI or direct token configuration
- For Slack channel: Bot token and app token
- For memory system: OpenAI or Gemini API key (optional, defaults to auto-detect)

**Production:**
- Bun 1.1.0 runtime
- SQLite 3 (via better-sqlite3)
- Optional: Tailscale, ngrok, or Cloudflare tunnel for remote access
- Optional: kubectl, aws-cli, or other DevOps tools (loaded as skills)

**Storage:**
- Default config: `~/.xops/config.yaml`
- Default workspace: `~/.xops/workspace/`
- Default memory DB: `~/.xops/memory.db` (SQLite)

---

*Stack analysis: 2026-07-19*
