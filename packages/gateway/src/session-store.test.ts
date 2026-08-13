import { describe, expect, test } from 'bun:test';
import { SessionStore } from './session-store';

describe('SessionStore', () => {
  test('unset chat returns undefined', () => {
    expect(new SessionStore().get('c1')).toBeUndefined();
  });
  test('setBot then get returns the binding', () => {
    const s = new SessionStore();
    s.setBot('c1', 'k8s-sre');
    expect(s.get('c1')).toEqual({ bot: 'k8s-sre' });
  });
  test('setProject preserves the bound bot', () => {
    const s = new SessionStore();
    s.setBot('c1', 'k8s-sre');
    s.setProject('c1', 'payments');
    expect(s.get('c1')).toEqual({ bot: 'k8s-sre', project: 'payments' });
  });
  test('setProject before any bot throws (must pick a bot first)', () => {
    expect(() => new SessionStore().setProject('c1', 'payments')).toThrow();
  });
});
