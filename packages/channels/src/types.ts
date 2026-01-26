/**
 * Channel adapter types
 */

export interface IncomingMessage {
  id: string;
  channel: string;
  userId: string;
  username?: string;
  content: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface OutgoingMessage {
  channel: string;
  userId?: string;
  chatId?: string;
  content: string;
  replyToId?: string;
  metadata?: Record<string, unknown>;
}

export type MessageHandler = (message: IncomingMessage) => Promise<string | void>;

export interface ChannelAdapter {
  /** Channel name (telegram, slack, web) */
  name: string;

  /** Initialize the adapter */
  initialize(): Promise<void>;

  /** Start listening for messages */
  start(): Promise<void>;

  /** Stop the adapter */
  stop(): Promise<void>;

  /** Send a message */
  send(message: OutgoingMessage): Promise<void>;

  /** Register message handler */
  onMessage(handler: MessageHandler): void;
}

export interface TelegramConfig {
  token: string;
  allowFrom?: string[];
  webhookUrl?: string;
  polling?: boolean;
}

export interface SlackConfig {
  appToken: string;
  botToken: string;
  signingSecret?: string;
}

export interface WebConfig {
  enabled: boolean;
  port: number;
}
