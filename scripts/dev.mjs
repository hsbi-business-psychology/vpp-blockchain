/**
 * Start the local test system on macOS, Linux, and Windows.
 *
 * Order matters: the Hardhat node must be up before the V3 proxy is
 * deployed, and the API and frontend must start only after that deploy.
 * The proxy address is deterministic on a fresh node (see
 * packages/backend/test/integration/setup.ts).
 */
import { spawn, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { nodeSupportError, resolvePnpm } from './check-runtime.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const PROXY = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512'
const RPC = 'http://127.0.0.1:8545'
const children = []
let stopping = false

let pnpmCommand = ''

function requirePnpm() {
  const command = resolvePnpm()
  if (command) {
    pnpmCommand = command
    return
  }
  console.error('pnpm 9.15.4 is not installed. Run: node scripts/bootstrap.mjs')
  process.exit(1)
}

function spawnPnpm(args, options = {}) {
  const child = spawn(pnpmCommand, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
    detached: process.platform !== 'win32',
    ...options,
  })
  children.push(child)
  return child
}

function pidsOnPort(port) {
  try {
    if (process.platform === 'win32') {
      const output = spawnSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8' }).stdout || ''
      const pids = new Set()
      for (const line of output.split(/\r?\n/)) {
        const parts = line.trim().split(/\s+/)
        if (parts[0] !== 'TCP' || parts[3] !== 'LISTENING') continue
        if (!parts[1].endsWith(`:${port}`)) continue
        if (parts[4] && parts[4] !== '0') pids.add(parts[4])
      }
      return [...pids]
    }
    const output = spawnSync('lsof', ['-ti', `tcp:${port}`], { encoding: 'utf8' })
    if (output.status !== 0) return []
    return (output.stdout || '').trim().split(/\s+/).filter(Boolean)
  } catch {
    return []
  }
}

function freePort(port) {
  for (const pid of pidsOnPort(port)) {
    console.log(`Stopping process ${pid} on port ${port}`)
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', pid, '/T', '/F'], { stdio: 'ignore' })
    } else {
      try {
        process.kill(Number(pid), 'SIGTERM')
      } catch {
        // The process exited between the lookup and the signal.
      }
    }
  }
}

function stopChildren() {
  stopping = true
  for (const child of children) {
    if (!child.pid || child.exitCode !== null) continue
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    } else {
      try {
        process.kill(-child.pid, 'SIGTERM')
      } catch {
        try {
          process.kill(child.pid, 'SIGTERM')
        } catch {
          // Already gone.
        }
      }
    }
  }
}

function ensureBackendEnv() {
  const file = join(root, 'packages', 'backend', '.env')
  const template = join(root, 'packages', 'backend', '.env.development')
  if (!existsSync(file)) copyFileSync(template, file)
  const text = readFileSync(file, 'utf8')
  const next = text.match(/^CONTRACT_ADDRESS=.*$/m)
    ? text.replace(/^CONTRACT_ADDRESS=.*$/m, `CONTRACT_ADDRESS=${PROXY}`)
    : `${text.trimEnd()}\nCONTRACT_ADDRESS=${PROXY}\n`
  if (next !== text) writeFileSync(file, next)
}

async function waitForChain(child) {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error('Hardhat exited before the local chain was ready.')
    }
    try {
      const response = await fetch(RPC, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
        signal: AbortSignal.timeout(1000),
      })
      if (response.ok) {
        const body = await response.json()
        if (body.result) return
      }
    } catch {
      // The node is still starting.
    }
    await delay(500)
  }
  throw new Error('The local chain did not answer on port 8545 within 60 seconds.')
}

function deployContract() {
  const result = spawnSync(
    pnpmCommand,
    [
      '--filter',
      '@vpp/contracts',
      'exec',
      'hardhat',
      'run',
      'scripts/deploy-v2-local.ts',
      '--network',
      'localhost',
    ],
    {
      cwd: root,
      encoding: 'utf8',
      shell: process.platform === 'win32',
      env: process.env,
    },
  )
  process.stdout.write(result.stdout || '')
  process.stderr.write(result.stderr || '')
  if (result.status !== 0) {
    throw new Error('Deploying the local contract failed.')
  }
  const deployed = result.stdout.match(/Proxy deployed to:\s*(0x[a-fA-F0-9]{40})/)
  if (!deployed || deployed[1].toLowerCase() !== PROXY.toLowerCase()) {
    throw new Error(
      `Expected the local proxy at ${PROXY}, got ${deployed ? deployed[1] : 'no address'}.`,
    )
  }
  if (!result.stdout.includes('SurveyPointsV3')) {
    throw new Error('The local node is not running SurveyPointsV3.')
  }
}

async function main() {
  const nodeError = nodeSupportError()
  if (nodeError) {
    console.error(nodeError)
    process.exit(1)
  }
  requirePnpm()

  console.log('VPP local test system')
  console.log('Starting the local chain, the API, and the website.')
  console.log('')

  for (const port of [8545, 3000, 5173]) freePort(port)
  await delay(300)
  ensureBackendEnv()

  const chain = spawnPnpm(['--filter', '@vpp/contracts', 'exec', 'hardhat', 'node'])
  chain.on('exit', (code) => {
    if (stopping) return
    console.error(`Hardhat exited (${code ?? 'signal'}).`)
    stopChildren()
    process.exit(code || 1)
  })

  await waitForChain(chain)
  deployContract()

  spawnPnpm(['--filter', '@vpp/backend', 'dev'])
  spawnPnpm(['--filter', '@vpp/frontend', 'dev'])

  console.log('')
  console.log('Open http://localhost:5173')
  console.log('The accounts printed above exist only on this local chain.')
  console.log('Stop everything with Ctrl+C.')
}

process.on('SIGINT', () => {
  stopChildren()
  process.exit(130)
})
process.on('SIGTERM', () => {
  stopChildren()
  process.exit(143)
})

if (process.argv.includes('--prepare-backend-env')) {
  ensureBackendEnv()
} else {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    stopChildren()
    process.exit(1)
  })
}
