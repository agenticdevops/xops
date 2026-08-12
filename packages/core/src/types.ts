/**
 * Core types for xops
 */

export interface AIConfig {
  provider: 'claude-code' | 'anthropic' | 'openai' | 'bedrock' | 'gemini' | 'ollama' | 'openrouter';
  model: string;
  apiKey?: string;
  maxTokens?: number;
  thinking?: {
    enabled: boolean;
    budget?: number;
  };
  fallback?: AIConfig[];
}

export interface ChannelConfig {
  enabled: boolean;
  accounts?: Record<string, ChannelAccountConfig>;
}

export interface ChannelAccountConfig {
  token?: string;
  tokenSource?: 'env' | 'file' | 'keychain';
  allowFrom?: string[];
  dmPolicy?: 'pairing' | 'open' | 'closed';
}

export interface TelegramConfig extends ChannelConfig {
  accounts?: Record<string, TelegramAccountConfig>;
}

export interface TelegramAccountConfig extends ChannelAccountConfig {
  requireMention?: boolean;
  allowUnmentionedGroups?: boolean;
}

export interface SlackConfig extends ChannelConfig {
  accounts?: Record<string, SlackAccountConfig>;
}

export interface SlackAccountConfig extends ChannelAccountConfig {
  appToken?: string;
  botToken?: string;
  channels?: string[];
}

export interface WebConfig extends ChannelConfig {
  port?: number;
  auth?: 'token' | 'password' | 'none';
}

export interface ChannelsConfig {
  telegram?: TelegramConfig;
  slack?: SlackConfig;
  discord?: ChannelConfig;
  whatsapp?: ChannelConfig;
  web?: WebConfig;
}

export interface ToolConfig {
  enabled: boolean;
  path?: string;
  context?: string;
  profile?: string;
}

export interface MCPServerConfig {
  name: string;
  transport?: 'stdio' | 'sse' | 'http';
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface ToolsConfig {
  builtin?: string[];
  detected?: Record<string, ToolConfig>;
  mcp?: {
    servers?: MCPServerConfig[];
  };
}

export interface SkillsConfig {
  enabled?: string[];
  custom?: { path: string }[];
  install?: {
    preferBrew?: boolean;
    nodeManager?: 'npm' | 'pnpm' | 'yarn' | 'bun';
  };
}

export interface MemoryConfig {
  enabled: boolean;
  provider?: 'auto' | 'openai' | 'gemini' | 'local';
  store?: {
    driver: 'sqlite';
    path: string;
  };
  chunking?: {
    tokens: number;
    overlap: number;
  };
  sync?: {
    onSessionStart?: boolean;
    onSearch?: boolean;
    watch?: boolean;
    intervalMinutes?: number;
  };
  search?: {
    maxResults?: number;
    minScore?: number;
    hybrid?: {
      enabled: boolean;
      vectorWeight: number;
      textWeight: number;
    };
  };
}

export interface HeartbeatConfig {
  enabled: boolean;
  every?: string;
  activeHours?: string;
  timezone?: string;
  checklist?: string;
}

export interface CronJobConfig {
  name: string;
  schedule: string;
  timezone?: string;
  message: string;
  deliver?: string;
  model?: string;
}

export interface AutomationConfig {
  heartbeat?: HeartbeatConfig;
  cron?: {
    jobs?: CronJobConfig[];
  };
}

export interface GatewayConfig {
  bind?: string;
  port?: number;
  tunnel?: {
    provider?: 'tailscale' | 'ngrok' | 'cloudflare' | 'none';
    serve?: boolean;
    funnel?: boolean;
  };
}

export interface AgentConfig {
  name?: string;
  workspace?: string;
  systemPrompt?: string;
  files?: string[];
}

export interface xopsConfig {
  version: string;
  meta?: {
    lastUpdated?: string;
    wizardVersion?: string;
  };
  ai: AIConfig;
  channels?: ChannelsConfig;
  tools?: ToolsConfig;
  skills?: SkillsConfig;
  memory?: MemoryConfig;
  automation?: AutomationConfig;
  gateway?: GatewayConfig;
  agent?: AgentConfig;
}

// Channel message types
export interface InboundMessage {
  id: string;
  channel: string;
  accountId?: string;
  senderId: string;
  senderName?: string;
  chatId: string;
  text: string;
  replyToId?: string;
  threadId?: string;
  timestamp: Date;
  raw?: unknown;
}

export interface OutboundMessage {
  channel: string;
  accountId?: string;
  to: string;
  text: string;
  replyToId?: string;
  threadId?: string;
  mediaUrl?: string;
}

export interface DeliveryResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// Memory types
export interface MemorySearchResult {
  path: string;
  lineStart: number;
  lineEnd: number;
  snippet: string;
  score: number;
}

export interface MemoryChunk {
  id: string;
  path: string;
  lineStart: number;
  lineEnd: number;
  text: string;
  hash: string;
}

// Skill types
export interface SkillMetadata {
  emoji?: string;
  version?: string;
  author?: string;
  requires?: {
    bins?: string[];
    env?: string[];
    config?: string[];
  };
  install?: SkillInstallOption[];
  tags?: string[];
  always?: boolean;
}

export interface SkillInstallOption {
  id: string;
  kind: 'brew' | 'apt' | 'npm' | 'manual';
  package?: string;
  formula?: string;
  bins?: string[];
  label?: string;
}

export interface Skill {
  name: string;
  description: string;
  homepage?: string;
  metadata?: SkillMetadata;
  content: string;
  path: string;
}
