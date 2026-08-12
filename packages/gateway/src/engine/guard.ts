/**
 * Fail-closed command guard, two gates (both must pass):
 *   1. Skill grant — the active runbook declares the verbs it needs
 *      (human-approved at skill-authoring time).
 *   2. Tier ceiling — CRITICAL commands (risk taxonomy) are denied in every
 *      mode, even if a skill mistakenly grants them.
 * kubectl additionally gets namespace pinning. Scoped credentials (RBAC
 * kubeconfig) remain the hard boundary; this shim is defense-in-depth.
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
}

const DEFAULT_K8S_GRANTS = ['get', 'describe', 'logs', 'patch', 'set', 'rollout', 'scale', 'top', 'events'];

export function evaluateCommand(req: CommandRequest): GuardDecision {
  const { tool, args, skillGrants } = req;
  if (args.length === 0) return { allowed: false, reason: 'empty command' };

  const { tier, matched } = classify(tool, args);

  if (tier === 'CRITICAL') {
    return { allowed: false, tier, reason: `CRITICAL command denied (${matched ?? tool}) — no mode permits this` };
  }

  // grant gate: the classified command word must be granted by the skill
  const grantKey = matched ?? firstCommandWord(args);
  const grantedSet = new Set(skillGrants);
  const granted = grantKey !== null && (grantedSet.has(grantKey) || grantedSet.has(grantKey.split(' ')[0]));
  if (!granted) {
    return { allowed: false, tier, reason: `command "${grantKey ?? '(none)'}" not granted by active skill` };
  }

  if (tool === 'kubectl') {
    const nsDecision = checkNamespacePinning(args, req.namespace);
    if (nsDecision) return { ...nsDecision, tier };
  }

  return { allowed: true, tier, reason: `ok (${tier})` };
}

/** Back-compat wrapper used by the kubectl shim. */
export function evaluateKubectl(args: string[], allowedNamespace: string, grants: string[] = DEFAULT_K8S_GRANTS): GuardDecision {
  return evaluateCommand({ tool: 'kubectl', args, skillGrants: grants, namespace: allowedNamespace });
}

function firstCommandWord(args: string[]): string | null {
  let i = 0;
  while (i < args.length && args[i].startsWith('-')) {
    i += args[i].includes('=') ? 1 : 2;
  }
  return args[i] ?? null;
}

function checkNamespacePinning(args: string[], allowedNamespace?: string): GuardDecision | null {
  if (!allowedNamespace) return { allowed: false, reason: 'no pinned namespace configured (fail-closed)' };
  if (args.includes('--all-namespaces') || args.includes('-A')) {
    return { allowed: false, reason: 'cross-namespace access denied (namespace pinning)' };
  }
  let namespace: string | null = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-n' || a === '--namespace') namespace = args[i + 1] ?? null;
    else if (a.startsWith('--namespace=')) namespace = a.slice('--namespace='.length);
    else if (a.startsWith('-n=')) namespace = a.slice('-n='.length);
  }
  if (namespace !== allowedNamespace) {
    return { allowed: false, reason: `namespace "${namespace ?? '(none)'}" not pinned namespace "${allowedNamespace}"` };
  }
  return null;
}
