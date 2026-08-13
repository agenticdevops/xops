/**
 * CLI entry for the command guard, two modes:
 *
 *  PATH-shim mode (native goose providers): goose runs tools through a shell
 *    whose PATH we control; the generated shim calls
 *      guard-cli.ts --tool T --grants a,b --ns N --target C --log P -- <argv...>
 *    and reads ALLOW/DENY from stdout (exit 1 on deny).
 *
 *  Hook mode (claude-acp provider): Claude Code executes tools via its Bash
 *    tool, bypassing our PATH shim. A generated Claude Code PreToolUse hook
 *    calls  guard-cli.ts --hook --tool T --grants a,b --ns N --target C --log P
 *    and pipes the hook's JSON on stdin. We extract tool_input.command, decide,
 *    and signal Claude Code with exit code: 0 = allow, 2 = hard block (reason
 *    on stderr). Fail-closed: any error → exit 2 (Claude Code fails OPEN on
 *    hook crash, so we must deny explicitly, never throw).
 *
 * Policy always arrives as argv (baked into the generated shim/hook) — NEVER
 * from environment variables the guarded agent controls.
 */
import { appendFileSync, readFileSync } from 'fs';
import { evaluateCommand } from './guard';
import { hookDecision } from './hook';

const argv = process.argv.slice(2);
const sep = argv.indexOf('--');
const policyArgs = sep === -1 ? argv : argv.slice(0, sep);
const cmdArgs = sep === -1 ? [] : argv.slice(sep + 1);

function policyValue(flag: string): string {
  const i = policyArgs.indexOf(flag);
  return i !== -1 ? policyArgs[i + 1] ?? '' : '';
}

const hookMode = policyArgs.includes('--hook');
const tool = policyValue('--tool');
const grants = policyValue('--grants').split(',').filter(Boolean);
const ns = policyValue('--ns') || undefined;
const target = policyValue('--target') || undefined;
const logPath = policyValue('--log');

function log(entry: Record<string, unknown>): void {
  if (!logPath) return;
  try {
    appendFileSync(logPath, JSON.stringify({ ts: new Date().toISOString(), tool, ...entry }) + '\n');
  } catch {
    // logging must never turn a deny into a crash-open
  }
}

if (hookMode) {
  // Claude Code PreToolUse hook. Deny on ANY error (fail-closed).
  try {
    const input = JSON.parse(readFileSync(0, 'utf8')) as {
      tool_name?: string;
      tool_input?: { command?: string };
    };
    if (input.tool_name !== 'Bash') {
      process.exit(0); // only the Bash tool is guarded here
    }
    const command = input.tool_input?.command ?? '';
    if (!tool) {
      console.error('xops-guard: policy missing --tool (fail-closed)');
      process.exit(2);
    }
    const decision = hookDecision(command, { tool, grants, namespace: ns, target });
    log({ mode: 'hook', command, ...decision });
    if (decision.allowed) process.exit(0);
    console.error(`xops-guard: blocked — ${decision.reason}`);
    process.exit(2);
  } catch (err) {
    log({ mode: 'hook', error: String(err), allowed: false });
    console.error(`xops-guard: fail-closed on error — ${String(err)}`);
    process.exit(2);
  }
}

// PATH-shim mode.
const decision = tool
  ? evaluateCommand({ tool, args: cmdArgs, skillGrants: grants, namespace: ns, target })
  : { allowed: false, reason: 'guard policy missing --tool (fail-closed)' };

log({ mode: 'shim', args: cmdArgs, ...decision });

if (decision.allowed) {
  console.log('ALLOW');
} else {
  console.log(`DENY ${decision.reason}`);
  process.exitCode = 1;
}
