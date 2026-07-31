/**
 * OpsPilot execution engine: goose subprocess + fail-closed guard +
 * independent verification. Reply is composed from the agent's report AND
 * an independent cluster-state verdict — never the report alone.
 */
import { join } from 'path';
import { runGooseSkill, type EngineRunOptions } from './goose';
import { verifyNamespace } from './verify';

export { evaluateKubectl } from './guard';
export { parseGooseOutput } from './parse';
export { renderRecipe } from './recipe';
export { runGooseSkill } from './goose';
export { assessPods, verifyNamespace } from './verify';

export interface IncidentRequest {
  namespace: string;
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

export async function handleIncident(req: IncidentRequest): Promise<IncidentReply> {
  const started = Date.now();
  const skill = req.skill ?? 'k8s-pod-restart-triage';

  const outcome = await runGooseSkill({
    namespace: req.namespace,
    skill,
    workdir: join(req.workdir, `run-${req.namespace}`),
    skillsSource: req.skillsSource,
    kubeconfig: req.kubeconfig,
    timeoutMs: req.timeoutMs ?? 300_000,
  } satisfies EngineRunOptions);

  const verdict = await verifyNamespace(req.namespace, req.kubeconfig);
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
