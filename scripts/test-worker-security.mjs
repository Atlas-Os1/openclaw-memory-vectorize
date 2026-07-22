#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const worker = join(root, 'worker');
const out = join(root, '.test-dist');
rmSync(out, { recursive: true, force: true });
execFileSync(process.execPath, [
  join(worker, 'node_modules/typescript/bin/tsc'),
  join(worker, 'src/index.ts'), join(worker, 'src/policy.ts'),
  '--outDir', out, '--module', 'commonjs', '--target', 'ES2022', '--skipLibCheck', '--types', '@cloudflare/workers-types',
], { cwd: worker, stdio: 'inherit' });
assert.ok(existsSync(join(out, 'index.js')));
const module = await import(pathToFileURL(join(out, 'index.js')).href);
const workerHandler = module.default?.fetch ? module.default : module.default?.default;
const calls = { filesPut: 0, memoryPut: 0, filesGet: 0, memoryGet: 0 };
const fileObject = { text: async () => 'legacy memory content' };
const env = {
  GATEWAY_TOKEN: 'token',
  ALLOWED_AGENTS: 'megenie',
  WORKER_SERVICE_NAME: 'megenie-memory-worker',
  EMBEDDING_MODEL: 'test-model',
  R2_FILES: {
    put: async () => { calls.filesPut++; },
    get: async () => { calls.filesGet++; return fileObject; },
  },
  R2_MEMORY: {
    put: async () => { calls.memoryPut++; },
    get: async () => { calls.memoryGet++; return fileObject; },
  },
  AI: { run: async () => ({ data: [[0.1, 0.2]] }) },
  VECTORIZE: { upsert: async () => ({ inserted: 1 }), query: async () => ({ matches: [] }) },
};
const tradingCalls = { filesPut: 0, memoryPut: 0 };
const tradingEnv = {
  ...env,
  ALLOWED_AGENTS: 'cleo',
  TRADING_ARCHIVE_AGENT: 'cleo',
  R2_TRADING_FILES: { put: async () => { tradingCalls.filesPut++; }, get: async () => fileObject },
  R2_TRADING_MEMORY: { put: async () => { tradingCalls.memoryPut++; }, get: async () => fileObject },
};
const ctx = { waitUntil() {} };
const request = (path, init = {}) => new Request(`https://test.local${path}`, init);
const json = (path, body, auth = true) => request(path, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer token' } : {}) },
  body: JSON.stringify(body),
});

assert.equal((await workerHandler.fetch(request('/agents/megenie/files/MEMORY.md'), env, ctx)).status, 401);
assert.equal((await workerHandler.fetch(json('/query', { query: 'hello' }), env, ctx)).status, 400);
assert.equal((await workerHandler.fetch(json('/query', { query: 'hello', agent: 'cleo' }), env, ctx)).status, 400);
assert.equal((await workerHandler.fetch(json('/index', { agent: 'cleo', text: 'hello' }), env, ctx)).status, 400);
assert.equal((await workerHandler.fetch(json('/capture', { agent: 'cleo', content: 'remember this decision' }), env, ctx)).status, 400);
assert.equal((await workerHandler.fetch(json('/index-file', { agent: 'cleo', file: 'MEMORY.md' }), env, ctx)).status, 400);
assert.equal((await workerHandler.fetch(json('/index-file', { agent: 'megenie', file: '../secret' }), env, ctx)).status, 400);
assert.equal((await workerHandler.fetch(json('/index', { agent: 'megenie', text: 'hello' }), { ...env, ALLOWED_AGENTS: '' }, ctx)).status, 400);
assert.equal((await workerHandler.fetch(request('/agents/megenie/files/../secret', { method: 'GET', headers: { Authorization: 'Bearer token' } }), env, ctx)).status, 404);
assert.equal((await workerHandler.fetch(request('/agents/megenie/files/MEMORY.md', { method: 'PUT', headers: { Authorization: 'Bearer token' }, body: 'data' }), env, ctx)).status, 201);
assert.equal(calls.filesPut, 1);
assert.equal(calls.memoryPut, 0);
assert.equal((await workerHandler.fetch(json('/index-file', { agent: 'megenie', file: 'MEMORY.md' }), env, ctx)).status, 200);
assert.equal(calls.filesGet, 1);
assert.equal(calls.memoryGet, 0);
assert.equal((await workerHandler.fetch(json('/index-file', { agent: 'megenie', file: 'MEMORY.md', source_bucket: 'memory' }), env, ctx)).status, 200);
assert.equal(calls.memoryGet, 1);
assert.equal((await workerHandler.fetch(json('/trading/archive', { agent: 'cleo', bucket: 'files', key: 'trading/briefs/old.md', content: 'old brief' }), tradingEnv, ctx)).status, 201);
assert.equal(tradingCalls.filesPut, 1);
assert.equal((await workerHandler.fetch(json('/index-file', { agent: 'cleo', file: 'trading/briefs/old.md', source_bucket: 'trading-files' }), tradingEnv, ctx)).status, 200);
const health = await workerHandler.fetch(request('/health'), env, ctx);
const healthBody = await health.json();
assert.equal(health.status, 200);
assert.equal(healthBody.status, 'ok');
assert.equal(healthBody.service, 'megenie-memory-worker');
assert.equal(typeof healthBody.timestamp, 'string');

console.log('worker route security/storage checks passed');
