/**
 * Install the one pnpm version this repo supports, then install dependencies.
 *
 * Node's installer does not include pnpm, and current Node images do not
 * include Corepack. `npm install -g pnpm` without a version installs pnpm 12,
 * which will not build Hardhat. This script pins 9.15.4.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { nodeSupportError, packageManagerError, resolvePnpm } from './check-runtime.mjs'

const PNPM_VERSION = '9.15.4'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm'
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  })
}

function pnpmVersion(command) {
  const result = spawnSync(command, ['--version'], {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
  if (result.status !== 0) return ''
  return (result.stdout || '').trim()
}

function globalPnpmPath() {
  const prefix = execFileSync(npmCommand(), ['prefix', '-g'], {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  }).trim()
  return process.platform === 'win32' ? join(prefix, 'pnpm.cmd') : join(prefix, 'bin', 'pnpm')
}

function ensurePnpm() {
  const found = resolvePnpm()
  if (found) return found

  console.log(`Installing pnpm ${PNPM_VERSION}...`)
  const globalInstall = run(npmCommand(), ['install', '-g', `pnpm@${PNPM_VERSION}`])
  if (
    globalInstall.status === 0 &&
    !packageManagerError(`pnpm/${pnpmVersion(globalPnpmPath()) || '0.0.0'}`)
  ) {
    return globalPnpmPath()
  }

  const tools = join(root, '.tools')
  mkdirSync(tools, { recursive: true })
  const localInstall = run(npmCommand(), ['install', '--prefix', tools, `pnpm@${PNPM_VERSION}`])
  if (localInstall.status !== 0) {
    console.error('Could not install pnpm. Install Node.js 24 LTS, then run this script again.')
    process.exit(localInstall.status || 1)
  }
  const localBin =
    process.platform === 'win32'
      ? join(tools, 'node_modules', '.bin', 'pnpm.cmd')
      : join(tools, 'node_modules', '.bin', 'pnpm')
  if (packageManagerError(`pnpm/${pnpmVersion(localBin) || '0.0.0'}`)) {
    console.error(`pnpm ${PNPM_VERSION} did not become available.`)
    process.exit(1)
  }
  return localBin
}

const nodeError = nodeSupportError()
if (nodeError) {
  console.error(nodeError)
  process.exit(1)
}

const pnpm = ensurePnpm()
console.log(`Using ${pnpm} (${pnpmVersion(pnpm)})`)
console.log('Installing dependencies...')
const install = run(pnpm, ['install', '--frozen-lockfile'])
if (install.status !== 0) process.exit(install.status || 1)

console.log('')
console.log('Dependencies are installed.')
console.log('Start the test system:')
console.log('  node scripts/dev.mjs')
console.log('Open http://localhost:5173')
