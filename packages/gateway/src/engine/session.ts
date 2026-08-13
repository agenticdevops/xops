/**
 * Unified scoped bot session: one turn = prep workdir (copy bot skills, bake
 * union-grant guard shim, set project creds), spawn goose with shell
 * available, parse, verify only if a HIGH-tier command ran, compose reply.
 */
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import type { Bot, Project } from '../../../core/src/bots';
import { grantsFor } from '../../../core/src/skills';
import { renderBotRecipe } from './recipe';
import { runGooseProcess, findRealTool, writeGuardShim, writeClaudeGuardHook } from './spawn';
import { parseGooseOutput } from './parse';
import { verifyContainer, verifyNamespace } from './verify';

export interface BotTurnRequest {
  bot: Bot;
  project?: Project;
  message: string;
  history?: Array<{ role: string; content: string }>;
  workdir: string;
  skillsSource: string;
  provider?: string;
  model?: string;
  timeoutMs?: number;
}

export interface BotTurnResult {
  reply: string;
  acted: boolean;
  verified: boolean | null;
  wallSeconds: number;
  guardLog: Array<Record<string, unknown>>;
}

export function mutatedInGuardLog(guardLog: Array<Record<string, unknown>>): boolean {
  return guardLog.some((g) => g.allowed === true && g.tier === 'HIGH');
}

/**
 * Whether to run independent verification after a turn. Triggers on any
 * operational turn (>=1 command ran) with a project scope — deliberately NOT
 * gated on seeing a HIGH command, because the guard log can undercount on the
 * claude-acp provider (Claude Code executes some commands outside our shim).
 * Pure-chat turns (no command ran) skip verification.
 */
export function shouldVerify(guardLog: Array<Record<string, unknown>>, hasProject: boolean): boolean {
  return hasProject && guardLog.length > 0;
}

export async function runBotTurn(req: BotTurnRequest): Promise<BotTurnResult> {
  const started = Date.now();
  const { bot, project } = req;
  const tool = bot.platform === 'docker' ? 'docker' : 'kubectl';
  const scope = project?.scope ?? (bot.platform === 'docker' ? '' : '');
  const wd = resolve(join(req.workdir, `turn-${bot.name}-${Date.now()}`));

  mkdirSync(join(wd, '.goose', 'skills'), { recursive: true });
  mkdirSync(join(wd, 'bin'), { recursive: true });
  for (const skill of bot.skills) {
    cpSync(join(req.skillsSource, skill), join(wd, '.goose', 'skills', skill), { recursive: true });
  }

  const grants = grantsFor(bot.skills, req.skillsSource);
  const guardLogPath = join(wd, 'guard.jsonl');
  writeFileSync(guardLogPath, '');
  const guardCli = join(import.meta.dir, 'guard-cli.ts');
  const realTool = findRealTool(tool, join(wd, 'bin'));
  const shimNs = bot.platform === 'docker' ? '' : scope;
  const shimTarget = bot.platform === 'docker' ? scope : '';
  writeGuardShim({ wd, tool, grants, ns: shimNs, target: shimTarget, guardLogPath, guardCliPath: guardCli, realTool });
  // claude-acp executes tools via Claude Code (bypasses the PATH shim); a
  // fail-closed PreToolUse hook enforces the same policy there. Inert on
  // native providers.
  writeClaudeGuardHook({ wd, tool, grants, ns: shimNs, target: shimTarget, guardLogPath, guardCliPath: guardCli });

  const recipePath = join(wd, 'recipe.yaml');
  writeFileSync(recipePath, renderBotRecipe({
    botDisplay: bot.display, platform: bot.platform, skills: bot.skills,
    scope, brief: project?.brief, identity: bot.identity,
  }));

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${join(wd, 'bin')}:${process.env.PATH ?? ''}`,
    GOOSE_MODE: 'auto',
  };
  if (bot.platform === 'k8s' && project?.kubeconfig) env.KUBECONFIG = project.kubeconfig;

  const historyPrefix =
    req.history && req.history.length > 0
      ? req.history.slice(-10).map((m) => `${m.role === 'user' ? 'User' : bot.display}: ${m.content}`).join('\n') + '\n\n'
      : '';

  const args = [
    'run', '--recipe', recipePath,
    '--params', `message=${historyPrefix}${req.message}`,
    '--no-session', '--output-format', 'stream-json', '--quiet', '--max-turns', '20',
  ];
  if (req.provider) args.push('--provider', req.provider);
  if (req.model) args.push('--model', req.model);

  const { stdout, stderr, timedOut } = await runGooseProcess(args, {
    cwd: wd, env, timeoutMs: req.timeoutMs ?? 420_000,
  });
  writeFileSync(join(wd, 'run.stream.jsonl'), stdout);
  writeFileSync(join(wd, 'run.stderr.log'), stderr);

  const guardLog = readFileSync(guardLogPath, 'utf8').split('\n').filter(Boolean).map((l) => {
    try { return JSON.parse(l) as Record<string, unknown>; } catch { return { unparsed: l }; }
  });

  const acted = mutatedInGuardLog(guardLog);
  let verified: boolean | null = null;
  let verifyLine = '';
  if (shouldVerify(guardLog, !!project) && project) {
    const verdict = bot.platform === 'docker'
      ? await verifyContainer(project.scope)
      : await verifyNamespace(project.scope, project.kubeconfig);
    verified = verdict.healthy;
    verifyLine = `\n\n---\n${verdict.healthy ? '✅ verified' : '⚠️ NOT verified'}: ${verdict.summary}`;
  }

  const agentText = parseGooseOutput(stdout).finalText ?? '(no reply produced)';
  const status = timedOut ? '⏱ run timed out. ' : '';
  const wallSeconds = Math.round((Date.now() - started) / 1000);

  return {
    reply: `${status}${agentText}${verifyLine}`,
    acted, verified, wallSeconds, guardLog,
  };
}
