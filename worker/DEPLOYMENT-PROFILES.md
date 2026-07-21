# Deployment profiles

The generic `worker/wrangler.jsonc` deploys `openclaw-memory-worker` for the Hermes/Cleo plane.

Use the tracked deployment manifests for isolated agent planes:

```bash
cd worker
npm ci
npm run typecheck
npx wrangler deploy --config wrangler.atlas.jsonc --dry-run
npx wrangler deploy --config wrangler.megenie.jsonc --dry-run
```

Bindings:

- Atlas-Lanes: `atlas-lanes-memory`, `atlas-lanes-files`, shared `agent-memories`
- MEgenie: `megenie-memory`, `megenie-files`, isolated `megenie-agent-memories`

All deployments require the profile-specific `GATEWAY_TOKEN` secret. Never commit secrets.

## Deployment evidence record — 2026-07-21 UTC

Repository: `Atlas-Os1/openclaw-memory-vectorize`
Implementation branch: `cleo/storage-plane-hardening`
Base: `33c2f106fca9ff5131356b782d759e657d6faec9`
Remediation implementation SHA: `e1e44dccbf7a4c6e9f4ab6c854a6ff1b4e01ed13`
Documentation evidence commit follows the implementation commit and records the same deployed source tree.

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
- Version: `b5c8622e-77df-4d8b-a12a-277aec075a1d`
- `R2_MEMORY`: `hermes-memory`
- `R2_FILES`: `hermes-files`
- Vectorize: `agent-memories`
- Allowed agents: `cleo,atlas,dev,lance,bigfoot,lil-beaver`

### Atlas-Lanes plane

- Config: `worker/wrangler.atlas.jsonc`
- Worker: `atlas-memory-worker`
- URL: https://atlas-memory-worker.srvcflo.workers.dev
- Version: `e7ed5bbd-db95-4fce-81f1-0c80e00fd9fd`
- `R2_MEMORY`: `atlas-lanes-memory`
- `R2_FILES`: `atlas-lanes-files`
- Vectorize: `agent-memories`
- Allowed agents: `atlas,dev,lance,bigfoot,lil-beaver`

### MEgenie plane

- Config: `worker/wrangler.megenie.jsonc`
- Worker: `megenie-memory-worker`
- URL: https://megenie-memory-worker.srvcflo.workers.dev
- Version: `e677df5c-0816-4293-8c25-97bb5d72ca4c`
- `R2_MEMORY`: `megenie-memory`
- `R2_FILES`: `megenie-files`
- Vectorize: `megenie-agent-memories`
- Allowed agents: `megenie`

### Runtime verification

- `/health` returned HTTP 200 for all three workers.
- Cache-busted MEgenie health response identified `service: megenie-memory-worker`.
- Unauthenticated `GET /agents/unknown/files/MEMORY.md` returned HTTP 401 for all three workers.
- Worker security/storage test returned `worker security/storage checks passed`.
- `source_bucket` defaults to `files` for `/index-file`; `source_bucket: "memory"` is an explicit compatibility path for legacy R2_MEMORY objects.
- Unknown or unauthorized agents return HTTP 400 after authentication.

### Recovery

Redeploy the exact profile with its tracked manifest:

```bash
npx wrangler deploy --config wrangler.jsonc
npx wrangler deploy --config wrangler.atlas.jsonc
npx wrangler deploy --config wrangler.megenie.jsonc
```

Rollback uses the prior Worker version through the Cloudflare dashboard or version API. Do not delete legacy R2 buckets during rollback or migration. Legacy objects in `R2_MEMORY` can be indexed explicitly with `source_bucket: "memory"` and should be migrated to `R2_FILES` before removing compatibility use.
