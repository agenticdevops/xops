/**
 * Unified scoped bot session: one turn = prep workdir (copy bot skills, bake
 * union-grant guard shim, set project creds), spawn goose with shell
 * available, parse, verify only if a HIGH-tier command ran, compose reply.
 */
import { cpSync, mkdirSync, readFileSync, watch, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import type { Bot, Project } from '../../../core/src/bots';
import { renderBotRecipe } from './recipe';
import { runGooseProcess, findRealTool, writeGuardShim, writeClaudeGuardHook } from './spawn';
import { parseGooseOutput } from './parse';
import { StreamJsonTextParser } from './stream-parse';
import { verifyContainer, verifyNamespace } from './verify';
import type { GuardMode } from './guard';

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
  /** command guard mode: 'auto' (writes allowed) | 'safe' (writes blocked). Default 'auto'. */
  mode?: GuardMode;
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

export type BotTurnEvent =
  | { type: 'text'; delta: string }
  | { type: 'guard'; tool: string; command: string; allowed: boolean; tier?: string; category?: string }
  | { type: 'verify'; healthy: boolean; summary: string }
  | { type: 'done'; wallSeconds: number; acted: boolean; verified: boolean | null; reply: string }
  | { type: 'error'; message: string };

export async function* streamBotTurn(req: BotTurnRequest): AsyncGenerator<BotTurnEvent> {
  const started = Date.now();
  const { bot, project } = req;
  const tool = bot.platform === 'docker' ? 'docker' : 'kubectl';
  const scope = project?.scope ?? '';
  const wd = resolve(join(req.workdir, `turn-${bot.name}-${Date.now()}`));

  try {
    mkdirSync(join(wd, '.goose', 'skills'), { recursive: true });
    mkdirSync(join(wd, 'bin'), { recursive: true });
    for (const skill of bot.skills) {
      cpSync(join(req.skillsSource, skill), join(wd, '.goose', 'skills', skill), { recursive: true });
    }
    const mode = req.mode ?? 'auto';
    const guardLogPath = join(wd, 'guard.jsonl');
    writeFileSync(guardLogPath, '');
    const guardCli = join(import.meta.dir, 'guard-cli.ts');
    const realTool = findRealTool(tool, join(wd, 'bin'));
    writeGuardShim({ wd, tool, mode, guardLogPath, guardCliPath: guardCli, realTool });
    // claude-acp executes tools via Claude Code (bypasses the PATH shim); a
    // fail-closed PreToolUse hook enforces the same policy there. Inert on
    // native providers.
    writeClaudeGuardHook({ wd, tool, mode, guardLogPath, guardCliPath: guardCli });

    const recipePath = join(wd, 'recipe.yaml');
    writeFileSync(recipePath, renderBotRecipe({
      botDisplay: bot.display, platform: bot.platform, skills: bot.skills,
      scope, brief: project?.brief, identity: bot.identity,
    }));

    const env: NodeJS.ProcessEnv = { ...process.env, PATH: `${join(wd, 'bin')}:${process.env.PATH ?? ''}`, GOOSE_MODE: 'auto' };
    if (bot.platform === 'k8s' && project?.kubeconfig) env.KUBECONFIG = project.kubeconfig;

    const historyPrefix =
      req.history && req.history.length > 0
        ? req.history.slice(-10).map((m) => `${m.role === 'user' ? 'User' : bot.display}: ${m.content}`).join('\n') + '\n\n'
        : '';
    const paramKey = 'message';
    const args = [
      'run', '--recipe', recipePath, '--params', `${paramKey}=${historyPrefix}${req.message}`,
      '--no-session', '--output-format', 'stream-json', '--quiet', '--max-turns', '20',
    ];
    if (req.provider) args.push('--provider', req.provider);
    if (req.model) args.push('--model', req.model);

    // ---- event queue bridging callbacks → generator ----
    const queue: BotTurnEvent[] = [];
    let wake: (() => void) | null = null;
    const emit = (e: BotTurnEvent) => { queue.push(e); wake?.(); wake = null; };

    const parser = new StreamJsonTextParser();
    let guardOffset = 0;
    const guardLog: Array<Record<string, unknown>> = [];
    const drainGuard = () => {
      let content = '';
      try { content = readFileSync(guardLogPath, 'utf8'); } catch { return; }
      if (content.length <= guardOffset) return;
      const fresh = content.slice(guardOffset);
      guardOffset = content.length;
      for (const raw of fresh.split('\n')) {
        const l = raw.trim();
        if (!l) continue;
        try {
          const d = JSON.parse(l) as Record<string, unknown>;
          guardLog.push(d);
          emit({ type: 'guard', tool: String(d.tool ?? ''), command: String(d.command ?? (Array.isArray(d.args) ? (d.args as string[]).join(' ') : '')), allowed: d.allowed === true, tier: d.tier as string | undefined, category: d.category as string | undefined });
        } catch { /* skip partial line; picked up next drain */ }
      }
    };

    const watcher = watch(guardLogPath, { persistent: false }, () => drainGuard());

    const procPromise = runGooseProcess(args, {
      cwd: wd, env, timeoutMs: req.timeoutMs ?? 420_000,
      onStdout: (chunk) => { for (const delta of parser.push(chunk)) emit({ type: 'text', delta }); drainGuard(); },
    });

    let finished = false;
    let outcome: { stdout: string; stderr: string; exitCode: number | null; timedOut: boolean } | undefined;
    procPromise.then((r) => { outcome = r; finished = true; wake?.(); wake = null; });

    // pump: yield queued events until the process finishes and the queue drains
    while (!finished || queue.length > 0) {
      if (queue.length > 0) { yield queue.shift()!; continue; }
      await new Promise<void>((r) => { wake = r; });
    }
    watcher.close();
    drainGuard(); // final sweep
    while (queue.length > 0) yield queue.shift()!;

    writeFileSync(join(wd, 'run.stream.jsonl'), outcome?.stdout ?? '');
    writeFileSync(join(wd, 'run.stderr.log'), outcome?.stderr ?? '');

    const acted = mutatedInGuardLog(guardLog);
    let verified: boolean | null = null;
    if (shouldVerify(guardLog, !!project) && project) {
      const verdict = bot.platform === 'docker' ? await verifyContainer(project.scope) : await verifyNamespace(project.scope, project.kubeconfig);
      verified = verdict.healthy;
      yield { type: 'verify', healthy: verdict.healthy, summary: verdict.summary };
    }
    if (outcome?.timedOut) yield { type: 'error', message: 'run timed out' };
    const finalReply = parseGooseOutput(outcome?.stdout ?? '').finalText ?? '';
    yield { type: 'done', wallSeconds: Math.round((Date.now() - started) / 1000), acted, verified, reply: finalReply };
  } catch (err) {
    yield { type: 'error', message: (err as Error).message };
    yield { type: 'done', wallSeconds: Math.round((Date.now() - started) / 1000), acted: false, verified: null, reply: '' };
  }
}

export async function drainToResult(stream: AsyncGenerator<BotTurnEvent>): Promise<BotTurnResult> {
  let text = '';
  let errorText = '';
  let verifyLine = '';
  let acted = false;
  let verified: boolean | null = null;
  let wallSeconds = 0;
  const guardLog: Array<Record<string, unknown>> = [];
  for await (const e of stream) {
    if (e.type === 'guard') guardLog.push({ tool: e.tool, command: e.command, allowed: e.allowed, tier: e.tier, category: e.category });
    else if (e.type === 'verify') verifyLine = `\n\n---\n${e.healthy ? '✅ verified' : '⚠️ NOT verified'}: ${e.summary}`;
    else if (e.type === 'done') { acted = e.acted; verified = e.verified; wallSeconds = e.wallSeconds; text = e.reply; }
    else if (e.type === 'error') errorText += `\n[error] ${e.message}`;
  }
  return { reply: `${text}${verifyLine}${errorText}`.trim() || '(no reply produced)', acted, verified, wallSeconds, guardLog };
}

export function runBotTurn(req: BotTurnRequest): Promise<BotTurnResult> {
  return drainToResult(streamBotTurn(req));
}
