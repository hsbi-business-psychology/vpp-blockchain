/**
 * Reject Node and pnpm versions that break Hardhat.
 *
 * Node 22.14+, 24, 25 and 26 can run Hardhat here. pnpm 10 and later skip
 * Hardhat's install scripts, so this repo stays on pnpm 9.15.4.
 *
 * Run automatically before `pnpm install`. `bootstrap.mjs` imports the
 * checks and does not exit from this file.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const PNPM_VERSION = '9.15.4'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

export function nodeSupportError(version = process.versions.node) {
  const [major, minor] = version.split('.').map((part) => Number(part))
  const supported = (major === 22 && minor >= 14) || major === 24 || major === 25 || major === 26
  if (supported) return null

  return [
    `Node.js ${version} cannot run this project.`,
    'Install Node.js 24 LTS from https://nodejs.org/ (the button labelled LTS).',
    'If node -v already prints v22.14 or newer, v24, v25, or v26, do not install another Node.js.',
    'Close the terminal and open it again after installing.',
  ].join('\n')
}

export function packageManagerError(userAgent = process.env.npm_config_user_agent || '') {
  if (!userAgent) return null

  const pnpm = userAgent.match(/^pnpm\/(\d+)\.(\d+)\.(\d+)/)
  if (pnpm) {
    const major = Number(pnpm[1])
    const minor = Number(pnpm[2])
    const patch = Number(pnpm[3])
    const supported = major === 9 && (minor > 15 || (minor === 15 && patch >= 4))
    if (supported) return null
    return [
      `pnpm ${pnpm[1]}.${pnpm[2]}.${pnpm[3]} cannot install this project.`,
      `Install pnpm ${PNPM_VERSION} and try again:`,
      '  node scripts/bootstrap.mjs',
      'A plain "pnpm install" with pnpm 10 or newer stops on Hardhat\'s packages,',
      'because those versions do not run dependency build scripts.',
    ].join('\n')
  }

  const tool = userAgent.split(' ')[0] || 'another package manager'
  return [
    `This install used ${tool}, not pnpm ${PNPM_VERSION}.`,
    'Run:',
    '  node scripts/bootstrap.mjs',
  ].join('\n')
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

function pnpmAccepted(version) {
  return Boolean(version) && packageManagerError(`pnpm/${version}`) === null
}

export function resolvePnpm() {
  const onPath = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  if (pnpmAccepted(pnpmVersion(onPath))) return onPath

  try {
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
    const prefix = execFileSync(npm, ['prefix', '-g'], {
      cwd: root,
      encoding: 'utf8',
      shell: process.platform === 'win32',
    }).trim()
    const globalBin =
      process.platform === 'win32' ? join(prefix, 'pnpm.cmd') : join(prefix, 'bin', 'pnpm')
    if (pnpmAccepted(pnpmVersion(globalBin))) return globalBin
  } catch {
    // npm is not available, or the global prefix could not be read.
  }

  const localBin =
    process.platform === 'win32'
      ? join(root, '.tools', 'node_modules', '.bin', 'pnpm.cmd')
      : join(root, '.tools', 'node_modules', '.bin', 'pnpm')
  if (existsSync(localBin) && pnpmAccepted(pnpmVersion(localBin))) return localBin
  return null
}

function isDirectRun() {
  const entry = process.argv[1]
  if (!entry) return false
  return import.meta.url === pathToFileURL(entry).href
}

if (isDirectRun()) {
  const message = nodeSupportError() || packageManagerError()
  if (message) {
    console.error(message)
    process.exit(1)
  }
}
