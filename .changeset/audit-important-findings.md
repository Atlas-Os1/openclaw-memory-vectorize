---
"openclaw-memory-worker": patch
---

Fix three audit findings and five nits.

Important:
- Worker bearer-token check now uses a constant-time XOR comparison instead of
  short-circuit `!==` (timing side channel in requireAuth).
- Hermes provider no longer mutates `self._agent_id` during
  `openclaw_memory_remember` tool calls; the per-call agent override is passed
  as a parameter through `_index()`/`_capture()`, removing a race with the
  background prefetch/sync daemon threads.
- Hermes provider Bearer-prefix stripping is anchored and case-insensitive
  (`re.sub(r"^Bearer\s+", ...)`) instead of an unanchored case-sensitive
  `str.replace`, matching the TS plugin behavior.

Nits:
- Removed dead per-agent bucket switch in `/index-file` (all cases returned
  `env.R2_MEMORY`).
- `generateId` now uses truncated SHA-256 (64-bit) via `crypto.subtle.digest`
  instead of a 32-bit djb2 hash that risked silent overwrite on collision.
- `/stats` reports the actual probe result (`probe_matches`, `status: "ok"`)
  instead of discarding the query and hardcoding `"healthy"`.
- `memory_cli.py` only sends the Authorization header on authenticated methods
  (POST/PUT/PATCH/DELETE), not on public GET /health and /stats.
- Removed the non-standard `_comment` field from `scripts/agents.json`.
