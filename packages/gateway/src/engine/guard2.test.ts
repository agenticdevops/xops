import { describe, expect, test } from 'bun:test';
import { evaluateCommand } from './guard';

const K8S_GRANTS = ['get', 'describe', 'logs', 'patch', 'set', 'rollout', 'scale', 'top', 'events'];
const DOCKER_GRANTS = ['ps', 'inspect', 'logs', 'stats', 'restart', 'update'];

describe('evaluateCommand (two-gate: skill grant + tier ceiling)', () => {
  test('granted kubectl verbs pass with namespace pinned', () => {
    const r = evaluateCommand({
      tool: 'kubectl',
      args: ['patch', 'deploy', 'web', '-n', 'demo'],
      skillGrants: K8S_GRANTS,
      namespace: 'demo',
    });
    expect(r.allowed).toBe(true);
    expect(r.tier).toBe('HIGH'); // HIGH allowed because skill grants patch
  });

  test('CRITICAL denied even when skill grants the verb', () => {
    const r = evaluateCommand({
      tool: 'kubectl',
      args: ['delete', 'pod', 'x', '-n', 'demo'],
      skillGrants: [...K8S_GRANTS, 'delete'], // grant mistake — ceiling still blocks
      namespace: 'demo',
    });
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain('CRITICAL');
  });

  test('ungranted verb denied even if LOW', () => {
    const r = evaluateCommand({
      tool: 'kubectl',
      args: ['api-resources'],
      skillGrants: K8S_GRANTS,
      namespace: 'demo',
    });
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain('not granted');
  });

  test('kubectl namespace pinning still enforced', () => {
    const r = evaluateCommand({
      tool: 'kubectl',
      args: ['get', 'pods', '-n', 'kube-system'],
      skillGrants: K8S_GRANTS,
      namespace: 'demo',
    });
    expect(r.allowed).toBe(false);
  });

  test('docker: granted restart passes, rm denied (CRITICAL), prune denied', () => {
    expect(evaluateCommand({ tool: 'docker', args: ['restart', 'web'], skillGrants: DOCKER_GRANTS }).allowed).toBe(true);
    expect(evaluateCommand({ tool: 'docker', args: ['rm', '-f', 'web'], skillGrants: DOCKER_GRANTS }).allowed).toBe(false);
    expect(evaluateCommand({ tool: 'docker', args: ['system', 'prune'], skillGrants: DOCKER_GRANTS }).allowed).toBe(false);
  });

  test('docker flags-before-verb classified and grant-checked correctly', () => {
    const r = evaluateCommand({ tool: 'docker', args: ['--context', 'default', 'restart', 'web'], skillGrants: DOCKER_GRANTS });
    expect(r.allowed).toBe(true);
  });

  test('kubectl flags-before-verb no longer bypass grant matching', () => {
    const r = evaluateCommand({
      tool: 'kubectl',
      args: ['-n', 'demo', 'get', 'deploy', '-o', 'json'],
      skillGrants: K8S_GRANTS,
      namespace: 'demo',
    });
    expect(r.allowed).toBe(true); // POC bug: this was denied
  });

  test('unknown tool denied', () => {
    expect(evaluateCommand({ tool: 'helm', args: ['list'], skillGrants: ['list'] }).allowed).toBe(false);
  });

  test('empty args denied', () => {
    expect(evaluateCommand({ tool: 'docker', args: [], skillGrants: DOCKER_GRANTS }).allowed).toBe(false);
  });
});
