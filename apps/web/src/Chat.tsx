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
