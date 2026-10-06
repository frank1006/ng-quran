#!/usr/bin/env node
/**
 * Runs QFlow's Vercel function (api/qflow/ask.ts) locally on http://localhost:3001, so the
 * Angular dev server can proxy /api/qflow here (proxy.conf.json) while every other /api call
 * still goes to production. QFlow is off in production until release, so this is how to try it.
 *
 * Usage: node scripts/qflow-dev-server.mjs   (keys from .env.local; never printed)
 */
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { register } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.removeAllListeners('warning'); // Node's notice about loading .ts files

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.QFLOW_PORT) || 3001;
if (existsSync(join(ROOT, '.env.local'))) process.loadEnvFile(join(ROOT, '.env.local'));
process.env.QFLOW_ENABLED = 'true';

// Vercel resolves extensionless imports ("../_lib/qflow"); Node needs ".ts" spelled out
register(
  'data:text/javascript,' +
    encodeURIComponent(`
      export async function resolve(specifier, context, next) {
        try { return await next(specifier, context); }
        catch (error) {
          if (specifier.startsWith('.') && !/\\.[cm]?[jt]s$/.test(specifier)) return next(specifier + '.ts', context);
          throw error;
        }
      }`),
  pathToFileURL(ROOT + '/'),
);

const routes = {
  '/api/qflow/ask': await import(pathToFileURL(join(ROOT, 'api/qflow/ask.ts')).href),
  '/api/qflow/quota': await import(pathToFileURL(join(ROOT, 'api/qflow/quota.ts')).href),
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const handler = routes[url.pathname]?.[req.method ?? 'GET'];
  if (!handler) {
    res.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"Not found"}');
    return;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const started = Date.now();
  const response = await handler(
    new Request(url, { method: req.method, headers: req.headers, body: chunks.length ? Buffer.concat(chunks) : undefined }),
  );
  const body = Buffer.from(await response.arrayBuffer());
  res.writeHead(response.status, Object.fromEntries(response.headers)).end(body);
  console.log(`${req.method} ${url.pathname} → ${response.status} in ${Date.now() - started}ms`);
}).listen(PORT, () => console.log(`QFlow dev API on http://localhost:${PORT}`));
