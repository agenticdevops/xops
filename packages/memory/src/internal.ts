/**
 * Internal utilities for memory system
 * Ported from clawdbot/src/memory/internal.ts
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { MemoryFileEntry, MemoryChunk } from './types';

/**
 * Ensure directory exists
 */
export function ensureDir(dir: string): string {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // Ignore if already exists
  }
  return dir;
}

/**
 * Normalize relative path
 */
export function normalizeRelPath(value: string): string {
  const trimmed = value.trim().replace(/^[./]+/, '');
  return trimmed.replace(/\\/g, '/');
}

/**
 * Check if path is a memory path
 */
export function isMemoryPath(relPath: string): boolean {
  const normalized = normalizeRelPath(relPath);
  if (!normalized) return false;
  if (normalized === 'MEMORY.md' || normalized === 'memory.md') return true;
  return normalized.startsWith('memory/');
}

/**
 * Check if file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Walk directory recursively
 */
async function walkDir(dir: string, files: string[]): Promise<void> {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkDir(full, files);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.md')) continue;
    files.push(full);
  }
}

/**
 * List all memory files in workspace
 */
export async function listMemoryFiles(workspaceDir: string): Promise<string[]> {
  const result: string[] = [];

  // Check MEMORY.md
  const memoryFile = path.join(workspaceDir, 'MEMORY.md');
  const altMemoryFile = path.join(workspaceDir, 'memory.md');
  if (await fileExists(memoryFile)) result.push(memoryFile);
  if (await fileExists(altMemoryFile)) result.push(altMemoryFile);

  // Check memory/ directory
  const memoryDir = path.join(workspaceDir, 'memory');
  if (await fileExists(memoryDir)) {
    await walkDir(memoryDir, result);
  }

  // Deduplicate
  if (result.length <= 1) return result;
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const entry of result) {
    let key = entry;
    try {
      key = await fs.promises.realpath(entry);
    } catch {
      // Use original path
    }
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(entry);
  }
  return deduped;
}

/**
 * Hash text using SHA256
 */
export function hashText(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/**
 * Build file entry from path
 */
export async function buildFileEntry(
  absPath: string,
  workspaceDir: string,
): Promise<MemoryFileEntry> {
  const stat = await fs.promises.stat(absPath);
  const content = await fs.promises.readFile(absPath, 'utf-8');
  const hash = hashText(content);
  return {
    path: path.relative(workspaceDir, absPath).replace(/\\/g, '/'),
    absPath,
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    hash,
  };
}

/**
 * Chunk markdown content for indexing
 *
 * Creates overlapping chunks of ~400 tokens (1600 chars) with 80-token overlap.
 * Preserves line numbers for accurate retrieval.
 */
export function chunkMarkdown(
  content: string,
  chunking: { tokens: number; overlap: number },
): Omit<MemoryChunk, 'id' | 'path' | 'embedding'>[] {
  const lines = content.split('\n');
  if (lines.length === 0) return [];

  const maxChars = Math.max(32, chunking.tokens * 4);
  const overlapChars = Math.max(0, chunking.overlap * 4);
  const chunks: Omit<MemoryChunk, 'id' | 'path' | 'embedding'>[] = [];

  let current: Array<{ line: string; lineNo: number }> = [];
  let currentChars = 0;

  const flush = () => {
    if (current.length === 0) return;
    const firstEntry = current[0];
    const lastEntry = current[current.length - 1];
    if (!firstEntry || !lastEntry) return;
    const text = current.map((entry) => entry.line).join('\n');
    chunks.push({
      startLine: firstEntry.lineNo,
      endLine: lastEntry.lineNo,
      text,
      hash: hashText(text),
    });
  };

  const carryOverlap = () => {
    if (overlapChars <= 0 || current.length === 0) {
      current = [];
      currentChars = 0;
      return;
    }
    let acc = 0;
    const kept: Array<{ line: string; lineNo: number }> = [];
    for (let i = current.length - 1; i >= 0; i -= 1) {
      const entry = current[i];
      if (!entry) continue;
      acc += entry.line.length + 1;
      kept.unshift(entry);
      if (acc >= overlapChars) break;
    }
    current = kept;
    currentChars = kept.reduce((sum, entry) => sum + entry.line.length + 1, 0);
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const lineNo = i + 1;

    // Handle very long lines by splitting
    const segments: string[] = [];
    if (line.length === 0) {
      segments.push('');
    } else {
      for (let start = 0; start < line.length; start += maxChars) {
        segments.push(line.slice(start, start + maxChars));
      }
    }

    for (const segment of segments) {
      const lineSize = segment.length + 1;
      if (currentChars + lineSize > maxChars && current.length > 0) {
        flush();
        carryOverlap();
      }
      current.push({ line: segment, lineNo });
      currentChars += lineSize;
    }
  }
  flush();
  return chunks;
}

/**
 * Parse embedding from JSON string
 */
export function parseEmbedding(raw: string): number[] {
  try {
    const parsed = JSON.parse(raw) as number[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Generate unique chunk ID
 */
export function generateChunkId(path: string, startLine: number, hash: string): string {
  return `${hashText(path)}-${startLine}-${hash.slice(0, 8)}`;
}
