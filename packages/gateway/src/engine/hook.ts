/**
 * Parse a guarded-tool invocation out of a raw shell command string, for the
 * Claude Code PreToolUse Bash hook used on the claude-acp provider (where the
 * agent runs commands through Claude Code's Terminal, not goose's PATH-shimmed
 * shell). Fail-closed: anything compound or obfuscated that references the
 * guarded tool is reported unparseable so the hook can deny it.
 */

import { evaluateCommand, type GuardDecision } from './guard';

export type ParsedCommand =
  | { kind: 'none' } // no guarded tool referenced — runs unguarded, same as the PATH shim
  | { kind: 'invocation'; args: string[] } // a single clean `<tool> args...` invocation
  | { kind: 'unparseable'; reason: string }; // guarded tool present but can't be isolated → deny

interface Lexed {
  tokens: string[]; // command words up to the first I/O redirect
  compound: boolean; // saw an unquoted command-chaining / substitution operator
}

/**
 * Split on unquoted whitespace, honoring single/double quotes.
 * - `compound` flags genuine chaining/substitution: `&&`, `||`, `;`, `|`,
 *   backtick, `$`, subshell `()`, a standalone `&`, or `\` — any of which can
 *   run or hide a SECOND command. These are denied.
 * - I/O redirects (`>`, `>>`, `<`, `2>&1`, `&>`, `2>/dev/null`) only affect the
 *   single command's streams. They are NOT compound; arg collection stops at
 *   the first redirect (the rest is stream plumbing), but scanning continues so
 *   a chaining operator after a redirect (`> x && rm`) is still caught.
 */
function lex(command: string): Lexed {
  const tokens: string[] = [];
  let cur = '';
  let has = false;
  let compound = false;
  let redirected = false; // past the first redirect: stop collecting args, keep scanning
  let quote: "'" | '"' | null = null;

  const push = () => {
    if (has && !redirected) tokens.push(cur);
    cur = '';
    has = false;
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
      push();
      continue;
    }
    // chaining / substitution → compound (deny)
    if (c === ';' || c === '|' || c === '`' || c === '$' || c === '(' || c === ')' || c === '\\' || c === '\n') {
      compound = true;
      continue;
    }
    if (c === '&') {
      if (next === '>') {
        // &> redirect
        push();
        redirected = true;
        i++;
        continue;
      }
      // && or standalone & (background/chain) → compound
      compound = true;
      if (next === '&') i++;
      continue;
    }
    if (c === '>' || c === '<') {
      // redirect (incl. >>, >&, 2>&1). A preceding fd digit (2>, 1>) is already in cur.
      if (has && /^\d+$/.test(cur)) {
        cur = '';
        has = false; // drop the bare fd number, it's plumbing not an arg
      } else {
        push();
      }
      redirected = true;
      if (next === c) i++; // >>
      else if (next === '&') i++; // >& / 2>&1 fd-dup — consume the &, the fd digit after is dropped as plumbing
      continue;
    }
    cur += c;
    has = true;
  }
  push();
  return { tokens, compound };
}

/**
 * Whole-word match where `-` counts as part of the word, so `docker` does NOT
 * match `docker-compose`/`dockerize`, but DOES match the tool inside quotes
 * (e.g. `sh -c 'kubectl ...'`) so obfuscated invocations are still detected.
 */
function referencesToolWord(command: string, tool: string): boolean {
  const esc = tool.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\w-])${esc}(?![\\w-])`).test(command);
}

export function parseGuardedCommand(command: string, tool: string): ParsedCommand {
  if (!referencesToolWord(command, tool)) return { kind: 'none' };
  const { tokens, compound } = lex(command);
  if (compound) return { kind: 'unparseable', reason: `compound command referencing ${tool}` };
  if (tokens[0] !== tool) return { kind: 'unparseable', reason: `${tool} is not the leading command (wrapper/obfuscation)` };
  return { kind: 'invocation', args: tokens.slice(1) };
}

export interface HookPolicy {
  tool: string;
  grants: string[];
  namespace?: string;
  target?: string;
}

/**
 * Decide allow/deny for a Claude Code Bash command on the claude-acp path.
 * A command that does not reference the guarded tool runs unguarded (parity
 * with the PATH shim). A clean guarded invocation is evaluated by the same
 * `evaluateCommand` policy as the shim. Compound/obfuscated commands that
 * reference the tool are denied (fail-closed).
 */
export function hookDecision(command: string, policy: HookPolicy): GuardDecision {
  const parsed = parseGuardedCommand(command, policy.tool);
  if (parsed.kind === 'none') return { allowed: true, reason: 'no guarded tool' };
  if (parsed.kind === 'unparseable') return { allowed: false, reason: parsed.reason };
  return evaluateCommand({
    tool: policy.tool,
    args: parsed.args,
    skillGrants: policy.grants,
    namespace: policy.namespace,
    target: policy.target,
  });
}
