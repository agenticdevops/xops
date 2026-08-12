/**
 * Fail-closed command guard, two gates (both must pass):
 *   1. Skill grant — the active runbook declares the verbs it needs
 *      (human-approved at skill-authoring time).
 *   2. Tier ceiling — CRITICAL commands (risk taxonomy) are denied in every
 *      mode, even if a skill mistakenly grants them.
 * Hardened per 2026-08-12 security review:
 *   - leading flags before the verb are DENIED outright (flag-swallow tricks
 *     like `docker --debug rm restart x` made classification land on an
 *     argument; fail-closed beats heuristics)
 *   - kubectl --kubeconfig/--context anywhere in args are denied (cluster
 *     escape past the scoped-credential boundary)
 *   - docker mutation verbs are pinned to the run's target container
 * The shim runs as the same user as the agent, so it is defense-in-depth
 * ONLY. The hard boundary is the scoped credential (RBAC kubeconfig for k8s;
 * docker currently has none — see SECURITY docs).
 */
import { classify, type RiskTier } from './risk';

export interface GuardDecision {
  allowed: boolean;
  reason: string;
  tier?: RiskTier;
}

export interface CommandRequest {
  tool: string;
  args: string[];
  skillGrants: string[];
  namespace?: string; // required pinning for kubectl
  /** docker profile: mutations must name this container */
  target?: string;
}

const DEFAULT_K8S_GRANTS = ['get', 'describe', 'logs', 'patch', 'set', 'rollout', 'scale', 'top', 'events'];

/** kubectl flags allowed to precede the verb (value-taking namespace forms). */
const K8S_SAFE_LEADING = new Set(['-n', '--namespace']);

const DOCKER_MUTATION_VERBS = new Set(['restart', 'start', 'stop', 'kill', 'pause', 'unpause', 'update', 'exec', 'attach', 'cp']);

export function evaluateCommand(req: CommandRequest): GuardDecision {
  const { tool, args, skillGrants } = req;
  if (args.length === 0) return { allowed: false, reason: 'empty command' };

  // cluster-escape flags: denied wherever they appear
  if (tool === 'kubectl') {
    for (const a of args) {
      if (a === '--kubeconfig' || a.startsWith('--kubeconfig=') || a === '--context' || a.startsWith('--context=')) {
        return { allowed: false, reason: `flag "${a.split('=')[0]}" denied — cluster escape past scoped credential` };
      }
    }
  }

  // leading flags: fail-closed. Only kubectl's namespace flags may precede
  // the verb; anything else is denied rather than skipped-over.
  let i = 0;
  while (i < args.length && args[i].startsWith('-')) {
    const flag = args[i];
    if (tool === 'kubectl' && (K8S_SAFE_LEADING.has(flag) || flag.startsWith('--namespace=') || flag.startsWith('-n='))) {
      i += flag.includes('=') ? 1 : 2;
      continue;
    }
    return { allowed: false, reason: `leading flag "${flag}" before command verb denied (fail-closed)` };
  }
  const words = args.slice(i);
  if (words.length === 0) return { allowed: false, reason: 'no command verb found' };

  const { tier, matched } = classify(tool, words);

  if (tier === 'CRITICAL') {
    return { allowed: false, tier, reason: `CRITICAL command denied (${matched ?? tool}) — no mode permits this` };
  }

  const grantKey = matched ?? words[0];
  const grantedSet = new Set(skillGrants);
  const granted = grantedSet.has(grantKey) || grantedSet.has(grantKey.split(' ')[0]);
  if (!granted) {
    return { allowed: false, tier, reason: `command "${grantKey}" not granted by active skill` };
  }

  if (tool === 'kubectl') {
    const nsDecision = checkNamespacePinning(args, req.namespace);
    if (nsDecision) return { ...nsDecision, tier };
  }

  if (tool === 'docker' && req.target) {
    const verb = grantKey.split(' ').pop() ?? grantKey;
    if (DOCKER_MUTATION_VERBS.has(verb)) {
      const named = words.slice(1).some((w) => !w.startsWith('-') && (w === req.target || w.startsWith(req.target)));
      if (!named) {
        return { allowed: false, tier, reason: `mutation "${grantKey}" does not name pinned target "${req.target}"` };
      }
    }
  }

  return { allowed: true, tier, reason: `ok (${tier})` };
}

/** Back-compat wrapper used by tests and the kubectl shim. */
export function evaluateKubectl(args: string[], allowedNamespace: string, grants: string[] = DEFAULT_K8S_GRANTS): GuardDecision {
  return evaluateCommand({ tool: 'kubectl', args, skillGrants: grants, namespace: allowedNamespace });
}

function checkNamespacePinning(args: string[], allowedNamespace?: string): GuardDecision | null {
  if (!allowedNamespace) return { allowed: false, reason: 'no pinned namespace configured (fail-closed)' };
  if (args.includes('--all-namespaces') || args.includes('-A')) {
    return { allowed: false, reason: 'cross-namespace access denied (namespace pinning)' };
  }
  let namespace: string | null = null;
  for (let idx = 0; idx < args.length; idx++) {
    const a = args[idx];
    if (a === '-n' || a === '--namespace') namespace = args[idx + 1] ?? null;
    else if (a.startsWith('--namespace=')) namespace = a.slice('--namespace='.length);
    else if (a.startsWith('-n=')) namespace = a.slice('-n='.length);
  }
  if (namespace !== allowedNamespace) {
    return { allowed: false, reason: `namespace "${namespace ?? '(none)'}" not pinned namespace "${allowedNamespace}"` };
  }
  return null;
}
