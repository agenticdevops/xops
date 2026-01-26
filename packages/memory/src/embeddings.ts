/**
 * Embedding providers for vector search
 *
 * Supports OpenAI and Gemini embeddings with fallback to keyword-only search.
 */

import OpenAI from 'openai';
import type { EmbeddingProvider } from './types';

const DEFAULT_OPENAI_MODEL = 'text-embedding-3-small';
const DEFAULT_GEMINI_MODEL = 'text-embedding-004';

/**
 * Create OpenAI embedding provider
 */
export async function createOpenAIEmbeddingProvider(options: {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}): Promise<EmbeddingProvider> {
  const client = new OpenAI({
    apiKey: options.apiKey,
    baseURL: options.baseUrl,
  });

  const model = options.model || DEFAULT_OPENAI_MODEL;

  // Get dimensions based on model
  const dimensions = model.includes('text-embedding-3') ? 1536 : 1536;

  return {
    id: 'openai',
    model,
    dimensions,

    async embedQuery(text: string): Promise<number[]> {
      const response = await client.embeddings.create({
        model,
        input: text,
      });
      return response.data[0]?.embedding ?? [];
    },

    async embedBatch(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return [];

      // OpenAI supports batch embeddings natively
      const response = await client.embeddings.create({
        model,
        input: texts,
      });

      return response.data.map((d) => d.embedding);
    },
  };
}

/**
 * Create Gemini embedding provider
 */
export async function createGeminiEmbeddingProvider(options: {
  apiKey: string;
  model?: string;
}): Promise<EmbeddingProvider> {
  const model = options.model || DEFAULT_GEMINI_MODEL;
  const baseUrl = 'https://generativelanguage.googleapis.com/v1beta';

  return {
    id: 'gemini',
    model,
    dimensions: 768,

    async embedQuery(text: string): Promise<number[]> {
      const response = await fetch(
        `${baseUrl}/models/${model}:embedContent?key=${options.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: `models/${model}`,
            content: { parts: [{ text }] },
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`Gemini embedding failed: ${response.statusText}`);
      }

      const data = (await response.json()) as { embedding: { values: number[] } };
      return data.embedding?.values ?? [];
    },

    async embedBatch(texts: string[]): Promise<number[][]> {
      // Gemini doesn't have native batch, so we parallelize
      const results = await Promise.all(
        texts.map((text) => this.embedQuery(text)),
      );
      return results;
    },
  };
}

/**
 * Create embedding provider based on configuration
 *
 * Tries providers in order: specified > openai > gemini > none
 */
export async function createEmbeddingProvider(options: {
  provider: 'auto' | 'openai' | 'gemini' | 'none';
  apiKey?: string;
  model?: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
}): Promise<EmbeddingProvider | null> {
  const { provider } = options;

  if (provider === 'none') {
    return null;
  }

  // Try specified provider
  if (provider === 'openai' && options.apiKey) {
    return createOpenAIEmbeddingProvider({
      apiKey: options.apiKey,
      model: options.model,
    });
  }

  if (provider === 'gemini' && options.apiKey) {
    return createGeminiEmbeddingProvider({
      apiKey: options.apiKey,
      model: options.model,
    });
  }

  // Auto-select based on available API keys
  if (provider === 'auto') {
    // Try OpenAI first (most common)
    const openaiKey = options.openaiApiKey || process.env.OPENAI_API_KEY;
    if (openaiKey) {
      try {
        return await createOpenAIEmbeddingProvider({ apiKey: openaiKey });
      } catch {
        // Fall through
      }
    }

    // Try Gemini
    const geminiKey = options.geminiApiKey || process.env.GEMINI_API_KEY;
    if (geminiKey) {
      try {
        return await createGeminiEmbeddingProvider({ apiKey: geminiKey });
      } catch {
        // Fall through
      }
    }
  }

  // No embedding provider available - will use keyword-only search
  return null;
}
