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
    expect(yaml).toContain('.goose/skills/k8s-pod-restart-triage/SKILL.md');
    expect(yaml).toContain('k8s-pod-restart-triage');
    // shell tool available via developer extension
    expect(yaml).toContain('name: developer');
    expect(yaml).toContain('available_tools: [shell]');
    // safety rules baked in
    expect(yaml).toContain('Never delete namespaces');
    // non-interactive: prompt itself carries full directives (ACP bridge can
    // dilute instructions) and forbids asking the user anything
    const promptSection = yaml.slice(yaml.indexOf('prompt:'));
    expect(promptSection).toContain('non-interactive');
    expect(promptSection).toContain('Do not ask');
    expect(promptSection).toContain('diagnose');
    expect(promptSection).toContain('{{ namespace }}');
  });

  test('different skill name lands in instructions and prompt', () => {
    const yaml = renderRecipe({ skill: 'k8s-imagepull-triage' });
    expect(yaml).toContain('k8s-imagepull-triage');
    expect(yaml).not.toContain('k8s-pod-restart-triage');
  });

  test('docker profile: target parameter, docker rules, no kubectl text', () => {
    const yaml = renderRecipe({ skill: 'docker-container-triage', profile: 'docker' });
    expect(yaml).toContain('key: target');
    expect(yaml).toContain('{{ target }}');
    expect(yaml).not.toContain('{{ namespace }}');
    expect(yaml).not.toContain('kubectl');
    expect(yaml).toContain('Never remove containers');
    expect(yaml).toContain('docker-container-triage');
    expect(yaml).toContain('non-interactive');
  });

  test('default profile stays k8s (backward compatible)', () => {
    const yaml = renderRecipe({ skill: 'k8s-pod-restart-triage' });
    expect(yaml).toContain('key: namespace');
    expect(yaml).toContain('kubectl');
  });
});
