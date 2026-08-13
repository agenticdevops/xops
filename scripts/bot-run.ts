/**
 * Run one bot turn from the CLI — the quickest way to test a bot without Telegram.
 *   docker:  bun scripts/bot-run.ts docker-ops <container> "<message>"
 *   k8s:     bun scripts/bot-run.ts k8s-sre <namespace> "<message>"   (needs scoped kubeconfig)
 *
 * Provider defaults to XOPS_PROVIDER (fall back claude-acp = your Claude subscription).
 */
import { join } from 'path';
import { existsSync } from 'fs';
import { getBot } from '../packages/core/src/bots';
import { runBotTurn } from '../packages/gateway/src/engine/session';

const [botName, scope, ...rest] = process.argv.slice(2);
const message = rest.join(' ') || 'diagnose and fix the problem';

const bot = getBot(botName);
if (!bot) {
  console.error(`Unknown bot "${botName}". Try: docker-ops, k8s-sre`);
  process.exit(1);
}
if (!scope) {
  console.error(`Usage: bun scripts/bot-run.ts <bot> <scope> "<message>"`);
  process.exit(1);
}

const HOME = process.env.HOME ?? '';
const WORKSPACE = join(HOME, '.xops', 'workspace');
const SKILLS = join(import.meta.dir, '..', 'packages', 'skills', 'bundled');

let project;
if (bot.platform === 'k8s') {
  const kubeconfig = join(WORKSPACE, `kubeconfig-${scope}`);
  if (!existsSync(kubeconfig)) {
    console.error(`No scoped kubeconfig for "${scope}". Run: bash scripts/provision-poc-rbac.sh ${scope}`);
    process.exit(1);
  }
  project = { name: scope, scope, kubeconfig };
} else {
  project = { name: scope, scope };
}

console.log(`[bot-run] ${bot.display} on ${bot.platform}:${scope}`);
console.log(`[bot-run] message: ${message}\n`);

const r = await runBotTurn({
  bot,
  project,
  message,
  workdir: join(WORKSPACE, 'bot-runs'),
  skillsSource: SKILLS,
  provider: process.env.XOPS_PROVIDER ?? 'claude-acp',
  model: process.env.XOPS_MODEL,
  mode: (process.env.XOPS_MODE as 'auto' | 'safe') || 'auto', // read allow, write allow(auto)/block(safe), dangerous always blocked
});

console.log(`[bot-run] acted=${r.acted} verified=${r.verified} wall=${r.wallSeconds}s\n`);
console.log(r.reply);
