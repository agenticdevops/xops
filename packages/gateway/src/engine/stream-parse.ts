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
