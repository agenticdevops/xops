/**
 * AI Runtime - manages LLM interactions
 * Supports: Claude Code (subscription), Anthropic API, and others
 */

import { spawn } from 'child_process';
import type { AIConfig } from '../../core/src/types';
import type { ChatMessage, ConversationContext } from './types';

export interface RuntimeOptions {
  aiConfig: AIConfig;
  systemPrompt?: string;
}

const DEFAULT_SYSTEM_PROMPT = `You are OpsPilot, a 24/7 DevOps copilot that helps with infrastructure management, debugging, and operations tasks.

You have access to various DevOps tools and can help with:
- Kubernetes troubleshooting and management
- Cloud infrastructure (AWS, GCP, Azure)
- CI/CD pipelines and deployments
- Monitoring and alerting
- Incident response and debugging

Be concise, practical, and action-oriented. When suggesting commands, explain what they do.
Always prioritize safety - ask for confirmation before destructive operations.`;

/**
 * Runtime that uses the Claude Code CLI (claude -p) to send messages.
 * Uses the user's existing Claude Pro/Max subscription - no API key needed.
 */
class ClaudeCodeRuntime {
  private systemPrompt: string;
  private model: string;

  constructor(systemPrompt: string, model: string) {
    this.systemPrompt = systemPrompt;
    this.model = model;
  }

  async chat(
    context: ConversationContext,
    message: string,
    memoryContext?: string[],
  ): Promise<string> {
    // Build the full prompt with conversation history and memory context
    const fullPrompt = this.buildPrompt(context, message, memoryContext);

    return new Promise((resolve, reject) => {
      const args = ['-p', fullPrompt, '--model', this.model, '--no-markdown'];
      const proc = spawn('claude', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Claude Code exited with code ${code}: ${stderr}`));
        } else {
          resolve(stdout.trim());
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to spawn claude: ${err.message}. Is Claude Code installed?`));
      });
    });
  }

  async *chatStream(
    context: ConversationContext,
    message: string,
    memoryContext?: string[],
  ): AsyncGenerator<string, void, unknown> {
    const fullPrompt = this.buildPrompt(context, message, memoryContext);

    const args = ['-p', fullPrompt, '--model', this.model, '--no-markdown'];
    const proc = spawn('claude', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    const decoder = new TextDecoder();

    for await (const chunk of proc.stdout) {
      yield decoder.decode(chunk as Buffer, { stream: true });
    }

    // Wait for process to finish
    await new Promise<void>((resolve, reject) => {
      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Claude Code exited with code ${code}`));
        } else {
          resolve();
        }
      });
    });
  }

  private buildPrompt(
    context: ConversationContext,
    message: string,
    memoryContext?: string[],
  ): string {
    let prompt = `<system>\n${this.systemPrompt}`;

    if (memoryContext && memoryContext.length > 0) {
      prompt += `\n\n## Relevant Context from Memory\n\n${memoryContext.join('\n\n')}`;
    }

    prompt += '\n</system>\n\n';

    // Add conversation history (last 10 messages)
    const recentMessages = context.messages.slice(-10);
    if (recentMessages.length > 0) {
      prompt += '<conversation_history>\n';
      for (const msg of recentMessages) {
        const role = msg.role === 'user' ? 'User' : 'OpsPilot';
        prompt += `${role}: ${msg.content}\n\n`;
      }
      prompt += '</conversation_history>\n\n';
    }

    prompt += `User: ${message}`;

    return prompt;
  }
}

/**
 * Runtime that uses the Anthropic SDK directly (API key required).
 */
class AnthropicAPIRuntime {
  private client: any; // Lazy loaded
  private model: string;
  private systemPrompt: string;
  private apiKey: string;

  constructor(apiKey: string, model: string, systemPrompt: string) {
    this.apiKey = apiKey;
    this.model = model;
    this.systemPrompt = systemPrompt;
  }

  private async getClient() {
    if (!this.client) {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      this.client = new Anthropic({ apiKey: this.apiKey });
    }
    return this.client;
  }

  async chat(
    context: ConversationContext,
    message: string,
    memoryContext?: string[],
  ): Promise<string> {
    const client = await this.getClient();

    const messages = context.messages
      .filter((m: ChatMessage) => m.role !== 'assistant' || m.content)
      .map((m: ChatMessage) => ({ role: m.role, content: m.content }));

    messages.push({ role: 'user', content: message });

    let systemPrompt = this.systemPrompt;
    if (memoryContext && memoryContext.length > 0) {
      systemPrompt += `\n\n## Relevant Context from Memory\n\n${memoryContext.join('\n\n')}`;
    }

    const response = await client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages,
    });

    const textContent = response.content.find((c: any) => c.type === 'text');
    return textContent?.text || 'No response generated.';
  }

  async *chatStream(
    context: ConversationContext,
    message: string,
    memoryContext?: string[],
  ): AsyncGenerator<string, void, unknown> {
    const client = await this.getClient();

    const messages = context.messages.map((m: ChatMessage) => ({
      role: m.role,
      content: m.content,
    }));

    messages.push({ role: 'user', content: message });

    let systemPrompt = this.systemPrompt;
    if (memoryContext && memoryContext.length > 0) {
      systemPrompt += `\n\n## Relevant Context from Memory\n\n${memoryContext.join('\n\n')}`;
    }

    const stream = await client.messages.stream({
      model: this.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield event.delta.text;
      }
    }
  }
}

/**
 * Main AIRuntime facade - delegates to the appropriate backend
 */
export class AIRuntime {
  private backend: ClaudeCodeRuntime | AnthropicAPIRuntime;

  constructor(options: RuntimeOptions) {
    const { aiConfig, systemPrompt } = options;
    const prompt = systemPrompt || DEFAULT_SYSTEM_PROMPT;

    if (aiConfig.provider === 'claude-code') {
      this.backend = new ClaudeCodeRuntime(prompt, aiConfig.model || 'sonnet');
    } else {
      const apiKey = this.resolveEnvVar(aiConfig.apiKey || '');
      this.backend = new AnthropicAPIRuntime(apiKey, aiConfig.model, prompt);
    }
  }

  async chat(
    context: ConversationContext,
    message: string,
    memoryContext?: string[],
  ): Promise<string> {
    return this.backend.chat(context, message, memoryContext);
  }

  async *chatStream(
    context: ConversationContext,
    message: string,
    memoryContext?: string[],
  ): AsyncGenerator<string, void, unknown> {
    yield* this.backend.chatStream(context, message, memoryContext);
  }

  private resolveEnvVar(value: string): string {
    if (value.startsWith('${') && value.endsWith('}')) {
      const envVar = value.slice(2, -1);
      return process.env[envVar] || '';
    }
    return value;
  }
}
