/**
 * Parse `goose run --output-format stream-json` captures: JSONL, each line
 * {"type":"message","message":{role, content:[{type:"text",text}|{type:"toolRequest",...}]}}.
 * stream-json is written incrementally so it survives a watchdog KILL —
 * tolerate truncated/garbage lines.
 */

interface GooseMessage {
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

  let finalText: string | null = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'assistant') continue;
    for (const block of msg.content ?? []) {
      if (block.type === 'text' && block.text) {
        finalText = block.text;
        break;
      }
    }
    if (finalText !== null) break;
  }

  return { finalText, messageCount: messages.length };
}
