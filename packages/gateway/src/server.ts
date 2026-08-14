/**
 * Gateway Server - Hono-based HTTP/WebSocket server
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serve } from 'bun';
import type { xopsConfig } from '../../core/src/types';
import { listBots } from '../../core/src/bots';
import { runGooseChat } from './engine/chat';
import { join } from 'path';
import { homedir } from 'os';
import type { ChatMessage, ConversationContext, GatewayStats } from './types';

export interface GatewayOptions {
  config: xopsConfig;
  onMemorySearch?: (query: string, limit?: number) => Promise<Array<{ content: string; score: number }>>;
}

export interface ProcessMessageOptions {
  message: string;
  userId: string;
  channel: string;
  username?: string;
}

export class GatewayServer {
  private app: Hono;
  private server: ReturnType<typeof serve> | null = null;
  private config: xopsConfig;
  private conversations: Map<string, ConversationContext> = new Map();
  private stats: GatewayStats;
  private startTime: Date;
  private onMemorySearch?: GatewayOptions['onMemorySearch'];
  private wsClients: Map<string, { ws: unknown; conversationId: string }> = new Map();

  constructor(options: GatewayOptions) {
    this.config = options.config;
    this.onMemorySearch = options.onMemorySearch;
    this.startTime = new Date();
    this.stats = {
      uptime: 0,
      messagesProcessed: 0,
      activeConversations: 0,
      memoryChunks: 0,
    };

    // Create Hono app
    this.app = new Hono();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // CORS for web chat
    this.app.use(
      '*',
      cors({
        origin: ['http://localhost:3000', 'http://localhost:8080'],
        credentials: true,
      }),
    );

    // Request logging
    this.app.use('*', logger());
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (c) => {
      return c.json({ status: 'healthy', timestamp: new Date().toISOString() });
    });

    // Status endpoint
    this.app.get('/status', (c) => {
      this.stats.uptime = Date.now() - this.startTime.getTime();
      this.stats.activeConversations = this.conversations.size;
      return c.json({
        status: 'running',
        stats: this.stats,
        config: {
          engine: {
            runner: 'goose',
            provider: process.env.XOPS_PROVIDER ?? 'goose-default',
            model: process.env.XOPS_MODEL ?? 'goose-default',
          },
          channels: {
            telegram: this.config.channels.telegram?.enabled ?? false,
            slack: this.config.channels.slack?.enabled ?? false,
            web: this.config.channels.web?.enabled ?? true,
          },
        },
      });
    });

    // Bots endpoint
    this.app.get('/bots', (c) => {
      return c.json({
        bots: listBots().map((b) => ({
          name: b.name, display: b.display, description: b.description, platform: b.platform, skills: b.skills,
        })),
      });
    });

    // Chat endpoint
    this.app.post('/chat', async (c) => {
      try {
        const body = await c.req.json<{
          message: string;
          conversationId?: string;
          channel?: string;
        }>();

        const { message, conversationId, channel = 'api' } = body;

        if (!message) {
          return c.json({ error: 'Message is required' }, 400);
        }

        // Get or create conversation
        const context = this.getOrCreateConversation(conversationId, channel);

        // Search memory for relevant context
        let memoryContext: string[] = [];
        if (this.onMemorySearch) {
          try {
            const results = await this.onMemorySearch(message, 3);
            memoryContext = results.filter((r) => r.score > 0.3).map((r) => r.content);
          } catch (err) {
            console.error('Memory search failed:', err);
          }
        }

        // Get AI response
        const response = await this.gooseChat(context, message, memoryContext);

        // Update conversation
        const userMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'user',
          content: message,
          timestamp: new Date(),
          channel,
        };

        const assistantMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: response,
          timestamp: new Date(),
          channel,
        };

        context.messages.push(userMessage, assistantMessage);
        context.lastActivity = new Date();
        this.stats.messagesProcessed += 2;

        return c.json({
          conversationId: context.id,
          response,
          memoryUsed: memoryContext.length > 0,
        });
      } catch (error) {
        const err = error as Error;
        console.error('Chat error:', err.message);
        return c.json({ error: err.message }, 500);
      }
    });

    // Stream chat endpoint
    this.app.post('/chat/stream', async (c) => {
      try {
        const body = await c.req.json<{
          message: string;
          conversationId?: string;
          channel?: string;
        }>();

        const { message, conversationId, channel = 'api' } = body;

        if (!message) {
          return c.json({ error: 'Message is required' }, 400);
        }

        const context = this.getOrCreateConversation(conversationId, channel);

        // Search memory
        let memoryContext: string[] = [];
        if (this.onMemorySearch) {
          try {
            const results = await this.onMemorySearch(message, 3);
            memoryContext = results.filter((r) => r.score > 0.3).map((r) => r.content);
          } catch (err) {
            console.error('Memory search failed:', err);
          }
        }

        // Stream response
        const stream = new ReadableStream({
          start: async (controller) => {
            let fullResponse = '';
            const encoder = new TextEncoder();

            try {
              fullResponse = await this.gooseChat(context, message, memoryContext);
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: fullResponse })}\n\n`));

              // Update conversation after stream completes
              context.messages.push(
                {
                  id: crypto.randomUUID(),
                  role: 'user',
                  content: message,
                  timestamp: new Date(),
                  channel,
                },
                {
                  id: crypto.randomUUID(),
                  role: 'assistant',
                  content: fullResponse,
                  timestamp: new Date(),
                  channel,
                },
              );
              context.lastActivity = new Date();
              this.stats.messagesProcessed += 2;

              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, conversationId: context.id })}\n\n`));
              controller.close();
            } catch (error) {
              const err = error as Error;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`));
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
        });
      } catch (error) {
        const err = error as Error;
        return c.json({ error: err.message }, 500);
      }
    });

    // Memory search endpoint
    this.app.post('/memory/search', async (c) => {
      if (!this.onMemorySearch) {
        return c.json({ error: 'Memory not configured' }, 400);
      }

      try {
        const body = await c.req.json<{ query: string; limit?: number }>();
        const results = await this.onMemorySearch(body.query, body.limit);
        return c.json({ results });
      } catch (error) {
        const err = error as Error;
        return c.json({ error: err.message }, 500);
      }
    });

    // Conversation management
    this.app.get('/conversations', (c) => {
      const conversations = Array.from(this.conversations.values()).map((conv) => ({
        id: conv.id,
        channel: conv.channel,
        messageCount: conv.messages.length,
        startedAt: conv.startedAt,
        lastActivity: conv.lastActivity,
      }));
      return c.json({ conversations });
    });

    this.app.delete('/conversations/:id', (c) => {
      const id = c.req.param('id');
      if (this.conversations.has(id)) {
        this.conversations.delete(id);
        return c.json({ success: true });
      }
      return c.json({ error: 'Conversation not found' }, 404);
    });

    // Webhook endpoints for channels
    this.app.post('/webhook/telegram', async (c) => {
      // Telegram webhook handling - to be implemented by channel adapter
      return c.json({ ok: true });
    });

    this.app.post('/webhook/slack', async (c) => {
      // Slack webhook handling - to be implemented by channel adapter
      return c.json({ ok: true });
    });
  }

  private async gooseChat(context: ConversationContext, message: string, memoryContext: string[]): Promise<string> {
    const memoryBlock = memoryContext.length > 0 ? `Relevant context from memory:\n${memoryContext.join('\n')}\n\n${message}` : message;
    return runGooseChat({
      message: memoryBlock,
      workdir: join(homedir(), '.xops', 'workspace', 'goose-chat'),
      history: context.messages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
      provider: process.env.XOPS_PROVIDER,
      model: process.env.XOPS_MODEL,
    });
  }

  private getOrCreateConversation(id?: string, channel = 'api'): ConversationContext {
    if (id && this.conversations.has(id)) {
      return this.conversations.get(id)!;
    }

    const newContext: ConversationContext = {
      id: id || crypto.randomUUID(),
      channel,
      messages: [],
      startedAt: new Date(),
      lastActivity: new Date(),
    };

    this.conversations.set(newContext.id, newContext);
    return newContext;
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    const { bind, port } = this.config.gateway;

    this.server = serve({
      fetch: this.app.fetch,
      hostname: bind,
      port,
      websocket: {
        open: (ws) => {
          const clientId = crypto.randomUUID();
          const conversationId = crypto.randomUUID();
          this.wsClients.set(clientId, { ws, conversationId });
          this.getOrCreateConversation(conversationId, 'web');
          ws.send(JSON.stringify({ type: 'connected', clientId, conversationId }));
        },
        message: async (ws, message) => {
          try {
            const data = JSON.parse(message.toString());
            if (data.type === 'chat' && data.message) {
              // Find client
              let clientEntry: { conversationId: string } | undefined;
              for (const [, entry] of this.wsClients) {
                if (entry.ws === ws) {
                  clientEntry = entry;
                  break;
                }
              }

              if (!clientEntry) {
                ws.send(JSON.stringify({ type: 'error', message: 'Client not found' }));
                return;
              }

              const context = this.getOrCreateConversation(clientEntry.conversationId, 'web');

              // Search memory
              let memoryContext: string[] = [];
              if (this.onMemorySearch) {
                try {
                  const results = await this.onMemorySearch(data.message, 3);
                  memoryContext = results.filter((r) => r.score > 0.3).map((r) => r.content);
                } catch (err) {
                  console.error('Memory search failed:', err);
                }
              }

              // Stream response
              ws.send(JSON.stringify({ type: 'start' }));

              const fullResponse = await this.gooseChat(context, data.message, memoryContext);
              ws.send(JSON.stringify({ type: 'chunk', text: fullResponse }));

              // Update conversation
              context.messages.push(
                {
                  id: crypto.randomUUID(),
                  role: 'user',
                  content: data.message,
                  timestamp: new Date(),
                  channel: 'web',
                },
                {
                  id: crypto.randomUUID(),
                  role: 'assistant',
                  content: fullResponse,
                  timestamp: new Date(),
                  channel: 'web',
                },
              );
              context.lastActivity = new Date();
              this.stats.messagesProcessed += 2;

              ws.send(JSON.stringify({ type: 'done' }));
            }
          } catch (error) {
            const err = error as Error;
            ws.send(JSON.stringify({ type: 'error', message: err.message }));
          }
        },
        close: (ws) => {
          for (const [clientId, entry] of this.wsClients) {
            if (entry.ws === ws) {
              this.wsClients.delete(clientId);
              break;
            }
          }
        },
      },
    });

    console.log(`Gateway server running on http://${bind}:${port}`);
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    if (this.server) {
      this.server.stop();
      this.server = null;
    }
  }

  /**
   * Process a message from any channel
   * This is the main entry point for channel adapters
   */
  async processMessage(options: ProcessMessageOptions): Promise<string> {
    const { message, userId, channel, username } = options;

    // Get or create conversation for this user+channel
    const conversationKey = `${channel}:${userId}`;
    const context = this.getOrCreateConversation(conversationKey, channel);
    context.userId = userId;

    // Search memory for relevant context
    let memoryContext: string[] = [];
    if (this.onMemorySearch) {
      try {
        const results = await this.onMemorySearch(message, 3);
        memoryContext = results.filter((r) => r.score > 0.3).map((r) => r.content);
      } catch (err) {
        console.error('Memory search failed:', err);
      }
    }

    // Get AI response
    const response = await this.gooseChat(context, message, memoryContext);

    // Update conversation
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: message,
      timestamp: new Date(),
      channel,
      metadata: { username },
    };

    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: response,
      timestamp: new Date(),
      channel,
    };

    context.messages.push(userMessage, assistantMessage);
    context.lastActivity = new Date();
    this.stats.messagesProcessed += 2;

    return response;
  }

  /**
   * Get the Hono app instance
   */
  getApp(): Hono {
    return this.app;
  }

}
