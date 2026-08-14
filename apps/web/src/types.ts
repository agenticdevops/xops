export interface BotInfo { name: string; display: string; description: string; platform: string; skills: string[]; }
export type BotTurnEvent =
  | { type: 'text'; delta: string }
  | { type: 'guard'; tool: string; command: string; allowed: boolean; tier?: string; category?: string }
  | { type: 'verify'; healthy: boolean; summary: string }
  | { type: 'done'; wallSeconds: number; acted: boolean; verified: boolean | null; reply: string }
  | { type: 'error'; message: string };
