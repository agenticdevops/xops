import { describe, expect, test } from 'bun:test';
import { evaluateKubectl } from './guard';

const NS = 'demo';

describe('evaluateKubectl (fail-closed)', () => {
  test('allows read verbs in the pinned namespace', () => {
    expect(evaluateKubectl(['get', 'pods', '-n', NS], NS).allowed).toBe(true);
    expect(evaluateKubectl(['describe', 'deploy', 'web', '--namespace', NS], NS).allowed).toBe(true);
    expect(evaluateKubectl(['logs', 'web-abc', '-n', NS, '--previous'], NS).allowed).toBe(true);
  });

  test('allows skill-sanctioned mutation verbs in namespace', () => {
    expect(evaluateKubectl(['patch', 'deploy', 'web', '-n', NS, '--type=json', '-p', '[]'], NS).allowed).toBe(true);
    expect(evaluateKubectl(['set', 'image', 'deploy/web', 'web=img:2', '-n', NS], NS).allowed).toBe(true);
    expect(evaluateKubectl(['rollout', 'status', 'deploy/web', '-n', NS], NS).allowed).toBe(true);
    expect(evaluateKubectl(['scale', 'deploy/web', '--replicas=2', '-n', NS], NS).allowed).toBe(true);
  });

  test('denies destructive verbs even in pinned namespace', () => {
    for (const verb of ['delete', 'drain', 'apply', 'create', 'edit', 'replace', 'cordon']) {
      const res = evaluateKubectl([verb, 'deploy', 'web', '-n', NS], NS);
      expect(res.allowed).toBe(false);
    }
  });

  test('denies allowed verbs outside pinned namespace (fail-closed)', () => {
    expect(evaluateKubectl(['get', 'pods', '-n', 'kube-system'], NS).allowed).toBe(false);
    expect(evaluateKubectl(['get', 'pods'], NS).allowed).toBe(false); // no ns = deny
    expect(evaluateKubectl(['get', 'pods', '--all-namespaces'], NS).allowed).toBe(false);
    expect(evaluateKubectl(['get', 'pods', '-A'], NS).allowed).toBe(false);
  });

  test('denies unknown/empty input', () => {
    expect(evaluateKubectl([], NS).allowed).toBe(false);
    expect(evaluateKubectl(['frobnicate', '-n', NS], NS).allowed).toBe(false);
  });

  test('deny reason names the offending rule', () => {
    expect(evaluateKubectl(['delete', 'ns', 'demo', '-n', NS], NS).reason).toContain('delete');
    expect(evaluateKubectl(['get', 'pods', '-n', 'other'], NS).reason).toContain('namespace');
  });
});
