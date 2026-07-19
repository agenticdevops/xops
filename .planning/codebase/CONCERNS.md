# Codebase Concerns

**Analysis Date:** 2026-07-19

## Tech Debt

**Incomplete provider support in AIRuntime:**
- Issue: Only `claude-code` and Anthropic API runtimes are implemented; config supports 7 providers (OpenAI, Bedrock, Gemini, Ollama, OpenRouter) but no backend logic exists
- Files: `/packages/core/src/types.ts` (lines 6), `/packages/gateway/src/runtime.ts` (line 237)
- Impact: Users selecting OpenAI, Bedrock, Gemini, Ollama, or OpenRouter at setup will hit runtime errors. Config accepts these but execution fails silently or errors.
- Fix approach: Implement remaining runtime classes (OpenAIRuntime, BedrockRuntime, GeminiRuntime, OllamaRuntime, OpenRouterRuntime) before v1.0 or explicitly disable non-working providers in wizard.

**Lazy Anthropic SDK loading in AnthropicAPIRuntime:**
- Issue: SDK imported dynamically on first use (line 158), increasing first-request latency and creating opportunity for import errors at runtime
- Files: `/packages/gateway/src/runtime.ts` (line 158)
- Impact: First chat interaction with Anthropic API has unquantified startup penalty. Import errors not caught until conversation starts.
- Fix approach: Move SDK to static imports, add dependency validation in initialization phase.

**Environment variable resolution fragility:**
- Issue: Config expansion in `expandEnvVars` returns empty string if env var not found (line 194), silently degrading to invalid config
- Files: `/packages/core/src/config.ts` (line 194)
- Impact: Missing API keys silently become empty strings instead of validation errors. Causes runtime failures at first use rather than setup validation.
- Fix approach: Track which keys are required (apiKey), add schema validation for required secrets, fail loudly at loadConfig time with clear "missing X environment variable" message.

**Oversimplified error handling in memory system:**
- Issue: Embedding provider failures caught and logged but swallow errors; search falls back to keyword-only silently (line 387, 396)
- Files: `/packages/memory/src/manager.ts` (lines 384-398)
- Impact: User unaware if vector search disabled. Memory searches degraded without notification. Hard to diagnose why semantic search isn't working.
- Fix approach: Surface embedding failures to user via status endpoint, track degradation mode in stats, add explicit logging or metrics.

**No test coverage across entire project:**
- Issue: Zero test files found; no test framework configured in any package.json, only `test` script placeholder
- Files: All packages lack `*.test.ts`, `*.spec.ts` files; `/package.json` has test script but no test implementation
- Impact: High refactor risk. No regression detection. Memory sync, gateway routing, skill eligibility logic untested. Changes to core config/type system untested.
- Fix approach: Add Bun test harness, write unit tests for config loading, memory search, and hybrid ranking. Target >70% coverage for gateway and memory packages.

## Known Bugs

**Telegram adapter: missing crypto import:**
- Symptoms: TelegramAdapter uses `crypto.randomUUID()` (line 35) but `crypto` not imported
- Files: `/packages/channels/src/telegram.ts` (line 35)
- Trigger: When no message ID present in Telegram update
- Workaround: Import crypto at top: `import * as crypto from 'crypto'`

**Slack adapter: undefined crypto reference:**
- Symptoms: SlackAdapter uses `crypto.randomUUID()` (line 35) without import
- Files: `/packages/channels/src/slack.ts` (line 35)
- Trigger: When Slack message missing timestamp
- Workaround: Same as Telegram

**Database transaction race condition in memory manager:**
- Issue: `indexFile` method uses transaction but doesn't handle concurrent sync calls (line 265-287)
- Files: `/packages/memory/src/manager.ts` (line 165-288)
- Impact: If two sync operations run simultaneously (e.g., onSessionStart + onSearch both true), database locking or chunk duplication possible
- Workaround: Ensure sync called only once per session

**Zod schema lenient validation:**
- Issue: Many config sections use `z.record(z.any())` instead of strict schemas (line 66-72)
- Files: `/packages/core/src/config.ts` (lines 66-72)
- Impact: Invalid channel/tool/skill configs accepted at load time, errors deferred to runtime. Typos in YAML go undetected.
- Fix approach: Define strict schemas for ChannelsConfig, ToolsConfig, SkillsConfig like done for AIConfig.

**Conversation history unbounded growth:**
- Issue: `GatewayServer.conversations` Map never evicts old conversations; stores unlimited messages in memory (line 30)
- Files: `/packages/gateway/src/server.ts` (line 30, 148)
- Impact: Long-running gateway accumulates memory leaks. 1000 conversations × 100 messages each = multi-MB memory waste. No cleanup.
- Fix approach: Add conversation TTL (e.g., 24h), implement LRU eviction, or persist to database, prune on startup.

## Security Considerations

**API keys stored plaintext in config file:**
- Risk: Users save API keys to `~/.opspilot/config.yaml` which is committed to git or readable by other users on shared machine
- Files: `/packages/wizard/src/wizard.ts` (line 104), `/packages/core/src/config.ts` (line 117)
- Current mitigation: Docs advise using env vars (e.g., `${ANTHROPIC_API_KEY}`), but wizard offers direct key input as alternative
- Recommendations: (1) Force env var expansion in wizard, reject direct keys. (2) Validate file permissions (0600) at config load. (3) Add warning if key appears plaintext.

**Telegram access control incomplete:**
- Risk: Telegram adapter checks `allowFrom` but only by username/ID; no rate limiting, no command authorization beyond channel access
- Files: `/packages/channels/src/telegram.ts` (line 26-36)
- Current mitigation: Quickstart requires username input
- Recommendations: (1) Add rate limiting per user. (2) Support command-level permissions (e.g., destructive ops require confirmation). (3) Audit logging of all commands executed.

**No authentication on web gateway:**
- Risk: Web chat endpoint at `/chat` and `/memory/search` has no auth; anyone with network access can query memory or send commands
- Files: `/packages/gateway/src/server.ts` (lines 100-161, 247-261)
- Current mitigation: CORS restricted to localhost, gateway only binds to 127.0.0.1 by default
- Recommendations: (1) Add token/session auth for web endpoints. (2) Document security model in setup wizard. (3) Warn if tunnel enabled without auth.

**Memory search results expose file paths:**
- Risk: Search results return full filesystem paths (line 412-416), leaking internal directory structure
- Files: `/packages/memory/src/manager.ts` (line 412-416)
- Current mitigation: Only accessible to authenticated users (ideally)
- Recommendations: Redact or anonymize paths in search results visible to untrusted users.

**Command execution via skills without validation:**
- Risk: Skill content formatted into system prompt; malicious or user-supplied skill content could prompt injection
- Files: `/packages/skills/src/loader.ts` (line 195-200)
- Current mitigation: Bundled skills are curated, custom skills scanned for requirements
- Recommendations: (1) Sandbox skill execution or review before loading. (2) Add signature verification for skills. (3) Warn when loading custom skills.

## Performance Bottlenecks

**Vector search iterates all embeddings into memory:**
- Problem: `vectorSearch` loads all chunks with embeddings into arrays (line 428-433), then iterates; no database-side filtering
- Files: `/packages/memory/src/manager.ts` (line 428-462)
- Cause: SQLite doesn't support native vector similarity; must load all into memory, compute similarity
- Improvement path: (1) Use sqlite-vec extension for similarity search if available. (2) Limit chunks retrieved first (e.g., by date, path). (3) Implement pagination.

**Conversation history in memory unbounded:**
- Problem: `buildPrompt` includes last 10 messages (line 125), but all messages stored in context; recalculation inefficient for long conversations
- Files: `/packages/gateway/src/runtime.ts` (line 125)
- Cause: Full conversation history stored and re-encoded with each request
- Improvement path: (1) Summarize old messages beyond fixed window. (2) Store compressed history. (3) Add message pruning.

**Blocking stream consumption in webhook handler:**
- Problem: Telegram webhook handler (line 195) and Slack (similar) use `for await` in hot path; no backpressure handling
- Files: `/packages/channels/src/telegram.ts` (line 195)
- Cause: Network delays in AI runtime block channel message delivery
- Improvement path: (1) Queue messages async. (2) Add timeout on handler execution. (3) Separate I/O from message processing.

**Skill eligibility checks call `which` synchronously:**
- Problem: `binaryExists` uses `execSync` (line 180), blocks setup wizard during tool detection (line 123-152 in steps.ts)
- Files: `/packages/skills/src/loader.ts` (line 178-184)
- Cause: No parallel tool detection; sequentially spawns subprocess for each tool
- Improvement path: (1) Use parallel `Promise.all` to check binaries concurrently. (2) Cache results. (3) Run detection once at startup, not per skill load.

## Fragile Areas

**Config validation happens after file save:**
- Files: `/packages/core/src/config.ts` (line 92-97)
- Why fragile: Config loaded and expanded before validation; invalid expanded config may cause runtime errors. `saveConfig` doesn't validate.
- Safe modification: Always validate before saving. Add pre-save schema validation.
- Test coverage: No tests for invalid config loading or validation error messages.

**Memory sync operates on workspace directory without bounds:**
- Files: `/packages/memory/src/manager.ts` (line 165-201)
- Why fragile: `listMemoryFiles` recursively walks entire workspace directory (line 56-68); no size limits, symlink handling, or exclusion list. Could sync 10GB directory, timeout, or infinite loop on circular symlinks.
- Safe modification: Add size limits, depth limits, and symlink detection before implementing sync.
- Test coverage: No tests for large directories, circular symlinks, or permission errors.

**Wizard state accumulates across steps without validation:**
- Files: `/packages/wizard/src/wizard.ts` (line 37-58)
- Why fragile: Each step modifies shared state object; no intermediate validation. Invalid state (e.g., empty aiApiKey after selecting Anthropic) propagates to config generation.
- Safe modification: Validate state after each step, show errors inline, don't proceed on validation failure.
- Test coverage: No tests for invalid step sequences or missing required fields.

**Message chunking logic brittle to boundary cases:**
- Files: `/packages/channels/src/telegram.ts` (line 149-189), `/packages/channels/src/slack.ts` (similar)
- Why fragile: `splitMessage` uses `lastIndexOf` with 50% threshold but no guarantee good break point found; could produce overly-long chunk or infinite loop if all breaks fail.
- Safe modification: Add fallback for case where no good break found; cap chunk size explicitly.
- Test coverage: No tests for edge cases (all caps, no spaces, long URLs).

## Scaling Limits

**Conversation storage unbounded:**
- Current capacity: Map in memory, 1GB heap typical = ~10M small messages
- Limit: Multi-tenant scenarios with 100+ concurrent conversations will OOM
- Scaling path: Persist conversations to SQLite (same database as memory), evict cold conversations, implement session TTL

**Memory system scales with file count linearly:**
- Current capacity: SQLite can handle ~1M chunks (each 400 tokens, ~1600 chars); practical limit ~10K large markdown files
- Limit: `listMemoryFiles` walks entire directory recursively; sync time O(n). Indexing time O(n*embedding_calls).
- Scaling path: Add incremental sync (track only changed files), implement embedding batching, use better indexing strategy

**API rate limits not enforced:**
- Current capacity: No rate limiting in gateway; can make unlimited requests
- Limit: AI provider rate limits (Anthropic: 50k tokens/min) will cause cascading failures without backpressure
- Scaling path: Implement request queue with priority, track token usage, add user-level rate limiting

**Channel adapters single-threaded:**
- Current capacity: Bun event loop handles ~1000s msgs/sec, but synchronous handler blocking
- Limit: High-volume Telegram/Slack groups will fall behind message processing
- Scaling path: Decouple message receipt from handler execution using queue (Bull, RabbitMQ, or similar)

## Dependencies at Risk

**grammY (Telegram SDK):**
- Risk: Small community project; 2-3 maintainers. No activity in past 6 months (as of 2026-07-19). Telegram Bot API changes may go unsupported.
- Impact: Telegram channel could break on API updates; no maintenance path
- Migration plan: Evaluate node-telegram-bot-api or implement direct Telegram API calls

**better-sqlite3:**
- Risk: Native module; requires compilation. Breaks with Node.js/Bun version updates. Slow binary downloads.
- Impact: Installation failures on some platforms. Version bumping complicated.
- Migration plan: Evaluate sql.js (pure JS SQLite) or D1 (Cloudflare Workers compatible)

**@anthropic-ai/sdk:**
- Risk: Rapid iteration; API instability possible during beta. Major version changes frequent.
- Impact: breaking changes could require code updates. Lazy loading (current implementation) makes errors hard to catch.
- Migration plan: Pin to LTS version. Add integration tests for SDK methods. Monitor changelog.

## Missing Critical Features

**No persistent session storage:**
- Problem: Conversation state lost on gateway restart; users lose context
- Blocks: Multi-instance deployments, graceful shutdowns, conversation replay
- Fix: Persist conversations to database, load on startup

**No skill execution sandboxing:**
- Problem: Skills can execute arbitrary shell commands; malicious or buggy skills could compromise system
- Blocks: Trusting third-party skills, using untrusted LLM-generated commands
- Fix: Run skills in isolated environment (container, subprocess with limited permissions)

**No audit logging:**
- Problem: No record of who ran what commands, when errors occurred, who accessed memory
- Blocks: Compliance, incident investigation, security analysis
- Fix: Log all gateway requests, skill executions, memory searches to audit trail

**No observability/metrics:**
- Problem: No way to see gateway performance, skill success rates, or system bottlenecks
- Blocks: Production debugging, capacity planning
- Fix: Add Prometheus metrics, optional OpenTelemetry integration

**No graceful degradation for embedding failures:**
- Problem: If embedding provider (OpenAI/Gemini) down, memory search fails entirely
- Blocks: Reliable 24/7 operation
- Fix: Fall back to keyword-only search; surface degradation to user

## Test Coverage Gaps

**Config loading and validation:**
- What's not tested: Invalid YAML, missing required fields, env var expansion, file permission errors
- Files: `/packages/core/src/config.ts` (entire file)
- Risk: Broken configs deployed without detection; wizard-generated configs might be invalid
- Priority: High

**Memory system (sync, search, chunking):**
- What's not tested: Concurrent syncs, large files, circular symlinks, embedding cache, FTS5 fallback, vector similarity ranking
- Files: `/packages/memory/src/manager.ts`, `/packages/memory/src/internal.ts`, `/packages/memory/src/hybrid.ts`
- Risk: Memory corruption on sync, incorrect search results, performance degradation
- Priority: High

**Gateway routing and error handling:**
- What's not tested: Invalid requests, missing conversation ID, memory search errors, stream interruption, WebSocket disconnects
- Files: `/packages/gateway/src/server.ts`
- Risk: Crashes on edge cases, memory leaks from dangling conversations, security issues (auth bypass)
- Priority: High

**Channel adapters (Telegram, Slack):**
- What's not tested: Message chunking edge cases, auth failures, rate limiting, reconnection logic, webhook signature validation
- Files: `/packages/channels/src/telegram.ts`, `/packages/channels/src/slack.ts`
- Risk: Message delivery failures, security vulnerabilities, dropped messages
- Priority: Medium

**Wizard state validation:**
- What's not tested: Invalid step sequences, missing required fields, API key validation, tool detection edge cases
- Files: `/packages/wizard/src/wizard.ts`, `/packages/wizard/src/steps.ts`
- Risk: Invalid configs generated, wizard crashes, confusing user experience
- Priority: Medium

**Runtime provider implementations:**
- What's not tested: Claude Code CLI not installed, Anthropic API errors, stream handling, system prompt injection
- Files: `/packages/gateway/src/runtime.ts`
- Risk: Silent failures, incomplete responses, prompt injection vulnerabilities
- Priority: High

---

*Concerns audit: 2026-07-19*
