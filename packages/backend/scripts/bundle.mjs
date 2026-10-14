/**
 * Bundles the backend into a single ESM file for the Plesk deploy.
 *
 * Shared hosting only reaches the server over FTPS, where every file costs
 * one to two seconds. The tsc output plus production node_modules is close
 * to 4,000 files; this bundle is one. It needs no node_modules at runtime.
 *
 * Output: dist/bundle/server.mjs. The launcher (app.js, written by
 * scripts/build-deploy-ci.sh) sets VPP_BACKEND_ROOT before importing it.
 */
import { execSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function buildId() {
  if (process.env.VPP_BUILD_ID) return process.env.VPP_BUILD_ID
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim()
  } catch {
    return 'dev'
  }
}

const id = buildId()

await build({
  entryPoints: [resolve(root, 'src/server.ts')],
  outfile: resolve(root, 'dist/bundle/server.mjs'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  // CommonJS dependencies (express, pino) call require() at runtime.
  banner: {
    js: "import { createRequire as __vppCreateRequire } from 'node:module'; const require = __vppCreateRequire(import.meta.url);",
  },
  define: { 'process.env.VPP_BUILD_ID': JSON.stringify(id) },
  minifySyntax: true,
  legalComments: 'none',
  logLevel: 'warning',
})

console.log(`bundled backend ${id} -> dist/bundle/server.mjs`)
