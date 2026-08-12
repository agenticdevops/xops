/**
 * Conversational replies through goose — same engine as action runs, but the
 * chat recipe exposes NO extensions/tools: a chat turn cannot run commands.
 * Actions happen only through guarded skill runs (see goose.ts).
 */
import { spawn } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { parseGooseOutput } from './parse';

const CHAT_SYSTEM = `You are OpsPilot, a self-hosted DevOps copilot. You chat about
infrastructure, Kubernetes, Docker, CI/CD, and incident response. You cannot run
commands in chat — when the user reports a broken workload, tell them you can run a
guarded triage if they name the target (namespace or container). Be concise and
practical.`;

export interface ChatOptions {
  message: string;
  workdir: string;
  gooseBin?: string;
  provider?: string;
  model?: string;
  timeoutMs?: number;
  history?: Array<{ role: string; content: string }>;
}

export async function runGooseChat(opts: ChatOptions): Promise<string> {
  const wd = resolve(opts.workdir);
  mkdirSync(wd, { recursive: true });

  const historyBlock =
    opts.history && opts.history.length > 0
      ? '\nRecent conversation:\n' +
        opts.history
          .slice(-10)
          .map((m) => `${m.role === 'user' ? 'User' : 'OpsPilot'}: ${m.content}`)
          .join('\n') +
        '\n'
      : '';

  const recipePath = join(wd, 'chat-recipe.yaml');
  writeFileSync(
    recipePath,
    `version: 1.0.0
title: OpsPilot chat turn
description: Tool-less conversational reply
parameters:
  - key: message
    input_type: string
    requirement: required
    description: The user's message
instructions: |
  ${CHAT_SYSTEM.split('\n').join('\n  ')}
  ${historyBlock.split('\n').join('\n  ')}
extensions: []
prompt: |
  {{ message }}
`,
  );

  const args = [
    'run',
    '--recipe',
    recipePath,
    '--params',
    `message=${opts.message}`,
    '--no-session',
    '--output-format',
    'stream-json',
    '--quiet',
    '--max-turns',
    '3',
  ];
  if (opts.provider) args.push('--provider', opts.provider);
  if (opts.model) args.push('--model', opts.model);

  const chunks: Buffer[] = [];
  const exitCode = await new Promise<number | null>((resolvePromise) => {
    const proc = spawn(opts.gooseBin ?? 'goose', args, { cwd: wd, stdio: ['ignore', 'pipe', 'ignore'] });
    proc.stdout.on('data', (d: Buffer) => chunks.push(d));
    const watchdog = setTimeout(() => proc.kill('SIGKILL'), opts.timeoutMs ?? 90_000);
    proc.on('close', (code) => {
      clearTimeout(watchdog);
      resolvePromise(code);
    });
    proc.on('error', () => {
      clearTimeout(watchdog);
      resolvePromise(null);
    });
  });

  const { finalText } = parseGooseOutput(Buffer.concat(chunks).toString('utf8'));
  if (finalText) return finalText;
  return exitCode === 0
    ? 'I had trouble forming a reply — try rephrasing.'
    : 'Chat engine unavailable — check that goose is installed and a provider is configured (`goose info`).';
}
