import { describe, expect, it } from 'vitest';
import worker from '../src/index';

function makeEnv(options: { failUpsert?: boolean } = {}) {
  const objects = new Map<string, string>();
  const vectors: string[] = [];
  let upserts = 0;
  const bucket = {
    async get(key: string) {
      const value = objects.get(key);
      if (value === undefined) return null;
      return { text: async () => value, json: async () => JSON.parse(value) };
    },
    async put(key: string, value: string) {
      objects.set(key, value);
    },
  } as unknown as R2Bucket;
  const env = {
    R2_MEMORY: bucket,
    R2_FILES: bucket,
    EMBEDDING_MODEL: 'test-model',
    GATEWAY_TOKEN: 'secret',
    AI: { run: async (_model: string, input: { text: string[] }) => ({ data: input.text.map(() => [1, 2, 3]) }) },
    VECTORIZE: {
      async upsert(batch: Array<{ id: string }>) {
        upserts += 1;
        if (options.failUpsert && upserts === 1) throw new Error('Vectorize batch unavailable');
        vectors.push(...batch.map(item => item.id));
      },
      async query() { return { matches: [] }; },
    },
  } as any;
  return { env, objects, vectors, get upserts() { return upserts; } };
}

const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;

async function indexFile(env: any, token = 'secret') {
  return worker.fetch(
    new Request('https://worker.test/index-file', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: 'cleo', file: 'MEMORY.md' }),
    }),
    env,
    ctx,
  );
}

describe('/index-file run accounting', () => {
  it('rejects unauthorized requests and reports missing files', async () => {
    const first = makeEnv();
    expect((await indexFile(first.env, 'wrong')).status).toBe(401);
    expect((await indexFile(first.env)).status).toBe(404);
  });

  it('persists partial Vectorize failure and retryable chunks', async () => {
    const state = makeEnv({ failUpsert: true });
    state.objects.set('cleo/MEMORY.md', `${'first paragraph '.repeat(40)}\n\nsecond paragraph`);
    const response = await indexFile(state.env);
    const body = await response.json() as any;
    expect(response.status).toBe(207);
    expect(body.run_id).toMatch(/^[a-f0-9]{32}$/);
    expect(body.total).toBe(2);
    expect(body.succeeded).toBe(0);
    expect(body.failed).toBe(2);
    expect(body.retryable).toBe(2);
    expect(body.status).toBe('failed');
    expect(state.objects.has(`index-runs/${body.run_id}.json`)).toBe(true);
    const stored = await worker.fetch(new Request(`https://worker.test/index-runs/${body.run_id}`), state.env, ctx);
    expect(stored.status).toBe(200);
    expect((await stored.json() as any).run_id).toBe(body.run_id);
  });

  it('retries the same durable run and upserts deterministic IDs once', async () => {
    const state = makeEnv({ failUpsert: true });
    state.objects.set('cleo/MEMORY.md', `${'first paragraph '.repeat(40)}\n\nsecond paragraph`);
    const first = await indexFile(state.env);
    const firstBody = await first.json() as any;
    const second = await indexFile(state.env);
    const secondBody = await second.json() as any;
    expect(firstBody.status).toBe('failed');
    expect(second.status).toBe(200);
    expect(secondBody.run_id).toBe(firstBody.run_id);
    expect(secondBody.status).toBe('completed');
    expect(secondBody.total).toBe(2);
    expect(secondBody.succeeded).toBe(2);
    expect(secondBody.failed).toBe(0);
    expect(secondBody.retryable).toBe(0);
    expect(state.upserts).toBe(2);
    expect(new Set(state.vectors).size).toBe(2);
  });
});
