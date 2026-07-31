import { describe, expect, test } from 'bun:test';
import { parseGooseOutput } from './parse';

const line = (obj: unknown) => JSON.stringify(obj);

const assistantText = (text: string) =>
  line({ type: 'message', message: { role: 'assistant', content: [{ type: 'text', text }] } });

describe('parseGooseOutput', () => {
  test('returns last assistant text block as the result', () => {
    const raw = [
      line({ type: 'message', message: { role: 'user', content: [{ type: 'text', text: 'fix ns demo' }] } }),
      assistantText('Loading skill...'),
      line({
        type: 'message',
        message: {
          role: 'assistant',
          content: [{ type: 'toolRequest', toolCall: { value: { name: 'shell', arguments: { command: 'kubectl get pods' } } } }],
        },
      }),
      assistantText('Root cause: bad liveness probe. Patched port to 8080. Pods Ready.'),
    ].join('\n');

    const result = parseGooseOutput(raw);
    expect(result.finalText).toBe('Root cause: bad liveness probe. Patched port to 8080. Pods Ready.');
    expect(result.messageCount).toBe(4);
  });

  test('tolerates garbage lines and partial writes (watchdog kill)', () => {
    const raw = [
      'goose starting up...',
      assistantText('diagnosing'),
      '{"type":"message","message":{"role":"assistant","cont', // truncated by KILL
    ].join('\n');

    const result = parseGooseOutput(raw);
    expect(result.finalText).toBe('diagnosing');
  });

  test('empty/no assistant output yields null finalText', () => {
    expect(parseGooseOutput('').finalText).toBeNull();
    expect(parseGooseOutput('not json at all').finalText).toBeNull();
  });
});
