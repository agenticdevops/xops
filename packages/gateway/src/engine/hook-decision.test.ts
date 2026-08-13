import { describe, expect, test } from 'bun:test';
import { hookDecision } from './hook';

const POLICY = { tool: 'docker', grants: ['ps', 'inspect', 'logs', 'restart', 'update'], target: 'xops-victim' };

describe('hookDecision (PreToolUse Bash → allow/deny)', () => {
  test('allows non-guarded commands (they run unguarded)', () => {
    expect(hookDecision('bash diagnose.sh xops-victim', POLICY).allowed).toBe(true);
    expect(hookDecision('cat SKILL.md', POLICY).allowed).toBe(true);
  });

  test('allows a granted, on-target mutation', () => {
    const d = hookDecision('docker update --memory 33554432 xops-victim', POLICY);
    expect(d.allowed).toBe(true);
    expect(d.tier).toBe('HIGH');
  });

  test('denies CRITICAL even if referenced directly', () => {
    expect(hookDecision('docker rm -f xops-victim', POLICY).allowed).toBe(false);
  });

  test('denies a mutation aimed at a different target', () => {
    expect(hookDecision('docker restart production-db', POLICY).allowed).toBe(false);
  });

  test('denies compound / obfuscated commands referencing the tool (fail-closed)', () => {
    expect(hookDecision('docker ps && docker rm xops-victim', POLICY).allowed).toBe(false);
    expect(hookDecision(`sh -c 'docker rm xops-victim'`, POLICY).allowed).toBe(false);
  });
});
