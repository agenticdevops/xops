/**
 * OpsPilot execution engine: goose subprocess + fail-closed guard +
 * independent verification. Reply is composed from the agent's report AND
 * an independent cluster-state verdict — never the report alone.
 */
import { join } from 'path';
import { runGooseSkill, type EngineRunOptions } from './goose';
import { verifyContainer, verifyNamespace } from './verify';
import type { EngineProfile } from './recipe';

export { evaluateCommand, evaluateKubectl } from './guard';
export { classify } from './risk';
export { parseGooseOutput } from './parse';
export { renderRecipe, type EngineProfile } from './recipe';
export { runGooseSkill } from './goose';
export { assessContainer, assessPods, verifyContainer, verifyNamespace } from './verify';

export interface IncidentRequest {
  /** namespace (k8s) or container name/pattern (docker) */
  target: string;
  profile?: EngineProfile;
  skill?: string;
  workdir: string;
  skillsSource: string;
  kubeconfig?: string;
  timeoutMs?: number;
}

export interface IncidentReply {
  reply: string;
  verified: boolean;
  wallSeconds: number;
}

const DEFAULT_SKILL: Record<EngineProfile, string> = {
  k8s: 'k8s-pod-restart-triage',
  docker: 'docker-container-triage',
};

export async function handleIncident(req: IncidentRequest): Promise<IncidentReply> {
  const started = Date.now();
  const profile = req.profile ?? 'k8s';
  const skill = req.skill ?? DEFAULT_SKILL[profile];

  const outcome = await runGooseSkill({
    target: req.target,
    profile,
    skill,
    workdir: join(req.workdir, `run-${req.target.replace(/[^a-z0-9-]/gi, '_')}`),
    skillsSource: req.skillsSource,
    kubeconfig: req.kubeconfig,
    timeoutMs: req.timeoutMs ?? 300_000,
  } satisfies EngineRunOptions);

  const verdict =
    profile === 'docker'
      ? await verifyContainer(req.target)
      : await verifyNamespace(req.target, req.kubeconfig);
  const wallSeconds = Math.round((Date.now() - started) / 1000);

  const denied = outcome.guardLog.filter((g) => g.allowed === false).length;
  const guardLine = `guard: ${outcome.guardLog.length} kubectl calls, ${denied} denied`;
  const verifyLine = verdict.healthy
    ? `✅ verified: ${verdict.summary}`
    : `⚠️ NOT verified: ${verdict.summary}`;

  const agentReport = outcome.result.finalText ?? '(agent produced no report)';
  const status = outcome.timedOut ? '⏱ run timed out. ' : '';

  return {
    reply: `${status}${agentReport}\n\n---\n${verifyLine}\n${guardLine} · ${wallSeconds}s`,
    verified: verdict.healthy,
    wallSeconds,
  };
}
