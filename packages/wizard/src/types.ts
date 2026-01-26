/**
 * Wizard types
 */

export type WizardMode = 'quickstart' | 'advanced';

export interface WizardOptions {
  mode: WizardMode;
  reset?: boolean;
  configPath?: string;
}

export interface WizardState {
  mode: WizardMode;

  // AI Provider
  aiProvider: 'anthropic' | 'openai' | 'bedrock' | 'gemini' | 'ollama' | 'openrouter';
  aiModel: string;
  aiApiKey: string;

  // Channels
  telegramEnabled: boolean;
  telegramToken?: string;
  telegramAllowFrom?: string[];

  slackEnabled: boolean;
  slackAppToken?: string;
  slackBotToken?: string;

  webEnabled: boolean;
  webPort: number;

  // Tools
  detectedTools: DetectedTool[];
  enabledTools: string[];
  mcpServers: MCPServerConfig[];

  // Skills
  enabledSkills: string[];

  // Memory
  memoryEnabled: boolean;
  memoryProvider: 'auto' | 'openai' | 'gemini' | 'none';

  // Automation
  heartbeatEnabled: boolean;
  heartbeatInterval: string;

  // Gateway
  gatewayBind: string;
  gatewayPort: number;
  tunnelProvider: 'tailscale' | 'ngrok' | 'cloudflare' | 'none';
}

export interface DetectedTool {
  name: string;
  path: string;
  version?: string;
}

export interface MCPServerConfig {
  name: string;
  command: string;
  args?: string[];
}
