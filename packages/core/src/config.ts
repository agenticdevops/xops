/**
 * Configuration loading and validation
 */

import { z } from 'zod';
import * as yaml from 'yaml';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { OpsPilotConfig } from './types';

// Default config path
export const DEFAULT_CONFIG_DIR = path.join(os.homedir(), '.opspilot');
export const DEFAULT_CONFIG_PATH = path.join(DEFAULT_CONFIG_DIR, 'config.yaml');
export const DEFAULT_WORKSPACE_PATH = path.join(DEFAULT_CONFIG_DIR, 'workspace');
export const DEFAULT_MEMORY_PATH = path.join(DEFAULT_CONFIG_DIR, 'memory.db');

// Zod schema for validation
export const AIConfigSchema = z.object({
  provider: z.enum(['anthropic', 'openai', 'bedrock', 'gemini', 'ollama', 'openrouter']),
  model: z.string(),
  apiKey: z.string().optional(),
  maxTokens: z.number().optional(),
  thinking: z.object({
    enabled: z.boolean(),
    budget: z.number().optional(),
  }).optional(),
  fallback: z.array(z.lazy(() => AIConfigSchema)).optional(),
});

export const MemoryConfigSchema = z.object({
  enabled: z.boolean(),
  provider: z.enum(['auto', 'openai', 'gemini', 'local']).optional(),
  store: z.object({
    driver: z.literal('sqlite'),
    path: z.string(),
  }).optional(),
  chunking: z.object({
    tokens: z.number(),
    overlap: z.number(),
  }).optional(),
  sync: z.object({
    onSessionStart: z.boolean().optional(),
    onSearch: z.boolean().optional(),
    watch: z.boolean().optional(),
    intervalMinutes: z.number().optional(),
  }).optional(),
  search: z.object({
    maxResults: z.number().optional(),
    minScore: z.number().optional(),
    hybrid: z.object({
      enabled: z.boolean(),
      vectorWeight: z.number(),
      textWeight: z.number(),
    }).optional(),
  }).optional(),
});

export const OpsPilotConfigSchema = z.object({
  version: z.string(),
  meta: z.object({
    lastUpdated: z.string().optional(),
    wizardVersion: z.string().optional(),
  }).optional(),
  ai: AIConfigSchema,
  channels: z.record(z.any()).optional(),
  tools: z.record(z.any()).optional(),
  skills: z.record(z.any()).optional(),
  memory: MemoryConfigSchema.optional(),
  automation: z.record(z.any()).optional(),
  gateway: z.record(z.any()).optional(),
  agent: z.record(z.any()).optional(),
});

/**
 * Load configuration from file
 */
export async function loadConfig(configPath?: string): Promise<OpsPilotConfig> {
  const filePath = configPath ?? DEFAULT_CONFIG_PATH;

  if (!fs.existsSync(filePath)) {
    throw new Error(`Config file not found: ${filePath}. Run 'opspilot setup' first.`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const raw = yaml.parse(content);

  // Expand environment variables
  const expanded = expandEnvVars(raw);

  // Validate
  const result = OpsPilotConfigSchema.safeParse(expanded);
  if (!result.success) {
    throw new Error(`Invalid config: ${result.error.message}`);
  }

  return expanded as OpsPilotConfig;
}

/**
 * Save configuration to file
 */
export async function saveConfig(config: OpsPilotConfig, configPath?: string): Promise<void> {
  const filePath = configPath ?? DEFAULT_CONFIG_PATH;
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Update meta
  config.meta = {
    ...config.meta,
    lastUpdated: new Date().toISOString(),
  };

  const content = yaml.stringify(config);
  fs.writeFileSync(filePath, content, 'utf-8');
}

/**
 * Check if config exists
 */
export function configExists(configPath?: string): boolean {
  return fs.existsSync(configPath ?? DEFAULT_CONFIG_PATH);
}

/**
 * Get default config
 */
export function getDefaultConfig(): OpsPilotConfig {
  return {
    version: '1',
    ai: {
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
    },
    channels: {
      telegram: { enabled: false },
      slack: { enabled: false },
      web: { enabled: true, port: 8080 },
    },
    tools: {
      builtin: ['shell', 'http', 'filesystem'],
      detected: {},
    },
    skills: {
      enabled: ['k8s-debug', 'incident-response'],
    },
    memory: {
      enabled: true,
      provider: 'auto',
      store: {
        driver: 'sqlite',
        path: DEFAULT_MEMORY_PATH,
      },
      chunking: {
        tokens: 400,
        overlap: 80,
      },
      search: {
        maxResults: 6,
        minScore: 0.35,
        hybrid: {
          enabled: true,
          vectorWeight: 0.7,
          textWeight: 0.3,
        },
      },
    },
    automation: {
      heartbeat: {
        enabled: false,
        every: '30m',
      },
    },
    gateway: {
      bind: '127.0.0.1',
      port: 18789,
    },
    agent: {
      name: 'OpsPilot',
      workspace: DEFAULT_WORKSPACE_PATH,
    },
  };
}

/**
 * Expand environment variables in config
 */
function expandEnvVars(obj: unknown): unknown {
  if (typeof obj === 'string') {
    return obj.replace(/\$\{([^}]+)\}/g, (_, name) => {
      return process.env[name] ?? '';
    });
  }

  if (Array.isArray(obj)) {
    return obj.map(expandEnvVars);
  }

  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = expandEnvVars(value);
    }
    return result;
  }

  return obj;
}
