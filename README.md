# OpenClaw Memory Vectorize

**Semantic long-term memory for AI agents using Cloudflare Vectorize + Workers AI.**

Auto-recalls relevant context before responses. Auto-captures decisions, corrections, and preferences. No "remember this" commands needed.

![Cost](https://img.shields.io/badge/cost-~%246%2Fmo-green)
![Cloudflare](https://img.shields.io/badge/platform-Cloudflare-orange)
![License](https://img.shields.io/badge/license-MIT-blue)

---

## The Problem

Out-of-the-box AI memory has limitations:
- **Keyword matching** misses semantically related content
- **Manual capture** requires explicit "remember this" commands  
- **Context windows** forget older conversations
- **No cross-session recall** — each chat starts fresh

## The Solution

```
┌─────────────────────────────────────────────────────────┐
│                    Agent Gateway                         │
│  ┌─────────────┐              ┌──────────────────────┐  │
│  │ Auto-Recall │──► Query ──►│ Inject into context  │  │
│  │   Hook      │              │ before agent runs    │  │
│  └─────────────┘              └──────────────────────┘  │
│  ┌─────────────┐                                        │
│  │ Auto-Capture│──► Detect decisions ──► Store         │
│  │   Hook      │    corrections, prefs                  │
│  └─────────────┘                                        │
└─────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────┐
│              Memory Worker (Cloudflare)                  │
│  • Vectorize index (768 dimensions, cosine similarity)  │
│  • Workers AI embeddings (bge-base-en-v1.5)             │
│  • R2 storage for source files                          │
└─────────────────────────────────────────────────────────┘
```

---

## Quick Start

### 1. Create Vectorize Index

```bash
# Create the index
wrangler vectorize create agent-memories --dimensions=768 --metric=cosine

# Add metadata indexes for filtering
wrangler vectorize create-metadata-index agent-memories --property-name=agent --type=string
wrangler vectorize create-metadata-index agent-memories --property-name=type --type=string
```

### 2. Deploy the Worker

```bash
cd worker
npm install
# Edit wrangler.jsonc with your R2 bucket names
wrangler deploy
```

### 3. Install the Plugin

Copy `plugin/` to your OpenClaw extensions directory:

```bash
cp -r plugin ~/.openclaw/extensions/memory-vectorize
```

### 4. Enable in Config

```json
{
  "plugins": {
    "slots": {
      "memory": "memory-vectorize"
    },
    "entries": {
      "memory-vectorize": {
        "enabled": true,
        "config": {
          "workerUrl": "https://your-worker.workers.dev",
          "autoRecall": true,
          "autoCapture": true,
          "minRecallScore": 0.5,
          "recallLimit": 3
        }
      }
    }
  }
}
```

### 5. Index Existing Memories

```bash
./scripts/memory-vector-index.sh all
```

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/query` | POST | Semantic search with filters |
| `/index` | POST | Index text chunks |
| `/index-file` | POST | Index file from R2 |
| `/capture` | POST | Auto-capture webhook |
| `/health` | GET | Health check |
| `/stats` | GET | Index statistics |

### Query Example

```bash
curl -X POST https://your-worker.workers.dev/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "deployment decisions",
    "agent": "dev",
    "topK": 5,
    "minScore": 0.5
  }'
```

### Response

```json
{
  "query": "deployment decisions",
  "count": 2,
  "matches": [
    {
      "id": "dev:MEMORY.md:abc123",
      "score": 0.85,
      "metadata": {
        "agent": "dev",
        "type": "decision",
        "raw_text": "Decided to use Cloudflare Workers for deployment...",
        "timestamp": "2026-02-18T12:00:00Z"
      }
    }
  ]
}
```

---

## Memory Types

| Type | Auto-Captured When |
|------|-------------------|
| `decision` | "I decided...", "We'll use...", "Going with..." |
| `correction` | "Actually...", "No, that's wrong...", "The fix is..." |
| `learning` | "I learned...", "I realized...", "Discovered that..." |
| `preference` | "I prefer...", "I like...", "I want..." |
| `context` | General information |
| `user_profile` | Contact info, roles, relationships |

---

## Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `workerUrl` | required | Your deployed worker URL |
| `autoRecall` | `true` | Inject memories before agent runs |
| `autoCapture` | `true` | Store important info after agent runs |
| `minRecallScore` | `0.5` | Minimum similarity for recall (0-1) |
| `recallLimit` | `3` | Max memories to inject |

---

## CLI Scripts

### Search Memories

```bash
./scripts/memory-vector-search.sh "query" [agent] [topK]

# Examples
./scripts/memory-vector-search.sh "deployment decisions"
./scripts/memory-vector-search.sh "API changes" dev 5
```

### Index Memories

```bash
./scripts/memory-vector-index.sh [agent|all]

# Examples
./scripts/memory-vector-index.sh dev
./scripts/memory-vector-index.sh all
```

---

## Cost

| Component | Monthly Cost |
|-----------|--------------|
| Vectorize | ~$5 (10k vectors, 100k queries) |
| Workers AI | ~$1 (embeddings) |
| Worker | Free tier |
| R2 | ~$0 (zero egress) |
| **Total** | **~$6/month** |

---

## How Auto-Capture Works

The plugin analyzes each conversation turn for capture-worthy patterns:

```typescript
const MEMORY_TRIGGERS = [
  /remember|zapamatuj/i,
  /prefer|like|love|hate|want|need/i,
  /decided|decision|will use/i,
  /learned|realized|discovered/i,
  /actually|no,|that's wrong|correction/i,
  /important|always|never/i,
  /\+\d{10,}/,                    // Phone numbers
  /[\w.-]+@[\w.-]+\.\w+/,         // Emails
  /my\s+\w+\s+is|is\s+my/i,       // Personal facts
];
```

Duplicate detection prevents storing the same information twice (0.95 similarity threshold).

---

## Requirements

- Cloudflare account with Workers, Vectorize, and R2
- Node.js 18+
- Wrangler CLI
- OpenClaw (for the plugin)

---

## License

MIT

---

## Credits

Built by the [Atlas-OS](https://github.com/Atlas-Os1) team.

*Agents are goldfish. This fixes that.*
