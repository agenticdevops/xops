import { describe, expect, test } from 'bun:test';
import { classify } from './risk';

describe('classify (risk taxonomy, ported from xopsbot)', () => {
  test('kubectl read verbs are LOW', () => {
    expect(classify('kubectl', ['get', 'pods', '-n', 'x']).tier).toBe('LOW');
    expect(classify('kubectl', ['logs', 'pod/web']).tier).toBe('LOW');
  });

  test('kubectl mutations are HIGH, destructive CRITICAL', () => {
    expect(classify('kubectl', ['patch', 'deploy', 'web']).tier).toBe('HIGH');
    expect(classify('kubectl', ['scale', 'deploy/web']).tier).toBe('HIGH');
    expect(classify('kubectl', ['delete', 'ns', 'prod']).tier).toBe('CRITICAL');
    expect(classify('kubectl', ['drain', 'node1']).tier).toBe('CRITICAL');
  });

  test('docker tiers', () => {
    expect(classify('docker', ['ps']).tier).toBe('LOW');
    expect(classify('docker', ['restart', 'web']).tier).toBe('HIGH');
    expect(classify('docker', ['rm', 'web']).tier).toBe('CRITICAL');
  });

  test('multi-word commands match longest key first', () => {
    expect(classify('docker', ['volume', 'rm', 'v1']).tier).toBe('CRITICAL');
    expect(classify('docker', ['system', 'prune', '-f']).tier).toBe('CRITICAL');
  });

  test('flags before verb are skipped when classifying', () => {
    expect(classify('kubectl', ['-n', 'demo', 'get', 'pods']).tier).toBe('LOW');
    expect(classify('kubectl', ['--namespace=demo', 'patch', 'deploy', 'w']).tier).toBe('HIGH');
    // flag with separate value before verb
    expect(classify('docker', ['--context', 'prod', 'rm', 'web']).tier).toBe('CRITICAL');
  });

  test('unknown command falls back to tool default_risk', () => {
    const r = classify('docker', ['frobnicate']);
    expect(r.tier).toBe('MEDIUM'); // docker default_risk
    expect(r.matched).toBeNull();
  });

  test('unknown tool is CRITICAL (fail-closed)', () => {
    expect(classify('rmctl' as any, ['anything']).tier).toBe('CRITICAL');
  });
});
