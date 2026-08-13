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
