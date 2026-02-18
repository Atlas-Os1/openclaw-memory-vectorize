# AGENTS.md

Guidelines for AI agents and contributors working on this codebase.

## Project Overview

OpenClaw plugin for persistent agent memory using Cloudflare Vectorize + Workers AI. Provides semantic search, auto-recall, and auto-capture of decisions/corrections/preferences.

## Structure

```
├── worker/           # Cloudflare Worker (API)
│   ├── src/index.ts  # Main logic: /query, /index, /capture endpoints
│   ├── wrangler.jsonc
│   └── package.json
├── plugin/           # OpenClaw integration
│   ├── index.ts      # Auto-recall + auto-capture lifecycle hooks
│   └── openclaw.plugin.json
├── scripts/          # CLI utilities
│   ├── memory-vector-search.sh
│   └── memory-vector-index.sh
```

## Key Files

| File | Purpose |
|------|---------|
| `worker/src/index.ts` | Worker endpoints: query, index, capture, index-file |
| `plugin/index.ts` | `before_agent_start` (recall) and `agent_end` (capture) hooks |
| `plugin/openclaw.plugin.json` | Plugin manifest with config schema |

## Development

```bash
# Worker development
cd worker
npm install
wrangler dev

# Deploy
wrangler deploy
```

## Testing

```bash
# Health check
curl https://your-worker.workers.dev/health

# Query test
curl -X POST https://your-worker.workers.dev/query \
  -H "Content-Type: application/json" \
  -d '{"query": "test", "topK": 3}'
```

## Dependencies

- **Cloudflare account** with Vectorize, Workers AI, and R2 enabled
- **OpenClaw** for the plugin hooks
- **Node.js 18+** and Wrangler CLI

## Contributing

1. Fork → branch → PR
2. Test locally with `wrangler dev`
3. Update README.md if adding features
4. Keep commits atomic and descriptive

## Don't

- Commit API keys, tokens, or `.dev.vars`
- Modify `wrangler.jsonc` bindings without updating README
- Add dependencies without justification
- Break backward compatibility without major version bump

## Architecture Notes

- **Embeddings:** `@cf/baai/bge-base-en-v1.5` (768 dimensions)
- **Similarity:** Cosine metric
- **Chunking:** ~500 chars per chunk, split on paragraphs
- **Deduplication:** 0.95 similarity threshold prevents duplicates
- **Metadata filtering:** Requires indexes created via `wrangler vectorize create-metadata-index`
