/**
 * Content manifest for the incremental FTP deploy.
 *
 *   node scripts/deploy-manifest.mjs write <deployDir>
 *     Hashes every file in <deployDir> into <deployDir>/.deploy-manifest.json.
 *
 *   node scripts/deploy-manifest.mjs plan <deployDir> <remoteManifest> <stageDir>
 *     Compares the local manifest with the one currently on the server and
 *     copies only new or changed files into <stageDir>/<phase>/, one folder
 *     per upload phase:
 *       assets   - everything the new index.html will reference, uploaded first
 *       backend  - launcher, bundle, ABI; a change here needs a Passenger restart
 *       entry    - HTML entry points, uploaded last so the switch is atomic
 *     Also writes <stageDir>/delete.txt (files retired by the previous deploy
 *     and still unused), <stageDir>/manifest.json (the new server manifest) and
 *     <stageDir>/restart when the backend changed.
 *
 * Files that disappear from a build stay on the server for one more deploy,
 * so a browser holding the previous index.html can still load its chunks.
 * Only plain paths under DELETABLE_PREFIXES are ever deleted; data/ never
 * is. The server manifest is input from outside this build, so a deletion
 * candidate with any other shape aborts the deploy.
 */
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'

const MANIFEST = '.deploy-manifest.json'
const DELETABLE_PREFIXES = ['packages/backend/public/', 'packages/backend/dist/']
const SAFE_DELETION = /^packages\/backend\/(public|dist)\/[A-Za-z0-9._/-]+$/

function assertSafeDeletion(path) {
  const segments = path.split('/')
  if (!SAFE_DELETION.test(path) || segments.includes('..') || segments.includes('.')) {
    throw new Error(`refusing to delete ${JSON.stringify(path)} listed in the server manifest`)
  }
}

function walk(dir, base = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return walk(full, base)
    return [relative(base, full).split(sep).join('/')]
  })
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

function phaseOf(path) {
  if (path === 'packages/backend/app.js' || path === 'packages/backend/package.json') {
    return 'backend'
  }
  if (path.startsWith('packages/backend/dist/') || path.startsWith('packages/contracts/')) {
    return 'backend'
  }
  if (path.startsWith('packages/backend/public/') && path.endsWith('.html')) return 'entry'
  return 'assets'
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return {}
  }
}

/** Reads a manifest, treating anything malformed as "no manifest". */
function readManifest(file) {
  const data = readJson(file)
  const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
  return {
    files: isRecord(data) && isRecord(data.files) ? data.files : {},
    retired:
      isRecord(data) && Array.isArray(data.retired)
        ? data.retired.filter((path) => typeof path === 'string')
        : [],
  }
}

function write(deployDir) {
  const files = {}
  for (const path of walk(deployDir).sort()) {
    if (path === MANIFEST) continue
    files[path] = sha256(join(deployDir, path))
  }
  writeFileSync(join(deployDir, MANIFEST), JSON.stringify({ version: 1, files }, null, 2) + '\n')
  console.log(`manifest: ${Object.keys(files).length} files`)
}

function plan(deployDir, remoteFile, stageDir) {
  const local = readManifest(join(deployDir, MANIFEST)).files
  const remote = readManifest(remoteFile)
  const remoteFiles = remote.files
  const counts = { assets: 0, backend: 0, entry: 0 }

  for (const [path, hash] of Object.entries(local)) {
    if (remoteFiles[path] === hash) continue
    const phase = phaseOf(path)
    const target = join(stageDir, phase, path)
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(join(deployDir, path), target)
    counts[phase]++
  }

  const deletable = (path) => DELETABLE_PREFIXES.some((prefix) => path.startsWith(prefix))
  const toDelete = remote.retired.filter((path) => !(path in local) && deletable(path))
  const retired = Object.keys(remoteFiles).filter((path) => !(path in local) && deletable(path))
  for (const path of [...toDelete, ...retired]) assertSafeDeletion(path)

  writeFileSync(join(stageDir, 'delete.txt'), toDelete.map((p) => p + '\n').join(''))
  writeFileSync(
    join(stageDir, 'manifest.json'),
    JSON.stringify({ version: 1, files: local, retired }, null, 2) + '\n',
  )
  if (counts.backend > 0) writeFileSync(join(stageDir, 'restart'), '')

  console.log(
    `upload: ${counts.assets} assets, ${counts.backend} backend, ${counts.entry} entry; ` +
      `retire ${retired.length}, delete ${toDelete.length}` +
      (Object.keys(remoteFiles).length === 0 ? ' (no manifest on server, full upload)' : ''),
  )
}

const [command, ...args] = process.argv.slice(2)
if (command === 'write' && args.length === 1) {
  write(args[0])
} else if (command === 'plan' && args.length === 3) {
  if (!existsSync(join(args[0], MANIFEST))) throw new Error(`missing ${MANIFEST} in ${args[0]}`)
  plan(args[0], args[1], args[2])
} else {
  console.error('usage: deploy-manifest.mjs write <deployDir> | plan <deployDir> <remote> <stage>')
  process.exit(2)
}
