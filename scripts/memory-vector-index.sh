#!/bin/bash
# Index agent memory files to Cloudflare Vectorize
# Usage: memory-vector-index.sh [agent]
#
# If no agent specified, indexes all agents

WORKER_URL="https://atlas-memory-worker.srvcflo.workers.dev"
AGENT="${1:-all}"

index_agent() {
  local agent="$1"
  echo "Indexing $agent memories..."
  
  # Index MEMORY.md
  RESULT=$(curl -s -X POST "$WORKER_URL/index-file" \
    -H "Content-Type: application/json" \
    -d "{\"agent\": \"$agent\", \"file\": \"MEMORY.md\"}")
  
  CHUNKS=$(echo "$RESULT" | jq -r '.chunks // "error"')
  echo "  MEMORY.md: $CHUNKS chunks indexed"
  
  # Index recent memory files (last 7 days)
  for i in {0..6}; do
    DATE=$(date -d "-$i days" '+%Y-%m-%d' 2>/dev/null || date -v-${i}d '+%Y-%m-%d')
    RESULT=$(curl -s -X POST "$WORKER_URL/index-file" \
      -H "Content-Type: application/json" \
      -d "{\"agent\": \"$agent\", \"file\": \"memory/$DATE.md\"}" 2>/dev/null)
    
    if echo "$RESULT" | jq -e '.chunks' >/dev/null 2>&1; then
      CHUNKS=$(echo "$RESULT" | jq -r '.chunks')
      echo "  memory/$DATE.md: $CHUNKS chunks indexed"
    fi
  done
}

if [ "$AGENT" = "all" ]; then
  for a in dev flo sage smarty rooty; do
    index_agent "$a"
  done
else
  index_agent "$AGENT"
fi

echo "Done."
