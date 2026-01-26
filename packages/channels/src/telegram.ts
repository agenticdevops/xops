/**
 * Telegram channel adapter using grammY
 */

import { Bot, Context } from 'grammy';
import type { ChannelAdapter, IncomingMessage, MessageHandler, OutgoingMessage, TelegramConfig } from './types';

const MAX_MESSAGE_LENGTH = 4096;

export class TelegramAdapter implements ChannelAdapter {
  name = 'telegram';
  private bot: Bot;
  private config: TelegramConfig;
  private handlers: MessageHandler[] = [];
  private allowedUsers: Set<string>;

  constructor(config: TelegramConfig) {
    this.config = config;
    this.bot = new Bot(config.token);
    this.allowedUsers = new Set(config.allowFrom?.map((u) => u.toLowerCase()) ?? []);
  }

  async initialize(): Promise<void> {
    // Set up message handler
    this.bot.on('message:text', async (ctx) => {
      // Check access control
      const username = ctx.from?.username?.toLowerCase();
      const userId = ctx.from?.id.toString();

      if (this.allowedUsers.size > 0) {
        const hasAccess = (username && this.allowedUsers.has(username)) || (userId && this.allowedUsers.has(userId));

        if (!hasAccess) {
          await ctx.reply('Access denied. Your username is not in the allowed list.');
          return;
        }
      }

      // Build incoming message
      const incoming: IncomingMessage = {
        id: ctx.message.message_id.toString(),
        channel: 'telegram',
        userId: userId || 'unknown',
        username: ctx.from?.username,
        content: ctx.message.text,
        timestamp: new Date(ctx.message.date * 1000),
        metadata: {
          chatId: ctx.chat.id,
          chatType: ctx.chat.type,
          firstName: ctx.from?.first_name,
          lastName: ctx.from?.last_name,
        },
      };

      // Call handlers and send response
      for (const handler of this.handlers) {
        try {
          const response = await handler(incoming);
          if (response) {
            await this.sendToChat(ctx.chat.id, response, ctx.message.message_id);
          }
        } catch (error) {
          console.error('Telegram handler error:', error);
          await ctx.reply('Sorry, an error occurred processing your message.');
        }
      }
    });

    // Handle /start command
    this.bot.command('start', async (ctx) => {
      await ctx.reply(`Hello! I'm OpsPilot, your 24/7 DevOps copilot.

Send me a message and I'll help you with:
- Kubernetes troubleshooting
- Infrastructure management
- CI/CD operations
- Incident response

Type your question or command to get started!`);
    });

    // Handle /help command
    this.bot.command('help', async (ctx) => {
      await ctx.reply(`Available commands:

/start - Start interacting with OpsPilot
/help - Show this help message
/status - Check OpsPilot status
/memory <query> - Search memory

Or just send a message with your DevOps question!`);
    });

    // Error handling
    this.bot.catch((err) => {
      console.error('Telegram bot error:', err);
    });
  }

  async start(): Promise<void> {
    if (this.config.webhookUrl) {
      // Webhook mode
      await this.bot.api.setWebhook(this.config.webhookUrl);
      console.log('Telegram bot started (webhook mode)');
    } else {
      // Long polling mode
      await this.bot.start({
        onStart: () => {
          console.log('Telegram bot started (polling mode)');
        },
      });
    }
  }

  async stop(): Promise<void> {
    await this.bot.stop();
  }

  async send(message: OutgoingMessage): Promise<void> {
    const chatId = message.chatId || message.userId;
    if (!chatId) {
      throw new Error('No chatId or userId provided');
    }

    await this.sendToChat(parseInt(chatId, 10), message.content, message.replyToId ? parseInt(message.replyToId, 10) : undefined);
  }

  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  /**
   * Send message to chat, splitting if too long
   */
  private async sendToChat(chatId: number, content: string, replyToId?: number): Promise<void> {
    const chunks = this.splitMessage(content);

    for (let i = 0; i < chunks.length; i++) {
      await this.bot.api.sendMessage(chatId, chunks[i], {
        parse_mode: 'Markdown',
        reply_parameters: i === 0 && replyToId ? { message_id: replyToId } : undefined,
      });
    }
  }

  /**
   * Split long messages into chunks
   */
  private splitMessage(content: string): string[] {
    if (content.length <= MAX_MESSAGE_LENGTH) {
      return [content];
    }

    const chunks: string[] = [];
    let remaining = content;

    while (remaining.length > 0) {
      if (remaining.length <= MAX_MESSAGE_LENGTH) {
        chunks.push(remaining);
        break;
      }

      // Find a good break point
      let breakPoint = MAX_MESSAGE_LENGTH;

      // Try to break at paragraph
      const paragraphBreak = remaining.lastIndexOf('\n\n', MAX_MESSAGE_LENGTH);
      if (paragraphBreak > MAX_MESSAGE_LENGTH * 0.5) {
        breakPoint = paragraphBreak;
      } else {
        // Try to break at line
        const lineBreak = remaining.lastIndexOf('\n', MAX_MESSAGE_LENGTH);
        if (lineBreak > MAX_MESSAGE_LENGTH * 0.5) {
          breakPoint = lineBreak;
        } else {
          // Try to break at space
          const spaceBreak = remaining.lastIndexOf(' ', MAX_MESSAGE_LENGTH);
          if (spaceBreak > MAX_MESSAGE_LENGTH * 0.5) {
            breakPoint = spaceBreak;
          }
        }
      }

      chunks.push(remaining.slice(0, breakPoint).trim());
      remaining = remaining.slice(breakPoint).trim();
    }

    return chunks;
  }

  /**
   * Get webhook handler for Hono/Express
   */
  getWebhookHandler(): (body: unknown) => Promise<void> {
    return async (body: unknown) => {
      await this.bot.handleUpdate(body as Parameters<typeof this.bot.handleUpdate>[0]);
    };
  }
}
