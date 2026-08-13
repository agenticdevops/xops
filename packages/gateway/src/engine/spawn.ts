// packages/gateway/src/engine/spawn.ts
import { spawn } from 'child_process';
import { accessSync, chmodSync, constants, writeFileSync } from 'fs';
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
  wd: string; tool: string; grants: string[]; ns: string; target: string;
  guardLogPath: string; guardCliPath: string; realTool: string;
}): string {
  const { wd, tool, grants, ns, target, guardLogPath, guardCliPath, realTool } = params;
  const shimPath = join(wd, 'bin', tool);
  writeFileSync(
    shimPath,
    `#!/usr/bin/env bash
# xops fail-closed ${tool} guard shim (generated per run; policy baked in)
decision=$(bun "${guardCliPath}" --tool ${shellQuote(tool)} --grants ${shellQuote(grants.join(','))} --ns ${shellQuote(ns)} --target ${shellQuote(target)} --log ${shellQuote(guardLogPath)} -- "$@")
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
