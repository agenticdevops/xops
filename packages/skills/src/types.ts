/**
 * Skill types
 */

export interface SkillMetadata {
  emoji?: string;
  version?: string;
  author?: string;
  license?: string;
  homepage?: string;
  requires?: {
    bins?: string[];
    anyBins?: string[];
    env?: string[];
    config?: string[];
  };
  install?: SkillInstallOption[];
  tags?: string[];
  always?: boolean;
  os?: ('darwin' | 'linux' | 'windows')[];
}

export interface SkillInstallOption {
  id: string;
  kind: 'brew' | 'apt' | 'npm' | 'manual';
  package?: string;
  formula?: string;
  bins?: string[];
  label?: string;
}

export interface SkillFrontmatter {
  name: string;
  description: string;
  homepage?: string;
  metadata?: SkillMetadata;
  'user-invocable'?: boolean;
  'disable-model-invocation'?: boolean;
}

export interface Skill {
  name: string;
  description: string;
  homepage?: string;
  metadata?: SkillMetadata;
  content: string;
  path: string;
  frontmatter: SkillFrontmatter;
}

export interface SkillLoadOptions {
  /** Check if required binaries exist */
  checkBinaries?: boolean;
  /** Check if required env vars exist */
  checkEnv?: boolean;
  /** Filter by skill names */
  filter?: string[];
  /** Include disabled skills */
  includeDisabled?: boolean;
}

export interface SkillEligibility {
  eligible: boolean;
  reason?: string;
  missingBins?: string[];
  missingEnv?: string[];
}
