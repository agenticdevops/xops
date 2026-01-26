/**
 * Hybrid search - combines vector similarity with keyword (FTS5) search
 * Ported from clawdbot/src/memory/hybrid.ts
 */

import type { MemorySearchResult } from './types';

export interface HybridVectorResult {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  snippet: string;
  vectorScore: number;
}

export interface HybridKeywordResult {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  snippet: string;
  textScore: number;
}

/**
 * Build FTS5 query from natural language query
 *
 * Extracts words and joins with AND for phrase matching.
 */
export function buildFtsQuery(raw: string): string | null {
  const tokens =
    raw
      .match(/[A-Za-z0-9_]+/g)
      ?.map((t) => t.trim())
      .filter(Boolean) ?? [];
  if (tokens.length === 0) return null;
  const quoted = tokens.map((t) => `"${t.replaceAll('"', '')}"`);
  return quoted.join(' AND ');
}

/**
 * Convert BM25 rank to normalized score (0-1)
 *
 * BM25 returns negative values where lower = better match.
 * We normalize to 0-1 where higher = better.
 */
export function bm25RankToScore(rank: number): number {
  const normalized = Number.isFinite(rank) ? Math.max(0, Math.abs(rank)) : 999;
  return 1 / (1 + normalized);
}

/**
 * Merge vector and keyword search results
 *
 * Uses weighted scoring: score = vectorWeight * vectorScore + textWeight * textScore
 * Default weights: 70% vector, 30% keyword
 */
export function mergeHybridResults(params: {
  vector: HybridVectorResult[];
  keyword: HybridKeywordResult[];
  vectorWeight: number;
  textWeight: number;
}): MemorySearchResult[] {
  const byId = new Map<
    string,
    {
      id: string;
      path: string;
      startLine: number;
      endLine: number;
      snippet: string;
      vectorScore: number;
      textScore: number;
    }
  >();

  // Add vector results
  for (const r of params.vector) {
    byId.set(r.id, {
      id: r.id,
      path: r.path,
      startLine: r.startLine,
      endLine: r.endLine,
      snippet: r.snippet,
      vectorScore: r.vectorScore,
      textScore: 0,
    });
  }

  // Merge keyword results
  for (const r of params.keyword) {
    const existing = byId.get(r.id);
    if (existing) {
      existing.textScore = r.textScore;
      // Prefer keyword snippet if available (has highlighted matches)
      if (r.snippet && r.snippet.length > 0) {
        existing.snippet = r.snippet;
      }
    } else {
      byId.set(r.id, {
        id: r.id,
        path: r.path,
        startLine: r.startLine,
        endLine: r.endLine,
        snippet: r.snippet,
        vectorScore: 0,
        textScore: r.textScore,
      });
    }
  }

  // Calculate weighted scores and sort
  const merged = Array.from(byId.values()).map((entry) => {
    const score =
      params.vectorWeight * entry.vectorScore +
      params.textWeight * entry.textScore;
    return {
      path: entry.path,
      startLine: entry.startLine,
      endLine: entry.endLine,
      score,
      snippet: entry.snippet,
    };
  });

  return merged.sort((a, b) => b.score - a.score);
}
