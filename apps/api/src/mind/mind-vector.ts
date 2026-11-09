import { MIND_EMBEDDING_DIM } from './mind.types.js';

/**
 * Lightweight local embedding. It is deliberately dependency-free: Chinese
 * character bigrams and word tokens are hashed into a fixed-size signed vector,
 * then L2-normalised. This is a lexical-semantic fallback until the deployment
 * configures a real embedding provider; the retrieval pipeline only depends on
 * cosine similarity, so swapping the vector source later is mechanical.
 */
export function embedText(text: string): number[] {
  const normalized = text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) {
    return new Array<number>(MIND_EMBEDDING_DIM).fill(0);
  }

  const vector = new Array<number>(MIND_EMBEDDING_DIM).fill(0);
  const tokens = tokenize(normalized);

  for (const token of tokens) {
    const hash = fnv1a(token);
    const index = hash % MIND_EMBEDDING_DIM;
    const sign = (hash & 0x80000000) === 0 ? 1 : -1;
    const weight = token.length >= 2 ? 1.4 : 1;
    vector[index] = (vector[index] ?? 0) + sign * weight;
  }

  let norm = 0;
  for (const value of vector) {
    norm += value * value;
  }
  norm = Math.sqrt(norm);
  if (norm === 0) {
    return vector;
  }
  return vector.map((value) => value / norm);
}

/** Cosine distance of two embeddings; mismatched lengths are compared up to the shorter one, zero vectors score 0. */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || b.length === 0) {
    return 0;
  }
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < length; index += 1) {
    const left = a[index] ?? 0;
    const right = b[index] ?? 0;
    dot += left * right;
    normA += left * left;
    normB += right * right;
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Share of distinct query tokens also present in the text; cheap lexical pre-filter alongside cosine. */
export function keywordOverlap(query: string, text: string): number {
  const queryTokens = new Set(tokenize(query.toLowerCase()));
  if (queryTokens.size === 0) {
    return 0;
  }
  const textTokens = new Set(tokenize(text.toLowerCase()));
  let hits = 0;
  for (const token of queryTokens) {
    if (textTokens.has(token)) {
      hits += 1;
    }
  }
  return hits / queryTokens.size;
}

/** Splits on non-word runs and expands CJK words into character bigrams. */
function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const words = text.split(/[^\p{L}\p{N}_]+/u).filter(Boolean);
  for (const word of words) {
    tokens.push(word);
    if (/[\u3400-\u9fff]/u.test(word)) {
      for (let index = 0; index < word.length - 1; index += 1) {
        tokens.push(word.slice(index, index + 2));
      }
    }
  }
  return tokens;
}

/** 32-bit FNV-1a hash; unsigned so it can be used as a vector index. */
function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
