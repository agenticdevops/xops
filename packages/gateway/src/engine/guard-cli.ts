/**
 * CLI entry for guarded-tool PATH shims. Prints "ALLOW" or "DENY <reason>".
 * Appends every decision as JSONL to OPSPILOT_GUARD_LOG when set.
 * Env contract (set by goose.ts per run):
 *   OPSPILOT_GUARD_TOOL   kubectl | docker
 *   OPSPILOT_GUARD_GRANTS comma-separated skill grants
 *   OPSPILOT_GUARD_NS     pinned namespace (k8s profile only)
 */
import { appendFileSync } from 'fs';
import { evaluateCommand } from './guard';

const tool = process.env.OPSPILOT_GUARD_TOOL ?? '';
const grants = (process.env.OPSPILOT_GUARD_GRANTS ?? '').split(',').filter(Boolean);
const ns = process.env.OPSPILOT_GUARD_NS;
const args = process.argv.slice(2);

const decision = tool
  ? evaluateCommand({ tool, args, skillGrants: grants, namespace: ns })
  : { allowed: false, reason: 'OPSPILOT_GUARD_TOOL not set (fail-closed)' };

const logPath = process.env.OPSPILOT_GUARD_LOG;
if (logPath) {
  try {
    appendFileSync(
      logPath,
      JSON.stringify({ ts: new Date().toISOString(), tool, args, ...decision }) + '\n',
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
