#!/usr/bin/env node
// Verify every service image has been refreshed on the GHCR remote before
// triggering docker compose to re-create the containers. Exits 0 only when
// the local digest is missing or stale, the pull succeeded, and the new
// digest differs from the previously running image.
//
// Usage:
//   node scripts/ensure-images-fresh.mjs
//   IMAGE_TAG=sha-1fe398b node scripts/ensure-images-fresh.mjs
//
// Requires: docker CLI on PATH, node 20+, access to GHCR (logged in already).

import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const composeFile = process.env.COMPOSE_FILE || 'docker-compose.prod.yml';
const envFile = process.env.ENV_FILE || '.env.prod';
const tag = process.env.IMAGE_TAG || 'latest';
const registry = process.env.IMAGE_REGISTRY || 'ghcr.io';
const namespace = process.env.IMAGE_NAMESPACE || process.env.GITHUB_REPOSITORY_OWNER || 'feinru';

const services = [
  'api-gateway',
  'article-service',
  'stemming-service',
  'wordcloud-service',
  'forwarding-inbox-service'
];

const images = services.map((name) => `${registry}/${namespace}/articleswap-${name}:${tag}`);

const localDigests = new Map();
for (const image of images) {
  localDigests.set(image, await getLocalDigest(image));
}

console.log(`[refresh] pulling ${images.length} images at tag ${tag}`);
for (const image of images) {
  const result = await run('docker', ['pull', image]);
  if (result.status !== 0) {
    console.error(`[refresh] FAILED to pull ${image}`);
    process.exit(result.status || 1);
  }
}

let updatedCount = 0;
let unchangedCount = 0;
for (const image of images) {
  const before = localDigests.get(image);
  const after = await getLocalDigest(image);
  if (!before) {
    console.log(`[refresh] ${image}: not present before, will be applied`);
    updatedCount += 1;
  } else if (before !== after) {
    console.log(`[refresh] ${image}: digest changed ${before.slice(0, 12)}... -> ${after.slice(0, 12)}...`);
    updatedCount += 1;
  } else {
    console.log(`[refresh] ${image}: already up to date (${after.slice(0, 12)}...)`);
    unchangedCount += 1;
  }
}

console.log(`[refresh] summary: ${updatedCount} updated, ${unchangedCount} unchanged`);
if (updatedCount === 0) {
  console.log('[refresh] no new image; aborting deploy to avoid unnecessary restart');
  process.exit(2);
}

if (!existsSync(composeFile)) {
  console.error(`[refresh] compose file not found: ${composeFile}`);
  process.exit(1);
}

if (!existsSync(envFile)) {
  console.warn(`[refresh] env file not found: ${envFile}; using process env only`);
}

const composeArgs = ['compose', '-f', composeFile];
if (existsSync(envFile)) composeArgs.push('--env-file', envFile);
composeArgs.push('up', '-d', '--remove-orphans');

console.log(`[refresh] restarting: docker ${composeArgs.join(' ')}`);
const up = await run('docker', composeArgs, { inheritStdio: true });
process.exit(up.status ?? 0);

async function getLocalDigest(image) {
  const result = await run('docker', ['image', 'inspect', image, '--format', '{{ index .RepoDigests 0 }}']);
  if (result.status !== 0) return null;
  const stdout = result.stdout.trim();
  if (!stdout) return null;
  const at = stdout.lastIndexOf('@');
  return at >= 0 ? stdout.slice(at + 1) : null;
}

function run(cmd, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: options.inheritStdio ? 'inherit' : 'pipe' });
    let stdout = '';
    let stderr = '';
    if (!options.inheritStdio) {
      child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
      child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
    }
    child.on('close', (code) => resolve({ status: code ?? 0, stdout, stderr }));
    child.on('error', (err) => resolve({ status: 1, stdout, stderr: stderr + err.message }));
  });
}
