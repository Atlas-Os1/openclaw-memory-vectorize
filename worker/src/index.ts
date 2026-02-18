/**
 * Atlas Memory Worker
 * 
 * Semantic memory layer for agents using Cloudflare Vectorize + Workers AI.
 * Provides auto-recall and auto-capture hooks for agent conversations.
 */

export interface Env {
  VECTORIZE: Vectorize;
  AI: Ai;
  R2_DEV: R2Bucket;
  R2_FLO: R2Bucket;
  R2_COLLAB: R2Bucket;
  EMBEDDING_MODEL: string;
  GATEWAY_TOKEN?: string;
}

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

// Utility: Generate deterministic ID from content
function generateId(agent: string, source: string, text: string): string {
  const hash = Array.from(text)
    .reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)
    .toString(16);
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
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Auth check (optional - for protected endpoints)
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    
    try {
      // ================================
      // POST /query - Semantic search
      // ================================
      if (path === '/query' && request.method === 'POST') {
        const body: QueryRequest = await request.json();
        
        if (!body.query) {
          return Response.json({ error: 'query is required' }, { status: 400, headers: corsHeaders });
        }

        // Generate embedding for query
        const embeddingResp: EmbeddingResponse = await env.AI.run(
          env.EMBEDDING_MODEL as BaseAiTextEmbeddingsModels,
          { text: [body.query] }
        );

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

        return Response.json({
          query: body.query,
          count: filtered.length,
          matches: filtered.map(m => ({
            id: m.id,
            score: m.score,
            metadata: m.metadata,
          })),
        }, { headers: corsHeaders });
      }

      // ================================
      // POST /index - Index new memory
      // ================================
      if (path === '/index' && request.method === 'POST') {
        const body: IndexRequest = await request.json();
        
        if (!body.agent || !body.text) {
          return Response.json({ error: 'agent and text are required' }, { status: 400, headers: corsHeaders });
        }

        // Chunk the text
        const chunks = chunkText(body.text);
        const vectors: VectorizeVector[] = [];
        
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          
          // Generate embedding
          const embeddingResp: EmbeddingResponse = await env.AI.run(
            env.EMBEDDING_MODEL as BaseAiTextEmbeddingsModels,
            { text: [chunk] }
          );

          const id = generateId(body.agent, body.source_file || 'manual', chunk);
          
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
            } as MemoryMetadata,
          });
        }

        // Upsert vectors
        const result = await env.VECTORIZE.upsert(vectors);

        return Response.json({
          indexed: vectors.length,
          ids: vectors.map(v => v.id),
          result,
        }, { headers: corsHeaders });
      }

      // ================================
      // POST /capture - Auto-capture webhook
      // ================================
      if (path === '/capture' && request.method === 'POST') {
        const body: CaptureRequest = await request.json();
        
        if (!body.agent || !body.content) {
          return Response.json({ error: 'agent and content are required' }, { status: 400, headers: corsHeaders });
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
          return Response.json({ captured: false, reason: 'Not a capture-worthy turn' }, { headers: corsHeaders });
        }

        // Generate embedding and store
        const embeddingResp: EmbeddingResponse = await env.AI.run(
          env.EMBEDDING_MODEL as BaseAiTextEmbeddingsModels,
          { text: [body.content] }
        );

        const id = generateId(body.agent, 'capture', body.content);
        
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
          } as MemoryMetadata,
        };

        await env.VECTORIZE.upsert([vector]);

        return Response.json({
          captured: true,
          type: memoryType,
          id,
        }, { headers: corsHeaders });
      }

      // ================================
      // POST /index-file - Index entire memory file from R2
      // ================================
      if (path === '/index-file' && request.method === 'POST') {
        const body = await request.json() as { agent: string; file: string };
        
        if (!body.agent || !body.file) {
          return Response.json({ error: 'agent and file are required' }, { status: 400, headers: corsHeaders });
        }

        // Get R2 bucket based on agent
        let bucket: R2Bucket;
        switch (body.agent) {
          case 'dev': bucket = env.R2_DEV; break;
          case 'flo': bucket = env.R2_FLO; break;
          default:
            return Response.json({ error: `Unknown agent: ${body.agent}` }, { status: 400, headers: corsHeaders });
        }

        // Fetch file from R2
        const obj = await bucket.get(body.file);
        if (!obj) {
          return Response.json({ error: `File not found: ${body.file}` }, { status: 404, headers: corsHeaders });
        }

        const text = await obj.text();
        
        // Index the content
        const chunks = chunkText(text);
        const vectors: VectorizeVector[] = [];
        
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          
          const embeddingResp: EmbeddingResponse = await env.AI.run(
            env.EMBEDDING_MODEL as BaseAiTextEmbeddingsModels,
            { text: [chunk] }
          );

          const id = generateId(body.agent, body.file, chunk);
          
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
            } as MemoryMetadata,
          });
        }

        // Upsert in batches of 100
        let totalInserted = 0;
        for (let i = 0; i < vectors.length; i += 100) {
          const batch = vectors.slice(i, i + 100);
          await env.VECTORIZE.upsert(batch);
          totalInserted += batch.length;
        }

        return Response.json({
          file: body.file,
          chunks: vectors.length,
          indexed: totalInserted,
        }, { headers: corsHeaders });
      }

      // ================================
      // GET /stats - Index statistics
      // ================================
      if (path === '/stats' && request.method === 'GET') {
        // Query a dummy vector to get index info
        const dummyEmbedding = new Array(768).fill(0);
        const results = await env.VECTORIZE.query(dummyEmbedding, {
          topK: 1,
          returnMetadata: 'none',
        });

        return Response.json({
          index: 'agent-memories',
          dimensions: 768,
          metric: 'cosine',
          model: env.EMBEDDING_MODEL,
          // Vectorize doesn't expose total count directly
          status: 'healthy',
        }, { headers: corsHeaders });
      }

      // ================================
      // GET /health - Health check
      // ================================
      if (path === '/health' || path === '/') {
        return Response.json({
          status: 'ok',
          service: 'atlas-memory-worker',
          timestamp: new Date().toISOString(),
        }, { headers: corsHeaders });
      }

      return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });

    } catch (err) {
      console.error('Error:', err);
      return Response.json({ 
        error: 'Internal server error',
        details: err instanceof Error ? err.message : String(err)
      }, { status: 500, headers: corsHeaders });
    }
  },
};
