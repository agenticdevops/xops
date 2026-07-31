/**
 * CLI entry for the kubectl PATH shim. Prints "ALLOW" or "DENY <reason>".
 * Appends every decision as JSONL to OPSPILOT_GUARD_LOG when set.
 * Invoked by the generated bin/kubectl wrapper inside the goose workdir.
 */
import { appendFileSync } from 'fs';
import { evaluateKubectl } from './guard';

const ns = process.env.OPSPILOT_GUARD_NS ?? '';
const args = process.argv.slice(2);
const decision = ns
  ? evaluateKubectl(args, ns)
  : { allowed: false, reason: 'OPSPILOT_GUARD_NS not set (fail-closed)' };

const logPath = process.env.OPSPILOT_GUARD_LOG;
if (logPath) {
  try {
    appendFileSync(
      logPath,
      JSON.stringify({ ts: new Date().toISOString(), args, ...decision }) + '\n',
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
