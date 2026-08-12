/**
 * Goose recipe generation. Template adapted from openagentix
 * recipes/fix-workload-slim.yaml (load_skill convention).
 * Profiles select the parameter and tool rules baked into the recipe.
 */

export type EngineProfile = 'k8s' | 'docker';

export interface RecipeOptions {
  skill: string;
  title?: string;
  profile?: EngineProfile;
}

interface ProfileTemplate {
  paramKey: string;
  paramDescription: string;
  subject: string; // what is unhealthy
  rules: string;
}

const PROFILES: Record<EngineProfile, ProfileTemplate> = {
  k8s: {
    paramKey: 'namespace',
    paramDescription: 'Kubernetes namespace to operate on',
    subject: 'Workloads in namespace {{ namespace }} are unhealthy',
    rules:
      'kubectl in namespace {{ namespace }} only. Never delete namespaces,\n  deployments, PVCs, or secrets.',
  },
  docker: {
    paramKey: 'target',
    paramDescription: 'Docker container name or name pattern to operate on',
    subject: 'Docker container {{ target }} is unhealthy',
    rules:
      'docker commands against container {{ target }} only. Never remove containers,\n  images, volumes, or networks (rm/rmi/prune are never permitted).',
  },
};

export function renderRecipe(opts: RecipeOptions): string {
  const profile = PROFILES[opts.profile ?? 'k8s'];
  const title = opts.title ?? `Run skill ${opts.skill}`;
  const p = `{{ ${profile.paramKey} }}`;
  return `version: 1.0.0
title: ${title}
description: OpsPilot-generated recipe driving the ${opts.skill} skill
parameters:
  - key: ${profile.paramKey}
    input_type: string
    requirement: required
    description: ${profile.paramDescription}
instructions: |
  You are an SRE agent. ${profile.subject}.
  STEP 1 - Read the runbook NOW with the shell tool:
    cat .goose/skills/${opts.skill}/SKILL.md
    It contains the procedure, decision table, and escalation criteria.
    Do not use any skill-loading tool; read the file directly.
  STEP 2 - Run the runbook's diagnose script with the shell tool; read its JSON.
  STEP 3 - Match evidence to the decision table and RUN the mapped fix command.
    A description is not a fix - you must execute the command.
  STEP 4 - Verify per the skill's procedure before reporting.
  Rules: ${profile.rules} Only escalate after an applied fix fails
  verification twice.
extensions:
  - type: builtin
    name: developer
    timeout: 300
    bundled: true
    available_tools: [shell]
prompt: |
  This is a non-interactive automated run. There is no human available.
  Do not ask questions - if information is missing, obtain it yourself with
  the shell tool. ${profile.subject}.
  1. Read the runbook with shell: cat .goose/skills/${opts.skill}/SKILL.md
     (do not use skill-loading tools; the file is in the working directory).
  2. Run its diagnose script against ${p} and read the JSON. The script is at
     .goose/skills/${opts.skill}/scripts/diagnose.sh
  3. Match evidence to the runbook's decision table and EXECUTE the mapped
     fix. A description is not a fix.
  4. Verify per the runbook's procedure, then report: root cause, fix applied,
     exact commands, verification result.
`;
}
