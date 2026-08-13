// packages/gateway/src/engine/spawn.test.ts
import { describe, expect, test } from 'bun:test';
import { shellQuote, findRealTool } from './spawn';

describe('shellQuote', () => {
  test('wraps in single quotes and escapes embedded quotes', () => {
    expect(shellQuote('abc')).toBe("'abc'");
    expect(shellQuote("a'b")).toBe("'a'\\''b'");
  });
});

describe('findRealTool', () => {
  test('throws when the real binary is absent (never returns bare name)', () => {
    expect(() => findRealTool('definitely-not-a-real-bin-xyz', '/tmp/shimbin')).toThrow();
  });
});
