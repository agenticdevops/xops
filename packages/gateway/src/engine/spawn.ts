// packages/gateway/src/engine/spawn.ts
import { spawn } from 'child_process';
import { accessSync, chmodSync, constants, mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';

const KILL_GRACE_MS = 15_000;

export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export function findRealTool(tool: string, shimBinDir: string): string {
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
  throw new Error(`real ${tool} binary not found on PATH — refusing to generate shim`);
}

export function writeGuardShim(params: {
  wd: string; tool: string; mode: string;
  guardLogPath: string; guardCliPath: string; realTool: string;
}): string {
  const { wd, tool, mode, guardLogPath, guardCliPath, realTool } = params;
  const shimPath = join(wd, 'bin', tool);
  writeFileSync(
    shimPath,
    `#!/usr/bin/env bash
# xops ${tool} guard shim (generated per run; policy baked in)
decision=$(bun "${guardCliPath}" --tool ${shellQuote(tool)} --mode ${shellQuote(mode)} --log ${shellQuote(guardLogPath)} -- "$@")
if [ "$decision" = "ALLOW" ]; then
  exec ${shellQuote(realTool)} "$@"
else
  echo "${tool}-guard: \${decision}" >&2
  exit 1
fi
`,
  );
  chmodSync(shimPath, 0o755);
  return shimPath;
}

/**
 * Generate a Claude Code fail-closed PreToolUse guard for the claude-acp path.
 * Writes <wd>/.claude/settings.json (a Bash PreToolUse hook) and
 * <wd>/guard-hook.sh (invokes guard-cli in --hook mode with the same baked
 * policy as the PATH shim). Honored by the claude-agent-acp SDK, which loads
 * project settings from its cwd (= the goose run workdir). Inert on native
 * providers (no Claude Code, settings never read).
 *
 * Policy is baked as literals; the hook is wrapped in a hard timeout and
 * defaults to deny (exit 2) on any failure, because Claude Code fails OPEN on
 * hook crash/timeout.
 */
export function writeClaudeGuardHook(params: {
  wd: string; tool: string; mode: string;
  guardLogPath: string; guardCliPath: string;
}): void {
  const { wd, tool, mode, guardLogPath, guardCliPath } = params;
  const hookPath = join(wd, 'guard-hook.sh');
  writeFileSync(
    hookPath,
    `#!/usr/bin/env bash
# xops fail-closed Claude Code PreToolUse guard (claude-acp; policy baked in).
# Reads the hook JSON on stdin, decides via guard-cli --hook. Deny (exit 2) on
# any error — Claude Code fails OPEN on hook crash, so we must deny explicitly.
set -uo pipefail
input=$(cat)
printf '%s' "$input" | timeout 10 bun ${shellQuote(guardCliPath)} --hook --tool ${shellQuote(tool)} --mode ${shellQuote(mode)} --log ${shellQuote(guardLogPath)}
rc=$?
if [ "$rc" = "0" ]; then exit 0; fi
if [ "$rc" = "2" ]; then exit 2; fi
echo "xops-guard: fail-closed (guard-cli rc=$rc)" >&2
exit 2
`,
  );
  chmodSync(hookPath, 0o755);

  mkdirSync(join(wd, '.claude'), { recursive: true });
  writeFileSync(
    join(wd, '.claude', 'settings.json'),
    JSON.stringify(
      { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: hookPath }] }] } },
      null,
      2,
    ),
  );
}

export function runGooseProcess(
  args: string[],
  opts: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number; gooseBin?: string },
): Promise<{ stdout: string; stderr: string; exitCode: number | null; timedOut: boolean }> {
  const chunks: Buffer[] = [];
  const errChunks: Buffer[] = [];
  let timedOut = false;
  return new Promise((resolvePromise) => {
    const proc = spawn(opts.gooseBin ?? 'goose', args, {
      cwd: opts.cwd, env: opts.env, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    proc.stdout.on('data', (d: Buffer) => chunks.push(d));
    proc.stderr.on('data', (d: Buffer) => errChunks.push(d));
    const killGroup = (signal: NodeJS.Signals) => {
      if (proc.pid) {
        try { process.kill(-proc.pid, signal); }
        catch { try { proc.kill(signal); } catch {} }
      }
    };
    const watchdog = setTimeout(() => {
      timedOut = true;
      killGroup('SIGTERM');
      setTimeout(() => killGroup('SIGKILL'), KILL_GRACE_MS).unref();
    }, opts.timeoutMs);
    const done = (code: number | null) => {
      clearTimeout(watchdog);
      resolvePromise({
        stdout: Buffer.concat(chunks).toString('utf8'),
        stderr: Buffer.concat(errChunks).toString('utf8'),
        exitCode: code, timedOut,
      });
    };
    proc.on('close', done);
    proc.on('error', () => done(null));
  });
}
