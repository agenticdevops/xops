import { describe, expect, test } from 'bun:test';
import { parseSkillGrants, grantsFor } from './skills';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('parseSkillGrants', () => {
  test('reads grants array from frontmatter', () => {
    expect(parseSkillGrants('metadata:\n  xops:\n    grants: [ps, inspect, restart]')).toEqual(['ps', 'inspect', 'restart']);
  });
  test('returns null when no grants key', () => {
    expect(parseSkillGrants('name: foo')).toBeNull();
  });
});

describe('grantsFor', () => {
  test('unions grants across skills, de-duplicated', () => {
    const dir = mkdtempSync(join(tmpdir(), 'xops-skills-'));
    for (const [name, grants] of [['a', '[get, logs]'], ['b', '[logs, patch]']] as const) {
      mkdirSync(join(dir, name), { recursive: true });
      writeFileSync(join(dir, name, 'SKILL.md'), `metadata:\n  xops:\n    grants: ${grants}`);
    }
    expect(grantsFor(['a', 'b'], dir).sort()).toEqual(['get', 'logs', 'patch']);
  });
});
