import { describe, expect, test } from 'bun:test';
import { assessPods } from './verify';

const pod = (name: string, opts: { ready?: boolean; phase?: string; restarts?: number } = {}) => ({
  metadata: { name },
  status: {
    phase: opts.phase ?? 'Running',
    containerStatuses: [{ ready: opts.ready ?? true, restartCount: opts.restarts ?? 0 }],
  },
});

describe('assessPods', () => {
  test('healthy when all pods Running and containers ready', () => {
    const verdict = assessPods([pod('a'), pod('b')]);
    expect(verdict.healthy).toBe(true);
    expect(verdict.summary).toContain('2/2');
  });

  test('unhealthy when a container is not ready', () => {
    const verdict = assessPods([pod('a'), pod('b', { ready: false })]);
    expect(verdict.healthy).toBe(false);
    expect(verdict.summary).toContain('b');
  });

  test('unhealthy on non-Running phase (Pending/CrashLoopBackOff surface as phase or readiness)', () => {
    expect(assessPods([pod('a', { phase: 'Pending', ready: false })]).healthy).toBe(false);
  });

  test('empty namespace is unhealthy (nothing running is not success)', () => {
    expect(assessPods([]).healthy).toBe(false);
  });

  test('succeeded jobs count as healthy completions', () => {
    expect(assessPods([pod('job-x', { phase: 'Succeeded', ready: false })]).healthy).toBe(true);
  });
});

describe('assessContainer', () => {
  const { assessContainer } = require('./verify');
  const c = (status: string, health?: string, restarts = 0) => ({
    State: { Status: status, Health: health ? { Status: health } : undefined },
    RestartCount: restarts,
    Name: '/web',
  });

  test('running with healthy healthcheck is healthy', () => {
    expect(assessContainer(c('running', 'healthy')).healthy).toBe(true);
  });

  test('running with no healthcheck is healthy', () => {
    expect(assessContainer(c('running')).healthy).toBe(true);
  });

  test('running but unhealthy healthcheck fails', () => {
    expect(assessContainer(c('running', 'unhealthy')).healthy).toBe(false);
  });

  test('exited and restarting fail', () => {
    expect(assessContainer(c('exited')).healthy).toBe(false);
    expect(assessContainer(c('restarting')).healthy).toBe(false);
  });
});
