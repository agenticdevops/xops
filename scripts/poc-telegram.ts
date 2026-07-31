/**
 * POC bridge: Telegram → goose engine → verified reply.
 *   bun scripts/poc-telegram.ts
 * Namespace extracted from message ("ns <name>" or any troublesim-* token);
 * defaults to troublesim-s4. Scoped kubeconfig expected at
 * ~/.opspilot/workspace/kubeconfig-<namespace> (scripts/provision-poc-rbac.sh).
 */
import { join } from 'path';
import { existsSync } from 'fs';
import { loadConfig } from '../packages/core/src/config';
import { TelegramAdapter } from '../packages/channels/src/telegram';
import { handleIncident } from '../packages/gateway/src/engine';

const config = await loadConfig();
const tgRaw = config.channels.telegram as any;
// config.yaml uses accounts.default.* layout; core schema predates it
const tg = tgRaw?.token ? tgRaw : { ...tgRaw?.accounts?.default, enabled: tgRaw?.enabled };
if (!tg?.token) {
  console.error('telegram token missing in ~/.opspilot/config.yaml');
  process.exit(1);
}

const HOME = process.env.HOME ?? '';
const WORKSPACE = join(HOME, '.opspilot', 'workspace');
const SKILLS = join(import.meta.dir, '..', 'packages', 'skills', 'bundled');

function extractNamespace(text: string): string {
  const nsMatch = text.match(/\bns[:= ]\s*([a-z0-9-]+)/i) ?? text.match(/\b(troublesim-[a-z0-9-]+)\b/i);
  return nsMatch?.[1] ?? 'troublesim-s4';
}

const adapter = new TelegramAdapter(tg);

adapter.onMessage(async (incoming) => {
  const namespace = extractNamespace(incoming.content);
  const chatId = String(incoming.metadata?.chatId ?? incoming.userId);

  const kubeconfig = join(WORKSPACE, `kubeconfig-${namespace}`);
  if (!existsSync(kubeconfig)) {
    return `No scoped kubeconfig for namespace "${namespace}". Run: scripts/provision-poc-rbac.sh ${namespace}`;
  }

  await adapter.send({ chatId, content: `🔧 On it — investigating \`${namespace}\` (goose + ${'k8s-pod-restart-triage'})...` });

  console.log(`[poc-tg] ${incoming.username ?? incoming.userId} -> ns=${namespace}`);
  const outcome = await handleIncident({
    namespace,
    workdir: join(WORKSPACE, 'goose-runs'),
    skillsSource: SKILLS,
    kubeconfig,
  });
  console.log(`[poc-tg] done ns=${namespace} verified=${outcome.verified} wall=${outcome.wallSeconds}s`);
  return outcome.reply;
});

await adapter.initialize();
await adapter.start();
console.log('[poc-tg] OpsPilot POC bridge up — message the bot.');
