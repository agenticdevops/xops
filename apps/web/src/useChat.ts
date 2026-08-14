import { useCallback, useEffect, useRef, useState } from 'react';
import type { BotTurnEvent } from './types';

export function useChat() {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<BotTurnEvent[]>([]);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      if (cancelled) return;
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onclose = () => { setConnected(false); if (!cancelled) reconnectTimer = setTimeout(connect, 1500); };
      ws.onmessage = (m) => {
        const ev = JSON.parse(m.data) as BotTurnEvent;
        setEvents((prev) => [...prev, ev]);
        if (ev.type === 'done' || ev.type === 'error') setRunning(false);
      };
    };
    connect();
    return () => {
      cancelled = true;
      clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, []);

  const send = useCallback((bot: string, scope: string, mode: 'auto' | 'safe', message: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    setEvents((prev) => [...prev, { type: 'text', delta: `\n\n🧑 ${message}\n\n🤖 ` }]);
    setRunning(true);
    wsRef.current.send(JSON.stringify({ type: 'chat', bot, scope, mode, message }));
  }, []);

  return { connected, events, running, send };
}
