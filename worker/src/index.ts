/**
 * Atlas Memory Worker
 *
 * Semantic memory layer for agents using Cloudflare Vectorize + Workers AI.
 * Provides auto-recall and auto-capture hooks for agent conversations.
 */

export interface Env {
  VECTORIZE: Vectorize;
  AI: Ai;
  R2_MEMORY: R2Bucket;
  R2_FILES: R2Bucket;
  // (third bucket removed; hermes uses R2_MEMORY + R2_FILES)
  EMBEDDING_MODEL: string;
  GATEWAY_TOKEN?: string;
}

const PROTECTED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

interface EmbeddingResponse {
  shape: number[];
  data: number[][];
}

interface MemoryMetadata {
  agent: string;
  type: 'decision' | 'correction' | 'learning' | 'preference' | 'context' | 'user_profile';
  source_file: string;
  timestamp: string;
  chunk_index: number;
  raw_text: string;
}

interface QueryRequest {
  query: string;
  agent?: string;       // Filter by agent
  type?: string;        // Filter by memory type
  topK?: number;        // Number of results (default 5)
  minScore?: number;    // Minimum similarity score (default 0.7)
}

interface IndexRequest {
  agent: string;
  text: string;
  type?: MemoryMetadata['type'];
  source_file?: string;
  chunk_index?: number;
}

interface CaptureRequest {
  agent: string;
  turn_type: 'user' | 'assistant';
  content: string;
  classification?: string;  // Pre-classified by gateway
}

function jsonResponse(payload: unknown, init: ResponseInit = {}, corsHeaders: Record<string, string>): Response {
  return Response.json(payload, {
    ...init,
    headers: {
      ...corsHeaders,
      ...(init.headers || {}),
    },
  });
}

/**
 * Constant-time string comparison for bearer tokens.
 *
 * A short-circuit `!==` comparison leaks how many leading characters matched
 * through response timing. This XOR loop touches every byte up to the longer
 * input and folds the length difference into the result, so comparison time
 * depends only on input length, never on where a mismatch occurred.
 */
function timingSafeTokenEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  const len = Math.max(aBytes.length, bBytes.length);
  let diff = aBytes.length ^ bBytes.length;
  for (let i = 0; i < len; i++) {
    const x = i < aBytes.length ? aBytes[i] : 0;
    const y = i < bBytes.length ? bBytes[i] : 0;
    diff |= x ^ y;
  }
  return diff === 0;
}

function requireAuth(request: Request, env: Env, corsHeaders: Record<string, string>): Response | null {
  if (!PROTECTED_METHODS.has(request.method)) {
    return null;
  }

  if (!env.GATEWAY_TOKEN) {
    return jsonResponse(
      { error: 'Memory worker auth is not configured' },
      { status: 503 },
      corsHeaders,
    );
  }

  const authHeader = request.headers.get('Authorization') || '';
  const supplied = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!supplied || !timingSafeTokenEqual(supplied, env.GATEWAY_TOKEN)) {
    return jsonResponse({ error: 'Unauthorized' }, { status: 401 }, corsHeaders);
  }

  return null;
}

function parseAgentFilePath(path: string): { agent: string; file: string } | null {
  const match = path.match(/^\/agents\/([^/]+)\/files\/(.+)$/);
  if (!match) return null;

  const agent = decodeURIComponent(match[1]);
  const file = match[2]
    .split('/')
    .map((part) => decodeURIComponent(part))
    .join('/');

  if (!agent || !file || file.includes('..') || file.startsWith('/')) {
    return null;
  }

  return { agent, file };
}

function contentTypeForPath(path: string): string {
  if (path.endsWith('.md')) return 'text/markdown; charset=utf-8';
  if (path.endsWith('.json')) return 'application/json; charset=utf-8';
  if (path.endsWith('.txt')) return 'text/plain; charset=utf-8';
  if (path.endsWith('.html')) return 'text/html; charset=utf-8';
  return 'application/octet-stream';
}

// Utility: Generate deterministic ID from content.
// Uses a truncated SHA-256 digest: the old 32-bit djb2 hash collided often
// enough that two different chunks could silently overwrite each other in
// Vectorize (upsert semantics). 64 bits of SHA-256 makes accidental
// collision negligible while keeping IDs short and deterministic.
async function generateId(agent: string, source: string, text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  const hash = Array.from(new Uint8Array(digest).subarray(0, 8))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${agent}:${source}:${hash}`;
}

// Utility: Chunk text into indexable segments
function chunkText(text: string, maxChunkSize = 500): string[] {
  const chunks: string[] = [];
  const paragraphs = text.split(/\n\n+/);

  let currentChunk = '';
  for (const para of paragraphs) {
    if (currentChunk.length + para.length > maxChunkSize && currentChunk) {
      chunks.push(currentChunk.trim());
      currentChunk = para;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + para;
    }
  }
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers for cross-origin requests
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Hermes-File-Sha256',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      const fileRoute = parseAgentFilePath(path);

      // ================================
      // GET/PUT /agents/:agent/files/* - R2 memory file mirror
      // ================================
      if (fileRoute && request.method === 'GET') {
        const objectKey = `${fileRoute.agent}/${fileRoute.file}`;
        const obj = await env.R2_MEMORY.get(objectKey);
        if (!obj) {
          return jsonResponse({ error: `File not found: ${fileRoute.file}` }, { status: 404 }, corsHeaders);
        }

        return new Response(obj.body, {
          headers: {
            ...corsHeaders,
            'Content-Type': obj.httpMetadata?.contentType || contentTypeForPath(fileRoute.file),
            'ETag': obj.httpEtag,
            'X-Hermes-Memory-Agent': fileRoute.agent,
            'X-Hermes-Memory-File': fileRoute.file,
          },
        });
      }

      if (fileRoute && request.method === 'PUT') {
        const authError = requireAuth(request, env, corsHeaders);
        if (authError) return authError;

        const objectKey = `${fileRoute.agent}/${fileRoute.file}`;
        const contentType = request.headers.get('Content-Type') || contentTypeForPath(fileRoute.file);
        await env.R2_MEMORY.put(objectKey, request.body, {
          httpMetadata: { contentType },
          customMetadata: {
            agent: fileRoute.agent,
            file: fileRoute.file,
            sha256: request.headers.get('X-Hermes-File-Sha256') || '',
            updated_at: new Date().toISOString(),
          },
        });

        return jsonResponse({ stored: true, agent: fileRoute.agent, file: fileRoute.file, key: objectKey }, { status: 201 }, corsHeaders);
      }

      if (fileRoute) {
        return jsonResponse({ error: 'Method not allowed' }, { status: 405 }, corsHeaders);
      }

      // ================================
      // POST /query - Semantic search
      // ================================
      if (path === '/query' && request.method === 'POST') {
        const authError = requireAuth(request, env, corsHeaders);
        if (authError) return authError;

        const body: QueryRequest = await request.json();

        if (!body.query) {
          return jsonResponse({ error: 'query is required' }, { status: 400 }, corsHeaders);
        }

        // Generate embedding for query
        const embeddingResp = await env.AI.run(
          env.EMBEDDING_MODEL as any,
          { text: [body.query] }
        ) as unknown as EmbeddingResponse;

        // Build filter using $eq operator
        const filter: VectorizeVectorMetadataFilter = {};
        if (body.agent) filter.agent = { $eq: body.agent };
        if (body.type) filter.type = { $eq: body.type };

        // Query Vectorize
        const results = await env.VECTORIZE.query(embeddingResp.data[0], {
          topK: body.topK || 5,
          filter: Object.keys(filter).length > 0 ? filter : undefined,
          returnMetadata: 'all',
        });

        // Filter by minimum score
        const minScore = body.minScore || 0.7;
        const filtered = results.matches.filter(m => m.score >= minScore);

        return jsonResponse({
          query: body.query,
          count: filtered.length,
          matches: filtered.map(m => ({
            id: m.id,
            score: m.score,
            metadata: m.metadata,
          })),
        }, {}, corsHeaders);
      }

      // ================================
      // POST /index - Index new memory
      // ================================
      if (path === '/index' && request.method === 'POST') {
        const authError = requireAuth(request, env, corsHeaders);
        if (authError) return authError;

        const body: IndexRequest = await request.json();

        if (!body.agent || !body.text) {
          return jsonResponse({ error: 'agent and text are required' }, { status: 400 }, corsHeaders);
        }

        // Chunk the text
        const chunks = chunkText(body.text);
        const vectors: VectorizeVector[] = [];

        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];

          // Generate embedding
          const embeddingResp = await env.AI.run(
            env.EMBEDDING_MODEL as any,
            { text: [chunk] }
          ) as unknown as EmbeddingResponse;

          const id = await generateId(body.agent, body.source_file || 'manual', chunk);

          vectors.push({
            id,
            values: embeddingResp.data[0],
            metadata: {
              agent: body.agent,
              type: body.type || 'context',
              source_file: body.source_file || 'manual',
              timestamp: new Date().toISOString(),
              chunk_index: body.chunk_index ?? i,
              raw_text: chunk,
            } as any,
          });
        }

        // Upsert vectors
        const result = await env.VECTORIZE.upsert(vectors);

        return jsonResponse({
          indexed: vectors.length,
          ids: vectors.map(v => v.id),
          result,
        }, {}, corsHeaders);
      }

      // ================================
      // POST /capture - Auto-capture webhook
      // ================================
      if (path === '/capture' && request.method === 'POST') {
        const authError = requireAuth(request, env, corsHeaders);
        if (authError) return authError;

        const body: CaptureRequest = await request.json();

        if (!body.agent || !body.content) {
          return jsonResponse({ error: 'agent and content are required' }, { status: 400 }, corsHeaders);
        }

        // If not pre-classified, use simple heuristics
        let memoryType: MemoryMetadata['type'] = 'context';
        const contentLower = body.content.toLowerCase();

        if (body.classification) {
          memoryType = body.classification as MemoryMetadata['type'];
        } else if (contentLower.includes('decided') || contentLower.includes('decision')) {
          memoryType = 'decision';
        } else if (contentLower.includes('actually') || contentLower.includes('no,') || contentLower.includes("that's wrong")) {
          memoryType = 'correction';
        } else if (contentLower.includes('learned') || contentLower.includes('realized')) {
          memoryType = 'learning';
        } else if (contentLower.includes('prefer') || contentLower.includes('like') || contentLower.includes('want')) {
          memoryType = 'preference';
        }

        // Only index if it's a capture-worthy type
        if (memoryType === 'context') {
          return jsonResponse({ captured: false, reason: 'Not a capture-worthy turn' }, {}, corsHeaders);
        }

        // Generate embedding and store
        const embeddingResp = await env.AI.run(
          env.EMBEDDING_MODEL as any,
          { text: [body.content] }
        ) as unknown as EmbeddingResponse;

        const id = await generateId(body.agent, 'capture', body.content);

        const vector: VectorizeVector = {
          id,
          values: embeddingResp.data[0],
          metadata: {
            agent: body.agent,
            type: memoryType,
            source_file: 'auto-capture',
            timestamp: new Date().toISOString(),
            chunk_index: 0,
            raw_text: body.content.slice(0, 1000), // Truncate for metadata
          } as any,
        };

        await env.VECTORIZE.upsert([vector]);

        return jsonResponse({
          captured: true,
          type: memoryType,
          id,
        }, {}, corsHeaders);
      }

      // ================================
      // POST /index-file - Index entire memory file from R2
      // ================================
      if (path === '/index-file' && request.method === 'POST') {
        const authError = requireAuth(request, env, corsHeaders);
        if (authError) return authError;

        const body = await request.json() as { agent: string; file: string };

        if (!body.agent || !body.file) {
          return jsonResponse({ error: 'agent and file are required' }, { status: 400 }, corsHeaders);
        }

        // All agents share the same memory bucket (R2_MEMORY).
        const bucket = env.R2_MEMORY;

        // Fetch file from R2
        const obj = await bucket.get(body.agent + '/' + body.file);
        if (!obj) {
          return jsonResponse({ error: `File not found: ${body.file}` }, { status: 404 }, corsHeaders);
        }

        const text = await obj.text();

        // Index the content
        const chunks = chunkText(text);
        const vectors: VectorizeVector[] = [];

        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];

          const embeddingResp = await env.AI.run(
            env.EMBEDDING_MODEL as any,
            { text: [chunk] }
          ) as unknown as EmbeddingResponse;

          const id = await generateId(body.agent, body.file, chunk);

          vectors.push({
            id,
            values: embeddingResp.data[0],
            metadata: {
              agent: body.agent,
              type: 'context',
              source_file: body.file,
              timestamp: new Date().toISOString(),
              chunk_index: i,
              raw_text: chunk,
            } as any,
          });
        }

        // Upsert in batches of 100
        let totalInserted = 0;
        for (let i = 0; i < vectors.length; i += 100) {
          const batch = vectors.slice(i, i + 100);
          await env.VECTORIZE.upsert(batch);
          totalInserted += batch.length;
        }

        return jsonResponse({
          file: body.file,
          chunks: vectors.length,
          indexed: totalInserted,
        }, {}, corsHeaders);
      }

      // ================================
      // GET /stats - Index statistics
      // ================================
      if (path === '/stats' && request.method === 'GET') {
        // Vectorize has no count/describe API, so probe with a zero-vector
        // query. A successful probe proves the index is reachable; a throw
        // surfaces as a 500 via the outer catch instead of a fake "healthy".
        const dummyEmbedding = new Array(768).fill(0);
        const probe = await env.VECTORIZE.query(dummyEmbedding, {
          topK: 1,
          returnMetadata: 'none',
        });

        return jsonResponse({
          index: 'agent-memories',
          dimensions: 768,
          metric: 'cosine',
          model: env.EMBEDDING_MODEL,
          probe_matches: probe.matches.length,
          status: 'ok',
        }, {}, corsHeaders);
      }

      // ================================
      // GET /health - Health check
      // ================================
      if (path === '/health' || path === '/') {
        return jsonResponse({
          status: 'ok',
          service: 'openclaw-memory-worker',
          timestamp: new Date().toISOString(),
        }, {}, corsHeaders);
      }

      return jsonResponse({ error: 'Not found' }, { status: 404 }, corsHeaders);

    } catch (err) {
      console.error('Error:', err);
      return jsonResponse({
        error: 'Internal server error',
        details: err instanceof Error ? err.message : String(err)
      }, { status: 500 }, corsHeaders);
    }
  },
};
