# AGENTS.md

**For AI agents (Claude Code, Cursor, Copilot, etc.):** This file tells you how to work with this repo.

---

## Quick Setup (Execute These Commands)

```bash
# 1. Install dependencies
cd worker && npm install && cd ..

# 2. Create Vectorize index (skip if exists)
npx wrangler vectorize create agent-memories --dimensions=768 --metric=cosine
npx wrangler vectorize create-metadata-index agent-memories --property-name=agent --type=string
npx wrangler vectorize create-metadata-index agent-memories --property-name=type --type=string

# 3. Deploy worker
cd worker && npx wrangler deploy && cd ..

# 4. Install plugin (for OpenClaw users)
mkdir -p ~/.openclaw/extensions/memory-vectorize
cp plugin/index.ts ~/.openclaw/extensions/memory-vectorize/
cp plugin/openclaw.plugin.json ~/.openclaw/extensions/memory-vectorize/
```

---

## Project Overview

OpenClaw plugin for persistent agent memory using Cloudflare Vectorize + Workers AI.

**What it does:**
- Stores memories as vector embeddings
- Auto-recalls relevant context before agent responses
- Auto-captures decisions, corrections, preferences after responses

---

## Structure

```
├── worker/                    # Cloudflare Worker (API)
│   ├── src/index.ts          # ← MAIN FILE: All endpoints
│   ├── wrangler.jsonc        # Cloudflare config
│   └── package.json
├── plugin/                    # OpenClaw integration
│   ├── index.ts              # ← MAIN FILE: Lifecycle hooks
│   └── openclaw.plugin.json  # Plugin manifest
├── scripts/                   # CLI utilities
│   ├── memory-vector-search.sh
│   └── memory-vector-index.sh
├── README.md                  # User documentation
└── AGENTS.md                  # This file
```

---

## Key Files to Modify

| Task | File | Function/Section |
|------|------|------------------|
| Add new endpoint | `worker/src/index.ts` | Add route in `fetch()` handler |
| Change embedding model | `worker/wrangler.jsonc` | `vars.EMBEDDING_MODEL` |
| Modify auto-capture patterns | `plugin/index.ts` | `MEMORY_TRIGGERS` array |
| Change recall behavior | `plugin/index.ts` | `before_agent_start` hook |
| Add plugin config option | `plugin/openclaw.plugin.json` | `configSchema.properties` |

---

## API Endpoints (worker/src/index.ts)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check |
| `/stats` | GET | Index statistics |
| `/query` | POST | Semantic search |
| `/index` | POST | Index text |
| `/index-file` | POST | Index from R2 file |
| `/capture` | POST | Auto-capture webhook |

---

## Testing Commands

```bash
# Health check
curl http://localhost:8787/health

# Test query
curl -X POST http://localhost:8787/query \
  -H "Content-Type: application/json" \
  -d '{"query": "test memory", "topK": 3}'

# Index a memory
curl -X POST http://localhost:8787/index \
  -H "Content-Type: application/json" \
  -d '{"agent": "test", "text": "Remember this fact", "type": "context"}'
```

---

## Development Workflow

```bash
# Start local dev server
cd worker
npm install
npx wrangler dev

# Make changes to src/index.ts
# Test at http://localhost:8787

# Deploy when ready
npx wrangler deploy
```

---

## Architecture Notes

| Component | Value |
|-----------|-------|
| Embedding model | `@cf/baai/bge-base-en-v1.5` |
| Vector dimensions | 768 |
| Similarity metric | Cosine |
| Chunk size | ~500 characters |
| Duplicate threshold | 0.95 similarity |

---

## Don't

- ❌ Commit `.dev.vars` or API keys
- ❌ Change `dimensions` after index creation (requires new index)
- ❌ Remove metadata indexes (breaks filtering)

---

## Dependencies

- Node.js 18+
- Cloudflare account (Vectorize, Workers AI enabled)
- Wrangler CLI (`npm install -g wrangler`)
- OpenClaw (for plugin only)
