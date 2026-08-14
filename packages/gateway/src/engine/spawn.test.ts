// packages/gateway/src/engine/spawn.test.ts
import { describe, expect, test } from 'bun:test';
import { shellQuote, findRealTool, runGooseProcess } from './spawn';

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

describe('runGooseProcess', () => {
  test('runGooseProcess streams stdout chunks to onStdout', async () => {
    const chunks: string[] = [];
    // use `bash` as a stand-in that prints two lines then exits
    const res = await runGooseProcess(['-c', 'printf "a\\n"; printf "b\\n"'], {
      cwd: process.cwd(),
      env: process.env,
      timeoutMs: 5000,
      gooseBin: 'bash',
      onStdout: (c) => chunks.push(c),
    });
    expect(res.exitCode).toBe(0);
    expect(chunks.join('')).toContain('a');
    expect(chunks.join('')).toContain('b');
    expect(res.stdout).toContain('a');
  });
});
