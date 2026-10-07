/**
 * Lets local scripts import the Vercel functions' TypeScript the way Vercel does: imports in
 * api/ leave out the extension ("../_lib/qflow"), and Node needs ".ts" spelled out.
 * Usage: `import './ts-resolve.mjs';` before importing anything from api/.
 */
import { register } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.removeAllListeners('warning'); // Node's notice about loading .ts files

register(
  'data:text/javascript,' +
    encodeURIComponent(`
      // .ts files are ES modules (saves Node guessing, and its warning about guessing)
      const asModule = (result) => (result.url.endsWith('.ts') ? { ...result, format: 'module-typescript' } : result);
      export async function resolve(specifier, context, next) {
        try { return asModule(await next(specifier, context)); }
        catch (error) {
          if (specifier.startsWith('.') && !/\\.[cm]?[jt]s$/.test(specifier)) return asModule(await next(specifier + '.ts', context));
          throw error;
        }
      }`),
  pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), '..') + '/'),
);
