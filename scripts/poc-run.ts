/**
 * POC smoke runner: drive the goose engine against a broken target.
 *   k8s:    bun scripts/poc-run.ts k8s <namespace> [kubeconfig]
 *   docker: bun scripts/poc-run.ts docker <container-name-or-pattern>
 */
import { runGooseSkill } from '../packages/gateway/src/engine/goose';
import type { EngineProfile } from '../packages/gateway/src/engine/recipe';
import { join } from 'path';

const profile = (process.argv[2] ?? 'k8s') as EngineProfile;
const target = process.argv[3] ?? (profile === 'docker' ? 'opspilot-victim' : 'troublesim-s4');
const kubeconfig =
  profile === 'k8s'
    ? process.argv[4] ?? join(process.env.HOME ?? '', '.opspilot', 'workspace', `kubeconfig-${target}`)
    : undefined;

console.log(`[poc] profile=${profile} target=${target}${kubeconfig ? ` kubeconfig=${kubeconfig}` : ''}`);
const started = Date.now();

const outcome = await runGooseSkill({
  target,
  profile,
  skill: profile === 'docker' ? 'docker-container-triage' : 'k8s-pod-restart-triage',
  workdir: join(process.env.HOME ?? '', '.opspilot', 'workspace', 'goose-poc'),
  skillsSource: join(import.meta.dir, '..', 'packages', 'skills', 'bundled'),
  kubeconfig,
  timeoutMs: 300_000,
});

console.log(`\n[poc] wall=${Math.round((Date.now() - started) / 1000)}s exit=${outcome.exitCode} timedOut=${outcome.timedOut}`);
console.log(`[poc] messages=${outcome.result.messageCount} raw=${outcome.rawPath}`);
console.log(`[poc] guard decisions: ${outcome.guardLog.length}`);
for (const g of outcome.guardLog) {
  console.log(`  ${g.allowed ? 'ALLOW' : 'DENY '} ${g.tool} ${(g.args as string[])?.join(' ')}${g.allowed ? '' : `  <- ${g.reason}`}`);
}
console.log(`\n[poc] final:\n${outcome.result.finalText ?? '(none)'}`);
if (outcome.exitCode !== 0) console.log(`\n[poc] stderr:\n${outcome.stderr.slice(-2000)}`);
