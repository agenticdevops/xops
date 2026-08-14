import { describe, expect, test } from 'bun:test';
import { mutatedInGuardLog, shouldVerify, drainToResult, type BotTurnEvent } from './session';

describe('mutatedInGuardLog', () => {
  test('true when an allowed HIGH command ran', () => {
    expect(mutatedInGuardLog([{ allowed: true, tier: 'HIGH' }])).toBe(true);
  });
  test('false for reads only', () => {
    expect(mutatedInGuardLog([{ allowed: true, tier: 'LOW' }, { allowed: true, tier: 'LOW' }])).toBe(false);
  });
  test('false when the HIGH command was denied', () => {
    expect(mutatedInGuardLog([{ allowed: false, tier: 'HIGH' }])).toBe(false);
  });
  test('false for empty log (pure chat turn)', () => {
    expect(mutatedInGuardLog([])).toBe(false);
  });
});

describe('shouldVerify', () => {
  // Verify decision must NOT depend on seeing a HIGH command in the guard log:
  // on the claude-acp provider the log can undercount (Claude Code executes
  // some commands outside our shim). Any operational turn (>=1 command ran)
  // with a project scope gets independently verified.
  test('verifies when a project is set and any command ran (even only reads)', () => {
    expect(shouldVerify([{ allowed: true, tier: 'LOW' }], true)).toBe(true);
  });
  test('verifies a mutation turn with a project', () => {
    expect(shouldVerify([{ allowed: true, tier: 'HIGH' }], true)).toBe(true);
  });
  test('skips pure-chat turn (no command ran)', () => {
    expect(shouldVerify([], true)).toBe(false);
  });
  test('skips when there is no project scope to verify against', () => {
    expect(shouldVerify([{ allowed: true, tier: 'HIGH' }], false)).toBe(false);
  });
});

describe('drainToResult', () => {
  test('assembles a BotTurnResult from an event stream', async () => {
    async function* scripted(): AsyncGenerator<BotTurnEvent> {
      yield { type: 'text', delta: 'Root cause: OOM. ' };
      yield { type: 'guard', tool: 'docker', command: 'docker update --memory 32m x', allowed: true, tier: 'HIGH', category: 'write' };
      yield { type: 'text', delta: 'Fixed.' };
      yield { type: 'verify', healthy: true, summary: 'x running' };
      yield { type: 'done', wallSeconds: 12, acted: true, verified: true };
    }
    const r = await drainToResult(scripted());
    expect(r.reply).toContain('Root cause: OOM.');
    expect(r.reply).toContain('Fixed.');
    expect(r.reply).toContain('x running');
    expect(r.acted).toBe(true);
    expect(r.verified).toBe(true);
    expect(r.wallSeconds).toBe(12);
    expect(r.guardLog.length).toBe(1);
  });
});
