# Web Chat UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A browser SPA to chat with an xops bot and watch the turn stream live — agent text, per-command guard decisions, and the verification verdict — over a WebSocket to the existing gateway.

**Architecture:** React/TS SPA in `apps/web` ↔ Hono gateway over WebSocket. A new `streamBotTurn` async generator emits `BotTurnEvent`s (text/guard/verify/done); `runBotTurn` is reimplemented on top of it so there is one execution path. The gateway forwards events over WS; the browser renders incrementally. Engine stays server-side (browser can't run goose).

**Tech Stack:** Bun, TypeScript, Hono (gateway), Bun.serve WebSocket, Vite + React 18 (frontend), bun:test.

## Global Constraints

- Runtime Bun; tests use `bun:test`, run with `bun test <path>`. Frontend built with Vite.
- Package namespace `@xops/*`. No `opspilot`/`OpsPilot` identifiers.
- The engine runs on the host; the browser only talks to the gateway. No auth (localhost-only), no persistence for v1.
- Guard mode values are exactly `'auto' | 'safe'`. Event `type` values are exactly `text | guard | verify | done | error`.
- Existing engine + gateway tests must stay green after every task (`bun test packages/`).
- Commit with `git -c core.hooksPath=/dev/null commit`; end messages with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Incremental stream-json text parser

goose `--output-format stream-json` emits JSONL; each assistant `text` block carries a delta fragment (the batch parser in `parse.ts` concatenates them). For live streaming we need a stateful parser fed arbitrary chunks that yields completed text fragments and buffers a partial trailing line.

**Files:**
- Create: `packages/gateway/src/engine/stream-parse.ts`
- Test: `packages/gateway/src/engine/stream-parse.test.ts`

**Interfaces:**
- Produces:
  - `class StreamJsonTextParser { push(chunk: string): string[] }` — returns text-delta fragments found in completed lines of (buffer + chunk); keeps the remainder buffered. Non-assistant / non-text lines yield nothing. Garbage lines are skipped.

- [ ] **Step 1: Write the failing test**

```ts
// packages/gateway/src/engine/stream-parse.test.ts
import { describe, expect, test } from 'bun:test';
import { StreamJsonTextParser } from './stream-parse';

const line = (obj: unknown) => JSON.stringify(obj) + '\n';
const asst = (text: string) =>
  line({ type: 'message', message: { role: 'assistant', content: [{ type: 'text', text }] } });

describe('StreamJsonTextParser', () => {
  test('emits text fragments from complete lines in order', () => {
    const p = new StreamJsonTextParser();
    expect(p.push(asst('Root '))).toEqual(['Root ']);
    expect(p.push(asst('cause: OOM.'))).toEqual(['cause: OOM.']);
  });

  test('buffers a partial trailing line until completed', () => {
    const p = new StreamJsonTextParser();
    const full = asst('hello');
    const cut = Math.floor(full.length / 2);
    expect(p.push(full.slice(0, cut))).toEqual([]); // incomplete line
    expect(p.push(full.slice(cut))).toEqual(['hello']);
  });

  test('ignores non-text blocks (thinking, toolRequest) and garbage', () => {
    const p = new StreamJsonTextParser();
    expect(p.push(line({ type: 'message', message: { role: 'assistant', content: [{ type: 'thinking', thinking: 'hm' }] } }))).toEqual([]);
    expect(p.push('not json\n')).toEqual([]);
    expect(p.push(line({ type: 'message', message: { role: 'user', content: [{ type: 'text', text: 'q' }] } }))).toEqual([]);
  });

  test('multiple complete lines in one chunk emit in order', () => {
    const p = new StreamJsonTextParser();
    expect(p.push(asst('a') + asst('b'))).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/gateway/src/engine/stream-parse.test.ts`
Expected: FAIL — cannot find module `./stream-parse`.

- [ ] **Step 3: Implement**

```ts
// packages/gateway/src/engine/stream-parse.ts
/**
 * Incremental parser for goose --output-format stream-json (JSONL). Fed
 * arbitrary chunks; returns assistant text-delta fragments from any COMPLETE
 * lines, buffering a partial trailing line for the next push. Batch equivalent:
 * parseGooseOutput in parse.ts.
 */
export class StreamJsonTextParser {
  private buf = '';

  push(chunk: string): string[] {
    this.buf += chunk;
    const out: string[] = [];
    let nl: number;
    while ((nl = this.buf.indexOf('\n')) !== -1) {
      const line = this.buf.slice(0, nl).trim();
      this.buf = this.buf.slice(nl + 1);
      if (!line) continue;
      let ev: any;
      try {
        ev = JSON.parse(line);
      } catch {
        continue;
      }
      const msg = ev?.type === 'message' ? ev.message : null;
      if (!msg || msg.role !== 'assistant') continue;
      for (const block of msg.content ?? []) {
        if (block?.type === 'text' && block.text) out.push(block.text);
      }
    }
    return out;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/gateway/src/engine/stream-parse.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/gateway/src/engine/stream-parse.ts packages/gateway/src/engine/stream-parse.test.ts
git -c core.hooksPath=/dev/null commit -m "feat(engine): incremental stream-json text parser for live streaming

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: onStdout callback on runGooseProcess

Let callers observe stdout as it arrives (for streaming) without changing the buffered return.

**Files:**
- Modify: `packages/gateway/src/engine/spawn.ts`
- Test: `packages/gateway/src/engine/spawn.test.ts` (add a case)

**Interfaces:**
- Consumes: existing `runGooseProcess(args, opts)`.
- Produces: `runGooseProcess(args, { cwd, env, timeoutMs, gooseBin?, onStdout?: (chunk: string) => void })` — `onStdout` is called with each stdout chunk (string) as it arrives, in addition to the buffered `stdout` in the resolved result.

- [ ] **Step 1: Write the failing test**

```ts
// append to packages/gateway/src/engine/spawn.test.ts
import { runGooseProcess } from './spawn';

test('runGooseProcess streams stdout chunks to onStdout', async () => {
  const chunks: string[] = [];
  // use `bash` as a stand-in that prints two lines then exits
  const res = await runGooseProcess(['-c', 'printf "a\\n"; printf "b\\n"'], {
    cwd: process.cwd(),
    env: process.env,
    timeoutMs: 5000,
    gooseBin: 'bash',
    onStdout: (c) => chunks.push(c),
  });
  expect(res.exitCode).toBe(0);
  expect(chunks.join('')).toContain('a');
  expect(chunks.join('')).toContain('b');
  expect(res.stdout).toContain('a');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/gateway/src/engine/spawn.test.ts`
Expected: FAIL — `onStdout` not called / not in options type.

- [ ] **Step 3: Implement**

In `packages/gateway/src/engine/spawn.ts`, change `runGooseProcess`'s options type to add `onStdout?: (chunk: string) => void`, and in the stdout data handler call it:

```ts
export function runGooseProcess(
  args: string[],
  opts: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number; gooseBin?: string; onStdout?: (chunk: string) => void },
): Promise<{ stdout: string; stderr: string; exitCode: number | null; timedOut: boolean }> {
```

In the `proc.stdout.on('data', ...)` handler, after pushing to the buffer, add:

```ts
    proc.stdout.on('data', (d: Buffer) => {
      chunks.push(d);
      opts.onStdout?.(d.toString('utf8'));
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/gateway/src/engine/spawn.test.ts`
Expected: PASS — existing spawn tests + the new streaming case.

- [ ] **Step 5: Commit**

```bash
git add packages/gateway/src/engine/spawn.ts packages/gateway/src/engine/spawn.test.ts
git -c core.hooksPath=/dev/null commit -m "feat(engine): onStdout callback on runGooseProcess for live streaming

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: streamBotTurn async generator + runBotTurn on top of it

Turn one bot turn into a live event stream, and reimplement `runBotTurn` by draining it (one execution path).

**Files:**
- Modify: `packages/gateway/src/engine/session.ts`
- Modify: `packages/gateway/src/engine/index.ts` (export `streamBotTurn`, `BotTurnEvent`)
- Test: `packages/gateway/src/engine/session.test.ts` (add a drain-equivalence unit test using a pure helper)

**Interfaces:**
- Consumes: `StreamJsonTextParser` (Task 1); `runGooseProcess` with `onStdout` (Task 2); existing prep helpers (`findRealTool`, `writeGuardShim`, `writeClaudeGuardHook`), `renderBotRecipe`, `verifyContainer`/`verifyNamespace`, `shouldVerify`.
- Produces:
  - `type BotTurnEvent = { type: 'text'; delta: string } | { type: 'guard'; tool: string; command: string; allowed: boolean; tier?: string; category?: string } | { type: 'verify'; healthy: boolean; summary: string } | { type: 'done'; wallSeconds: number; acted: boolean; verified: boolean | null } | { type: 'error'; message: string }`
  - `streamBotTurn(req: BotTurnRequest): AsyncGenerator<BotTurnEvent>`
  - `runBotTurn(req: BotTurnRequest): Promise<BotTurnResult>` — same contract as today, now draining `streamBotTurn`.

- [ ] **Step 1: Write the failing test (drain equivalence, pure)**

```ts
// append to packages/gateway/src/engine/session.test.ts
import { drainToResult, type BotTurnEvent } from './session';

describe('drainToResult', () => {
  test('assembles a BotTurnResult from an event stream', async () => {
    async function* scripted(): AsyncGenerator<BotTurnEvent> {
      yield { type: 'text', delta: 'Root cause: OOM. ' };
      yield { type: 'guard', tool: 'docker', command: 'docker update --memory 32m x', allowed: true, tier: 'HIGH', category: 'write' };
      yield { type: 'text', delta: 'Fixed.' };
      yield { type: 'verify', healthy: true, summary: 'x running' };
      yield { type: 'done', wallSeconds: 12, acted: true, verified: true };
    }
    const r = await drainToResult(scripted());
    expect(r.reply).toContain('Root cause: OOM.');
    expect(r.reply).toContain('Fixed.');
    expect(r.reply).toContain('x running');
    expect(r.acted).toBe(true);
    expect(r.verified).toBe(true);
    expect(r.wallSeconds).toBe(12);
    expect(r.guardLog.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/gateway/src/engine/session.test.ts`
Expected: FAIL — `drainToResult` / `BotTurnEvent` not exported.

- [ ] **Step 3: Implement in `session.ts`**

Add the event type and a small async queue, rewrite the turn body as a generator, add `drainToResult`, and reimplement `runBotTurn`. Replace the existing `runBotTurn` implementation with:

```ts
export type BotTurnEvent =
  | { type: 'text'; delta: string }
  | { type: 'guard'; tool: string; command: string; allowed: boolean; tier?: string; category?: string }
  | { type: 'verify'; healthy: boolean; summary: string }
  | { type: 'done'; wallSeconds: number; acted: boolean; verified: boolean | null }
  | { type: 'error'; message: string };

import { watch, readFileSync as readFileSyncNode } from 'fs'; // note: readFileSync already imported; reuse it

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
    let outcome: Awaited<ReturnType<typeof runGooseProcess>> | null = null;
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
    yield { type: 'done', wallSeconds: Math.round((Date.now() - started) / 1000), acted, verified };
  } catch (err) {
    yield { type: 'error', message: (err as Error).message };
    yield { type: 'done', wallSeconds: Math.round((Date.now() - started) / 1000), acted: false, verified: null };
  }
}

export async function drainToResult(stream: AsyncGenerator<BotTurnEvent>): Promise<BotTurnResult> {
  let text = '';
  let verifyLine = '';
  let acted = false;
  let verified: boolean | null = null;
  let wallSeconds = 0;
  const guardLog: Array<Record<string, unknown>> = [];
  for await (const e of stream) {
    if (e.type === 'text') text += e.delta;
    else if (e.type === 'guard') guardLog.push({ tool: e.tool, command: e.command, allowed: e.allowed, tier: e.tier, category: e.category });
    else if (e.type === 'verify') verifyLine = `\n\n---\n${e.healthy ? '✅ verified' : '⚠️ NOT verified'}: ${e.summary}`;
    else if (e.type === 'done') { acted = e.acted; verified = e.verified; wallSeconds = e.wallSeconds; }
    else if (e.type === 'error') text += `\n[error] ${e.message}`;
  }
  return { reply: `${text}${verifyLine}`.trim() || '(no reply produced)', acted, verified, wallSeconds, guardLog };
}

export function runBotTurn(req: BotTurnRequest): Promise<BotTurnResult> {
  return drainToResult(streamBotTurn(req));
}
```

Remove the old `runBotTurn` body (the buffered implementation) — `drainToResult(streamBotTurn(...))` replaces it. Keep `mutatedInGuardLog`, `shouldVerify`, `BotTurnRequest`, `BotTurnResult` as they are. Ensure `watch` is imported from `'fs'` (add to the existing `fs` import; drop the stray `readFileSyncNode` alias — reuse the already-imported `readFileSync`).

- [ ] **Step 4: Export from engine index**

In `packages/gateway/src/engine/index.ts`, extend the session export:

```ts
export { runBotTurn, streamBotTurn, drainToResult, mutatedInGuardLog, shouldVerify, type BotTurnRequest, type BotTurnResult, type BotTurnEvent } from './session';
```

- [ ] **Step 5: Run tests**

Run: `bun test packages/gateway/src/engine/`
Expected: PASS — `drainToResult` test passes; all prior engine tests stay green (runBotTurn contract preserved).

- [ ] **Step 6: Manual streaming smoke (requires goose + docker)**

```bash
bash scripts/seed-docker-fault.sh oom
```

```ts
// /tmp/stream-smoke.ts
import { getBot } from './packages/core/src/bots';
import { streamBotTurn } from './packages/gateway/src/engine/session';
import { join } from 'path';
for await (const e of streamBotTurn({
  bot: getBot('docker-ops')!, project: { name: 'l', scope: 'xops-victim' },
  message: 'fix it', workdir: join(process.env.HOME!, '.xops', 'workspace', 'stream'),
  skillsSource: join(import.meta.dir, 'packages', 'skills', 'bundled'),
  provider: process.env.XOPS_PROVIDER ?? 'claude-acp',
})) console.log(e.type, e.type === 'text' ? JSON.stringify(e.delta) : JSON.stringify(e));
```

Run: `XOPS_PROVIDER=claude-acp bun /tmp/stream-smoke.ts`
Expected: `guard` and `text` events print DURING the run (not all at the end), then a `verify` and a `done`. If they only appear at the very end, the `onStdout`/`watch` wiring is not live — report it.

- [ ] **Step 7: Commit**

```bash
git add packages/gateway/src/engine/session.ts packages/gateway/src/engine/index.ts packages/gateway/src/engine/session.test.ts
git -c core.hooksPath=/dev/null commit -m "feat(engine): streamBotTurn async generator; runBotTurn drains it (one path)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Gateway GET /bots

**Files:**
- Modify: `packages/gateway/src/server.ts`
- Test: `packages/gateway/src/bots-endpoint.test.ts`

**Interfaces:**
- Consumes: `listBots` from `@xops/core`.
- Produces: `GET /bots` → `{ bots: Array<{ name: string; display: string; description: string; platform: string; skills: string[] }> }`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/gateway/src/bots-endpoint.test.ts
import { describe, expect, test } from 'bun:test';
import { GatewayServer } from './server';

function makeConfig() {
  return { ai: { provider: 'goose', model: 'x' }, channels: {}, gateway: { bind: '127.0.0.1', port: 0 } } as any;
}

describe('GET /bots', () => {
  test('returns the bundled bots with name/display/platform/skills', async () => {
    const app = new GatewayServer({ config: makeConfig() }).getApp();
    const res = await app.request('/bots');
    expect(res.status).toBe(200);
    const body = await res.json();
    const names = body.bots.map((b: any) => b.name);
    expect(names).toContain('docker-ops');
    expect(names).toContain('k8s-sre');
    const docker = body.bots.find((b: any) => b.name === 'docker-ops');
    expect(docker.platform).toBe('docker');
    expect(Array.isArray(docker.skills)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/gateway/src/bots-endpoint.test.ts`
Expected: FAIL — 404 (route not defined).

- [ ] **Step 3: Implement**

In `packages/gateway/src/server.ts`, add an import at the top:

```ts
import { listBots } from '../../core/src/bots';
```

In `setupRoutes()`, after the `/status` route, add:

```ts
    this.app.get('/bots', (c) => {
      return c.json({
        bots: listBots().map((b) => ({
          name: b.name, display: b.display, description: b.description, platform: b.platform, skills: b.skills,
        })),
      });
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/gateway/src/bots-endpoint.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/gateway/src/server.ts packages/gateway/src/bots-endpoint.test.ts
git -c core.hooksPath=/dev/null commit -m "feat(gateway): GET /bots endpoint for the web UI picker

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Gateway WebSocket chat — forward streamed events

**Files:**
- Create: `packages/gateway/src/ws-chat.ts` (pure forwarder, testable)
- Modify: `packages/gateway/src/server.ts` (wire the WS handler to it)
- Test: `packages/gateway/src/ws-chat.test.ts`

**Interfaces:**
- Consumes: `streamBotTurn`, `getBot` (`@xops/core`), `BotTurnEvent`.
- Produces:
  - `interface ChatRequest { bot: string; scope: string; mode?: 'auto' | 'safe'; message: string }`
  - `runChatToSink(req: ChatRequest, opts: { workspace: string; skillsSource: string; provider?: string; model?: string }, send: (msg: object) => void): Promise<void>` — resolves the bot, builds a project from scope (kubeconfig path for k8s), runs `streamBotTurn`, and calls `send` for each event; on unknown bot / missing kubeconfig, sends a single `{type:'error'}` then returns.

- [ ] **Step 1: Write the failing test**

```ts
// packages/gateway/src/ws-chat.test.ts
import { describe, expect, test } from 'bun:test';
import { runChatToSink } from './ws-chat';

describe('runChatToSink', () => {
  test('sends an error for an unknown bot and does not throw', async () => {
    const sent: any[] = [];
    await runChatToSink({ bot: 'nope', scope: 'x', message: 'hi' }, { workspace: '/tmp/x', skillsSource: '/tmp/s' }, (m) => sent.push(m));
    expect(sent.length).toBe(1);
    expect(sent[0].type).toBe('error');
    expect(sent[0].message).toContain('nope');
  });

  test('sends an error when a k8s bot has no scope/kubeconfig', async () => {
    const sent: any[] = [];
    await runChatToSink({ bot: 'k8s-sre', scope: '', message: 'hi' }, { workspace: '/tmp/x', skillsSource: '/tmp/s' }, (m) => sent.push(m));
    expect(sent[0].type).toBe('error');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/gateway/src/ws-chat.test.ts`
Expected: FAIL — cannot find module `./ws-chat`.

- [ ] **Step 3: Implement `ws-chat.ts`**

```ts
// packages/gateway/src/ws-chat.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/gateway/src/ws-chat.test.ts`
Expected: PASS — 2 tests (error paths; no goose spawned).

- [ ] **Step 5: Wire the WS handler in `server.ts`**

Replace the body of the existing `websocket.message` handler (the one that currently calls `this.runtime.chatStream` / `gooseChat`) so a `{type:'chat', ...}` message calls `runChatToSink`, forwarding each event to the socket. Add the import `import { runChatToSink } from './ws-chat';` and `import { homedir } from 'os';` / `import { join } from 'path';` if not present. The handler:

```ts
        message: async (ws, message) => {
          try {
            const data = JSON.parse(message.toString());
            if (data.type === 'chat' && data.message && data.bot) {
              await runChatToSink(
                { bot: data.bot, scope: data.scope ?? '', mode: data.mode, message: data.message },
                {
                  workspace: join(homedir(), '.xops', 'workspace'),
                  skillsSource: join(import.meta.dir, '..', '..', 'skills', 'bundled'),
                  provider: process.env.XOPS_PROVIDER,
                  model: process.env.XOPS_MODEL,
                },
                (msg) => ws.send(JSON.stringify(msg)),
              );
            }
          } catch (error) {
            ws.send(JSON.stringify({ type: 'error', message: (error as Error).message }));
          }
        },
```

Leave `open`/`close` handlers as they are (drop any `gooseChat`/conversation bookkeeping specific to the old path if it no longer compiles; the WS now only needs to forward chat events).

- [ ] **Step 6: Typecheck the gateway compiles**

Run: `bun build --no-bundle packages/gateway/src/server.ts >/dev/null && echo OK`
Expected: `OK` (or resolve any leftover reference to the removed old-chat helpers).

- [ ] **Step 7: Commit**

```bash
git add packages/gateway/src/ws-chat.ts packages/gateway/src/ws-chat.test.ts packages/gateway/src/server.ts
git -c core.hooksPath=/dev/null commit -m "feat(gateway): WebSocket chat forwarding streamBotTurn events

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Scaffold apps/web (Vite + React + TS)

**Files:**
- Create: `apps/web/package.json`, `apps/web/vite.config.ts`, `apps/web/tsconfig.json`, `apps/web/index.html`, `apps/web/src/main.tsx`, `apps/web/src/App.tsx`

**Interfaces:**
- Produces: a Vite dev server that renders a placeholder App and proxies `/bots` and `/ws` to the gateway (default port 8787 — adjust to the gateway's configured port).

- [ ] **Step 1: Create package.json**

```json
// apps/web/package.json
{
  "name": "@xops/web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.7.0",
    "vite": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create vite.config.ts, tsconfig.json, index.html**

```ts
// apps/web/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const GATEWAY = process.env.XOPS_GATEWAY ?? 'http://localhost:8787';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5273,
    proxy: {
      '/bots': GATEWAY,
      '/ws': { target: GATEWAY.replace('http', 'ws'), ws: true },
    },
  },
});
```

```json
// apps/web/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

```html
<!-- apps/web/index.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>xops</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Create main.tsx + placeholder App.tsx**

```tsx
// apps/web/src/main.tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
```

```tsx
// apps/web/src/App.tsx
export function App() {
  return <div style={{ fontFamily: 'system-ui', padding: 24 }}>xops web — loading…</div>;
}
```

- [ ] **Step 4: Install and verify it builds**

Run: `cd apps/web && bun install && bun run build`
Expected: Vite build succeeds, `apps/web/dist` created.

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json apps/web/vite.config.ts apps/web/tsconfig.json apps/web/index.html apps/web/src/main.tsx apps/web/src/App.tsx
git -c core.hooksPath=/dev/null commit -m "feat(web): scaffold Vite + React SPA (apps/web)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Chat UI — bot picker, scope+mode bar, streaming transcript

**Files:**
- Create: `apps/web/src/useChat.ts` (WS hook), `apps/web/src/types.ts`, `apps/web/src/Chat.tsx`
- Modify: `apps/web/src/App.tsx`

**Interfaces:**
- Consumes: `GET /bots`, WS `/ws` sending `{type:'chat', bot, scope, mode, message}`, receiving `BotTurnEvent`s.
- Produces: a working chat page.

- [ ] **Step 1: Types**

```ts
// apps/web/src/types.ts
export interface BotInfo { name: string; display: string; description: string; platform: string; skills: string[]; }
export type BotTurnEvent =
  | { type: 'text'; delta: string }
  | { type: 'guard'; tool: string; command: string; allowed: boolean; tier?: string; category?: string }
  | { type: 'verify'; healthy: boolean; summary: string }
  | { type: 'done'; wallSeconds: number; acted: boolean; verified: boolean | null }
  | { type: 'error'; message: string };
```

- [ ] **Step 2: WS hook**

```ts
// apps/web/src/useChat.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { BotTurnEvent } from './types';

export function useChat() {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<BotTurnEvent[]>([]);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    const connect = () => {
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onclose = () => { setConnected(false); setTimeout(connect, 1500); };
      ws.onmessage = (m) => {
        const ev = JSON.parse(m.data) as BotTurnEvent;
        setEvents((prev) => [...prev, ev]);
        if (ev.type === 'done' || ev.type === 'error') setRunning(false);
      };
    };
    connect();
    return () => wsRef.current?.close();
  }, []);

  const send = useCallback((bot: string, scope: string, mode: 'auto' | 'safe', message: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    setEvents((prev) => [...prev, { type: 'text', delta: `\n\n🧑 ${message}\n\n🤖 ` } as BotTurnEvent]);
    setRunning(true);
    wsRef.current.send(JSON.stringify({ type: 'chat', bot, scope, mode, message }));
  }, []);

  return { connected, events, running, send };
}
```

- [ ] **Step 3: Chat component**

```tsx
// apps/web/src/Chat.tsx
import { useEffect, useState } from 'react';
import type { BotInfo, BotTurnEvent } from './types';
import { useChat } from './useChat';

function GuardChip({ e }: { e: Extract<BotTurnEvent, { type: 'guard' }> }) {
  const color = !e.allowed ? '#c0392b' : e.category === 'write' ? '#b9770e' : '#1e8449';
  const mark = e.allowed ? '✔' : '✖';
  return (
    <div style={{ fontFamily: 'monospace', fontSize: 12, color, margin: '2px 0' }}>
      {mark} {e.category ?? '?'}: {e.command || e.tool}{e.allowed ? '' : ' (blocked)'}
    </div>
  );
}

export function Chat({ bots }: { bots: BotInfo[] }) {
  const { connected, events, running, send } = useChat();
  const [bot, setBot] = useState(bots[0]?.name ?? '');
  const [scope, setScope] = useState('');
  const [mode, setMode] = useState<'auto' | 'safe'>('auto');
  const [input, setInput] = useState('');
  const current = bots.find((b) => b.name === bot);

  useEffect(() => {
    const el = document.getElementById('transcript');
    if (el) el.scrollTop = el.scrollHeight;
  }, [events]);

  const submit = () => {
    if (!input.trim() || !bot || running) return;
    send(bot, scope, mode, input.trim());
    setInput('');
  };

  return (
    <div style={{ fontFamily: 'system-ui', maxWidth: 780, margin: '0 auto', padding: 16 }}>
      <h2>xops chat {connected ? '🟢' : '🔴'}</h2>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <select value={bot} onChange={(e) => setBot(e.target.value)}>
          {bots.map((b) => <option key={b.name} value={b.name}>{b.display}</option>)}
        </select>
        <input placeholder={current?.platform === 'k8s' ? 'namespace' : 'container name'} value={scope} onChange={(e) => setScope(e.target.value)} />
        <select value={mode} onChange={(e) => setMode(e.target.value as 'auto' | 'safe')}>
          <option value="auto">auto (writes allowed)</option>
          <option value="safe">safe (writes blocked)</option>
        </select>
      </div>
      {current && <div style={{ fontSize: 12, color: '#555', marginBottom: 8 }}>{current.description} · skills: {current.skills.join(', ')}</div>}
      <div id="transcript" style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, height: 440, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
        {events.map((e, i) => {
          if (e.type === 'text') return <span key={i}>{e.delta}</span>;
          if (e.type === 'guard') return <GuardChip key={i} e={e} />;
          if (e.type === 'verify') return <div key={i} style={{ margin: '6px 0', fontWeight: 600, color: e.healthy ? '#1e8449' : '#c0392b' }}>{e.healthy ? '✅ verified' : '⚠️ NOT verified'}: {e.summary}</div>;
          if (e.type === 'done') return <div key={i} style={{ fontSize: 12, color: '#888', margin: '6px 0' }}>— done in {e.wallSeconds}s (acted={String(e.acted)}, verified={String(e.verified)})</div>;
          if (e.type === 'error') return <div key={i} style={{ color: '#c0392b' }}>[error] {e.message}</div>;
          return null;
        })}
        {running && <span style={{ color: '#888' }}>▋</span>}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input style={{ flex: 1 }} value={input} placeholder="ask the bot…" onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        <button onClick={submit} disabled={running || !connected}>{running ? 'running…' : 'send'}</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: App wires bot fetch → Chat**

```tsx
// apps/web/src/App.tsx
import { useEffect, useState } from 'react';
import type { BotInfo } from './types';
import { Chat } from './Chat';

export function App() {
  const [bots, setBots] = useState<BotInfo[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    fetch('/bots').then((r) => r.json()).then((d) => setBots(d.bots)).catch((e) => setErr(String(e)));
  }, []);
  if (err) return <div style={{ padding: 24, color: '#c0392b' }}>Failed to load bots: {err}. Is the gateway running?</div>;
  if (!bots) return <div style={{ padding: 24 }}>Loading bots…</div>;
  return <Chat bots={bots} />;
}
```

- [ ] **Step 5: Verify it builds**

Run: `cd apps/web && bun run build`
Expected: Vite build succeeds.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/types.ts apps/web/src/useChat.ts apps/web/src/Chat.tsx apps/web/src/App.tsx
git -c core.hooksPath=/dev/null commit -m "feat(web): streaming chat UI — bot picker, scope/mode, guard chips, verify banner

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Dev script, manual E2E, docs

**Files:**
- Modify: root `package.json` (a `web` dev convenience script), `apps/cli` gateway port note if needed
- Create: `docs/docs/web-ui.md`; Modify: `docs/sidebars.ts`

- [ ] **Step 1: Add a dev convenience script**

In root `package.json` `scripts`, add:

```json
    "web": "cd apps/web && XOPS_GATEWAY=http://localhost:${XOPS_PORT:-8787} bun run dev"
```

- [ ] **Step 2: Manual end-to-end**

Terminal A (gateway): start it however the CLI runs it — `bun run cli gateway` (note the port it prints; set `XOPS_PORT` to match).
Terminal B: `bash scripts/seed-docker-fault.sh oom` then `XOPS_PROVIDER=claude-acp bun run web`.
Browser: open the Vite URL (`http://localhost:5273`). Pick **Docker Ops Bot**, scope `xops-victim`, mode `auto`, send "the container keeps dying, fix it".
Expected: text streams in; guard chips appear (`✔ read: docker ps`, `✔ write: docker update …`); a `✅ verified` banner; a `done` line. Confirm independently: `docker inspect xops-victim --format '{{.State.Status}}'` → `running`.

`If events only appear all at once at the end, streaming isn't live — revisit Task 3 wiring.`

- [ ] **Step 3: Write docs page**

```markdown
<!-- docs/docs/web-ui.md -->
# Web Chat UI

> **Status: new, dev-only.** A browser UI to chat with a bot and watch it work live. Localhost only, no auth yet.

Run the gateway, then the web app:

​```
# terminal 1 — gateway (note the port it prints)
bun run cli gateway

# terminal 2 — web UI
XOPS_PROVIDER=claude-acp bun run web
​```

Open the printed Vite URL. Pick a bot, set a scope (container name for Docker, namespace for Kubernetes), choose a mode (`auto` runs writes, `safe` blocks them), and chat. You watch the turn stream: the agent's text, each guarded command as a chip (read / write / dangerous, allow or block), and a final verification banner.

The engine runs on the host behind the gateway — the browser only talks to it over WebSocket. Defining your own roles (agent.md + skills + tools) in the UI is the next planned step.
```

Add `'web-ui'` to `docs/sidebars.ts` (top level, after `getting-started`).

- [ ] **Step 4: Build docs**

Run: `cd docs && bun run build 2>&1 | tail -1`
Expected: `[SUCCESS] Generated static files in "build".`

- [ ] **Step 5: Commit**

```bash
git add package.json docs/docs/web-ui.md docs/sidebars.ts
git -c core.hooksPath=/dev/null commit -m "feat(web): dev script + docs for the web chat UI

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Web SPA + gateway over WS → Tasks 5–7. ✓
- `streamBotTurn` emitting text/guard/verify/done; `runBotTurn` on top → Task 3. ✓
- Incremental stream-json parser → Task 1. ✓
- `GET /bots` → Task 4. ✓
- WS `/ws/chat` forwarding events → Task 5. ✓
- Bot picker, scope+mode bar, streaming transcript with guard chips + verify banner → Task 7. ✓
- Dev/serve (vite dev + proxy) → Tasks 6, 8. ✓
- Error handling (unknown bot, missing kubeconfig, timeout, fs.watch fallback) → Task 5 (bot/kubeconfig), Task 3 (timeout event, guard drain-at-close covers watch gaps). ✓
- Testing (parser, drain-equivalence, /bots shape, ws error paths, manual E2E) → Tasks 1,3,4,5,8. ✓
- Out of scope (role editor, auth, persistence, write→ask) → not built. ✓

**Placeholder scan:** no TBD/TODO; every code step has complete code; manual steps give exact commands + expected observations.

**Type consistency:** `BotTurnEvent` identical in `session.ts` (Task 3) and `apps/web/src/types.ts` (Task 7); `ChatRequest` fields (`bot, scope, mode, message`) match the WS client payload (Task 7) and handler (Task 5); `mode` is `'auto'|'safe'` throughout; `streamBotTurn`/`runBotTurn`/`drainToResult` signatures consistent across Tasks 3 and 5.

**Note/assumption:** the gateway port is referenced as `8787` in the Vite proxy and `XOPS_PORT`; the implementer must set it to the gateway's actual configured port (from `config.gateway.port`). Flagged in Task 6 and Task 8. The old WS `runGooseChat` path is replaced by the bot-chat forwarder; `chat.ts`/`runGooseChat` may remain for the HTTP `/chat` endpoint but the WS path no longer uses it.
