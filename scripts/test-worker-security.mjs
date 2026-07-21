#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const worker = join(root, 'worker');
const out = join(root, '.test-dist');
rmSync(out, { recursive: true, force: true });
execFileSync(process.execPath, [
  join(worker, 'node_modules/typescript/bin/tsc'), join(worker, 'src/policy.ts'), '--outDir', out,
  '--module', 'commonjs', '--target', 'ES2022', '--skipLibCheck',
], { cwd: worker, stdio: 'inherit' });

const policy = await import(pathToFileURL(join(out, 'policy.js')).href);
assert.equal(policy.validateAgent('cleo', 'cleo'), null);
assert.equal(policy.validateAgent('unknown', 'cleo'), 'Unknown or unauthorized agent');
assert.equal(policy.validateAgent(undefined, 'cleo'), 'agent is required');
assert.equal(policy.validateAgent('atlas', 'atlas,dev'), null);
assert.equal(policy.validateAgent('cleo', 'atlas,dev'), 'Unknown or unauthorized agent');

const source = readFileSync(join(worker, 'src/index.ts'), 'utf8');
assert.match(source, /query and agent are required/);
assert.match(source, /R2_FILES\.get\(objectKey\)/);
assert.match(source, /R2_FILES\.put\(objectKey/);
assert.match(source, /source_bucket\?: 'files' \| 'memory'/);
assert.match(source, /validateAgent/);

console.log('worker security/storage checks passed');
