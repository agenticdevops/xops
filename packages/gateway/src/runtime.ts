/**
 * AI Runtime - manages LLM interactions
 */

import Anthropic from '@anthropic-ai/sdk';
import type { AIConfig } from '../../core/src/types';
import type { ChatMessage, ConversationContext } from './types';

export interface RuntimeOptions {
  aiConfig: AIConfig;
  systemPrompt?: string;
}

export class AIRuntime {
  private client: Anthropic;
  private model: string;
  private systemPrompt: string;

  constructor(options: RuntimeOptions) {
    const { aiConfig, systemPrompt } = options;

    // Initialize Anthropic client
    this.client = new Anthropic({
      apiKey: this.resolveEnvVar(aiConfig.apiKey),
    });
    this.model = aiConfig.model;
    this.systemPrompt =
      systemPrompt ||
      `You are OpsPilot, a 24/7 DevOps copilot that helps with infrastructure management, debugging, and operations tasks.

You have access to various DevOps tools and can help with:
- Kubernetes troubleshooting and management
- Cloud infrastructure (AWS, GCP, Azure)
- CI/CD pipelines and deployments
- Monitoring and alerting
- Incident response and debugging

Be concise, practical, and action-oriented. When suggesting commands, explain what they do.
Always prioritize safety - ask for confirmation before destructive operations.`;
  }

  /**
   * Send a message and get a response
   */
  async chat(
    context: ConversationContext,
    message: string,
    memoryContext?: string[],
  ): Promise<string> {
    // Build messages array
    const messages: Anthropic.MessageParam[] = context.messages
      .filter((m) => m.role !== 'assistant' || m.content)
      .map((m) => ({
        role: m.role,
        content: m.content,
      }));

    // Add new user message
    messages.push({ role: 'user', content: message });

    // Build system prompt with memory context
    let systemPrompt = this.systemPrompt;
    if (memoryContext && memoryContext.length > 0) {
      systemPrompt += `\n\n## Relevant Context from Memory\n\n${memoryContext.join('\n\n')}`;
    }

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages,
      });

      // Extract text content
      const textContent = response.content.find((c) => c.type === 'text');
      return textContent?.text || 'No response generated.';
    } catch (error) {
      const err = error as Error;
      console.error('AI Runtime error:', err.message);
      throw new Error(`Failed to get AI response: ${err.message}`);
    }
  }

  /**
   * Generate a streaming response
   */
  async *chatStream(
    context: ConversationContext,
    message: string,
    memoryContext?: string[],
  ): AsyncGenerator<string, void, unknown> {
    const messages: Anthropic.MessageParam[] = context.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    messages.push({ role: 'user', content: message });

    let systemPrompt = this.systemPrompt;
    if (memoryContext && memoryContext.length > 0) {
      systemPrompt += `\n\n## Relevant Context from Memory\n\n${memoryContext.join('\n\n')}`;
    }

    const stream = await this.client.messages.stream({
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

  /**
   * Resolve environment variable references
   */
  private resolveEnvVar(value: string): string {
    if (value.startsWith('${') && value.endsWith('}')) {
      const envVar = value.slice(2, -1);
      return process.env[envVar] || '';
    }
    return value;
  }
}
