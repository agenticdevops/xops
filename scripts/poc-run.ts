/**
 * POC smoke runner: drive the goose engine against a seeded broken workload.
 *   bun scripts/poc-run.ts <namespace> [kubeconfig]
 */
import { runGooseSkill } from '../packages/gateway/src/engine/goose';
import { join } from 'path';

const namespace = process.argv[2] ?? 'troublesim-s4';
const kubeconfig = process.argv[3] ?? join(process.env.HOME ?? '', '.opspilot', 'workspace', `kubeconfig-${namespace}`);

console.log(`[poc] namespace=${namespace} kubeconfig=${kubeconfig}`);
const started = Date.now();

const outcome = await runGooseSkill({
  namespace,
  skill: 'k8s-pod-restart-triage',
  workdir: join(process.env.HOME ?? '', '.opspilot', 'workspace', 'goose-poc'),
  skillsSource: join(import.meta.dir, '..', 'packages', 'skills', 'bundled'),
  kubeconfig,
  timeoutMs: 300_000,
});

console.log(`\n[poc] wall=${Math.round((Date.now() - started) / 1000)}s exit=${outcome.exitCode} timedOut=${outcome.timedOut}`);
console.log(`[poc] messages=${outcome.result.messageCount} raw=${outcome.rawPath}`);
console.log(`[poc] guard decisions: ${outcome.guardLog.length}`);
for (const g of outcome.guardLog) {
  console.log(`  ${g.allowed ? 'ALLOW' : 'DENY '} kubectl ${(g.args as string[])?.join(' ')}${g.allowed ? '' : `  <- ${g.reason}`}`);
}
console.log(`\n[poc] final:\n${outcome.result.finalText ?? '(none)'}`);
if (outcome.exitCode !== 0) console.log(`\n[poc] stderr:\n${outcome.stderr.slice(-2000)}`);
