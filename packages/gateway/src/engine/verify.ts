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

interface ContainerInspect {
  Name?: string;
  State?: { Status?: string; Health?: { Status?: string } };
  RestartCount?: number;
}

export function assessContainer(c: ContainerInspect): Verdict {
  const name = (c.Name ?? '(unnamed)').replace(/^\//, '');
  const status = c.State?.Status ?? 'unknown';
  const health = c.State?.Health?.Status;

  if (status !== 'running') return { healthy: false, summary: `${name} is ${status}` };
  if (health && health !== 'healthy') return { healthy: false, summary: `${name} running but ${health}` };
  return { healthy: true, summary: `${name} running${health ? ' and healthy' : ''}` };
}

export async function verifyContainer(pattern: string): Promise<Verdict> {
  try {
    const { stdout: id } = await execFileAsync('docker', ['ps', '-a', '--filter', `name=${pattern}`, '--format', '{{.ID}}'], {
      timeout: 15_000,
    });
    const cid = id.trim().split('\n')[0];
    if (!cid) return { healthy: false, summary: `no container matching "${pattern}"` };
    const { stdout } = await execFileAsync('docker', ['inspect', cid], { timeout: 15_000 });
    return assessContainer(JSON.parse(stdout)[0] as ContainerInspect);
  } catch (err) {
    return { healthy: false, summary: `verification failed to run: ${(err as Error).message}` };
  }
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
