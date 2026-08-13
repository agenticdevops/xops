import { describe, expect, test } from 'bun:test';
import { getBot, listBots, BUNDLED_BOTS } from './bots';

describe('bot registry', () => {
  test('ships a k8s-sre and a docker-ops bot', () => {
    expect(getBot('k8s-sre')?.platform).toBe('k8s');
    expect(getBot('docker-ops')?.platform).toBe('docker');
    expect(getBot('k8s-sre')?.skills).toContain('k8s-pod-restart-triage');
    expect(getBot('docker-ops')?.skills).toContain('docker-container-triage');
  });
  test('getBot returns undefined for unknown', () => {
    expect(getBot('nope')).toBeUndefined();
  });
  test('listBots returns all bundled bots', () => {
    expect(listBots().length).toBe(BUNDLED_BOTS.length);
    expect(listBots().length).toBeGreaterThanOrEqual(2);
  });
});
