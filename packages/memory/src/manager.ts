/**
 * Memory Manager - orchestrates indexing, searching, and syncing
 *
 * Simplified port from clawdbot's MemoryIndexManager.
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import type {
  MemoryConfig,
  MemoryChunk,
  MemorySearchResult,
  MemorySearchOptions,
  EmbeddingProvider,
  MemoryStats,
} from './types';
import {
  listMemoryFiles,
  buildFileEntry,
  chunkMarkdown,
  hashText,
  generateChunkId,
  cosineSimilarity,
  parseEmbedding,
  ensureDir,
} from './internal';
import {
  buildFtsQuery,
  bm25RankToScore,
  mergeHybridResults,
  type HybridVectorResult,
  type HybridKeywordResult,
} from './hybrid';
import { createEmbeddingProvider } from './embeddings';

const EMBEDDING_CACHE_TABLE = 'embedding_cache';
const FTS_TABLE = 'chunks_fts';

/**
 * Memory Manager
 *
 * Handles indexing markdown files and searching with hybrid (vector + keyword) search.
 */
export class MemoryManager {
  private db: Database.Database | null = null;
  private provider: EmbeddingProvider | null = null;
  private config: MemoryConfig;
  private workspaceDir: string;
  private initialized = false;
  private ftsAvailable = false;

  constructor(config: MemoryConfig, workspaceDir: string) {
    this.config = config;
    this.workspaceDir = workspaceDir;
  }

  /**
   * Initialize the memory system
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    // Ensure store directory exists
    const storeDir = path.dirname(this.config.store.path);
    ensureDir(storeDir);

    // Open database
    this.db = new Database(this.config.store.path);
    this.db.pragma('journal_mode = WAL');

    // Create schema
    this.createSchema();

    // Initialize embedding provider
    if (this.config.provider !== 'none') {
      try {
        this.provider = await createEmbeddingProvider({
          provider: this.config.provider,
          apiKey: this.config.apiKey,
        });
      } catch (error) {
        console.warn('Failed to initialize embedding provider:', error);
        // Continue with keyword-only search
      }
    }

    this.initialized = true;
  }

  /**
   * Create database schema
   */
  private createSchema(): void {
    if (!this.db) throw new Error('Database not initialized');

    // Metadata table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    // Files table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS files (
        path TEXT PRIMARY KEY,
        source TEXT NOT NULL DEFAULT 'memory',
        hash TEXT NOT NULL,
        mtime INTEGER NOT NULL,
        size INTEGER NOT NULL
      );
    `);

    // Chunks table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'memory',
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        hash TEXT NOT NULL,
        text TEXT NOT NULL,
        embedding TEXT,
        updated_at INTEGER NOT NULL
      );
    `);

    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_chunks_path ON chunks(path);`);

    // Embedding cache table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${EMBEDDING_CACHE_TABLE} (
        hash TEXT PRIMARY KEY,
        embedding TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    // Try to create FTS5 table
    try {
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS ${FTS_TABLE} USING fts5(
          text,
          id UNINDEXED,
          path UNINDEXED,
          start_line UNINDEXED,
          end_line UNINDEXED
        );
      `);
      this.ftsAvailable = true;
    } catch {
      console.warn('FTS5 not available, using vector-only search');
      this.ftsAvailable = false;
    }
  }

  /**
   * Sync memory index with workspace files
   */
  async sync(): Promise<{ indexed: number; removed: number }> {
    if (!this.db) await this.init();

    const files = await listMemoryFiles(this.workspaceDir);
    let indexed = 0;
    let removed = 0;

    // Get current indexed files
    const stmt = this.db!.prepare('SELECT path, hash FROM files');
    const currentFiles = new Map<string, string>();
    for (const row of stmt.iterate() as IterableIterator<{ path: string; hash: string }>) {
      currentFiles.set(row.path, row.hash);
    }

    // Index new/changed files
    for (const absPath of files) {
      const entry = await buildFileEntry(absPath, this.workspaceDir);

      // Skip if unchanged
      if (currentFiles.get(entry.path) === entry.hash) {
        currentFiles.delete(entry.path);
        continue;
      }

      await this.indexFile(entry.absPath, entry.path);
      indexed++;
      currentFiles.delete(entry.path);
    }

    // Remove deleted files
    for (const deletedPath of currentFiles.keys()) {
      this.removeFile(deletedPath);
      removed++;
    }

    return { indexed, removed };
  }

  /**
   * Index a single file
   */
  private async indexFile(absPath: string, relPath: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const content = await fs.promises.readFile(absPath, 'utf-8');
    const stat = await fs.promises.stat(absPath);
    const fileHash = hashText(content);

    // Chunk the content
    const rawChunks = chunkMarkdown(content, this.config.chunking);

    // Generate embeddings if provider available
    const chunks: MemoryChunk[] = [];
    const textsToEmbed = rawChunks.map((c) => c.text);
    let embeddings: number[][] = [];

    if (this.provider && textsToEmbed.length > 0) {
      try {
        embeddings = await this.getOrCreateEmbeddings(textsToEmbed);
      } catch (error) {
        console.warn('Failed to generate embeddings:', error);
      }
    }

    for (let i = 0; i < rawChunks.length; i++) {
      const raw = rawChunks[i]!;
      chunks.push({
        id: generateChunkId(relPath, raw.startLine, raw.hash),
        path: relPath,
        startLine: raw.startLine,
        endLine: raw.endLine,
        text: raw.text,
        hash: raw.hash,
        embedding: embeddings[i],
      });
    }

    // Update database (transaction)
    const insertFile = this.db.prepare(`
      INSERT OR REPLACE INTO files (path, hash, mtime, size, source)
      VALUES (?, ?, ?, ?, 'memory')
    `);

    const deleteChunks = this.db.prepare('DELETE FROM chunks WHERE path = ?');
    const deleteFts = this.ftsAvailable
      ? this.db.prepare(`DELETE FROM ${FTS_TABLE} WHERE path = ?`)
      : null;

    const insertChunk = this.db.prepare(`
      INSERT INTO chunks (id, path, start_line, end_line, hash, text, embedding, source, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'memory', ?)
    `);

    const insertFts = this.ftsAvailable
      ? this.db.prepare(`
          INSERT INTO ${FTS_TABLE} (text, id, path, start_line, end_line)
          VALUES (?, ?, ?, ?, ?)
        `)
      : null;

    const transaction = this.db.transaction(() => {
      insertFile.run(relPath, fileHash, stat.mtimeMs, stat.size);
      deleteChunks.run(relPath);
      deleteFts?.run(relPath);

      const now = Date.now();
      for (const chunk of chunks) {
        const embeddingJson = chunk.embedding ? JSON.stringify(chunk.embedding) : null;
        insertChunk.run(
          chunk.id,
          chunk.path,
          chunk.startLine,
          chunk.endLine,
          chunk.hash,
          chunk.text,
          embeddingJson,
          now,
        );
        insertFts?.run(chunk.text, chunk.id, chunk.path, chunk.startLine, chunk.endLine);
      }
    });

    transaction();
  }

  /**
   * Get or create embeddings (with caching)
   */
  private async getOrCreateEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.provider || !this.db) return [];

    const results: number[][] = new Array(texts.length);
    const toEmbed: { index: number; text: string; hash: string }[] = [];

    // Check cache
    const getCache = this.db.prepare(`
      SELECT embedding FROM ${EMBEDDING_CACHE_TABLE} WHERE hash = ?
    `);

    for (let i = 0; i < texts.length; i++) {
      const text = texts[i]!;
      const hash = hashText(text);
      const cached = getCache.get(hash) as { embedding: string } | undefined;

      if (cached) {
        results[i] = parseEmbedding(cached.embedding);
      } else {
        toEmbed.push({ index: i, text, hash });
      }
    }

    // Embed missing texts
    if (toEmbed.length > 0) {
      const embeddings = await this.provider.embedBatch(toEmbed.map((t) => t.text));

      const insertCache = this.db.prepare(`
        INSERT OR REPLACE INTO ${EMBEDDING_CACHE_TABLE} (hash, embedding, provider, model, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `);

      const now = Date.now();
      for (let i = 0; i < toEmbed.length; i++) {
        const item = toEmbed[i]!;
        const embedding = embeddings[i] ?? [];
        results[item.index] = embedding;
        insertCache.run(
          item.hash,
          JSON.stringify(embedding),
          this.provider.id,
          this.provider.model,
          now,
        );
      }
    }

    return results;
  }

  /**
   * Remove a file from index
   */
  private removeFile(relPath: string): void {
    if (!this.db) throw new Error('Database not initialized');

    const deleteFile = this.db.prepare('DELETE FROM files WHERE path = ?');
    const deleteChunks = this.db.prepare('DELETE FROM chunks WHERE path = ?');
    const deleteFts = this.ftsAvailable
      ? this.db.prepare(`DELETE FROM ${FTS_TABLE} WHERE path = ?`)
      : null;

    const transaction = this.db.transaction(() => {
      deleteFile.run(relPath);
      deleteChunks.run(relPath);
      deleteFts?.run(relPath);
    });

    transaction();
  }

  /**
   * Search memory
   */
  async search(query: string, options?: MemorySearchOptions): Promise<MemorySearchResult[]> {
    if (!this.db) await this.init();

    const maxResults = options?.maxResults ?? this.config.search.maxResults;
    const minScore = options?.minScore ?? this.config.search.minScore;
    const hybridConfig = this.config.search.hybrid;

    // Sync before search if configured
    if (this.config.sync.onSearch) {
      await this.sync();
    }

    let vectorResults: HybridVectorResult[] = [];
    let keywordResults: HybridKeywordResult[] = [];

    // Vector search (if embeddings available)
    if (this.provider) {
      try {
        vectorResults = await this.vectorSearch(query, maxResults * 2);
      } catch (error) {
        console.warn('Vector search failed:', error);
      }
    }

    // Keyword search (if FTS available)
    if (this.ftsAvailable && hybridConfig.enabled) {
      try {
        keywordResults = this.keywordSearch(query, maxResults * 2);
      } catch (error) {
        console.warn('Keyword search failed:', error);
      }
    }

    // If no vector results and no FTS, fall back to simple text matching
    if (vectorResults.length === 0 && keywordResults.length === 0) {
      return this.fallbackSearch(query, maxResults);
    }

    // Merge results
    const merged = mergeHybridResults({
      vector: vectorResults,
      keyword: keywordResults,
      vectorWeight: hybridConfig.vectorWeight,
      textWeight: hybridConfig.textWeight,
    });

    // Filter by score and limit
    return merged
      .filter((r) => r.score >= minScore)
      .slice(0, maxResults);
  }

  /**
   * Vector similarity search
   */
  private async vectorSearch(query: string, limit: number): Promise<HybridVectorResult[]> {
    if (!this.provider || !this.db) return [];

    const queryEmbedding = await this.provider.embedQuery(query);
    if (queryEmbedding.length === 0) return [];

    // Get all chunks with embeddings
    const stmt = this.db.prepare(`
      SELECT id, path, start_line, end_line, text, embedding
      FROM chunks
      WHERE embedding IS NOT NULL
    `);

    const results: HybridVectorResult[] = [];

    for (const row of stmt.iterate() as IterableIterator<{
      id: string;
      path: string;
      start_line: number;
      end_line: number;
      text: string;
      embedding: string;
    }>) {
      const embedding = parseEmbedding(row.embedding);
      if (embedding.length === 0) continue;

      const score = cosineSimilarity(queryEmbedding, embedding);
      results.push({
        id: row.id,
        path: row.path,
        startLine: row.start_line,
        endLine: row.end_line,
        snippet: row.text.slice(0, 200),
        vectorScore: score,
      });
    }

    // Sort by score and limit
    return results
      .sort((a, b) => b.vectorScore - a.vectorScore)
      .slice(0, limit);
  }

  /**
   * FTS5 keyword search
   */
  private keywordSearch(query: string, limit: number): HybridKeywordResult[] {
    if (!this.db || !this.ftsAvailable) return [];

    const ftsQuery = buildFtsQuery(query);
    if (!ftsQuery) return [];

    try {
      const stmt = this.db.prepare(`
        SELECT id, path, start_line, end_line, snippet(${FTS_TABLE}, 0, '**', '**', '...', 32) as snippet, bm25(${FTS_TABLE}) as rank
        FROM ${FTS_TABLE}
        WHERE ${FTS_TABLE} MATCH ?
        ORDER BY rank
        LIMIT ?
      `);

      const results: HybridKeywordResult[] = [];
      for (const row of stmt.iterate(ftsQuery, limit) as IterableIterator<{
        id: string;
        path: string;
        start_line: number;
        end_line: number;
        snippet: string;
        rank: number;
      }>) {
        results.push({
          id: row.id,
          path: row.path,
          startLine: row.start_line,
          endLine: row.end_line,
          snippet: row.snippet,
          textScore: bm25RankToScore(row.rank),
        });
      }

      return results;
    } catch {
      return [];
    }
  }

  /**
   * Fallback simple text search (LIKE query)
   */
  private fallbackSearch(query: string, limit: number): MemorySearchResult[] {
    if (!this.db) return [];

    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];

    // Build LIKE conditions
    const conditions = terms.map(() => 'LOWER(text) LIKE ?').join(' AND ');
    const params = terms.map((t) => `%${t}%`);

    const stmt = this.db.prepare(`
      SELECT id, path, start_line, end_line, text
      FROM chunks
      WHERE ${conditions}
      LIMIT ?
    `);

    const results: MemorySearchResult[] = [];
    for (const row of stmt.iterate(...params, limit) as IterableIterator<{
      id: string;
      path: string;
      start_line: number;
      end_line: number;
      text: string;
    }>) {
      results.push({
        path: row.path,
        startLine: row.start_line,
        endLine: row.end_line,
        snippet: row.text.slice(0, 200),
        score: 0.5, // Fixed score for fallback
      });
    }

    return results;
  }

  /**
   * Get memory statistics
   */
  async getStats(): Promise<MemoryStats> {
    if (!this.db) await this.init();

    const fileCount = (this.db!.prepare('SELECT COUNT(*) as count FROM files').get() as { count: number }).count;
    const chunkCount = (this.db!.prepare('SELECT COUNT(*) as count FROM chunks').get() as { count: number }).count;

    return {
      totalFiles: fileCount,
      totalChunks: chunkCount,
      indexedAt: new Date(),
      embeddingProvider: this.provider?.id ?? null,
    };
  }

  /**
   * Get specific lines from a file
   */
  async getLines(
    relPath: string,
    startLine: number,
    endLine: number,
  ): Promise<string | null> {
    const absPath = path.join(this.workspaceDir, relPath);

    try {
      const content = await fs.promises.readFile(absPath, 'utf-8');
      const lines = content.split('\n');
      return lines.slice(startLine - 1, endLine).join('\n');
    } catch {
      return null;
    }
  }

  /**
   * Close the database
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
    }
  }
}

/**
 * Create a memory manager instance
 */
export function createMemoryManager(
  config: MemoryConfig,
  workspaceDir: string,
): MemoryManager {
  return new MemoryManager(config, workspaceDir);
}
