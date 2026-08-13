import { describe, expect, test } from 'bun:test';
import { parseGuardedCommands, hookDecision } from './hook';

describe('parseGuardedCommands (multi-stage pipeline/sequence aware)', () => {
  test('no guarded tool → none (runs unguarded, like the PATH shim)', () => {
    expect(parseGuardedCommands('bash diagnose.sh victim', 'docker')).toEqual({ kind: 'none' });
    expect(parseGuardedCommands('cat SKILL.md', 'kubectl')).toEqual({ kind: 'none' });
  });

  test('single clean invocation → its args', () => {
    expect(parseGuardedCommands('docker update --memory 33554432 xops-victim', 'docker')).toEqual({
      kind: 'invocations', list: [['update', '--memory', '33554432', 'xops-victim']],
    });
  });

  test('quoted args preserved', () => {
    expect(parseGuardedCommands(`docker inspect x --format '{{.State.Status}}'`, 'docker')).toEqual({
      kind: 'invocations', list: [['inspect', 'x', '--format', '{{.State.Status}}']],
    });
  });

  test('pipe into a benign filter → the guarded stage only', () => {
    expect(parseGuardedCommands('docker ps -a 2>&1 | head -30', 'docker')).toEqual({
      kind: 'invocations', list: [['ps', '-a']],
    });
    expect(parseGuardedCommands(`docker inspect x --format '{{json .State}}' 2>&1 | jq .`, 'docker')).toEqual({
      kind: 'invocations', list: [['inspect', 'x', '--format', '{{json .State}}']],
    });
  });

  test('sequence of two guarded commands → both invocations', () => {
    expect(parseGuardedCommands('docker update --memory 32m victim && docker restart victim', 'docker')).toEqual({
      kind: 'invocations', list: [['update', '--memory', '32m', 'victim'], ['restart', 'victim']],
    });
  });

  test('sleep then guarded command → the guarded stage', () => {
    expect(parseGuardedCommands('sleep 20 && docker inspect victim', 'docker')).toEqual({
      kind: 'invocations', list: [['inspect', 'victim']],
    });
  });

  test('trailing redirects stripped from args', () => {
    expect(parseGuardedCommands('kubectl get pods -n demo 2>/dev/null', 'kubectl')).toEqual({
      kind: 'invocations', list: [['get', 'pods', '-n', 'demo']],
    });
  });

  test('command substitution / backticks referencing the tool → deny (can hide a call)', () => {
    expect(parseGuardedCommands('echo $(docker rm x)', 'docker').kind).toBe('unparseable');
    expect(parseGuardedCommands('docker inspect x `docker rm y`', 'docker').kind).toBe('unparseable');
  });

  test('tool wrapped so it is not a clean stage leader → deny', () => {
    expect(parseGuardedCommands(`sh -c 'docker rm x'`, 'docker').kind).toBe('unparseable');
    expect(parseGuardedCommands('env docker rm x', 'docker').kind).toBe('unparseable');
    expect(parseGuardedCommands('xargs docker rm', 'docker').kind).toBe('unparseable');
  });

  test('tool as substring is not a match', () => {
    expect(parseGuardedCommands('docker-compose up', 'docker')).toEqual({ kind: 'none' });
    expect(parseGuardedCommands('dockerize -wait x | head', 'docker')).toEqual({ kind: 'none' });
  });
});

const AUTO = { tool: 'docker', mode: 'auto' as const };
const SAFE = { tool: 'docker', mode: 'safe' as const };

describe('hookDecision (PreToolUse Bash → allow/deny)', () => {
  test('allows non-guarded commands', () => {
    expect(hookDecision('bash diagnose.sh xops-victim', AUTO).allowed).toBe(true);
    expect(hookDecision('cat SKILL.md', AUTO).allowed).toBe(true);
  });

  test('allows reads piped to filters (any mode)', () => {
    expect(hookDecision('docker ps -a 2>&1 | head -30', SAFE).allowed).toBe(true);
    expect(hookDecision('docker logs anything 2>&1 | tail -20', SAFE).allowed).toBe(true);
  });

  test('allows a write in auto mode; a sequence of writes too', () => {
    expect(hookDecision('docker update --memory 33554432 xops-victim', AUTO).allowed).toBe(true);
    expect(hookDecision('docker update --memory 32m xops-victim && docker restart xops-victim', AUTO).allowed).toBe(true);
  });

  test('blocks a write in safe mode', () => {
    expect(hookDecision('docker restart web', SAFE).allowed).toBe(false);
  });

  test('denies if ANY stage is dangerous (CRITICAL), in every mode', () => {
    expect(hookDecision('docker ps && docker rm -f xops-victim', AUTO).allowed).toBe(false);
    expect(hookDecision('docker ps && docker rm -f xops-victim', SAFE).allowed).toBe(false);
  });

  test('denies substitution / wrappers (fail-closed)', () => {
    expect(hookDecision('echo $(docker rm xops-victim)', AUTO).allowed).toBe(false);
    expect(hookDecision(`sh -c 'docker rm xops-victim'`, AUTO).allowed).toBe(false);
  });
});
