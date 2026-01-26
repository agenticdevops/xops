/**
 * Gateway types
 */

export interface GatewayConfig {
  bind: string;
  port: number;
  tunnel?: {
    provider: 'tailscale' | 'ngrok' | 'cloudflare' | 'none';
  };
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  channel?: string;
  metadata?: Record<string, unknown>;
}

export interface ConversationContext {
  id: string;
  channel: string;
  userId?: string;
  messages: ChatMessage[];
  memory?: string[];
  startedAt: Date;
  lastActivity: Date;
}

export interface GatewayStats {
  uptime: number;
  messagesProcessed: number;
  activeConversations: number;
  memoryChunks: number;
}
