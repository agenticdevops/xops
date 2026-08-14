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
