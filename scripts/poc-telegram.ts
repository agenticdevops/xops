/**
 * POC bridge: Telegram → goose engine → verified reply.
 *   bun scripts/poc-telegram.ts
 * Namespace extracted from message ("ns <name>" or any troublesim-* token);
 * defaults to troublesim-s4. Scoped kubeconfig expected at
 * ~/.xops/workspace/kubeconfig-<namespace> (scripts/provision-poc-rbac.sh).
 */
import { join } from 'path';
import { existsSync } from 'fs';
import { loadConfig } from '../packages/core/src/config';
import { TelegramAdapter } from '../packages/channels/src/telegram';
import { listBots, getBot } from '../packages/core/src/bots';
import { SessionStore } from '../packages/gateway/src/session-store';
import { runBotTurn } from '../packages/gateway/src/engine/session';

const config = await loadConfig();
const tgRaw = config.channels.telegram as any;
// config.yaml uses accounts.default.* layout; core schema predates it
const tg = tgRaw?.token ? tgRaw : { ...tgRaw?.accounts?.default, enabled: tgRaw?.enabled };
if (!tg?.token) {
  console.error('telegram token missing in ~/.xops/config.yaml');
  process.exit(1);
}

const HOME = process.env.HOME ?? '';
const WORKSPACE = join(HOME, '.xops', 'workspace');
const SKILLS = join(import.meta.dir, '..', 'packages', 'skills', 'bundled');

const store = new SessionStore();
const DEFAULT_BOT = 'k8s-sre';

function botsList(): string {
  return listBots().map((b) => `• \`${b.name}\` — ${b.display}: ${b.description}`).join('\n');
}

const adapter = new TelegramAdapter(tg);

adapter.onMessage(async (incoming) => {
  const chatId = String(incoming.metadata?.chatId ?? incoming.userId);
  const text = incoming.content.trim();

  if (text === '/bots') {
    return `Available bots:\n${botsList()}\n\nBind one with \`/use <name>\`.`;
  }
  if (text.startsWith('/use ')) {
    const name = text.slice(5).trim();
    if (!getBot(name)) return `No bot named "${name}". ${'\n'}${botsList()}`;
    store.setBot(chatId, name);
    return `This chat is now talking to *${getBot(name)!.display}*. Set a project with \`/project <ns-or-container>\` if it needs one.`;
  }
  if (text.startsWith('/project ')) {
    const scope = text.slice(9).trim();
    if (!store.get(chatId)) store.setBot(chatId, DEFAULT_BOT);
    store.setProject(chatId, scope);
    return `Project scope for this chat set to \`${scope}\`.`;
  }

  const binding = store.get(chatId) ?? (store.setBot(chatId, DEFAULT_BOT), store.get(chatId)!);
  const bot = getBot(binding.bot)!;

  // resolve project: for k8s use scope + provisioned kubeconfig; for docker scope=container
  let project;
  if (binding.project) {
    const kubeconfig = bot.platform === 'k8s' ? join(WORKSPACE, `kubeconfig-${binding.project}`) : undefined;
    if (bot.platform === 'k8s' && !existsSync(kubeconfig!)) {
      return `No scoped kubeconfig for namespace "${binding.project}". Run: scripts/provision-poc-rbac.sh ${binding.project}`;
    }
    project = { name: binding.project, scope: binding.project, kubeconfig };
  } else if (bot.platform === 'docker') {
    return `Tell me which container: \`/project <container-name>\`, then send your message again.`;
  } else {
    return `Tell me which namespace: \`/project <namespace>\` (I'll use its scoped kubeconfig).`;
  }

  await adapter.send({ chatId, content: `🔧 ${bot.display} on \`${project.scope}\`…` });
  console.log(`[tg] ${incoming.username ?? incoming.userId} -> ${bot.name}:${project.scope}`);
  const r = await runBotTurn({
    bot, project, message: text,
    workdir: join(WORKSPACE, 'bot-runs'),
    skillsSource: SKILLS,
    provider: process.env.XOPS_PROVIDER,
    model: process.env.XOPS_MODEL,
    mode: (process.env.XOPS_MODE as 'auto' | 'safe') || 'auto',
  });
  console.log(`[tg] done ${bot.name}:${project.scope} acted=${r.acted} verified=${r.verified} wall=${r.wallSeconds}s`);
  return r.reply;
});

await adapter.initialize();
await adapter.start();
console.log('[poc-tg] xops POC bridge up — message the bot.');
