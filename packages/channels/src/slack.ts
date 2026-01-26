/**
 * Slack channel adapter using @slack/bolt
 */

import { App, LogLevel } from '@slack/bolt';
import type { ChannelAdapter, IncomingMessage, MessageHandler, OutgoingMessage, SlackConfig } from './types';

const MAX_MESSAGE_LENGTH = 40000; // Slack's block text limit

export class SlackAdapter implements ChannelAdapter {
  name = 'slack';
  private app: App;
  private config: SlackConfig;
  private handlers: MessageHandler[] = [];

  constructor(config: SlackConfig) {
    this.config = config;
    this.app = new App({
      token: config.botToken,
      appToken: config.appToken,
      socketMode: true,
      logLevel: LogLevel.WARN,
    });
  }

  async initialize(): Promise<void> {
    // Handle direct messages
    this.app.message(async ({ message, say }) => {
      // Type guard for text messages
      if (!('text' in message) || !message.text) {
        return;
      }

      const incoming: IncomingMessage = {
        id: message.ts || crypto.randomUUID(),
        channel: 'slack',
        userId: message.user || 'unknown',
        content: message.text,
        timestamp: new Date(parseFloat(message.ts || '0') * 1000),
        metadata: {
          channelId: message.channel,
          threadTs: 'thread_ts' in message ? message.thread_ts : undefined,
        },
      };

      // Call handlers
      for (const handler of this.handlers) {
        try {
          const response = await handler(incoming);
          if (response) {
            const chunks = this.splitMessage(response);
            for (const chunk of chunks) {
              await say({
                text: chunk,
                thread_ts: 'thread_ts' in message ? message.thread_ts : message.ts,
              });
            }
          }
        } catch (error) {
          console.error('Slack handler error:', error);
          await say('Sorry, an error occurred processing your message.');
        }
      }
    });

    // Handle app mentions
    this.app.event('app_mention', async ({ event, say }) => {
      // Remove the bot mention from the message
      const text = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();

      if (!text) {
        await say({
          text: "Hello! I'm OpsPilot. How can I help you today?",
          thread_ts: event.thread_ts || event.ts,
        });
        return;
      }

      const incoming: IncomingMessage = {
        id: event.ts,
        channel: 'slack',
        userId: event.user,
        content: text,
        timestamp: new Date(parseFloat(event.ts) * 1000),
        metadata: {
          channelId: event.channel,
          threadTs: event.thread_ts,
          isMention: true,
        },
      };

      for (const handler of this.handlers) {
        try {
          const response = await handler(incoming);
          if (response) {
            const chunks = this.splitMessage(response);
            for (const chunk of chunks) {
              await say({
                text: chunk,
                thread_ts: event.thread_ts || event.ts,
              });
            }
          }
        } catch (error) {
          console.error('Slack handler error:', error);
          await say({
            text: 'Sorry, an error occurred processing your message.',
            thread_ts: event.thread_ts || event.ts,
          });
        }
      }
    });

    // Handle slash command (optional)
    this.app.command('/opspilot', async ({ command, ack, respond }) => {
      await ack();

      const incoming: IncomingMessage = {
        id: crypto.randomUUID(),
        channel: 'slack',
        userId: command.user_id,
        username: command.user_name,
        content: command.text,
        timestamp: new Date(),
        metadata: {
          channelId: command.channel_id,
          isCommand: true,
        },
      };

      for (const handler of this.handlers) {
        try {
          const response = await handler(incoming);
          if (response) {
            await respond(response);
          }
        } catch (error) {
          console.error('Slack command handler error:', error);
          await respond('Sorry, an error occurred processing your command.');
        }
      }
    });
  }

  async start(): Promise<void> {
    await this.app.start();
    console.log('Slack bot started (Socket Mode)');
  }

  async stop(): Promise<void> {
    await this.app.stop();
  }

  async send(message: OutgoingMessage): Promise<void> {
    const channelId = message.chatId || message.userId;
    if (!channelId) {
      throw new Error('No chatId or userId provided');
    }

    const chunks = this.splitMessage(message.content);
    for (const chunk of chunks) {
      await this.app.client.chat.postMessage({
        channel: channelId,
        text: chunk,
        thread_ts: message.replyToId,
      });
    }
  }

  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
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

      let breakPoint = MAX_MESSAGE_LENGTH;

      // Try to break at code block
      const codeBlockEnd = remaining.lastIndexOf('```\n', MAX_MESSAGE_LENGTH);
      if (codeBlockEnd > MAX_MESSAGE_LENGTH * 0.5) {
        breakPoint = codeBlockEnd + 4;
      } else {
        // Try to break at paragraph
        const paragraphBreak = remaining.lastIndexOf('\n\n', MAX_MESSAGE_LENGTH);
        if (paragraphBreak > MAX_MESSAGE_LENGTH * 0.5) {
          breakPoint = paragraphBreak;
        } else {
          // Try to break at line
          const lineBreak = remaining.lastIndexOf('\n', MAX_MESSAGE_LENGTH);
          if (lineBreak > MAX_MESSAGE_LENGTH * 0.5) {
            breakPoint = lineBreak;
          }
        }
      }

      chunks.push(remaining.slice(0, breakPoint).trim());
      remaining = remaining.slice(breakPoint).trim();
    }

    return chunks;
  }
}
