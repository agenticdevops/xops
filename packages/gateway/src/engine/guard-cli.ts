/**
 * CLI entry for guarded-tool PATH shims. Prints "ALLOW" or "DENY <reason>".
 * Policy arrives as argv baked into the generated shim by goose.ts — NEVER
 * from environment variables, which the guarded agent's shell controls
 * (security review: env-override bypass).
 *
 * Invocation: guard-cli.ts --tool T --grants a,b --ns N --target C --log PATH -- <cmd args...>
 */
import { appendFileSync } from 'fs';
import { evaluateCommand } from './guard';

const argv = process.argv.slice(2);
const sep = argv.indexOf('--');
const policyArgs = sep === -1 ? argv : argv.slice(0, sep);
const cmdArgs = sep === -1 ? [] : argv.slice(sep + 1);

function policyValue(flag: string): string {
  const i = policyArgs.indexOf(flag);
  return i !== -1 ? policyArgs[i + 1] ?? '' : '';
}

const tool = policyValue('--tool');
const grants = policyValue('--grants').split(',').filter(Boolean);
const ns = policyValue('--ns') || undefined;
const target = policyValue('--target') || undefined;
const logPath = policyValue('--log');

const decision = tool
  ? evaluateCommand({ tool, args: cmdArgs, skillGrants: grants, namespace: ns, target })
  : { allowed: false, reason: 'guard policy missing --tool (fail-closed)' };

if (logPath) {
  try {
    appendFileSync(
      logPath,
      JSON.stringify({ ts: new Date().toISOString(), tool, args: cmdArgs, ...decision }) + '\n',
    );
  } catch {
    // logging must never turn a deny into a crash-open
  }
}

if (decision.allowed) {
  console.log('ALLOW');
} else {
  console.log(`DENY ${decision.reason}`);
  process.exitCode = 1;
}
