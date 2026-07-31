/**
 * Parse `goose run --output-format stream-json` captures: JSONL, each line
 * {"type":"message","message":{role, content:[{type:"text",text}|{type:"toolRequest",...}]}}.
 * stream-json is written incrementally so it survives a watchdog KILL —
 * tolerate truncated/garbage lines.
 */

interface GooseMessage {
  id?: string;
  role?: string;
  content?: Array<{ type?: string; text?: string }>;
}

export interface GooseResult {
  finalText: string | null;
  messageCount: number;
}

export function parseGooseOutput(raw: string): GooseResult {
  const messages: GooseMessage[] = [];
  for (const lineRaw of raw.split('\n')) {
    const line = lineRaw.trim();
    if (!line) continue;
    let ev: any;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    if (ev?.type === 'message' && typeof ev.message === 'object' && ev.message !== null) {
      messages.push(ev.message);
    }
  }

  // goose 1.45 stream-json emits incremental deltas sharing a message id;
  // accumulate text per id (fallback: line index = own group), last group
  // containing text wins.
  const order: string[] = [];
  const textById = new Map<string, string>();
  messages.forEach((msg, i) => {
    if (msg.role !== 'assistant') return;
    const id = msg.id ?? `__idx_${i}`;
    for (const block of msg.content ?? []) {
      if (block.type === 'text' && block.text) {
        if (!textById.has(id)) order.push(id);
        textById.set(id, (textById.get(id) ?? '') + block.text);
      }
    }
  });

  const lastId = order[order.length - 1];
  const finalText = lastId !== undefined ? textById.get(lastId) ?? null : null;

  return { finalText, messageCount: messages.length };
}
