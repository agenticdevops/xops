import { join } from 'path';
import { existsSync } from 'fs';
import { getBot } from '../../core/src/bots';
import { streamBotTurn } from './engine';

export interface ChatRequest {
  bot: string;
  scope: string;
  mode?: 'auto' | 'safe';
  message: string;
}

export async function runChatToSink(
  req: ChatRequest,
  opts: { workspace: string; skillsSource: string; provider?: string; model?: string },
  send: (msg: object) => void,
): Promise<void> {
  const bot = getBot(req.bot);
  if (!bot) {
    send({ type: 'error', message: `unknown bot "${req.bot}"` });
    return;
  }
  let project;
  if (bot.platform === 'k8s') {
    if (!req.scope) {
      send({ type: 'error', message: 'set a namespace scope for a Kubernetes bot' });
      return;
    }
    const kubeconfig = join(opts.workspace, `kubeconfig-${req.scope}`);
    if (!existsSync(kubeconfig)) {
      send({ type: 'error', message: `no scoped kubeconfig for "${req.scope}" — run scripts/provision-poc-rbac.sh ${req.scope}` });
      return;
    }
    project = { name: req.scope, scope: req.scope, kubeconfig };
  } else {
    if (!req.scope) {
      send({ type: 'error', message: 'set a container name scope for a Docker bot' });
      return;
    }
    project = { name: req.scope, scope: req.scope };
  }
  try {
    for await (const ev of streamBotTurn({
      bot, project, message: req.message,
      workdir: join(opts.workspace, 'bot-runs'), skillsSource: opts.skillsSource,
      provider: opts.provider, model: opts.model, mode: req.mode ?? 'auto',
    })) {
      send(ev);
    }
  } catch (err) {
    send({ type: 'error', message: (err as Error).message });
  }
}
