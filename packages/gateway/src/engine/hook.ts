/**
 * Parse guarded-tool invocations out of a raw shell command string, for the
 * Claude Code PreToolUse Bash hook used on the claude-acp provider (where the
 * agent runs commands through Claude Code's Terminal, not goose's PATH-shimmed
 * shell).
 *
 * A command may be a pipeline or sequence of stages. Every stage that invokes
 * the guarded tool is evaluated against policy; benign filter stages (head,
 * jq, grep, ...) are ignored — they cannot invoke the guarded tool. I/O
 * redirects only affect a single stage's streams and are stripped. Genuine
 * hiding — command substitution `$()`, backticks, or the tool wrapped so it is
 * not a clean stage leader (`sh -c '...'`, `env docker ...`) — is denied
 * fail-closed.
 */
import { evaluateCommand, type GuardDecision } from './guard';

export type ParsedCommands =
  | { kind: 'none' } // no guarded tool referenced — runs unguarded, same as the PATH shim
  | { kind: 'invocations'; list: string[][] } // one arg-list per guarded stage
  | { kind: 'unparseable'; reason: string }; // guarded tool present but hidden/obfuscated → deny

/**
 * Whole-word match where `-` counts as part of the word, so `docker` does NOT
 * match `docker-compose`/`dockerize`, but DOES match the tool inside quotes
 * (e.g. `sh -c 'docker ...'`) so wrapped invocations are still detected.
 */
function referencesToolWord(text: string, tool: string): boolean {
  const esc = tool.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\w-])${esc}(?![\\w-])`).test(text);
}

interface Lexed {
  stages: string[][]; // command words per stage; redirect plumbing stripped
  deny: boolean; // saw command substitution / backtick / escape — can hide a call
}

/** Split into stages on unquoted `| ; && || &`, honoring quotes; strip redirects. */
function lex(command: string): Lexed {
  const stages: string[][] = [];
  let stage: string[] = [];
  let cur = '';
  let has = false;
  let deny = false;
  let redirected = false; // past the first redirect in this stage: stop collecting args
  let quote: "'" | '"' | null = null;

  const pushToken = () => {
    if (has && !redirected) stage.push(cur);
    cur = '';
    has = false;
  };
  const endStage = () => {
    pushToken();
    if (stage.length) stages.push(stage);
    stage = [];
    redirected = false;
  };

  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    const next = command[i + 1];
    if (quote) {
      if (c === quote) quote = null;
      else {
        cur += c;
        has = true;
      }
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      has = true;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\n') {
      pushToken();
      continue;
    }
    if (c === '|') {
      endStage();
      if (next === '|') i++; // ||
      continue;
    }
    if (c === ';') {
      endStage();
      continue;
    }
    if (c === '&') {
      if (next === '&') {
        endStage();
        i++;
        continue;
      }
      if (next === '>') {
        // &> redirect
        pushToken();
        redirected = true;
        i++;
        continue;
      }
      endStage(); // lone & (background) separates commands
      continue;
    }
    if (c === '>' || c === '<') {
      if (has && /^\d+$/.test(cur)) {
        cur = '';
        has = false; // drop a bare fd number (2>, 1>) — plumbing, not an arg
      } else {
        pushToken();
      }
      redirected = true;
      if (next === c) i++; // >>
      else if (next === '&') i++; // >& / 2>&1 fd-dup
      continue;
    }
    if (c === '`' || c === '$' || c === '(' || c === ')' || c === '\\') {
      deny = true; // substitution / subshell / escape
      continue;
    }
    cur += c;
    has = true;
  }
  endStage();
  return { stages, deny };
}

export function parseGuardedCommands(command: string, tool: string): ParsedCommands {
  if (!referencesToolWord(command, tool)) return { kind: 'none' };
  const { stages, deny } = lex(command);
  if (deny) return { kind: 'unparseable', reason: `command substitution referencing ${tool}` };

  const list: string[][] = [];
  for (const tokens of stages) {
    if (tokens.length === 0) continue;
    if (tokens[0] === tool) {
      list.push(tokens.slice(1));
    } else if (tokens.some((t) => referencesToolWord(t, tool))) {
      return { kind: 'unparseable', reason: `${tool} is wrapped / not a clean command (obfuscation)` };
    }
  }
  if (list.length === 0) return { kind: 'none' };
  return { kind: 'invocations', list };
}

export interface HookPolicy {
  tool: string;
  grants: string[];
  namespace?: string;
  target?: string;
}

const TIER_RANK: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

/**
 * Decide allow/deny for a Claude Code Bash command on the claude-acp path.
 * Non-guarded commands run unguarded (parity with the PATH shim). Every
 * guarded stage is evaluated by the same `evaluateCommand` policy as the shim;
 * the command is allowed only if ALL guarded stages are allowed. The returned
 * tier is the highest among the allowed stages (for logging/verify signals).
 */
export function hookDecision(command: string, policy: HookPolicy): GuardDecision {
  const parsed = parseGuardedCommands(command, policy.tool);
  if (parsed.kind === 'none') return { allowed: true, reason: 'no guarded tool' };
  if (parsed.kind === 'unparseable') return { allowed: false, reason: parsed.reason };

  let best: GuardDecision = { allowed: true, reason: 'ok', tier: 'LOW' };
  for (const args of parsed.list) {
    const d = evaluateCommand({
      tool: policy.tool,
      args,
      skillGrants: policy.grants,
      namespace: policy.namespace,
      target: policy.target,
    });
    if (!d.allowed) return d;
    if (d.tier && (TIER_RANK[d.tier] ?? 0) >= (TIER_RANK[best.tier ?? 'LOW'] ?? 0)) best = d;
  }
  return best;
}
