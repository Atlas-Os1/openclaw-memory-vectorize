# Deployment profiles

The generic `worker/wrangler.jsonc` deploys `openclaw-memory-worker` for the Hermes/Cleo plane.

Use the tracked deployment manifests for isolated agent planes:

```bash
cd worker
npm ci
npm run typecheck
npx wrangler deploy --config wrangler.atlas.jsonc --dry-run
npx wrangler deploy --config wrangler.megenie.jsonc --dry-run
npx wrangler deploy --config wrangler.ansem.jsonc --dry-run
```

Bindings:

- Atlas-Lanes: `atlas-lanes-memory`, `atlas-lanes-files`, shared `agent-memories`
- MEgenie: `megenie-memory`, `megenie-files`, isolated `megenie-agent-memories`

All deployments require the profile-specific `GATEWAY_TOKEN` secret. Never commit secrets.

## Deployment evidence record — 2026-07-21 UTC

Repository: `Atlas-Os1/openclaw-memory-vectorize`
Implementation branch: `cleo/storage-plane-hardening`
Base: `33c2f106fca9ff5131356b782d759e657d6faec9`
Final implementation SHA: `24f1374aea51a07106099e950a6037793680dce8`
Comparison base: `33c2f106fca9ff5131356b782d759e657d6faec9`
Verified changed files: `README.md`, `plugin/index.ts`, `scripts/test-worker-security.mjs`, `worker/DEPLOYMENT-PROFILES.md`, `worker/package.json`, `worker/src/index.ts`, `worker/src/policy.ts`, `worker/wrangler.ansem.jsonc`, `worker/wrangler.atlas.jsonc`, `worker/wrangler.jsonc`, `worker/wrangler.megenie.jsonc`.
The deployment versions below were deployed from the implementation tree before this documentation-only evidence update.

Commands completed successfully from `worker/`:

```bash
npm ci
npm test
npm run typecheck
npx wrangler deploy --config wrangler.jsonc
npx wrangler deploy --config wrangler.atlas.jsonc
npx wrangler deploy --config wrangler.megenie.jsonc
```

### Hermes/Cleo plane

- Config: `worker/wrangler.jsonc`
- Worker: `openclaw-memory-worker`
- URL: https://openclaw-memory-worker.srvcflo.workers.dev
- Version: `850a4208-d614-438b-ab90-95e461205ccb`
- `R2_MEMORY`: `hermes-memory`
- `R2_FILES`: `hermes-files`
- Vectorize: `agent-memories`
- Allowed agent identity: `cleo`

### Trading archive plane — Ansem

- Worker: `ansem-memory-worker`
- URL: https://ansem-memory-worker.srvcflo.workers.dev
- Version: `b228eeae-3593-4b09-a138-3f17470ea639`
- Config: `worker/wrangler.ansem.jsonc`
- Agent identity: `ansem`
- Implementation extension SHA: recorded in the current Trading archive commit.
- `R2_TRADING_MEMORY`: `trading-memory`
- `R2_TRADING_FILES`: `trading-files`
- Archive endpoint: `POST /trading/archive` (Ansem-only, authenticated)
- Long-term source indexing: `POST /index-file` with `source_bucket` set to `trading-memory` or `trading-files` and an exact `key`
- Retention procedure: `C:\Users\Minte\Desktop\dev-code\Trading\scripts\offload_old_trading.py --profile ansem --agent ansem --days 7 --apply --delete`
- Manifests and briefs archive to `trading-memory`; event artifacts archive to `trading-files`.
- Local deletion occurs only after archive and indexing succeed. Non-UTF-8 files are retained locally.
- Verified run: 189 text artifacts archived, indexed as `agent: ansem`, and removed locally; two PNGs retained intentionally.

### Atlas-Lanes plane

- Config: `worker/wrangler.atlas.jsonc`
- Worker: `atlas-memory-worker`
- URL: https://atlas-memory-worker.srvcflo.workers.dev
- Version: `ca2fee94-b0e2-4d4f-9f22-d534cbb5e965`
- `R2_MEMORY`: `atlas-lanes-memory`
- `R2_FILES`: `atlas-lanes-files`
- Vectorize: `agent-memories`
- Allowed agent identity: `atlas`

### MEgenie plane

- Config: `worker/wrangler.megenie.jsonc`
- Worker: `megenie-memory-worker`
- URL: https://megenie-memory-worker.srvcflo.workers.dev
- Version: `e8ef71cf-f483-4979-b847-10452945ba98`
- `R2_MEMORY`: `megenie-memory`
- `R2_FILES`: `megenie-files`
- Vectorize: `megenie-agent-memories`
- Allowed agent identity: `megenie`

### Runtime verification

- `/health` returned HTTP 200 for all four workers, including Ansem.
- Cache-busted MEgenie health response identified `service: megenie-memory-worker`.
- Unauthenticated `GET /agents/unknown/files/MEMORY.md` returned HTTP 401 for the four deployed workers.
- Cleo's generic worker has no Trading R2 bindings; route-level tests return 503 for Trading archive/index requests from that plane.
- Ansem's Worker owns the Trading R2 bindings and returns archived Trading recall results under `agent: ansem`.
- Worker security/storage test returned `worker security/storage checks passed`.
- `npm audit --omit=dev --audit-level=high` returned `found 0 vulnerabilities`.
- Full `npm audit` reports three high-severity transitive vulnerabilities through the Wrangler/Miniflare/Sharp development toolchain. They are not in the production Worker bundle; `npm audit fix --force` proposes a breaking Wrangler downgrade and is not applied without a compatibility review.
- `source_bucket` defaults to `files` for `/index-file`; `source_bucket: "memory"` is an explicit compatibility path for legacy R2_MEMORY objects.
- Unknown or unauthorized agents return HTTP 400 after authentication.

### Recovery

Redeploy the exact profile with its tracked manifest:

```bash
npx wrangler deploy --config wrangler.jsonc
npx wrangler deploy --config wrangler.atlas.jsonc
npx wrangler deploy --config wrangler.megenie.jsonc
npx wrangler deploy --config wrangler.ansem.jsonc
```

Rollback uses the prior Worker version through the Cloudflare dashboard or version API. Do not delete legacy R2 buckets during rollback or migration. Legacy objects in `R2_MEMORY` can be indexed explicitly with `source_bucket: "memory"` and should be migrated to `R2_FILES` before removing compatibility use.
