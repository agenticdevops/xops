/**
 * Memory system types
 */

export interface MemoryConfig {
  enabled: boolean;
  provider: 'auto' | 'openai' | 'gemini' | 'local' | 'none';
  apiKey?: string;
  model?: string;
  store: {
    driver: 'sqlite';
    path: string;
  };
  chunking: {
    tokens: number;
    overlap: number;
  };
  sync: {
    onSessionStart: boolean;
    onSearch: boolean;
    watch: boolean;
    intervalMinutes: number;
  };
  search: {
    maxResults: number;
    minScore: number;
    hybrid: {
      enabled: boolean;
      vectorWeight: number;
      textWeight: number;
    };
  };
}

export interface MemoryFileEntry {
  path: string;
  absPath: string;
  mtimeMs: number;
  size: number;
  hash: string;
}

export interface MemoryChunk {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  text: string;
  hash: string;
  embedding?: number[];
}

export interface MemorySearchResult {
  path: string;
  startLine: number;
  endLine: number;
  snippet: string;
  score: number;
}

export interface MemorySearchOptions {
  maxResults?: number;
  minScore?: number;
  source?: 'memory' | 'sessions' | 'all';
}

export interface EmbeddingProvider {
  id: string;
  model: string;
  dimensions: number;
  embedQuery(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

export interface MemoryStats {
  totalFiles: number;
  totalChunks: number;
  indexedAt: Date | null;
  embeddingProvider: string | null;
}
