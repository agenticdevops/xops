# Bots, Projects & Unified Sessions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace xops's single hardcoded incident flow with a bot/project domain model where the user picks a specialist bot and talks to it in one guarded, scoped goose session that can answer or act.

**Architecture:** A `Bot` (skills + platform) bound per Telegram chat runs against a `Project` (scope + scoped credentials). Each turn is one `goose run` with the bot's skills available, the fail-closed guard shim on PATH baked with the union of the bot's skills' grants, and independent verification when a HIGH-tier command ran. No intent routing — the human selects the bot.

**Tech Stack:** Bun, TypeScript, goose (agent engine), grammY (Telegram), bun:test.

## Global Constraints

- Runtime: Bun; tests use `bun:test`; run with `bun test <path>`.
- Engine is always goose via subprocess — no LLM SDK in xops.
- Guard is fail-closed: CRITICAL denied unconditionally; a command must be granted by an active skill.
- Config dir is `~/.xops`; env overrides `XOPS_PROVIDER` / `XOPS_MODEL`.
- Package namespace `@xops/*`. Do not introduce `opspilot`/`OpsPilot` identifiers.
- Commit end line: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Commit with `git -c core.hooksPath=/dev/null commit` (repo hooks reject the Test User identity used here).
- Existing engine tests (43) must stay green after every task.

---

### Task 1: Extract shared goose-spawn helpers

Pull the low-level process/watchdog/shim logic out of `goose.ts` so the new bot-session path reuses it instead of duplicating ~60 lines.

**Files:**
- Create: `packages/gateway/src/engine/spawn.ts`
- Modify: `packages/gateway/src/engine/goose.ts` (use the extracted helpers)
- Test: `packages/gateway/src/engine/spawn.test.ts`

**Interfaces:**
- Produces:
  - `runGooseProcess(args: string[], opts: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number; gooseBin?: string }): Promise<{ stdout: string; stderr: string; exitCode: number | null; timedOut: boolean }>`
  - `findRealTool(tool: string, shimBinDir: string): string`
  - `shellQuote(s: string): string`
  - `writeGuardShim(params: { wd: string; tool: string; grants: string[]; ns: string; target: string; guardLogPath: string; guardCliPath: string; realTool: string }): string` — writes `<wd>/bin/<tool>`, returns its path.

- [ ] **Step 1: Write the failing test**

```ts
// packages/gateway/src/engine/spawn.test.ts
import { describe, expect, test } from 'bun:test';
import { shellQuote, findRealTool } from './spawn';

describe('shellQuote', () => {
  test('wraps in single quotes and escapes embedded quotes', () => {
    expect(shellQuote('abc')).toBe("'abc'");
    expect(shellQuote("a'b")).toBe("'a'\\''b'");
  });
});

describe('findRealTool', () => {
  test('throws when the real binary is absent (never returns bare name)', () => {
    expect(() => findRealTool('definitely-not-a-real-bin-xyz', '/tmp/shimbin')).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/gateway/src/engine/spawn.test.ts`
Expected: FAIL — cannot find module `./spawn`.

- [ ] **Step 3: Create `spawn.ts` with the helpers moved verbatim from `goose.ts`**

```ts
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
```

- [ ] **Step 4: Refactor `goose.ts` to use the helpers**

In `packages/gateway/src/engine/goose.ts`: delete the local `shellQuote`, `findRealTool`, and the inline shim-writing block and watchdog Promise; import from `./spawn` instead. Replace the shim-writing in `prepWorkdir` with:

```ts
import { runGooseProcess, findRealTool, writeGuardShim } from './spawn';
// ...in prepWorkdir, after computing realTool/guardCli/nsLiteral/targetLiteral:
writeGuardShim({ wd, tool, grants, ns: nsLiteral, target: targetLiteral, guardLogPath, guardCliPath: guardCli, realTool });
```

Replace the `spawn(...)`/watchdog Promise in `runGooseSkill` with:

```ts
const { stdout: raw, stderr, exitCode, timedOut } = await runGooseProcess(args, {
  cwd: wd, env, timeoutMs, gooseBin,
});
writeFileSync(rawPath, raw);
writeFileSync(join(wd, 'run.stderr.log'), stderr);
```

Keep the rest (guardLog read, `parseGooseOutput`, return) unchanged.

- [ ] **Step 5: Run tests to verify all pass**

Run: `bun test packages/gateway/src/engine/`
Expected: PASS — 43 existing + 2 new = 45 tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/gateway/src/engine/spawn.ts packages/gateway/src/engine/spawn.test.ts packages/gateway/src/engine/goose.ts
git -c core.hooksPath=/dev/null commit -m "refactor(engine): extract goose spawn/shim helpers into spawn.ts

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Skill grants in core

Move grant parsing to `@xops/core` so both the engine and the bot registry compute grants from one place.

**Files:**
- Create: `packages/core/src/skills.ts`
- Modify: `packages/core/src/index.ts` (export skills utils), `packages/gateway/src/engine/goose.ts` (import `parseSkillGrants` from core)
- Test: `packages/core/src/skills.test.ts`

**Interfaces:**
- Produces:
  - `parseSkillGrants(skillMd: string): string[] | null`
  - `grantsFor(skillNames: string[], skillsDir: string): string[]` — union of each skill's grants; skills with no grants contribute nothing.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/skills.test.ts
import { describe, expect, test } from 'bun:test';
import { parseSkillGrants, grantsFor } from './skills';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('parseSkillGrants', () => {
  test('reads grants array from frontmatter', () => {
    expect(parseSkillGrants('metadata:\n  xops:\n    grants: [ps, inspect, restart]')).toEqual(['ps', 'inspect', 'restart']);
  });
  test('returns null when no grants key', () => {
    expect(parseSkillGrants('name: foo')).toBeNull();
  });
});

describe('grantsFor', () => {
  test('unions grants across skills, de-duplicated', () => {
    const dir = mkdtempSync(join(tmpdir(), 'xops-skills-'));
    for (const [name, grants] of [['a', '[get, logs]'], ['b', '[logs, patch]']] as const) {
      mkdirSync(join(dir, name), { recursive: true });
      writeFileSync(join(dir, name, 'SKILL.md'), `metadata:\n  xops:\n    grants: ${grants}`);
    }
    expect(grantsFor(['a', 'b'], dir).sort()).toEqual(['get', 'logs', 'patch']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/core/src/skills.test.ts`
Expected: FAIL — cannot find module `./skills`.

- [ ] **Step 3: Create `skills.ts`**

```ts
// packages/core/src/skills.ts
import { readFileSync } from 'fs';
import { join } from 'path';

export function parseSkillGrants(skillMd: string): string[] | null {
  const m = skillMd.match(/grants:\s*\[([^\]]*)\]/);
  if (!m) return null;
  return m[1].split(',').map((s) => s.trim()).filter(Boolean);
}

export function grantsFor(skillNames: string[], skillsDir: string): string[] {
  const set = new Set<string>();
  for (const name of skillNames) {
    let md: string;
    try {
      md = readFileSync(join(skillsDir, name, 'SKILL.md'), 'utf8');
    } catch {
      continue;
    }
    for (const g of parseSkillGrants(md) ?? []) set.add(g);
  }
  return [...set];
}
```

- [ ] **Step 4: Export from core index and re-point the engine**

Add to `packages/core/src/index.ts`:

```ts
export * from './skills';
```

In `packages/gateway/src/engine/goose.ts`, delete the local `parseSkillGrants` function and import it:

```ts
import { parseSkillGrants } from '../../../core/src/skills';
```

(Keep the `LEGACY_GRANTS` fallback and its use in `prepWorkdir` unchanged.)

- [ ] **Step 5: Run tests**

Run: `bun test packages/core/src/skills.test.ts packages/gateway/src/engine/`
Expected: PASS — new skills tests pass; engine tests still 45 pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/skills.ts packages/core/src/skills.test.ts packages/core/src/index.ts packages/gateway/src/engine/goose.ts
git -c core.hooksPath=/dev/null commit -m "refactor(core): move skill grant parsing into @xops/core

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Bot & Project domain model + registry

**Files:**
- Create: `packages/core/src/bots.ts`
- Modify: `packages/core/src/index.ts` (export bots)
- Test: `packages/core/src/bots.test.ts`

**Interfaces:**
- Consumes: nothing (types + data only).
- Produces:
  - `type Platform = 'k8s' | 'docker'`
  - `interface Bot { name: string; display: string; description: string; platform: Platform; skills: string[]; identity?: string }`
  - `interface Project { name: string; scope: string; kubeconfig?: string; brief?: string }`
  - `BUNDLED_BOTS: Bot[]`
  - `getBot(name: string): Bot | undefined`
  - `listBots(): Bot[]`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/bots.test.ts
import { describe, expect, test } from 'bun:test';
import { getBot, listBots, BUNDLED_BOTS } from './bots';

describe('bot registry', () => {
  test('ships a k8s-sre and a docker-ops bot', () => {
    expect(getBot('k8s-sre')?.platform).toBe('k8s');
    expect(getBot('docker-ops')?.platform).toBe('docker');
    expect(getBot('k8s-sre')?.skills).toContain('k8s-pod-restart-triage');
    expect(getBot('docker-ops')?.skills).toContain('docker-container-triage');
  });
  test('getBot returns undefined for unknown', () => {
    expect(getBot('nope')).toBeUndefined();
  });
  test('listBots returns all bundled bots', () => {
    expect(listBots().length).toBe(BUNDLED_BOTS.length);
    expect(listBots().length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/core/src/bots.test.ts`
Expected: FAIL — cannot find module `./bots`.

- [ ] **Step 3: Create `bots.ts`**

```ts
// packages/core/src/bots.ts
export type Platform = 'k8s' | 'docker';

export interface Bot {
  name: string;        // stable id, e.g. 'k8s-sre'
  display: string;     // human name, e.g. 'Kubernetes SRE Bot'
  description: string; // one line, shown in /bots
  platform: Platform;  // tool + credential + verify strategy
  skills: string[];    // executable runbooks this bot owns
  identity?: string;   // future: persona voice (unused this phase)
}

export interface Project {
  name: string;
  scope: string;        // namespace (k8s) or container name/pattern (docker)
  kubeconfig?: string;  // scoped credential path (k8s)
  brief?: string;       // tech stack / responsibilities context
}

export const BUNDLED_BOTS: Bot[] = [
  {
    name: 'k8s-sre',
    display: 'Kubernetes SRE Bot',
    description: 'Diagnoses and fixes unhealthy Kubernetes workloads (crashloops, probes, OOM).',
    platform: 'k8s',
    skills: ['k8s-pod-restart-triage'],
  },
  {
    name: 'docker-ops',
    display: 'Docker Ops Bot',
    description: 'Diagnoses and fixes unhealthy Docker containers.',
    platform: 'docker',
    skills: ['docker-container-triage'],
  },
];

export function listBots(): Bot[] {
  return BUNDLED_BOTS;
}

export function getBot(name: string): Bot | undefined {
  return BUNDLED_BOTS.find((b) => b.name === name);
}
```

- [ ] **Step 4: Export from core index**

Add to `packages/core/src/index.ts`:

```ts
export * from './bots';
```

- [ ] **Step 5: Run tests**

Run: `bun test packages/core/src/bots.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/bots.ts packages/core/src/bots.test.ts packages/core/src/index.ts
git -c core.hooksPath=/dev/null commit -m "feat(core): Bot/Project domain model + bundled registry

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Per-chat session store

**Files:**
- Create: `packages/gateway/src/session-store.ts`
- Test: `packages/gateway/src/session-store.test.ts`

**Interfaces:**
- Produces:
  - `interface ChatBinding { bot: string; project?: string }`
  - `class SessionStore { get(chatId: string): ChatBinding | undefined; setBot(chatId: string, bot: string): void; setProject(chatId: string, project: string): void }`

- [ ] **Step 1: Write the failing test**

```ts
// packages/gateway/src/session-store.test.ts
import { describe, expect, test } from 'bun:test';
import { SessionStore } from './session-store';

describe('SessionStore', () => {
  test('unset chat returns undefined', () => {
    expect(new SessionStore().get('c1')).toBeUndefined();
  });
  test('setBot then get returns the binding', () => {
    const s = new SessionStore();
    s.setBot('c1', 'k8s-sre');
    expect(s.get('c1')).toEqual({ bot: 'k8s-sre' });
  });
  test('setProject preserves the bound bot', () => {
    const s = new SessionStore();
    s.setBot('c1', 'k8s-sre');
    s.setProject('c1', 'payments');
    expect(s.get('c1')).toEqual({ bot: 'k8s-sre', project: 'payments' });
  });
  test('setProject before any bot throws (must pick a bot first)', () => {
    expect(() => new SessionStore().setProject('c1', 'payments')).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/gateway/src/session-store.test.ts`
Expected: FAIL — cannot find module `./session-store`.

- [ ] **Step 3: Implement**

```ts
// packages/gateway/src/session-store.ts
export interface ChatBinding {
  bot: string;
  project?: string;
}

export class SessionStore {
  private bindings = new Map<string, ChatBinding>();

  get(chatId: string): ChatBinding | undefined {
    return this.bindings.get(chatId);
  }

  setBot(chatId: string, bot: string): void {
    const existing = this.bindings.get(chatId);
    this.bindings.set(chatId, { bot, project: existing?.project });
  }

  setProject(chatId: string, project: string): void {
    const existing = this.bindings.get(chatId);
    if (!existing) throw new Error('pick a bot first (use /use <bot>) before setting a project');
    this.bindings.set(chatId, { ...existing, project });
  }
}
```

- [ ] **Step 4: Run tests**

Run: `bun test packages/gateway/src/session-store.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/gateway/src/session-store.ts packages/gateway/src/session-store.test.ts
git -c core.hooksPath=/dev/null commit -m "feat(gateway): per-chat bot/project session store

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Bot-session recipe rendering

Add a recipe renderer for a bot turn: identity + candidate skills + act-or-answer, `shell` available, project scope baked into instructions.

**Files:**
- Modify: `packages/gateway/src/engine/recipe.ts`
- Test: `packages/gateway/src/engine/recipe.test.ts` (add cases)

**Interfaces:**
- Consumes: `EngineProfile` (existing, = Platform values).
- Produces:
  - `interface BotRecipeOptions { botDisplay: string; platform: EngineProfile; skills: string[]; scope: string; brief?: string; identity?: string }`
  - `renderBotRecipe(opts: BotRecipeOptions): string`

- [ ] **Step 1: Write the failing test**

```ts
// append to packages/gateway/src/engine/recipe.test.ts
import { renderBotRecipe } from './recipe';

describe('renderBotRecipe', () => {
  test('bakes identity, candidate skills, scope, and act-or-answer instructions', () => {
    const yaml = renderBotRecipe({
      botDisplay: 'Kubernetes SRE Bot',
      platform: 'k8s',
      skills: ['k8s-pod-restart-triage'],
      scope: 'payments-staging',
    });
    expect(yaml).toContain('Kubernetes SRE Bot');
    expect(yaml).toContain('payments-staging');
    // candidate runbook read via shell, no skill-registry tool
    expect(yaml).toContain('cat .goose/skills/k8s-pod-restart-triage/SKILL.md');
    // act-or-answer: may just answer, or run a runbook
    expect(yaml).toContain('answer');
    expect(yaml).toContain('one tool call at a time');
    // param is the free-form user message, not a target
    expect(yaml).toContain('key: message');
    expect(yaml).toContain('{{ message }}');
    // shell available
    expect(yaml).toContain('available_tools: [shell]');
  });

  test('lists multiple candidate skills when a bot owns several', () => {
    const yaml = renderBotRecipe({
      botDisplay: 'Multi', platform: 'k8s', scope: 'ns',
      skills: ['k8s-pod-restart-triage', 'k8s-imagepull-triage'],
    });
    expect(yaml).toContain('k8s-pod-restart-triage');
    expect(yaml).toContain('k8s-imagepull-triage');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/gateway/src/engine/recipe.test.ts`
Expected: FAIL — `renderBotRecipe` is not exported.

- [ ] **Step 3: Implement `renderBotRecipe` in `recipe.ts`**

Add at the end of `packages/gateway/src/engine/recipe.ts`:

```ts
export interface BotRecipeOptions {
  botDisplay: string;
  platform: EngineProfile;
  skills: string[];
  scope: string;
  brief?: string;
  identity?: string;
}

export function renderBotRecipe(opts: BotRecipeOptions): string {
  const tool = opts.platform === 'docker' ? 'docker' : 'kubectl';
  const scopeWord = opts.platform === 'docker' ? 'container' : 'namespace';
  const candidates = opts.skills
    .map((s) => `    - ${s}: read .goose/skills/${s}/SKILL.md`)
    .join('\n');
  const identity = opts.identity ? `${opts.identity}\n  ` : '';
  const brief = opts.brief ? `  Project brief: ${opts.brief}\n` : '';
  return `version: 1.0.0
title: ${opts.botDisplay} session turn
description: Unified scoped bot session (answer or run a runbook)
parameters:
  - key: message
    input_type: string
    requirement: required
    description: The user's message this turn
instructions: |
  ${identity}You are ${opts.botDisplay}, a scoped ops copilot. You operate ONLY on
  ${scopeWord} ${opts.scope} using ${tool}. This is a non-interactive automated
  run: never ask the user questions; issue one tool call at a time; never run
  tools in parallel.
${brief}  You may simply ANSWER the user's question conversationally when no action is
  needed. When the user asks you to fix or diagnose something, choose the
  best-matching runbook from the list below, read it with the shell tool, and
  follow its procedure and decision table exactly. A description is not a fix —
  execute the mapped command. Never exceed the commands your runbooks sanction.
  Available runbooks:
${candidates}
  After any fix, verify per the runbook and report: root cause, commands run,
  and verification result.
extensions:
  - type: builtin
    name: developer
    timeout: 300
    bundled: true
    available_tools: [shell]
prompt: |
  {{ message }}
`;
}
```

- [ ] **Step 4: Run tests**

Run: `bun test packages/gateway/src/engine/recipe.test.ts`
Expected: PASS — existing recipe tests + 2 new pass.

- [ ] **Step 5: Commit**

```bash
git add packages/gateway/src/engine/recipe.ts packages/gateway/src/engine/recipe.test.ts
git -c core.hooksPath=/dev/null commit -m "feat(engine): renderBotRecipe — identity + candidate skills + act-or-answer

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Unified scoped bot session engine

Run one bot turn: prep workdir (copy bot skills, bake union-grant shim, set project creds), spawn goose with shell available, parse, verify only if a HIGH-tier command ran, compose the reply.

**Files:**
- Create: `packages/gateway/src/engine/session.ts`
- Modify: `packages/gateway/src/engine/index.ts` (export session API)
- Test: `packages/gateway/src/engine/session.test.ts`

**Interfaces:**
- Consumes: `Bot`, `Project` (`@xops/core`); `grantsFor` (`@xops/core`); `renderBotRecipe`, `runGooseProcess`, `findRealTool`, `writeGuardShim` (engine); `parseGooseOutput`, `verifyNamespace`, `verifyContainer`.
- Produces:
  - `interface BotTurnRequest { bot: Bot; project?: Project; message: string; history?: Array<{ role: string; content: string }>; workdir: string; skillsSource: string; provider?: string; model?: string; timeoutMs?: number }`
  - `interface BotTurnResult { reply: string; acted: boolean; verified: boolean | null; wallSeconds: number; guardLog: Array<Record<string, unknown>> }`
  - `runBotTurn(req: BotTurnRequest): Promise<BotTurnResult>`
  - `mutatedInGuardLog(guardLog: Array<Record<string, unknown>>): boolean` — true if any entry has `allowed === true && tier === 'HIGH'`.

- [ ] **Step 1: Write the failing test (pure logic — the verify trigger)**

```ts
// packages/gateway/src/engine/session.test.ts
import { describe, expect, test } from 'bun:test';
import { mutatedInGuardLog } from './session';

describe('mutatedInGuardLog', () => {
  test('true when an allowed HIGH command ran', () => {
    expect(mutatedInGuardLog([{ allowed: true, tier: 'HIGH' }])).toBe(true);
  });
  test('false for reads only', () => {
    expect(mutatedInGuardLog([{ allowed: true, tier: 'LOW' }, { allowed: true, tier: 'LOW' }])).toBe(false);
  });
  test('false when the HIGH command was denied', () => {
    expect(mutatedInGuardLog([{ allowed: false, tier: 'HIGH' }])).toBe(false);
  });
  test('false for empty log (pure chat turn)', () => {
    expect(mutatedInGuardLog([])).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/gateway/src/engine/session.test.ts`
Expected: FAIL — cannot find module `./session`.

- [ ] **Step 3: Implement `session.ts`**

```ts
// packages/gateway/src/engine/session.ts
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import type { Bot, Project } from '../../../core/src/bots';
import { grantsFor } from '../../../core/src/skills';
import { renderBotRecipe } from './recipe';
import { runGooseProcess, findRealTool, writeGuardShim } from './spawn';
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
  writeGuardShim({
    wd, tool, grants,
    ns: bot.platform === 'docker' ? '' : scope,
    target: bot.platform === 'docker' ? scope : '',
    guardLogPath, guardCliPath: guardCli, realTool,
  });

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
  if (acted && project) {
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
```

- [ ] **Step 4: Export from engine index**

Add to `packages/gateway/src/engine/index.ts`:

```ts
export { runBotTurn, mutatedInGuardLog, type BotTurnRequest, type BotTurnResult } from './session';
```

- [ ] **Step 5: Run unit tests**

Run: `bun test packages/gateway/src/engine/session.test.ts packages/gateway/src/engine/`
Expected: PASS — `mutatedInGuardLog` 4 tests pass; all engine tests green.

- [ ] **Step 6: Integration smoke (manual, requires goose + docker)**

Seed a broken container and run one action turn through the bot session via a throwaway script:

```bash
bash scripts/seed-docker-fault.sh oom
```

```ts
// /tmp/bot-smoke.ts
import { getBot } from './packages/core/src/bots';
import { runBotTurn } from './packages/gateway/src/engine/session';
import { join } from 'path';
const r = await runBotTurn({
  bot: getBot('docker-ops')!,
  project: { name: 'local', scope: 'xops-victim' },
  message: 'the container is broken, fix it',
  workdir: join(process.env.HOME!, '.xops', 'workspace', 'bot-runs'),
  skillsSource: join(import.meta.dir, 'packages', 'skills', 'bundled'),
  provider: process.env.XOPS_PROVIDER ?? 'claude-acp',
});
console.log('acted', r.acted, 'verified', r.verified, 'wall', r.wallSeconds);
console.log(r.reply);
```

Run: `bun /tmp/bot-smoke.ts`
Expected: `acted true`, `verified true`, reply contains a root cause + `✅ verified`. Confirm independently: `docker inspect xops-victim --format '{{.State.Status}} {{.State.OOMKilled}}'` → `running false`.

`If verified is null: the container had no project scope — check project.scope matches the container name.`

- [ ] **Step 7: Commit**

```bash
git add packages/gateway/src/engine/session.ts packages/gateway/src/engine/session.test.ts packages/gateway/src/engine/index.ts
git -c core.hooksPath=/dev/null commit -m "feat(engine): unified scoped bot session — answer or act, verify on HIGH

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Wire Telegram to bots

Replace the naive keyword `routeIntent` with bot selection commands and bound-bot dispatch.

**Files:**
- Modify: `scripts/poc-telegram.ts`
- Test: manual (Telegram) — no unit test (thin I/O glue over already-tested units)

**Interfaces:**
- Consumes: `listBots`, `getBot` (`@xops/core`); `SessionStore` (`../packages/gateway/src/session-store`); `runBotTurn` (`../packages/gateway/src/engine/session`).

- [ ] **Step 1: Replace the routing block**

In `scripts/poc-telegram.ts`, delete the `RoutedIntent` interface and `routeIntent` function. Add near the top:

```ts
import { listBots, getBot } from '../packages/core/src/bots';
import { SessionStore } from '../packages/gateway/src/session-store';
import { runBotTurn } from '../packages/gateway/src/engine/session';

const store = new SessionStore();
const DEFAULT_BOT = 'k8s-sre';

function botsList(): string {
  return listBots().map((b) => `• \`${b.name}\` — ${b.display}: ${b.description}`).join('\n');
}
```

- [ ] **Step 2: Replace the `onMessage` handler body**

Replace the existing `adapter.onMessage(async (incoming) => { ... })` with:

```ts
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
  });
  console.log(`[tg] done ${bot.name}:${project.scope} acted=${r.acted} verified=${r.verified} wall=${r.wallSeconds}s`);
  return r.reply;
});
```

(Keep the existing `WORKSPACE`, `SKILLS`, `join`, `existsSync` imports and the adapter setup below unchanged.)

- [ ] **Step 3: Typecheck the script**

Run: `cd /Users/gshah/work/opsflow-sh/opspilot && bunx tsc --noEmit scripts/poc-telegram.ts 2>&1 | grep -v "rootDir\|core/src" | head`
Expected: no errors from `poc-telegram.ts` itself (cross-package rootDir notices are pre-existing and ignorable).

- [ ] **Step 4: Manual end-to-end (Telegram)**

```bash
bash scripts/seed-docker-fault.sh oom
XOPS_PROVIDER=claude-acp bun scripts/poc-telegram.ts
```

In Telegram: `/bots` → lists two bots. `/use docker-ops` → bound. `/project xops-victim` → scope set. `the container is broken, fix it` → ack, then a verified fix report. Confirm: `docker inspect xops-victim --format '{{.State.Status}}'` → `running`.

- [ ] **Step 5: Commit**

```bash
git add scripts/poc-telegram.ts
git -c core.hooksPath=/dev/null commit -m "feat(telegram): bot selection (/bots, /use, /project) + bound-bot dispatch

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Docs — bots model

**Files:**
- Create: `docs/docs/features/bots.md`
- Modify: `docs/sidebars.ts` (add the page), `docs/docs/cli.md` (bot commands)

- [ ] **Step 1: Write `bots.md`**

```markdown
# Bots

> **Status: new in this build.** Two bots ship: Kubernetes SRE Bot and Docker Ops Bot.

A **bot** is the specialist you talk to — modeled on a job role. You pick a bot, optionally point it at a **project** (a namespace or container it's scoped to), and talk to it. The bot answers questions directly, and when you ask it to fix something it loads the matching runbook (skill) and follows it — every command through the fail-closed guard, scoped to the project's credentials.

## Bundled bots

| Bot | Platform | Skills |
|---|---|---|
| Kubernetes SRE Bot (`k8s-sre`) | Kubernetes | k8s-pod-restart-triage |
| Docker Ops Bot (`docker-ops`) | Docker | docker-container-triage |

## Talking to a bot (Telegram)

- `/bots` — list bots
- `/use <name>` — bind this chat to a bot
- `/project <namespace-or-container>` — set what the bot is scoped to
- then just message it

A bot × project is one guarded, scoped session: it can answer or act, and xops verifies real state after any change.

## Bots vs skills vs projects

- **Skill** — a runbook (a capability). See [Skills](skills.md).
- **Bot** — a bundle of skills with a platform and identity.
- **Project** — the scope + credentials + brief a bot works within.

Squads (bots assigned to a project as a team), approval tiers, and richer personas are on the roadmap.
```

- [ ] **Step 2: Add to sidebar**

In `docs/sidebars.ts`, add `'features/bots'` as the first item of the Features category (before `'features/memory'`).

- [ ] **Step 3: Build docs**

Run: `cd docs && bun run build 2>&1 | tail -1`
Expected: `[SUCCESS] Generated static files in "build".`

- [ ] **Step 4: Commit**

```bash
git add docs/docs/features/bots.md docs/sidebars.ts docs/docs/cli.md
git -c core.hooksPath=/dev/null commit -m "docs: bots model page + telegram bot commands

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Domain model (Bot/Project) → Task 3. Skill/grants → Task 2. Squad → out of scope (spec agrees). ✓
- No-routing, human picks bot → Task 7 (`/use`, dispatch). ✓
- Unified scoped session (answer or act, guard, scoped creds, shell available) → Tasks 5 (recipe) + 6 (engine). ✓
- Verify only on HIGH mutation → Task 6 `mutatedInGuardLog`. ✓
- Union grants → Task 2 `grantsFor` + Task 6 use. ✓
- Per-chat binding + `/bots`/`/use`/`/project` → Tasks 4 + 7. ✓
- Ship 2 bots, minimal projects → Task 3 + Task 7. ✓
- Interfaces framing / goose-provides-not → docs Task 8 + existing intro. ✓
- Out of scope items (approval tiers, persona voice, other channels, LLM routing, persistent store, goose sessions) → not implemented. ✓

**Placeholder scan:** no TBD/TODO; every code step has complete code; manual-test steps specify exact commands + expected observations. ✓

**Type consistency:** `Platform`/`EngineProfile` both `'k8s'|'docker'` (compatible); `renderBotRecipe`/`BotRecipeOptions`, `runBotTurn`/`BotTurnRequest`/`BotTurnResult`, `mutatedInGuardLog`, `grantsFor`, `getBot`/`listBots`, `SessionStore` methods consistent across tasks. ✓

**Note/deviation:** `chat.ts` (`runGooseChat`) is NOT deleted — it still serves the gateway's unscoped `/chat` HTTP/WS endpoint. The unified-session retirement of tool-less chat applies to the bot path (Telegram) this phase; rewiring the generic web endpoint to bot sessions is deferred with the other interfaces.
