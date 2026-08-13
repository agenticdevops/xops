import { describe, expect, test } from 'bun:test';
import { parseGuardedCommand } from './hook';

describe('parseGuardedCommand (claude-acp PreToolUse: extract guarded invocation from a shell string)', () => {
  test('no guarded tool referenced → none (command runs unguarded, like the PATH shim)', () => {
    expect(parseGuardedCommand('bash /w/.goose/skills/x/scripts/diagnose.sh victim', 'docker')).toEqual({ kind: 'none' });
    expect(parseGuardedCommand('cat SKILL.md', 'kubectl')).toEqual({ kind: 'none' });
    expect(parseGuardedCommand('ls -la', 'docker')).toEqual({ kind: 'none' });
  });

  test('simple guarded invocation → its args', () => {
    expect(parseGuardedCommand('docker update --memory 33554432 xops-victim', 'docker')).toEqual({
      kind: 'invocation',
      args: ['update', '--memory', '33554432', 'xops-victim'],
    });
    expect(parseGuardedCommand('kubectl -n demo get pods -o json', 'kubectl')).toEqual({
      kind: 'invocation',
      args: ['-n', 'demo', 'get', 'pods', '-o', 'json'],
    });
  });

  test('quoted args are preserved, quotes stripped', () => {
    expect(parseGuardedCommand(`docker inspect x --format '{{.State.Status}}'`, 'docker')).toEqual({
      kind: 'invocation',
      args: ['inspect', 'x', '--format', '{{.State.Status}}'],
    });
  });

  test('metacharacters inside quotes do NOT trip the compound guard', () => {
    expect(parseGuardedCommand(`docker inspect x --format '{{.A}} && {{.B}}'`, 'docker')).toEqual({
      kind: 'invocation',
      args: ['inspect', 'x', '--format', '{{.A}} && {{.B}}'],
    });
  });

  test('compound command containing the guarded tool → unparseable (fail-closed)', () => {
    const cases: Array<[string, string]> = [
      ['docker ps && docker rm xops-victim', 'docker'],
      ['docker rm x; echo done', 'docker'],
      ['kubectl get pods | grep bad', 'kubectl'],
      ['echo $(docker rm x)', 'docker'],
      ['docker inspect x `whoami`', 'docker'],
    ];
    for (const [cmd, tool] of cases) {
      expect(parseGuardedCommand(cmd, tool).kind).toBe('unparseable');
    }
  });

  test('a single guarded command with only a redirect parses (policy decides the verb)', () => {
    // `kubectl delete ns prod >/dev/null` is one command — parses as an
    // invocation; the CRITICAL deny happens at the policy layer, not here.
    expect(parseGuardedCommand('kubectl delete ns prod >/dev/null', 'kubectl')).toEqual({
      kind: 'invocation', args: ['delete', 'ns', 'prod'],
    });
  });

  test('guarded tool not the leading command → unparseable (sh -c, env, xargs wrappers)', () => {
    expect(parseGuardedCommand(`sh -c 'kubectl delete ns prod'`, 'kubectl').kind).toBe('unparseable');
    expect(parseGuardedCommand('env docker rm x', 'docker').kind).toBe('unparseable');
    expect(parseGuardedCommand('sudo docker rm x', 'docker').kind).toBe('unparseable');
  });

  test('trailing I/O redirects are allowed and stripped from args (2>&1, >/dev/null)', () => {
    expect(parseGuardedCommand(`docker ps -a --format '{{.ID}}' 2>&1`, 'docker')).toEqual({
      kind: 'invocation', args: ['ps', '-a', '--format', '{{.ID}}'],
    });
    expect(parseGuardedCommand('docker inspect x >/dev/null 2>&1', 'docker')).toEqual({
      kind: 'invocation', args: ['inspect', 'x'],
    });
    expect(parseGuardedCommand('kubectl get pods -n demo 2>/dev/null', 'kubectl')).toEqual({
      kind: 'invocation', args: ['get', 'pods', '-n', 'demo'],
    });
  });

  test('redirect does not smuggle a second command past the guard', () => {
    // `>` then `&&` still chains — must deny
    expect(parseGuardedCommand('docker ps > /tmp/x && docker rm victim', 'docker').kind).toBe('unparseable');
  });

  test('tool name as a substring of another token is not a match', () => {
    expect(parseGuardedCommand('docker-compose up', 'docker')).toEqual({ kind: 'none' });
    expect(parseGuardedCommand('dockerize -wait x', 'docker')).toEqual({ kind: 'none' });
  });
});
