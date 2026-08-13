export type Platform = 'k8s' | 'docker';

export interface Bot {
  name: string;        // stable id, e.g. 'k8s-sre'
  display: string;     // human name, e.g. 'Kubernetes SRE Bot'
  description: string; // one line, shown in /bots
  platform: Platform;  // tool + credential + verify strategy
  skills: string[];    // executable runbooks this bot owns
  identity?: string;   // future: persona voice (unused this phase)
}

export interface Project {
  name: string;
  scope: string;        // namespace (k8s) or container name/pattern (docker)
  kubeconfig?: string;  // scoped credential path (k8s)
  brief?: string;       // tech stack / responsibilities context
}

export const BUNDLED_BOTS: Bot[] = [
  {
    name: 'k8s-sre',
    display: 'Kubernetes SRE Bot',
    description: 'Diagnoses and fixes unhealthy Kubernetes workloads (crashloops, probes, OOM).',
    platform: 'k8s',
    skills: ['k8s-pod-restart-triage'],
  },
  {
    name: 'docker-ops',
    display: 'Docker Ops Bot',
    description: 'Diagnoses and fixes unhealthy Docker containers.',
    platform: 'docker',
    skills: ['docker-container-triage'],
  },
];

export function listBots(): Bot[] {
  return BUNDLED_BOTS;
}

export function getBot(name: string): Bot | undefined {
  return BUNDLED_BOTS.find((b) => b.name === name);
}
