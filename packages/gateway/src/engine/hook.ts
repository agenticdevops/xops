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
  tokens: string[];
  compound: boolean; // saw an unquoted shell control character
}

/** Split on unquoted whitespace, honoring single/double quotes; flag unquoted control chars. */
function lex(command: string): Lexed {
  const tokens: string[] = [];
  let cur = '';
  let has = false; // current token has content
  let compound = false;
  let quote: "'" | '"' | null = null;

  for (let i = 0; i < command.length; i++) {
    const c = command[i];
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
      has = true; // an empty quoted string is still a token
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\n') {
      if (has) {
        tokens.push(cur);
        cur = '';
        has = false;
      }
      continue;
    }
    if (c === '&' || c === '|' || c === ';' || c === '<' || c === '>' || c === '(' || c === ')' || c === '`' || c === '$') {
      compound = true;
      continue;
    }
    if (c === '\\') {
      // line continuation or escape — treat as obfuscation
      compound = true;
      continue;
    }
    cur += c;
    has = true;
  }
  if (has) tokens.push(cur);
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
