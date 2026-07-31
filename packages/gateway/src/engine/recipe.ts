/**
 * Goose recipe generation. Template adapted from openagentix
 * recipes/fix-workload-slim.yaml (load_skill convention).
 */

export interface RecipeOptions {
  skill: string;
  title?: string;
}

export function renderRecipe(opts: RecipeOptions): string {
  const title = opts.title ?? `Run skill ${opts.skill}`;
  return `version: 1.0.0
title: ${title}
description: OpsPilot-generated recipe driving the ${opts.skill} skill
parameters:
  - key: namespace
    input_type: string
    requirement: required
    description: Kubernetes namespace to operate on
instructions: |
  You are an SRE agent operating on namespace {{ namespace }}.
  STEP 1 - Call load_skill NOW with name "${opts.skill}". It gives you the
    diagnose script, procedure, and decision table.
  STEP 2 - Run the skill's diagnose script with the shell tool; read its JSON.
  STEP 3 - Match evidence to the decision table and RUN the mapped kubectl fix.
    A description is not a fix - you must execute the kubectl command.
  STEP 4 - Verify per the skill's procedure before reporting.
  Rules: kubectl in namespace {{ namespace }} only. Never delete namespaces,
  deployments, PVCs, or secrets. Only escalate after an applied fix fails
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
  the shell tool. Workloads in namespace {{ namespace }} are unhealthy.
  1. Load the skill "${opts.skill}" now.
  2. Run its diagnose script against namespace {{ namespace }} and read the JSON.
  3. Match evidence to the skill's decision table and EXECUTE the mapped
     kubectl fix. A description is not a fix.
  4. Verify pods become Ready and restarts stay stable, then report: root
     cause, fix applied, exact commands, verification result.
`;
}
