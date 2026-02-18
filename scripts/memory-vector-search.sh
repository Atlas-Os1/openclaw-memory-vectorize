#!/bin/bash
# Semantic memory search via Cloudflare Vectorize
# Usage: memory-vector-search.sh <query> [agent] [topK]
#
# Examples:
#   memory-vector-search.sh "R2 sync issues"           # Search all agents
#   memory-vector-search.sh "projects" dev 5           # Search dev's memories, top 5

QUERY="$1"
AGENT="${2:-}"
TOP_K="${3:-5}"
MIN_SCORE="${4:-0.5}"

WORKER_URL="${MEMORY_WORKER_URL:-https://your-worker.workers.dev}"

if [ -z "$QUERY" ]; then
  echo "Usage: memory-vector-search.sh <query> [agent] [topK]"
  exit 1
fi

# Build JSON payload
PAYLOAD=$(jq -n \
  --arg query "$QUERY" \
  --arg agent "$AGENT" \
  --argjson topK "$TOP_K" \
  --argjson minScore "$MIN_SCORE" \
  '{query: $query, topK: $topK, minScore: $minScore} + (if $agent != "" then {agent: $agent} else {} end)')

# Query the worker
RESPONSE=$(curl -s -X POST "$WORKER_URL/query" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

# Format output for agent consumption
echo "$RESPONSE" | jq -r '
  if .count == 0 then
    "No relevant memories found."
  else
    "Found \(.count) relevant memories:\n" +
    (.matches | to_entries | map(
      "---\n[\(.key + 1)] Score: \(.value.score | tostring | .[0:6]) | Agent: \(.value.metadata.agent) | Source: \(.value.metadata.source_file)\n\(.value.metadata.raw_text)"
    ) | join("\n\n"))
  end'
