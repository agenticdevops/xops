import { describe, expect, test } from 'bun:test';
import { GatewayServer } from './server';

function makeConfig() {
  return { ai: { provider: 'goose', model: 'x' }, channels: {}, gateway: { bind: '127.0.0.1', port: 0 } } as any;
}

describe('GET /bots', () => {
  test('returns the bundled bots with name/display/platform/skills', async () => {
    const app = new GatewayServer({ config: makeConfig() }).getApp();
    const res = await app.request('/bots');
    expect(res.status).toBe(200);
    const body = await res.json();
    const names = body.bots.map((b: any) => b.name);
    expect(names).toContain('docker-ops');
    expect(names).toContain('k8s-sre');
    const docker = body.bots.find((b: any) => b.name === 'docker-ops');
    expect(docker.platform).toBe('docker');
    expect(Array.isArray(docker.skills)).toBe(true);
  });
});
