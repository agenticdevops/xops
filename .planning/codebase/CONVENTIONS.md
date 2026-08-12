# Coding Conventions

**Analysis Date:** 2026-07-19

## Naming Patterns

**Files:**
- `index.ts` - Barrel files that re-export public API from submodules
- `*.ts` - All files are TypeScript (strict mode enabled)
- `[feature].ts` - Feature-specific implementations (e.g., `manager.ts`, `runtime.ts`, `server.ts`)
- `types.ts` - Interface and type definitions (per package)
- `config.ts` - Configuration loading and validation

**Functions:**
- camelCase for all function names: `loadConfig()`, `detectTools()`, `expandEnvVars()`, `getOrCreateConversation()`
- Async functions use standard `async/await` syntax
- Private methods prefixed with underscore: `_buildPrompt()`, `_splitMessage()`, `_getClient()`
- Public methods use JSDoc comments for entry points

**Variables:**
- camelCase for const/let: `claudeCodeAvailable`, `messageLength`, `detectedTools`
- UPPER_SNAKE_CASE for constants: `DEFAULT_CONFIG_DIR`, `MAX_MESSAGE_LENGTH`, `EMBEDDING_CACHE_TABLE`
- Descriptive names: `allowedUsers` (not `au`), `conversationKey` (not `key`)
- Single letter `_` for unused parameters in callbacks

**Types & Interfaces:**
- PascalCase for all interfaces: `xopsConfig`, `ChannelAdapter`, `GatewayServer`, `MemoryManager`
- Suffix `Config` for configuration types: `AIConfig`, `TelegramConfig`, `WebConfig`
- Suffix `Result`, `Response`, or `Stats` for return types: `DeliveryResult`, `MemorySearchResult`, `GatewayStats`
- Suffix `Options` for constructor/function parameters: `RuntimeOptions`, `GatewayOptions`, `ProcessMessageOptions`
- Suffix `Provider` for factory/strategy types: `EmbeddingProvider`
- Suffix `Handler` for callback types: `MessageHandler`

## Code Style

**Formatting:**
- TypeScript with `target: ES2022` compiled with `moduleResolution: bundler`
- Indentation: 2 spaces
- Line width: No enforced limit in config
- File organization: imports at top, exports at top or bottom of file

**Linting:**
- No ESLint configuration present. Project relies on TypeScript strict mode for type safety.
- Configured strict: `true` in tsconfig.json
- `forceConsistentCasingInFileNames: true` enforced at compile time

**Prettier:**
- Prettier v3.2.0 installed as dev dependency
- No `.prettierrc` configuration file (uses defaults: single quotes, trailing commas, 80 char width)
- Run with: `bun run format` (formats `**/*.{ts,tsx,md,json}`)

**Error Handling:**
- Errors thrown as `new Error('message')` instances
- Validation errors from Zod: `result.error.message` extracted and wrapped
- Try-catch blocks used for explicit error handling
- Errors logged to console with context: `console.error('Component error:', error)`
- Graceful fallbacks when non-critical: `console.warn()` for warnings

## Import Organization

**Order:**
1. Node.js built-ins: `import { spawn } from 'child_process'`, `import * as fs from 'fs'`
2. Third-party packages: `import { z } from 'zod'`, `import { Hono } from 'hono'`, `import { Bot } from 'grammy'`
3. Internal packages (via path imports): `import { AIRuntime } from './runtime'`
4. Type imports: `import type { xopsConfig } from '../../core/src/types'`

**Path Aliases:**
- Monorepo uses relative paths: `../../core/src/types` (not configured as aliases)
- Imports use full path to source files: `'../../../packages/gateway/src'`
- Packages export from `index.ts` barrel files, consumers import via barrel or direct path

**Re-exports:**
- Barrel files (`index.ts`) re-export all public APIs:
  ```typescript
  export * from './config';
  export * from './types';
  export * from './utils';
  ```

## Comments

**When to Comment:**
- File headers with description: Present in most files
  ```typescript
  /**
   * Component Name - Brief description
   */
  ```
- Complex logic or unusual patterns: Commented inline
- Environment variable expansion: Documented (see `expandEnvVars` in `config.ts`)
- Algorithm decisions: Documented (e.g., message splitting logic in `telegram.ts`)
- Public APIs: JSDoc-style comments on exported functions

**JSDoc/TSDoc:**
- Used for public exported functions and classes
- Parameter descriptions with `@param` are optional
- Return type descriptions with `@returns` are optional
- Example from `runtime.ts`:
  ```typescript
  /**
   * Runtime that uses the Claude Code CLI (claude -p) to send messages.
   * Uses the user's existing Claude Pro/Max subscription - no API key needed.
   */
  class ClaudeCodeRuntime {
  ```

## Function Design

**Size:**
- No strict line limits observed
- Functions range from 5 lines (simple accessors) to 100+ lines (complex orchestration)
- Long functions typically handle orchestration or configuration logic

**Parameters:**
- Functions accept specific parameters or single options object
- Options objects use TypeScript interfaces: `ProcessMessageOptions`, `RuntimeOptions`
- Prefer options objects over positional args for 3+ parameters
- Example from `server.ts`:
  ```typescript
  async processMessage(options: ProcessMessageOptions): Promise<string>
  ```

**Return Values:**
- Promises for async functions: `Promise<string>`, `Promise<void>`, `AsyncGenerator<string>`
- Typed return interfaces: `DeliveryResult`, `MemorySearchResult`, `ExecResult`
- Optional returns use `| undefined` or `| null`
- Streaming uses `AsyncGenerator` for lazy evaluation

## Module Design

**Exports:**
- Default exports not used; all exports are named
- Barrel files re-export from submodules for clean public API
- Classes exported for instantiation: `export class GatewayServer`, `export class TelegramAdapter`
- Functions exported for utilities: `export async function loadConfig()`
- Types exported via `export interface` and `export type`

**Visibility:**
- Private class members use `private` keyword: `private app: Hono`, `private provider: EmbeddingProvider | null`
- Private methods prefixed with `_`: `_buildPrompt()`, `_splitMessage()`
- Static factory methods not used; construction via `new ClassName()`

## Error Boundaries

**Error Propagation:**
- Errors caught and logged at orchestration boundaries (e.g., CLI commands)
- Errors converted to user-friendly messages using `try-catch` blocks
- Example from `steps.ts`:
  ```typescript
  try {
    execSync(`which ${tool}`, { stdio: 'ignore' });
  } catch {
    // Tool not found (silently handled)
  }
  ```

**Error Messages:**
- Include context: `'Failed to spawn claude: ${err.message}. Is Claude Code installed?'`
- Avoid exposing internal paths in user-facing errors
- Log full errors internally: `console.error('Component error:', error)`

## Logging

**Framework:** Node.js `console` API (no dedicated logger)

**Patterns:**
- `console.log()` for general output
- `console.error()` for errors with context
- `console.warn()` for non-critical issues
- Structured with colored output via picocolors in CLI (`pc.cyan()`, `pc.green()`, `pc.red()`)
- Example from CLI:
  ```typescript
  console.log(pc.green('✓'), 'Configuration loaded');
  console.error('Chat error:', err.message);
  ```

## Validation

**Validation Pattern:**
- Zod for schema validation on configuration
- Example from `config.ts`:
  ```typescript
  export const AIConfigSchema = z.object({
    provider: z.enum(['claude-code', 'anthropic', 'openai', ...]),
    model: z.string(),
    maxTokens: z.number().optional(),
  });
  ```
- Configuration validation uses `safeParse()` with error handling
- Input validation in CLI prompts uses `validate` callbacks

## Environment Configuration

**Environment Variables:**
- Read via `process.env[name]` directly
- Can be referenced in config YAML as `${ENV_VAR}` (expanded at load time via `expandEnvVars()`)
- API keys stored as env vars: `${ANTHROPIC_API_KEY}`, `${OPENAI_API_KEY}`
- Tool paths detected via `which` command, not env var config

---

*Convention analysis: 2026-07-19*
