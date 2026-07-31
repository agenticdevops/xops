/**
 * Independent post-run verification (openagentix bench/verify.sh discipline):
 * pass/fail comes from actual cluster state, never from the model's report.
 */
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

interface PodLike {
  metadata?: { name?: string };
  status?: {
    phase?: string;
    containerStatuses?: Array<{ ready?: boolean; restartCount?: number }>;
  };
}

export interface Verdict {
  healthy: boolean;
  summary: string;
}

export function assessPods(pods: PodLike[]): Verdict {
  if (pods.length === 0) return { healthy: false, summary: 'no pods found in namespace' };

  const unhealthy: string[] = [];
  let ok = 0;
  for (const p of pods) {
    const name = p.metadata?.name ?? '(unnamed)';
    const phase = p.status?.phase ?? 'Unknown';
    if (phase === 'Succeeded') {
      ok++;
      continue;
    }
    const containersReady = (p.status?.containerStatuses ?? []).every((c) => c.ready === true);
    if (phase === 'Running' && containersReady) ok++;
    else unhealthy.push(`${name} (${phase}${containersReady ? '' : ', not ready'})`);
  }

  return unhealthy.length === 0
    ? { healthy: true, summary: `${ok}/${pods.length} pods healthy` }
    : { healthy: false, summary: `unhealthy: ${unhealthy.join(', ')} (${ok}/${pods.length} ok)` };
}

export async function verifyNamespace(namespace: string, kubeconfig?: string): Promise<Verdict> {
  try {
    const env = kubeconfig ? { ...process.env, KUBECONFIG: kubeconfig } : process.env;
    const { stdout } = await execFileAsync(
      'kubectl',
      ['get', 'pods', '-n', namespace, '-o', 'json'],
      { env, timeout: 30_000 },
    );
    const pods = (JSON.parse(stdout).items ?? []) as PodLike[];
    return assessPods(pods);
  } catch (err) {
    return { healthy: false, summary: `verification failed to run: ${(err as Error).message}` };
  }
}
