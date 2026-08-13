/**
 * Command guard — tier/category policy, general-purpose (not scoped to one
 * container/namespace, no per-skill grant list):
 *
 *   read      (LOW)          → allow          (no side effects)
 *   write     (MEDIUM/HIGH)  → mode-gated     (auto = allow, safe = block,
 *                                              ask = pending approval [future])
 *   dangerous (CRITICAL)     → block always
 *
 * Categorization is by the risk taxonomy at SUBCOMMAND granularity
 * (`kubectl config view` = read vs `kubectl config set-context` = write;
 * `docker system df` = read vs `docker system prune` = dangerous).
 *
 * Verb detection tolerates leading global flags but never lets one hide a
 * dangerous verb: known value-taking flags (`-n ns`, `--context c`) skip their
 * value; any other leading flag is treated as boolean (skip one token), so a
 * hidden verb like `docker --debug rm x` still surfaces as the verb and is
 * classified/blocked.
 *
 * Same-user process, so this is defense-in-depth. The hard boundary for k8s is
 * the RBAC-scoped kubeconfig; docker has none (see SECURITY docs).
 */
import { classify, type RiskTier } from './risk';

export type GuardMode = 'auto' | 'safe'; // future: 'ask' (interactive approval)
export type Category = 'read' | 'write' | 'dangerous';

export interface GuardDecision {
  allowed: boolean;
  reason: string;
  tier?: RiskTier;
  category?: Category;
}

export interface CommandRequest {
  tool: string;
  args: string[];
  mode?: GuardMode; // default 'auto'
}

/** Leading global flags that take a following value, per tool. */
const VALUE_FLAGS: Record<string, Set<string>> = {
  kubectl: new Set(['-n', '--namespace', '--context', '--kubeconfig', '--cluster', '--user', '--as', '--token', '--server']),
  docker: new Set(['-H', '--host', '--context', '--config', '--log-level', '-l', '--tlscacert', '--tlscert', '--tlskey']),
};

export function categoryFor(tier: RiskTier): Category {
  if (tier === 'CRITICAL') return 'dangerous';
  if (tier === 'LOW') return 'read';
  return 'write'; // MEDIUM | HIGH
}

/** Strip leading global flags to find the command verb (see file header). */
function commandWords(tool: string, args: string[]): string[] {
  const valueFlags = VALUE_FLAGS[tool] ?? new Set<string>();
  let i = 0;
  while (i < args.length && args[i].startsWith('-')) {
    const flag = args[i];
    if (flag.includes('=')) {
      i += 1; // --flag=value is self-contained
    } else if (valueFlags.has(flag)) {
      i += 2; // known value-taking flag consumes its value
    } else {
      i += 1; // unknown leading flag: treat as boolean so it can't hide the verb
    }
  }
  return args.slice(i);
}

export function evaluateCommand(req: CommandRequest): GuardDecision {
  const { tool, args } = req;
  const mode: GuardMode = req.mode ?? 'auto';
  if (args.length === 0) return { allowed: false, reason: 'empty command' };

  const words = commandWords(tool, args);
  if (words.length === 0) return { allowed: false, reason: 'no command verb found (only flags)' };

  const { tier, matched } = classify(tool, words);
  const category = categoryFor(tier);
  const what = matched ?? words[0];

  if (category === 'dangerous') {
    return { allowed: false, tier, category, reason: `dangerous command blocked: ${tool} ${what} (${tier})` };
  }
  if (category === 'read') {
    return { allowed: true, tier, category, reason: `read allowed: ${tool} ${what}` };
  }
  // write
  if (mode === 'auto') {
    return { allowed: true, tier, category, reason: `write allowed (auto mode): ${tool} ${what}` };
  }
  return { allowed: false, tier, category, reason: `write blocked in safe mode (needs approval): ${tool} ${what}` };
}
