# OpenClaw Memory Refinement Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Make OpenClaw Memory Vectorize a reliable shared-memory backbone for Hermes profiles by documenting and implementing linked context trails, consistent provider/plugin installation, runtime health checks, and clearer storage semantics.

**Architecture:** Keep the Cloudflare Worker as the source-of-truth API for vector recall and R2-backed long-form memory files. Keep the Hermes provider as the runtime integration point for explicit memory tools, local memory mirroring, turn sync, and profile-scoped recall. Add a lightweight “context trail” convention so vector memories can point to deeper R2/GitHub/session references without overloading Vectorize metadata.

**Tech Stack:** Cloudflare Workers, Vectorize, Workers AI embeddings, R2, TypeScript Worker API, Python Hermes MemoryProvider, Hermes profile plugins.

---

## Background

Recent live checks showed this distinction:

- Direct Worker storage works: `/index` can store memories and `/query` can recall them.
- Hermes automatic/session storage can be inconsistent when a profile is missing the `openclaw-memory-vectorize` provider plugin, has stale env, or has a live gateway process that inherited another profile’s memory environment.
- Dev and Bigfoot specifically needed provider/plugin cleanup at the profile layer.
- The Worker already supports R2 memory-file mirrors through `/agents/:agent/files/*` and `/index-file`, which makes it a good base for “linked trails”: compact vector summaries that point to deeper files, repo docs, session records, or R2 objects.

This plan captures the follow-up work so future agents do not have to rediscover the same memory wiring problems.

## Current repo surfaces

| Surface | Current file(s) | Current responsibility |
|---|---|---|
| Worker API | `worker/src/index.ts` | `/health`, `/query`, `/index`, `/capture`, `/index-file`, `/agents/:agent/files/*` |
| Hermes provider | `__init__.py`, `plugin.yaml` | Registers `openclaw_memory_search`, `openclaw_memory_remember`, sync hooks, memory mirror hook |
| OpenClaw plugin | `plugin/index.ts`, `plugin/openclaw.plugin.json` | OpenClaw lifecycle hooks and tools |
| Shell scripts | `scripts/*.sh` | Manual query/index helpers |
| Docs | `README.md`, `AGENTS.md` | Setup and operator guidance |

## Target behavior

1. Every Hermes profile that claims OpenClaw memory support has the provider plugin installed under its own `$HERMES_HOME/plugins/openclaw-memory-vectorize/`.
2. Every profile has explicit env identity, worker URL/token, and memory bucket settings; no gateway process should accidentally inherit another profile’s identity.
3. Explicit memory writes, local Hermes memory writes, and completed-turn sync should be observable and testable.
4. Linked context trails should be first-class enough that agents know how to store compact vector summaries plus a durable deep-reference URI.
5. Troubleshooting should answer “direct worker works, but Hermes memory is broken” without manual archaeology.

---

## Task 1: Document the context trail schema

**Objective:** Define the canonical payload shape for compact memories that point to deeper context.

**Files:**
- Create: `docs/context-trails.md`
- Modify: `README.md`

**Step 1: Create the doc**

Create `docs/context-trails.md` with a schema like:

```markdown
# Context Trails

A context trail is a compact vector-indexed memory that points to a larger durable source.

## Required fields inside the text or metadata envelope

- `Use when:` human-readable trigger for future agents
- `Primary reference:` canonical URI (`r2://`, `https://`, `github://`, or `session://`)
- `Fallback reference:` optional secondary URI
- `Summary:` 3-8 bullet summary of the deeper source
- `Last verified:` ISO date
- `Owner agent:` `cleo`, `lilbeaver`, `bigfoot`, `dev`, `lance`, etc.

## URI examples

- `r2://hermes-memory/dev/Knowledge.md`
- `r2://hermes-files/shared/kbc-admin-audit.md`
- `github://Atlas-Os1/Hermes-agents/management/docs/08-memory-sync.md`
- `session://dev/20260703_143813_603c3d#message=1234`
```

**Step 2: Add README link**

Add a short README section under Troubleshooting or API docs that links to `docs/context-trails.md`.

**Step 3: Verify**

Run:

```bash
git diff --check
```

Expected: no whitespace errors.

**Step 4: Commit**

```bash
git add docs/context-trails.md README.md
git commit -m "docs: add context trail schema"
```

---

## Task 2: Add a profile memory wiring audit doc

**Objective:** Document how to prove that each Hermes profile is actually using the provider plugin and correct env.

**Files:**
- Create: `docs/hermes-profile-memory-audit.md`
- Modify: `README.md`

**Step 1: Create the audit checklist**

Include checks for:

```bash
# Plugin installed per profile
ls "$HERMES_HOME/plugins/openclaw-memory-vectorize/__init__.py"
ls "$HERMES_HOME/plugins/openclaw-memory-vectorize/plugin.yaml"

# Provider configured
python3 - <<'PY'
from pathlib import Path
cfg = Path('${HERMES_HOME}/config.yaml')
print(cfg.read_text() if cfg.exists() else 'missing config.yaml')
PY

# Env present without printing secrets
python3 - <<'PY'
import os
for key in [
  'OPENCLAW_MEMORY_WORKER_URL',
  'OPENCLAW_MEMORY_WORKER_TOKEN',
  'OPENCLAW_MEMORY_AGENT_ID',
  'HERMES_MEMORY_PREFIX',
]:
    val = os.environ.get(key, '')
    print(key, 'present' if val else 'missing', 'len', len(val))
PY
```

Also include live process checks:

```bash
ps -ef | grep 'hermes .*gateway run'
tr '\0' '\n' < /proc/<pid>/environ | grep -E 'HERMES_HOME|OPENCLAW_MEMORY_AGENT_ID|HERMES_MEMORY_PREFIX'
```

**Step 2: Add profile-specific reminders**

Document that Dev and Bigfoot failures can happen when:

- the repo has the provider files but the live profile does not;
- `.env` is correct but the gateway process was not restarted;
- gateway restart happened from a contaminated shell and inherited the wrong profile values.

**Step 3: Verify**

Run:

```bash
git diff --check
```

Expected: no whitespace errors.

**Step 4: Commit**

```bash
git add docs/hermes-profile-memory-audit.md README.md
git commit -m "docs: add Hermes memory wiring audit"
```

---

## Task 3: Add a provider install/sync helper script

**Objective:** Reduce profile drift by making plugin installation repeatable for all Hermes profiles.

**Files:**
- Create: `scripts/install-hermes-provider.sh`
- Modify: `README.md`

**Step 1: Write the script**

Create a bash script that accepts one or more profile homes:

```bash
#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: $0 /path/to/profile [profile ...]" >&2
  exit 2
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

for profile_home in "$@"; do
  target="$profile_home/plugins/openclaw-memory-vectorize"
  mkdir -p "$target"
  install -m 0644 "$repo_root/__init__.py" "$target/__init__.py"
  install -m 0644 "$repo_root/plugin.yaml" "$target/plugin.yaml"
  echo "installed provider into $target"
done
```

**Step 2: Document usage**

Add README usage:

```bash
scripts/install-hermes-provider.sh \
  /opt/data/profiles/dev \
  /opt/data/profiles/bigfoot \
  /opt/data/profiles/lil-beaver
```

**Step 3: Verify**

Run:

```bash
bash -n scripts/install-hermes-provider.sh
git diff --check
```

Expected: both pass.

**Step 4: Commit**

```bash
git add scripts/install-hermes-provider.sh README.md
git commit -m "chore: add Hermes provider install helper"
```

---

## Task 4: Add a runtime memory smoke-test script

**Objective:** Provide one command that verifies direct Worker store/recall and Hermes provider prerequisites without exposing secrets.

**Files:**
- Create: `scripts/hermes-memory-smoke-test.py`
- Modify: `README.md`

**Step 1: Implement script behavior**

The script should:

1. Read `OPENCLAW_MEMORY_WORKER_URL`, `OPENCLAW_MEMORY_WORKER_TOKEN`, and `OPENCLAW_MEMORY_AGENT_ID` from env.
2. Print presence/length only for secret-bearing values.
3. POST a unique test memory to `/index`.
4. POST `/query` for the unique text.
5. Confirm the stored id or text appears in recall.
6. Exit non-zero if any step fails.

Pseudo-code:

```python
import json, os, sys, time, urllib.request

worker = os.environ['OPENCLAW_MEMORY_WORKER_URL'].rstrip('/')
token = os.environ.get('OPENCLAW_MEMORY_WORKER_TOKEN', '')
agent = os.environ.get('OPENCLAW_MEMORY_AGENT_ID', 'hermes-smoke')
nonce = f"memory-smoke-{int(time.time())}"
text = f"Smoke test memory {nonce}"

headers = {'Content-Type': 'application/json', 'User-Agent': 'OpenClawMemorySmokeTest/1.0'}
if token:
    headers['Authorization'] = f"Bearer {token}"

# POST /index, then POST /query; assert count >= 1 and raw_text contains nonce.
```

**Step 2: Verify**

Run syntax check:

```bash
python3 -m py_compile scripts/hermes-memory-smoke-test.py
git diff --check
```

If env is available, run:

```bash
python3 scripts/hermes-memory-smoke-test.py
```

Expected: `direct_worker_store=true`, `direct_worker_recall=true`.

**Step 3: Commit**

```bash
git add scripts/hermes-memory-smoke-test.py README.md
git commit -m "test: add OpenClaw memory smoke test"
```

---

## Task 5: Clarify storage semantics in the Hermes provider docs

**Objective:** Make the difference between explicit store, local memory mirror, turn sync, and context trails obvious.

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`

**Step 1: Add a “Storage paths” table**

Document these paths:

| Path | Trigger | Code surface | Expected result |
|---|---|---|---|
| Direct Worker store | `POST /index` | `worker/src/index.ts` | Indexed vector chunks |
| Explicit Hermes store | `openclaw_memory_remember` | `__init__.py::handle_tool_call` | Indexed vector chunks |
| Hermes memory mirror | Hermes `memory` tool writes | `__init__.py::on_memory_write` | Mirrored important local memory writes |
| Turn sync | Completed user/assistant turn | `__init__.py::sync_turn` | Captured decisions/preferences/corrections or fallback context index |
| Context trail | Human/agent-created summary | `/index` plus URI convention | Vector recall points to deeper source |

**Step 2: Add operator note**

Explicitly state:

> A healthy `/health` only proves the Worker is up. It does not prove a Hermes profile has the provider installed, configured, or loaded by the live gateway.

**Step 3: Verify**

Run:

```bash
git diff --check
```

Expected: no whitespace errors.

**Step 4: Commit**

```bash
git add README.md AGENTS.md
git commit -m "docs: clarify OpenClaw memory storage paths"
```

---

## Task 6: Add optional Worker metadata for context trails

**Objective:** Allow future Worker/API callers to store structured trail metadata without breaking existing clients.

**Files:**
- Modify: `worker/src/index.ts`
- Add or modify tests if a Worker test harness exists; otherwise document manual curl checks in README.

**Step 1: Extend `MemoryMetadata` safely**

Add optional fields:

```ts
interface MemoryMetadata {
  agent: string;
  type: 'decision' | 'correction' | 'learning' | 'preference' | 'context' | 'user_profile';
  source_file: string;
  timestamp: string;
  chunk_index: number;
  raw_text: string;
  trail_uri?: string;
  fallback_uri?: string;
  use_when?: string;
  owner_agent?: string;
  last_verified?: string;
}
```

**Step 2: Extend `IndexRequest`**

Add the same optional fields to `IndexRequest`.

**Step 3: Preserve compatibility**

When creating vector metadata in `/index`, include optional fields only if supplied:

```ts
const metadata: MemoryMetadata = {
  agent: body.agent,
  type: body.type || 'context',
  source_file: body.source_file || 'manual',
  timestamp: new Date().toISOString(),
  chunk_index: body.chunk_index ?? i,
  raw_text: chunk,
};

for (const key of ['trail_uri', 'fallback_uri', 'use_when', 'owner_agent', 'last_verified'] as const) {
  if (body[key]) metadata[key] = body[key];
}
```

**Step 4: Verify**

Run:

```bash
cd worker
npm run typecheck
```

If no typecheck script exists, run:

```bash
npx tsc --noEmit
```

Expected: TypeScript passes.

**Step 5: Commit**

```bash
git add worker/src/index.ts README.md docs/context-trails.md
git commit -m "feat: support context trail metadata"
```

---

## Task 7: Add authentication guidance for OpenClaw plugin calls

**Objective:** Ensure OpenClaw plugin calls work with protected Worker methods.

**Files:**
- Modify: `plugin/openclaw.plugin.json`
- Modify: `plugin/index.ts`
- Modify: `README.md`

**Step 1: Add optional `workerToken` config**

In `plugin/openclaw.plugin.json`, add a secret/string config property named `workerToken`.

**Step 2: Send Bearer auth in plugin client**

Update `VectorizeClient` to accept a token and include it in `/query`, `/index`, and `/capture` requests when set.

**Step 3: Verify**

Run:

```bash
cd worker
npm run typecheck
```

Also run a manual query/store against a protected Worker if env is available.

**Step 4: Commit**

```bash
git add plugin/index.ts plugin/openclaw.plugin.json README.md
git commit -m "fix: support protected OpenClaw memory worker calls"
```

---

## Task 8: Add release checklist for profile rollout

**Objective:** Define the exact rollout checklist after code/docs changes land.

**Files:**
- Create: `docs/release-checklist.md`

**Step 1: Checklist contents**

Include:

- [ ] Deploy Worker if `worker/src/index.ts` changed.
- [ ] Install provider plugin into each profile using `scripts/install-hermes-provider.sh`.
- [ ] Confirm each profile env contains worker URL/token/agent id without printing secret values.
- [ ] Restart gateways from a clean external shell.
- [ ] Verify live process env via `/proc/<pid>/environ`.
- [ ] Run `scripts/hermes-memory-smoke-test.py` for each profile.
- [ ] Test `openclaw_memory_remember` and `openclaw_memory_search` from Hermes.
- [ ] Store one context trail and confirm recall returns the summary plus deep-reference URI.

**Step 2: Verify**

Run:

```bash
git diff --check
```

Expected: no whitespace errors.

**Step 3: Commit**

```bash
git add docs/release-checklist.md
git commit -m "docs: add OpenClaw memory rollout checklist"
```

---

## Acceptance criteria

The refinement is done when:

- [ ] The repo explains linked context trails and gives concrete URI examples.
- [ ] The repo explains all storage paths: direct Worker, explicit Hermes tool, local memory mirror, turn sync, and context trails.
- [ ] There is a repeatable provider install script.
- [ ] There is a direct Worker smoke test that proves store + recall.
- [ ] Docs clearly state that `/health` is not enough to verify Hermes profile memory wiring.
- [ ] Optional context-trail metadata can be stored without breaking old `/index` clients.
- [ ] OpenClaw plugin supports protected Worker calls if `GATEWAY_TOKEN` is set.
- [ ] Dev and Bigfoot profile rollout can be verified without printing secrets.

## Non-goals

- Do not change Vectorize dimensions or recreate the index.
- Do not commit any Worker tokens, Cloudflare tokens, profile `.env` values, or memory contents containing secrets.
- Do not require all historical memories to be re-indexed before the docs/scripts are useful.
- Do not replace Hermes local memory; this Worker complements and mirrors it.

## Suggested implementation order

1. Docs-only commits first: context trails, audit doc, storage semantics.
2. Add scripts next: provider install, smoke test.
3. Add Worker metadata support.
4. Add OpenClaw plugin auth support.
5. Run rollout checklist on Dev and Bigfoot.

## Verification commands for this plan file

```bash
git diff --check
find docs -maxdepth 2 -type f -name '*.md' -print
```

Expected: no whitespace errors and this plan appears under `docs/plans/`.
