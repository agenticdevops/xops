/**
 * Skill loader - discovers and loads SKILL.md files
 */

import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import { execSync } from 'child_process';
import type { Skill, SkillFrontmatter, SkillMetadata, SkillLoadOptions, SkillEligibility } from './types';

// Default bundled skills directory (relative to this package)
const BUNDLED_SKILLS_DIR = path.join(__dirname, '..', 'bundled');

/**
 * Load all skills from a directory
 */
export async function loadSkillsFromDir(
  dir: string,
  options?: SkillLoadOptions,
): Promise<Skill[]> {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const skills: Skill[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillPath = path.join(dir, entry.name, 'SKILL.md');
    if (!fs.existsSync(skillPath)) continue;

    try {
      const skill = await loadSkill(skillPath);

      // Apply filter
      if (options?.filter && !options.filter.includes(skill.name)) {
        continue;
      }

      // Check eligibility
      if (options?.checkBinaries || options?.checkEnv) {
        const eligibility = checkSkillEligibility(skill, options);
        if (!eligibility.eligible && !options?.includeDisabled) {
          continue;
        }
      }

      skills.push(skill);
    } catch (error) {
      console.warn(`Failed to load skill from ${skillPath}:`, error);
    }
  }

  return skills;
}

/**
 * Load a single skill from SKILL.md path
 */
export async function loadSkill(skillPath: string): Promise<Skill> {
  const content = fs.readFileSync(skillPath, 'utf-8');
  const { data, content: body } = matter(content);

  const frontmatter = data as SkillFrontmatter;

  if (!frontmatter.name) {
    throw new Error(`Skill at ${skillPath} is missing 'name' in frontmatter`);
  }

  if (!frontmatter.description) {
    throw new Error(`Skill at ${skillPath} is missing 'description' in frontmatter`);
  }

  return {
    name: frontmatter.name,
    description: frontmatter.description,
    homepage: frontmatter.homepage,
    metadata: frontmatter.metadata,
    content: body.trim(),
    path: skillPath,
    frontmatter,
  };
}

/**
 * Load bundled skills
 */
export async function loadBundledSkills(options?: SkillLoadOptions): Promise<Skill[]> {
  return loadSkillsFromDir(BUNDLED_SKILLS_DIR, options);
}

/**
 * Load skills from multiple directories with precedence
 * Later directories override earlier ones (by skill name)
 */
export async function loadSkillsWithPrecedence(
  dirs: string[],
  options?: SkillLoadOptions,
): Promise<Skill[]> {
  const skillMap = new Map<string, Skill>();

  for (const dir of dirs) {
    const skills = await loadSkillsFromDir(dir, options);
    for (const skill of skills) {
      skillMap.set(skill.name, skill);
    }
  }

  return Array.from(skillMap.values());
}

/**
 * Check if a skill meets its requirements
 */
export function checkSkillEligibility(
  skill: Skill,
  options?: SkillLoadOptions,
): SkillEligibility {
  const requires = skill.metadata?.requires;
  if (!requires) {
    return { eligible: true };
  }

  const missingBins: string[] = [];
  const missingEnv: string[] = [];

  // Check required binaries
  if (options?.checkBinaries && requires.bins) {
    for (const bin of requires.bins) {
      if (!binaryExists(bin)) {
        missingBins.push(bin);
      }
    }
  }

  // Check anyBins (at least one must exist)
  if (options?.checkBinaries && requires.anyBins && requires.anyBins.length > 0) {
    const hasAny = requires.anyBins.some(binaryExists);
    if (!hasAny) {
      missingBins.push(`one of: ${requires.anyBins.join(', ')}`);
    }
  }

  // Check required env vars
  if (options?.checkEnv && requires.env) {
    for (const envVar of requires.env) {
      if (!process.env[envVar]) {
        missingEnv.push(envVar);
      }
    }
  }

  if (missingBins.length > 0 || missingEnv.length > 0) {
    const reasons: string[] = [];
    if (missingBins.length > 0) {
      reasons.push(`missing binaries: ${missingBins.join(', ')}`);
    }
    if (missingEnv.length > 0) {
      reasons.push(`missing env vars: ${missingEnv.join(', ')}`);
    }

    return {
      eligible: false,
      reason: reasons.join('; '),
      missingBins: missingBins.length > 0 ? missingBins : undefined,
      missingEnv: missingEnv.length > 0 ? missingEnv : undefined,
    };
  }

  return { eligible: true };
}

/**
 * Check if a binary exists in PATH
 */
function binaryExists(name: string): boolean {
  try {
    execSync(`which ${name}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Format skills for inclusion in system prompt
 */
export function formatSkillsForPrompt(skills: Skill[]): string {
  if (skills.length === 0) {
    return '';
  }

  const sections = skills.map((skill) => {
    const emoji = skill.metadata?.emoji || '📋';
    return `## ${emoji} ${skill.name}\n\n${skill.content}`;
  });

  return `# Available Skills\n\n${sections.join('\n\n---\n\n')}`;
}

/**
 * Get skill by name from loaded skills
 */
export function getSkillByName(skills: Skill[], name: string): Skill | undefined {
  return skills.find((s) => s.name === name);
}
