import { describe, expect, test } from 'bun:test';
import { StreamJsonTextParser } from './stream-parse';

const line = (obj: unknown) => JSON.stringify(obj) + '\n';
const asst = (text: string) =>
  line({ type: 'message', message: { role: 'assistant', content: [{ type: 'text', text }] } });

describe('StreamJsonTextParser', () => {
  test('emits text fragments from complete lines in order', () => {
    const p = new StreamJsonTextParser();
    expect(p.push(asst('Root '))).toEqual(['Root ']);
    expect(p.push(asst('cause: OOM.'))).toEqual(['cause: OOM.']);
  });

  test('buffers a partial trailing line until completed', () => {
    const p = new StreamJsonTextParser();
    const full = asst('hello');
    const cut = Math.floor(full.length / 2);
    expect(p.push(full.slice(0, cut))).toEqual([]); // incomplete line
    expect(p.push(full.slice(cut))).toEqual(['hello']);
  });

  test('ignores non-text blocks (thinking, toolRequest) and garbage', () => {
    const p = new StreamJsonTextParser();
    expect(p.push(line({ type: 'message', message: { role: 'assistant', content: [{ type: 'thinking', thinking: 'hm' }] } }))).toEqual([]);
    expect(p.push('not json\n')).toEqual([]);
    expect(p.push(line({ type: 'message', message: { role: 'user', content: [{ type: 'text', text: 'q' }] } }))).toEqual([]);
  });

  test('multiple complete lines in one chunk emit in order', () => {
    const p = new StreamJsonTextParser();
    expect(p.push(asst('a') + asst('b'))).toEqual(['a', 'b']);
  });
});
