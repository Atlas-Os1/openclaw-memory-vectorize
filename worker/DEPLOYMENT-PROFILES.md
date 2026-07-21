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
