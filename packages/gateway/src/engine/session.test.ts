import { describe, expect, test } from 'bun:test';
import { join, resolve } from 'path';
import { mutatedInGuardLog } from './session';
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
