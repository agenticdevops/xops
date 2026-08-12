/**
 * Goose subprocess runner. Invocation pattern and watchdog semantics ported
 * from openagentix bench/run-bench.sh:
 *  - skills are workdir-local under .goose/skills/
 *  - stream-json output is written incrementally (survives watchdog KILL)
 *  - goose survives SIGTERM waiting out in-flight streams; kill the process
 *    group, escalate to SIGKILL after a grace period
 * Guarded tools (kubectl/docker) are PATH-shimmed per run; grants come from
 * the skill's frontmatter (metadata.opspilot.grants) with a legacy fallback.
 */
import { spawn } from 'child_process';
import { accessSync, chmodSync, constants, cpSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { renderRecipe, type EngineProfile } from './recipe';
import { parseGooseOutput, type GooseResult } from './parse';

export interface EngineRunOptions {
  target: string; // namespace (k8s) or container name/pattern (docker)
  skill: string;
  profile?: EngineProfile;
  workdir: string;
  skillsSource: string; // dir containing <skill>/SKILL.md
  kubeconfig?: string; // scoped kubeconfig (k8s profile hard boundary)
  gooseBin?: string;
  timeoutMs?: number;
  maxTurns?: number;
  /** goose provider override (e.g. 'ollama', 'anthropic'). Avoids machine-default
   *  claude-acp, whose ACP bridge has proven flaky (hangs on parallel tool calls,
   *  no skill registry passthrough). */
  provider?: string;
  model?: string;
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

const PROFILE_TOOL: Record<EngineProfile, string> = { k8s: 'kubectl', docker: 'docker' };

const LEGACY_GRANTS: Record<string, string[]> = {
  'k8s-pod-restart-triage': ['get', 'describe', 'logs', 'patch', 'set', 'rollout', 'scale', 'top', 'events'],
};

/** Parse `grants: [a, b, c]` from SKILL.md frontmatter (metadata.opspilot.grants). */
export function parseSkillGrants(skillMd: string): string[] | null {
  const m = skillMd.match(/grants:\s*\[([^\]]*)\]/);
  if (!m) return null;
  return m[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function prepWorkdir(opts: EngineRunOptions): {
  recipePath: string;
  guardLogPath: string;
  binDir: string;
  grants: string[];
  tool: string;
  realTool: string;
} {
  const profile = opts.profile ?? 'k8s';
  const tool = PROFILE_TOOL[profile];
  const wd = resolve(opts.workdir);
  mkdirSync(join(wd, '.goose', 'skills'), { recursive: true });
  mkdirSync(join(wd, 'bin'), { recursive: true });

  const skillDir = join(opts.skillsSource, opts.skill);
  cpSync(skillDir, join(wd, '.goose', 'skills', opts.skill), { recursive: true });

  const skillMd = readFileSync(join(skillDir, 'SKILL.md'), 'utf8');
  const grants = parseSkillGrants(skillMd) ?? LEGACY_GRANTS[opts.skill] ?? [];

  const recipePath = join(wd, 'recipe.yaml');
  writeFileSync(recipePath, renderRecipe({ skill: opts.skill, profile }));

  const guardLogPath = join(wd, 'guard.jsonl');
  writeFileSync(guardLogPath, '');

  // Policy is baked into the shim as literals — never read from env the
  // agent's shell controls (security review: env-var override bypass).
  // The real binary path is resolved now and baked too; findRealTool throws
  // rather than fall back to a name that would re-resolve to this shim.
  const realTool = findRealTool(tool, join(wd, 'bin'));
  const guardCli = join(import.meta.dir, 'guard-cli.ts');
  const shimPath = join(wd, 'bin', tool);
  const nsLiteral = opts.profile === 'docker' ? '' : opts.target;
  const targetLiteral = opts.profile === 'docker' ? opts.target : '';
  writeFileSync(
    shimPath,
    `#!/usr/bin/env bash
# OpsPilot fail-closed ${tool} guard shim (generated per run; policy baked in)
decision=$(bun "${guardCli}" --tool ${shellQuote(tool)} --grants ${shellQuote(grants.join(','))} --ns ${shellQuote(nsLiteral)} --target ${shellQuote(targetLiteral)} --log ${shellQuote(guardLogPath)} -- "$@")
if [ "$decision" = "ALLOW" ]; then
  exec ${shellQuote(realTool)} "$@"
else
  echo "${tool}-guard: \${decision}" >&2
  exit 1
fi
`,
  );
  chmodSync(shimPath, 0o755);

  return { recipePath, guardLogPath, binDir: join(wd, 'bin'), grants, tool, realTool };
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export async function runGooseSkill(opts: EngineRunOptions): Promise<EngineRunOutcome> {
  const profile = opts.profile ?? 'k8s';
  const wd = resolve(opts.workdir);
  const { recipePath, guardLogPath, binDir } = prepWorkdir(opts);
  const rawPath = join(wd, 'run.stream.jsonl');
  const gooseBin = opts.gooseBin ?? 'goose';
  const timeoutMs = opts.timeoutMs ?? 300_000;

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
    GOOSE_MODE: 'auto',
  };
  if (profile === 'k8s' && opts.kubeconfig) env.KUBECONFIG = opts.kubeconfig;

  const paramKey = profile === 'docker' ? 'target' : 'namespace';
  const args = [
    'run',
    '--recipe',
    recipePath,
    '--params',
    `${paramKey}=${opts.target}`,
    '--no-session',
    '--output-format',
    'stream-json',
    '--quiet',
    '--max-turns',
    String(opts.maxTurns ?? 20),
  ];
  if (opts.provider) args.push('--provider', opts.provider);
  if (opts.model) args.push('--model', opts.model);

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

function findRealTool(tool: string, shimBinDir: string): string {
  const path = (process.env.PATH ?? '').split(':').filter((p) => p && resolve(p) !== resolve(shimBinDir));
  for (const dir of path) {
    const candidate = join(dir, tool);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      continue;
    }
  }
  // Never return a bare name: the shim would exec it, PATH would resolve it
  // back to the shim, and the run becomes a fork bomb (security review).
  throw new Error(`real ${tool} binary not found on PATH — refusing to generate shim`);
}
