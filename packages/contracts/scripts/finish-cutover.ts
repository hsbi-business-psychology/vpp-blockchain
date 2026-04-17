/**
 * Resume the V1 → V2 cutover after a proxy has already been deployed.
 *
 * Use this when deploy-v2.ts exited between the proxy deploy and the
 * migration / role-transfer steps (e.g. because the upgrades plugin
 * post-deploy check choked on an RPC hiccup). The script is fully
 * idempotent — it reads the on-chain state, performs only the
 * transitions still missing, and is safe to re-run.
 *
 * Usage:
 *   V2_PROXY=0x…            (required)
 *   V1_CONTRACT_ADDRESS=0x… (required if V1 deactivation still pending)
 *   V1_ACTIVE_SURVEYS="1,4,5" (optional override; otherwise enumerated)
 *   V1_ADMINS="0x…,0x…"      (required for admin migration — verified via isAdmin)
 *   ADMIN_ADDRESS=0x…        (defaults to deployer)
 *   MINTER_ADDRESS=0x…       (defaults to deployer — typically set)
 *   KEEP_DEPLOYER_ADMIN=true (default false)
 *   SKIP_V1_DEACTIVATION=true
 *
 *   npx hardhat run scripts/finish-cutover.ts --network baseMainnet
 */
import { ethers, network } from 'hardhat'

const V1_ABI = [
  'function isAdmin(address) view returns (bool)',
  'function deactivateSurvey(uint256) external',
  'function getSurveyInfo(uint256) view returns (bytes32 secretHash, uint8 points, uint256 maxClaims, uint256 claimCount, bool active, uint256 registeredAt, string title)',
]

async function enumerateActiveSurveys(v1: ethers.Contract): Promise<number[]> {
  const active: number[] = []
  let misses = 0
  for (let id = 1; id <= 512; id++) {
    const info = (await v1.getSurveyInfo(id)) as [
      string,
      bigint,
      bigint,
      bigint,
      boolean,
      bigint,
      string,
    ]
    const registeredAt = info[5]
    const isActive = info[4]
    if (registeredAt === 0n) {
      misses++
      if (misses >= 10) break
      continue
    }
    misses = 0
    if (isActive) active.push(id)
  }
  return active
}

async function main() {
  const proxyAddress = process.env.V2_PROXY
  if (!proxyAddress || !ethers.isAddress(proxyAddress)) {
    throw new Error('V2_PROXY env var required (checksummed address)')
  }
  const v1Address = process.env.V1_CONTRACT_ADDRESS || ''
  const manualActive = (process.env.V1_ACTIVE_SURVEYS || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map(Number)
  const v1AdminsRaw = (process.env.V1_ADMINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  const [deployer] = await ethers.getSigners()
  const adminAddress = process.env.ADMIN_ADDRESS || deployer.address
  const minterAddress = process.env.MINTER_ADDRESS || deployer.address
  const keepDeployerAdmin = (process.env.KEEP_DEPLOYER_ADMIN || '').toLowerCase() === 'true'
  const skipDeactivation = (process.env.SKIP_V1_DEACTIVATION || '').toLowerCase() === 'true'

  console.log('=== Resuming V1 → V2 cutover ===')
  console.log(`  Network:       ${network.name} (chainId=${network.config.chainId})`)
  console.log(`  Deployer:      ${deployer.address}`)
  console.log(`  Proxy:         ${proxyAddress}`)
  console.log(`  Target admin:  ${adminAddress}`)
  console.log(`  Target minter: ${minterAddress}`)
  if (v1Address) console.log(`  V1 source:     ${v1Address}`)

  const v2 = await ethers.getContractAt('SurveyPointsV2', proxyAddress, deployer)

  const DEFAULT_ADMIN_ROLE = await v2.DEFAULT_ADMIN_ROLE()
  const ADMIN_ROLE = await v2.ADMIN_ROLE()
  const MINTER_ROLE = await v2.MINTER_ROLE()

  // -------------------------------------------------------------
  // Step 1: migrate V1 admins — skip minter (least privilege) and
  //         anyone already holding ADMIN_ROLE on V2.
  // -------------------------------------------------------------
  if (v1AdminsRaw.length > 0 && v1Address) {
    console.log('\n→ Migrating ADMIN_ROLE holders ...')
    const v1 = new ethers.Contract(v1Address, V1_ABI, deployer)
    for (const raw of v1AdminsRaw) {
      if (!ethers.isAddress(raw)) {
        console.warn(`   - ${raw}: invalid address, skipping`)
        continue
      }
      const addr = ethers.getAddress(raw)
      if (addr.toLowerCase() === minterAddress.toLowerCase()) {
        console.log(`   - ${addr} SKIPPED (= minter, least privilege)`)
        continue
      }
      if (addr.toLowerCase() === deployer.address.toLowerCase()) {
        console.log(`   - ${addr} (= deployer, already has ADMIN_ROLE)`)
        continue
      }
      const v1IsAdmin = (await v1.isAdmin(addr)) as boolean
      if (!v1IsAdmin) {
        console.log(`   - ${addr} NOT on V1, skipping`)
        continue
      }
      const v2IsAdmin = await v2.hasRole(ADMIN_ROLE, addr)
      if (v2IsAdmin) {
        console.log(`   - ${addr} already ADMIN on V2 ✔`)
        continue
      }
      const tx = await v2.addAdmin(addr)
      await tx.wait()
      console.log(`   - ${addr} added ✔`)
    }
  }

  // -------------------------------------------------------------
  // Step 2: deactivate V1 surveys. Enumerate if not overridden.
  // -------------------------------------------------------------
  if (v1Address && !skipDeactivation) {
    const v1 = new ethers.Contract(v1Address, V1_ABI, deployer)
    const v1DeployerIsAdmin = (await v1.isAdmin(deployer.address)) as boolean
    if (!v1DeployerIsAdmin) {
      console.warn(`\n⚠ Skipping V1 deactivation: deployer is not V1 admin.`)
    } else {
      const activeIds = manualActive.length > 0 ? manualActive : await enumerateActiveSurveys(v1)
      console.log(`\n→ Deactivating ${activeIds.length} V1 surveys: [${activeIds.join(', ')}]`)
      for (const id of activeIds) {
        try {
          const tx = await v1.deactivateSurvey(id)
          await tx.wait()
          console.log(`   - survey #${id} deactivated ✔`)
        } catch (err) {
          console.warn(`   - survey #${id} failed: ${(err as Error).message.slice(0, 120)}`)
        }
      }
    }
  }

  // -------------------------------------------------------------
  // Step 3: transfer roles to production admin / minter. Idempotent.
  // -------------------------------------------------------------
  const deployerIsTargetAdmin = deployer.address.toLowerCase() === adminAddress.toLowerCase()

  if (!deployerIsTargetAdmin) {
    console.log('\n→ Ensuring target admin holds DEFAULT_ADMIN + ADMIN ...')
    if (!(await v2.hasRole(DEFAULT_ADMIN_ROLE, adminAddress))) {
      await (await v2.grantRole(DEFAULT_ADMIN_ROLE, adminAddress)).wait()
      console.log(`   DEFAULT_ADMIN_ROLE → ${adminAddress} ✔`)
    } else {
      console.log(`   ${adminAddress} already DEFAULT_ADMIN ✔`)
    }
    if (!(await v2.hasRole(ADMIN_ROLE, adminAddress))) {
      await (await v2.addAdmin(adminAddress)).wait()
      console.log(`   ADMIN_ROLE → ${adminAddress} ✔`)
    } else {
      console.log(`   ${adminAddress} already ADMIN ✔`)
    }
  }

  if (minterAddress.toLowerCase() !== deployer.address.toLowerCase()) {
    console.log('\n→ Moving MINTER_ROLE to backend signer ...')
    if (!(await v2.hasRole(MINTER_ROLE, minterAddress))) {
      await (await v2.grantRole(MINTER_ROLE, minterAddress)).wait()
      console.log(`   MINTER_ROLE → ${minterAddress} ✔`)
    } else {
      console.log(`   ${minterAddress} already MINTER ✔`)
    }
    if (!keepDeployerAdmin && (await v2.hasRole(MINTER_ROLE, deployer.address))) {
      await (await v2.revokeRole(MINTER_ROLE, deployer.address)).wait()
      console.log(`   MINTER_ROLE revoked from deployer ✔`)
    }
  }

  if (!deployerIsTargetAdmin && !keepDeployerAdmin) {
    console.log('\n→ Renouncing deployer admin rights ...')
    if (await v2.hasRole(ADMIN_ROLE, deployer.address)) {
      await (await v2.removeAdmin(deployer.address)).wait()
      console.log(`   ADMIN_ROLE renounced ✔`)
    }
    if (await v2.hasRole(DEFAULT_ADMIN_ROLE, deployer.address)) {
      await (await v2.renounceRole(DEFAULT_ADMIN_ROLE, deployer.address)).wait()
      console.log(`   DEFAULT_ADMIN_ROLE renounced ✔`)
    }
  }

  // -------------------------------------------------------------
  // Final check
  // -------------------------------------------------------------
  console.log('\n=== Post-cutover state ===')
  console.log(`Deployer  ${deployer.address}`)
  console.log(`  DEFAULT_ADMIN: ${await v2.hasRole(DEFAULT_ADMIN_ROLE, deployer.address)}`)
  console.log(`  ADMIN:         ${await v2.hasRole(ADMIN_ROLE, deployer.address)}`)
  console.log(`  MINTER:        ${await v2.hasRole(MINTER_ROLE, deployer.address)}`)
  if (!deployerIsTargetAdmin) {
    console.log(`Target admin  ${adminAddress}`)
    console.log(`  DEFAULT_ADMIN: ${await v2.hasRole(DEFAULT_ADMIN_ROLE, adminAddress)}`)
    console.log(`  ADMIN:         ${await v2.hasRole(ADMIN_ROLE, adminAddress)}`)
  }
  console.log(`Minter wallet  ${minterAddress}`)
  console.log(`  MINTER:        ${await v2.hasRole(MINTER_ROLE, minterAddress)}`)
  for (const raw of v1AdminsRaw) {
    if (!ethers.isAddress(raw)) continue
    const addr = ethers.getAddress(raw)
    if (
      addr.toLowerCase() === deployer.address.toLowerCase() ||
      addr.toLowerCase() === minterAddress.toLowerCase()
    ) {
      continue
    }
    console.log(`Migrated admin ${addr}`)
    console.log(`  ADMIN: ${await v2.hasRole(ADMIN_ROLE, addr)}`)
  }

  console.log('\n=== Plesk env ===')
  console.log(`CONTRACT_ADDRESS=${proxyAddress}`)
  console.log(`# Restart Phusion Passenger: touch tmp/restart.txt`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
