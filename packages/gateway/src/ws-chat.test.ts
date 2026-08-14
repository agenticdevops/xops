import { describe, expect, test } from 'bun:test';
import { runChatToSink } from './ws-chat';

describe('runChatToSink', () => {
  test('sends an error for an unknown bot and does not throw', async () => {
    const sent: any[] = [];
    await runChatToSink({ bot: 'nope', scope: 'x', message: 'hi' }, { workspace: '/tmp/x', skillsSource: '/tmp/s' }, (m) => sent.push(m));
    expect(sent.length).toBe(1);
    expect(sent[0].type).toBe('error');
    expect(sent[0].message).toContain('nope');
  });

  test('sends an error when a k8s bot has no scope/kubeconfig', async () => {
    const sent: any[] = [];
    await runChatToSink({ bot: 'k8s-sre', scope: '', message: 'hi' }, { workspace: '/tmp/x', skillsSource: '/tmp/s' }, (m) => sent.push(m));
    expect(sent[0].type).toBe('error');
  });
});
