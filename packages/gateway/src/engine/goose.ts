/**
 * Goose subprocess runner. Invocation pattern and watchdog semantics ported
 * from openagentix bench/run-bench.sh:
 *  - skills are workdir-local under .goose/skills/
 *  - stream-json output is written incrementally (survives watchdog KILL)
 *  - goose survives SIGTERM waiting out in-flight streams; kill the process
 *    group, escalate to SIGKILL after a grace period
 */
import { spawn } from 'child_process';
import { accessSync, chmodSync, constants, cpSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { renderRecipe } from './recipe';
import { parseGooseOutput, type GooseResult } from './parse';

export interface EngineRunOptions {
  namespace: string;
  skill: string;
  workdir: string; // run workspace; created if missing
  skillsSource: string; // dir containing <skill>/SKILL.md
  kubeconfig?: string; // scoped kubeconfig path (RBAC hard boundary)
  gooseBin?: string;
  timeoutMs?: number;
  maxTurns?: number;
}

export interface EngineRunOutcome {
  result: GooseResult;
  exitCode: number | null;
  timedOut: boolean;
  guardLog: Array<Record<string, unknown>>;
  rawPath: string;
  stderr: string;
}

const KILL_GRACE_MS = 15_000;

export function prepWorkdir(opts: EngineRunOptions): { recipePath: string; guardLogPath: string; binDir: string } {
  const wd = resolve(opts.workdir);
  mkdirSync(join(wd, '.goose', 'skills'), { recursive: true });
  mkdirSync(join(wd, 'bin'), { recursive: true });

  cpSync(join(opts.skillsSource, opts.skill), join(wd, '.goose', 'skills', opts.skill), {
    recursive: true,
  });

  const recipePath = join(wd, 'recipe.yaml');
  writeFileSync(recipePath, renderRecipe({ skill: opts.skill }));

  const guardLogPath = join(wd, 'guard.jsonl');
  writeFileSync(guardLogPath, '');

  const guardCli = join(import.meta.dir, 'guard-cli.ts');
  const shimPath = join(wd, 'bin', 'kubectl');
  writeFileSync(
    shimPath,
    `#!/usr/bin/env bash
# OpsPilot fail-closed kubectl guard shim (generated per run)
decision=$(bun "${guardCli}" "$@")
if [ "$decision" = "ALLOW" ]; then
  exec "\${OPSPILOT_REAL_KUBECTL:?}" "$@"
else
  echo "kubectl-guard: \${decision}" >&2
  exit 1
fi
`,
  );
  chmodSync(shimPath, 0o755);

  return { recipePath, guardLogPath, binDir: join(wd, 'bin') };
}

export async function runGooseSkill(opts: EngineRunOptions): Promise<EngineRunOutcome> {
  const wd = resolve(opts.workdir);
  const { recipePath, guardLogPath, binDir } = prepWorkdir(opts);
  const rawPath = join(wd, 'run.stream.jsonl');
  const gooseBin = opts.gooseBin ?? 'goose';
  const timeoutMs = opts.timeoutMs ?? 300_000;

  const realKubectl = findRealKubectl(binDir);

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
    GOOSE_MODE: 'auto',
    OPSPILOT_GUARD_NS: opts.namespace,
    OPSPILOT_GUARD_LOG: guardLogPath,
    OPSPILOT_REAL_KUBECTL: realKubectl,
  };
  if (opts.kubeconfig) env.KUBECONFIG = opts.kubeconfig;

  const args = [
    'run',
    '--recipe',
    recipePath,
    '--params',
    `namespace=${opts.namespace}`,
    '--no-session',
    '--output-format',
    'stream-json',
    '--quiet',
    '--max-turns',
    String(opts.maxTurns ?? 20),
  ];

  const chunks: Buffer[] = [];
  const errChunks: Buffer[] = [];
  let timedOut = false;

  const exitCode = await new Promise<number | null>((resolvePromise) => {
    const proc = spawn(gooseBin, args, { cwd: wd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });

    proc.stdout.on('data', (d: Buffer) => chunks.push(d));
    proc.stderr.on('data', (d: Buffer) => errChunks.push(d));

    const killGroup = (signal: NodeJS.Signals) => {
      if (proc.pid) {
        try {
          process.kill(-proc.pid, signal);
        } catch {
          try {
            proc.kill(signal);
          } catch {}
        }
      }
    };

    const watchdog = setTimeout(() => {
      timedOut = true;
      killGroup('SIGTERM');
      setTimeout(() => killGroup('SIGKILL'), KILL_GRACE_MS).unref();
    }, timeoutMs);

    proc.on('close', (code) => {
      clearTimeout(watchdog);
      resolvePromise(code);
    });
    proc.on('error', () => {
      clearTimeout(watchdog);
      resolvePromise(null);
    });
  });

  const raw = Buffer.concat(chunks).toString('utf8');
  writeFileSync(rawPath, raw);
  const stderr = Buffer.concat(errChunks).toString('utf8');
  writeFileSync(join(wd, 'run.stderr.log'), stderr);

  const guardLog = readFileSync(guardLogPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l) as Record<string, unknown>;
      } catch {
        return { unparsed: l };
      }
    });

  return { result: parseGooseOutput(raw), exitCode, timedOut, guardLog, rawPath, stderr };
}

function findRealKubectl(shimBinDir: string): string {
  const path = (process.env.PATH ?? '').split(':').filter((p) => p && resolve(p) !== resolve(shimBinDir));
  for (const dir of path) {
    const candidate = join(dir, 'kubectl');
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      continue;
    }
  }
  return 'kubectl';
}
