import { describe, expect, test } from 'bun:test';
import { renderRecipe } from './recipe';

describe('renderRecipe', () => {
  test('renders a goose recipe for a skill with namespace parameter', () => {
    const yaml = renderRecipe({
      skill: 'k8s-pod-restart-triage',
      title: 'Fix Unhealthy Workload',
    });

    expect(yaml).toContain('version: 1.0.0');
    expect(yaml).toContain('title: Fix Unhealthy Workload');
    // namespace declared as required recipe parameter, referenced via template
    expect(yaml).toContain('key: namespace');
    expect(yaml).toContain('requirement: required');
    expect(yaml).toContain('{{ namespace }}');
    // load_skill convention: instructions direct the agent to load the skill first
    expect(yaml).toContain('load_skill');
    expect(yaml).toContain('k8s-pod-restart-triage');
    // shell tool available via developer extension
    expect(yaml).toContain('name: developer');
    expect(yaml).toContain('available_tools: [shell]');
    // safety rules baked in
    expect(yaml).toContain('Never delete namespaces');
  });

  test('different skill name lands in instructions and prompt', () => {
    const yaml = renderRecipe({ skill: 'k8s-imagepull-triage' });
    expect(yaml).toContain('k8s-imagepull-triage');
    expect(yaml).not.toContain('k8s-pod-restart-triage');
  });
});
