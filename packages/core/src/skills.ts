import { readFileSync } from 'fs';
import { join } from 'path';

export function parseSkillGrants(skillMd: string): string[] | null {
  const m = skillMd.match(/grants:\s*\[([^\]]*)\]/);
  if (!m) return null;
  return m[1].split(',').map((s) => s.trim()).filter(Boolean);
}

export function grantsFor(skillNames: string[], skillsDir: string): string[] {
  const set = new Set<string>();
  for (const name of skillNames) {
    let md: string;
    try {
      md = readFileSync(join(skillsDir, name, 'SKILL.md'), 'utf8');
    } catch {
      continue;
    }
    for (const g of parseSkillGrants(md) ?? []) set.add(g);
  }
  return [...set];
}
