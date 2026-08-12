# Testing Patterns

**Analysis Date:** 2026-07-19

## Test Framework

**Runner:**
- Bun's built-in test runner
- Config: `bun test` (no configuration file needed)
- TypeScript tests run natively without compilation step

**Run Commands:**
```bash
bun test                  # Run all tests
bun run test             # Run tests via turbo (monorepo)
bun test --watch         # Watch mode (not verified in package.json)
bun test --coverage      # Coverage mode (not verified in package.json)
```

**Assertion Library:**
- No dedicated assertion library configured
- Bun's native assertions available but not yet integrated into codebase

## Test File Organization

**Location:**
- No test files currently present in codebase
- Convention not yet established (no `.test.ts` or `.spec.ts` files found)
- Recommended location: Co-located with source files (e.g., `src/config.test.ts` next to `src/config.ts`)

**Naming Convention (Recommended):**
- `*.test.ts` suffix for unit tests
- `*.spec.ts` alternative suffix not in use
- Separate test directory possible but not established

**Structure:**
```
packages/[package-name]/
├── src/
│   ├── index.ts
│   ├── config.ts
│   └── config.test.ts          # Co-located with source
├── dist/                        # Built output
└── package.json
```

## Test Structure Template

Since no existing tests are present, the following patterns should be established:

**Recommended Structure:**
```typescript
import { expect } from 'bun:test';
import { describe, it, beforeEach, afterEach } from 'bun:test';
import { loadConfig, getDefaultConfig } from './config';
import type { xopsConfig } from './types';

describe('Config Loading', () => {
  describe('loadConfig()', () => {
    it('should load valid config file', async () => {
      // Arrange: setup test data
      // Act: call function
      // Assert: verify result
    });

    it('should throw error on missing config', async () => {
      // Test error case
    });
  });

  describe('getDefaultConfig()', () => {
    it('should return config with sensible defaults', () => {
      const config = getDefaultConfig();
      expect(config.version).toBe('1');
      expect(config.ai.provider).toBe('claude-code');
    });
  });
});
```

**Patterns to Establish:**
- AAA pattern: Arrange → Act → Assert
- One assertion per test when possible
- Descriptive test names as sentences
- Nested `describe()` blocks for organization
- Use `beforeEach()` for common setup
- Use `afterEach()` for cleanup

## Mocking

**Framework:** Bun's native mocking via `bun:test`

**Recommended Patterns (Not yet implemented):**

### File System Mocking
```typescript
import { mock } from 'bun:test';
import * as fs from 'fs';

// Mock fs.readFileSync for config loading tests
mock.module('fs', () => ({
  readFileSync: mock(() => 'mock config content'),
  existsSync: mock(() => true),
}));
```

### Child Process Mocking
```typescript
import { mock } from 'bun:test';
import { execSync, spawn } from 'child_process';

// Mock execSync for tool detection
mock.module('child_process', () => ({
  execSync: mock(() => '/usr/local/bin/kubectl'),
}));
```

### External API Mocking
```typescript
// Mock fetch for gateway status checks
global.fetch = mock(async () => ({
  ok: true,
  json: async () => ({ status: 'healthy' }),
}));
```

**What to Mock:**
- File system operations (fs module) for deterministic tests
- External commands (execSync, spawn) to avoid tool dependencies
- HTTP calls (fetch) to avoid network dependency
- Environment variables in isolated scope

**What NOT to Mock:**
- Internal service classes (instantiate real instances)
- Zod validation (test actual validation logic)
- Async/await behavior (test real promises)
- Configuration transformations (test actual pipeline)

## Fixtures and Factories

**Test Data Pattern (Recommended):**
```typescript
// config.test.ts - Test fixture
const mockTelegramConfig = {
  enabled: true,
  accounts: {
    default: {
      token: 'test-token-12345:abcdefgh',
      allowFrom: ['testuser'],
    },
  },
};

const mockxopsConfig: xopsConfig = {
  version: '1',
  ai: {
    provider: 'claude-code',
    model: 'sonnet',
  },
  channels: {
    telegram: mockTelegramConfig,
    slack: { enabled: false },
    web: { enabled: true, port: 8080 },
  },
  // ... rest of config
};
```

**Factory Pattern (Recommended):**
```typescript
function createTestConfig(overrides?: Partial<xopsConfig>): xopsConfig {
  return {
    ...getDefaultConfig(),
    ...overrides,
  };
}

// Usage in tests:
const config = createTestConfig({ 
  ai: { provider: 'anthropic', model: 'custom' }
});
```

**Location:**
- Co-locate fixtures with test files: `src/[feature].test.ts`
- Extract shared factories to `src/__tests__/fixtures.ts` if shared across multiple test files
- Keep fixtures minimal and focused on what the test needs

## Coverage

**Requirements:** Not enforced (no coverage configuration present)

**Recommended Baseline:**
- Aim for 70%+ statement coverage on critical paths
- 100% coverage on configuration loading and validation
- 100% coverage on type schemas (config.ts, types.ts)
- 50%+ coverage on adapters and infrastructure code

**View Coverage:**
```bash
bun test --coverage                    # Generate coverage report
# Coverage output format: text by default, JSON/HTML via reporter config
```

## Test Types

**Unit Tests:**
- Scope: Individual functions and classes
- Approach: Test pure functions, configuration, utilities
- Examples:
  - `config.test.ts` - Configuration loading and validation
  - `utils.test.ts` - `detectTools()`, `parseDuration()`, `formatBytes()`, `truncate()`
  - `types.test.ts` - Zod schema validation

**Integration Tests:**
- Scope: Components working together (adapters + gateway, gateway + runtime)
- Approach: Real instances, mocked external calls
- Examples:
  - Gateway receives message → runtime processes → adapter sends response
  - Memory manager indexes files → searches results
  - Wizard collects input → generates config file

**E2E Tests:**
- Framework: Not implemented
- Recommendation: Consider playwright or bun's native test utilities for CLI E2E
- Scope: Full workflow tests (wizard setup → gateway start → send message)

## Async Testing

**Pattern (Recommended):**
```typescript
import { describe, it } from 'bun:test';

describe('Async Functions', () => {
  it('should resolve config promise', async () => {
    const config = await loadConfig('./test-config.yaml');
    expect(config.ai.provider).toBe('claude-code');
  });

  it('should handle async errors', async () => {
    try {
      await loadConfig('./missing.yaml');
      throw new Error('Should have thrown');
    } catch (error) {
      expect((error as Error).message).toContain('Config file not found');
    }
  });
});
```

**Streaming Tests (for AsyncGenerator):**
```typescript
it('should stream chat response chunks', async () => {
  const runtime = new AIRuntime({ aiConfig: testConfig });
  const context = createTestContext();
  
  const chunks: string[] = [];
  for await (const chunk of runtime.chatStream(context, 'test message')) {
    chunks.push(chunk);
  }
  
  expect(chunks.length).toBeGreaterThan(0);
  expect(chunks.join('')).toContain('expected response');
});
```

## Error Testing

**Pattern (Recommended):**
```typescript
import { describe, it, expect } from 'bun:test';

describe('Error Handling', () => {
  it('should throw on invalid configuration', () => {
    const invalidConfig = { version: '1', ai: {} }; // Missing required fields
    expect(() => {
      xopsConfigSchema.parse(invalidConfig);
    }).toThrow('Invalid');
  });

  it('should handle missing config file gracefully', async () => {
    const error = await loadConfig('/nonexistent/path.yaml').catch(e => e);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('Config file not found');
  });

  it('should recover from tool detection failures', async () => {
    // Mock execSync to throw
    const tools = await detectTools(); // Should not throw
    expect(Array.isArray(tools)).toBe(true);
  });
});
```

## Missing Test Coverage

**Critical Areas Needing Tests:**

**Configuration System:**
- File: `packages/core/src/config.ts`
- Tests needed:
  - `loadConfig()` with valid/invalid YAML
  - `saveConfig()` creates directories and writes file
  - `expandEnvVars()` replaces `${VAR}` patterns
  - Zod schema validation for all config types

**Gateway Server:**
- File: `packages/gateway/src/server.ts`
- Tests needed:
  - Chat endpoint accepts message and returns response
  - Conversation state persists across messages
  - Memory search integrates with chat
  - WebSocket connections handle messages
  - Error handling for malformed requests

**Channel Adapters:**
- File: `packages/channels/src/telegram.ts`, `packages/channels/src/slack.ts`
- Tests needed:
  - Message handlers called correctly
  - Long messages split appropriately
  - Access control enforced
  - Error handling for API failures

**AI Runtime:**
- File: `packages/gateway/src/runtime.ts`
- Tests needed:
  - Provider selection (Claude Code vs API)
  - Message formatting with history and memory
  - Stream chunking behavior
  - Error handling for missing CLI or API key

**Memory Manager:**
- File: `packages/memory/src/manager.ts`
- Tests needed:
  - File indexing creates chunks
  - Search returns ranked results
  - Hybrid vector + keyword scoring
  - Sync updates changed files

**Wizard Steps:**
- File: `packages/wizard/src/steps.ts`
- Tests needed:
  - Tool detection works
  - Answers collected correctly
  - State transitions between steps
  - Config generation from wizard state

---

*Testing analysis: 2026-07-19*
