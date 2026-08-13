import { describe, expect, test } from 'bun:test';
import { evaluateCommand, categoryFor } from './guard';

describe('categoryFor', () => {
  test('maps tiers to read/write/dangerous', () => {
    expect(categoryFor('LOW')).toBe('read');
    expect(categoryFor('MEDIUM')).toBe('write');
    expect(categoryFor('HIGH')).toBe('write');
    expect(categoryFor('CRITICAL')).toBe('dangerous');
  });
});

describe('evaluateCommand — read/write/dangerous, mode-gated', () => {
  test('reads are always allowed (any container/namespace, no grant needed)', () => {
    expect(evaluateCommand({ tool: 'docker', args: ['ps', '-a'] }).allowed).toBe(true);
    expect(evaluateCommand({ tool: 'docker', args: ['inspect', 'anything'] }).allowed).toBe(true);
    expect(evaluateCommand({ tool: 'docker', args: ['system', 'df'] }).allowed).toBe(true);
    expect(evaluateCommand({ tool: 'kubectl', args: ['get', 'pods', '-A'] }).allowed).toBe(true);
    expect(evaluateCommand({ tool: 'kubectl', args: ['config', 'view'] }).allowed).toBe(true);
  });

  test('dangerous commands are blocked in every mode', () => {
    for (const mode of ['auto', 'safe'] as const) {
      expect(evaluateCommand({ tool: 'docker', args: ['rm', '-f', 'x'], mode }).allowed).toBe(false);
      expect(evaluateCommand({ tool: 'docker', args: ['system', 'prune'], mode }).allowed).toBe(false);
      expect(evaluateCommand({ tool: 'kubectl', args: ['delete', 'ns', 'prod'], mode }).allowed).toBe(false);
      expect(evaluateCommand({ tool: 'kubectl', args: ['drain', 'node1'], mode }).allowed).toBe(false);
    }
  });

  test('writes: allowed in auto mode, blocked in safe mode', () => {
    const write = { tool: 'docker', args: ['restart', 'web'] };
    expect(evaluateCommand({ ...write, mode: 'auto' }).allowed).toBe(true);
    expect(evaluateCommand({ ...write, mode: 'safe' }).allowed).toBe(false);
    expect(evaluateCommand({ tool: 'kubectl', args: ['scale', 'deploy/web', '--replicas=2'], mode: 'auto' }).allowed).toBe(true);
    expect(evaluateCommand({ tool: 'kubectl', args: ['scale', 'deploy/web', '--replicas=2'], mode: 'safe' }).allowed).toBe(false);
  });

  test('default mode is auto', () => {
    expect(evaluateCommand({ tool: 'docker', args: ['restart', 'web'] }).allowed).toBe(true);
  });

  test('subcommand granularity: config view (read) vs config set-context (write)', () => {
    expect(evaluateCommand({ tool: 'kubectl', args: ['config', 'view'] }).category).toBe('read');
    expect(evaluateCommand({ tool: 'kubectl', args: ['config', 'set-context', 'x'], mode: 'auto' }).category).toBe('write');
    expect(evaluateCommand({ tool: 'docker', args: ['volume', 'ls'] }).category).toBe('read');
    expect(evaluateCommand({ tool: 'docker', args: ['volume', 'rm', 'v'] }).category).toBe('dangerous');
  });

  test('leading value-flags are skipped to find the verb (-n ns, --context c)', () => {
    expect(evaluateCommand({ tool: 'kubectl', args: ['-n', 'demo', 'get', 'pods'] }).category).toBe('read');
    expect(evaluateCommand({ tool: 'kubectl', args: ['--context', 'prod', 'delete', 'pod', 'x'] }).allowed).toBe(false);
    expect(evaluateCommand({ tool: 'docker', args: ['--context', 'foo', 'ps'] }).category).toBe('read');
  });

  test('an unknown leading flag cannot hide a dangerous verb (flag-swallow)', () => {
    // `docker --debug rm x`: --debug is boolean, rm surfaces as the verb → blocked
    expect(evaluateCommand({ tool: 'docker', args: ['--debug', 'rm', 'x'] }).allowed).toBe(false);
  });

  test('empty / flags-only commands are denied', () => {
    expect(evaluateCommand({ tool: 'docker', args: [] }).allowed).toBe(false);
    expect(evaluateCommand({ tool: 'kubectl', args: ['-n', 'demo'] }).allowed).toBe(false);
  });
});
