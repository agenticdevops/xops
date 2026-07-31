/**
 * Fail-closed kubectl argument guard (aoh kubectl-guard pattern).
 * Only allowlisted verbs pass, and only when pinned to the run's namespace.
 * The RBAC-scoped kubeconfig is the hard boundary; this is defense-in-depth.
 */

const ALLOWED_VERBS = new Set(['get', 'describe', 'logs', 'patch', 'set', 'rollout', 'scale', 'top', 'events']);

export interface GuardDecision {
  allowed: boolean;
  reason: string;
}

export function evaluateKubectl(args: string[], allowedNamespace: string): GuardDecision {
  if (args.length === 0) return { allowed: false, reason: 'empty command' };

  const verb = args[0];
  if (!ALLOWED_VERBS.has(verb)) {
    return { allowed: false, reason: `verb "${verb}" not in allowlist` };
  }

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
    return {
      allowed: false,
      reason: `namespace "${namespace ?? '(none)'}" not pinned namespace "${allowedNamespace}"`,
    };
  }

  return { allowed: true, reason: 'ok' };
}
