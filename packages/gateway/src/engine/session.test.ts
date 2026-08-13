import { describe, expect, test } from 'bun:test';
import { join, resolve } from 'path';
import { mutatedInGuardLog, shouldVerify } from './session';
import { grantsFor } from '../../../core/src/skills';
import { listBots } from '../../../core/src/bots';

describe('grantsFor bundled bots', () => {
  const bundledSkillsDir = resolve(join(import.meta.dir, '../../../skills/bundled'));

  for (const bot of listBots()) {
    test(`${bot.name} resolves at least one grant from its skills`, () => {
      const grants = grantsFor(bot.skills, bundledSkillsDir);
      expect(grants.length).toBeGreaterThan(0);
    });
  }
});

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
