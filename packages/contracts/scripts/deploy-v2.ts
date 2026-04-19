/**
 * Production deployment script for SurveyPointsV2 (UUPS proxy).
 *
 * Performs the full V1 → V2 cutover in a single command:
 *
 *   1. Deploys the V2 implementation behind a UUPS ERC-1967 proxy.
 *   2. Reads the current ADMIN_ROLE holders from the V1 contract by
 *      replaying RoleGranted / RoleRevoked logs and grants ADMIN_ROLE
 *      to each surviving holder on the new V2 proxy.
 *   3. Optionally calls `deactivateSurvey` on every still-active survey
 *      in the V1 contract so users do not accidentally claim against
 *      the dead contract after the frontend has been switched over.
 *      (V1 has no global pause; per-survey deactivation is the closest
 *      equivalent.)
 *   4. Verifies the implementation contract on BaseScan.
 *   5. Prints a clean Plesk cutover snippet (env vars + restart).
 *
 * Usage:
 *   npx hardhat run scripts/deploy-v2.ts --network baseSepolia
 *   npx hardhat run scripts/deploy-v2.ts --network baseMainnet
 *
 * Required environment variables:
 *   DEPLOYER_PRIVATE_KEY   – private key of the deploying wallet
 *
 * Optional environment variables:
 *   ADMIN_ADDRESS          – wallet to receive DEFAULT_ADMIN_ROLE +
 *                            ADMIN_ROLE on the new proxy. Defaults to
 *                            the deployer.
 *   MINTER_ADDRESS         – wallet to receive MINTER_ROLE on the new
 *                            proxy (typically the backend signer).
 *                            Defaults to the deployer.
 *   V1_CONTRACT_ADDRESS    – address of the existing SurveyPoints V1
 *                            contract. When set, ADMIN_ROLE holders are
 *                            migrated and active surveys are deactivated.
 *                            Skip this var on a greenfield deploy.
 *   V1_DEPLOY_BLOCK        – block number the V1 contract was deployed
 *                            in. Speeds up the log scan fallback.
 *   V1_ADMINS              – comma-separated list of V1 ADMIN_ROLE
 *                            holders to migrate. When provided, the
 *                            script skips the eth_getLogs role replay
 *                            entirely and just verifies each address
 *                            via isAdmin() on V1. This is orders of
 *                            magnitude faster and robust against public
 *                            RPC rate limits. Unknown addresses in the
 *                            list are skipped with a warning rather
 *                            than aborting. You can read the canonical
 *                            list from the running Plesk admin UI.
 *   V1_MAX_SURVEY_ID       – optional upper bound for the survey
 *                            enumeration via getSurveyInfo view calls.
 *                            Defaults to 512 which is plenty for the
 *                            current deployment. Override for very
 *                            large tenants.
 *   SKIP_V1_DEACTIVATION   – set to "true" to skip the deactivation
 *                            step (useful for staged cutovers where the
 *                            old contract should remain claimable for a
 *                            grace period).
 *   KEEP_DEPLOYER_ADMIN    – set to "true" to keep DEFAULT_ADMIN_ROLE
 *                            and ADMIN_ROLE on the deployer wallet
 *                            after migration. Default is "false": once
 *                            ADMIN_ADDRESS holds both roles, the
 *                            deployer renounces its own roles so the
 *                            deploy key is no longer privileged.
 *   EXCLUDE_FROM_ADMIN_MIGRATION –
 *                            comma-separated list of addresses that
 *                            must NOT receive ADMIN_ROLE on V2 even if
 *                            they had ADMIN_ROLE on V1. Use this to
 *                            strip legacy accounts during cutover.
 *                            MINTER_ADDRESS is granted ADMIN_ROLE in
 *                            step 5 by design — see "Backend signer
 *                            holds ADMIN_ROLE" below.
 *
 * Backend signer holds ADMIN_ROLE (architectural decision):
 *   The backend is a stateless relayer. Admins authenticate themselves
 *   in the frontend by signing an EIP-191 message; the backend
 *   verifies the signature off-chain (see middleware/auth.ts) and
 *   then submits the actual on-chain transaction with the single
 *   funded backend wallet (MINTER). For routes like /admin/add,
 *   /admin/remove, /surveys/:id/deactivate, /surveys/:id/revoke,
 *   /wallets/:addr/mark, the on-chain msg.sender is therefore the
 *   minter — and SurveyPointsV2 enforces onlyRole(ADMIN_ROLE) on
 *   each of those functions. Granting ADMIN_ROLE to the minter is
 *   what makes this relayer pattern work end-to-end.
 *
 *   Trade-off: a minter-key compromise lets the attacker do anything
 *   ADMIN_ROLE allows (add/remove admins, deactivate surveys, revoke
 *   claim points, mark wallets as submitted). The mitigations are:
 *     - DEFAULT_ADMIN_ROLE (the upgrade authority) stays with
 *       ADMIN_ADDRESS (Hochschule wallet), not the minter.
 *     - The HMAC keys live off-chain (data/survey-keys.json) and
 *       are unreachable from any on-chain attack.
 *     - _adminCount enforces LastAdmin(): the attacker cannot lock
 *       out every admin, so the legitimate admin can always revoke
 *       the compromised minter and rotate the key.
 *   Documented in docs/adr/0004-... ("Backend signer holds
 *   ADMIN_ROLE — accepted trade-off").
 *   SKIP_VERIFY            – set to "true" to skip BaseScan verification.
 *
 * Idempotency:
 *   Re-running the script will deploy a NEW proxy. To merely upgrade an
 *   existing proxy, use scripts/upgrade-v2.ts.
 */
import { ethers, network, run, upgrades } from 'hardhat'

const ADMIN_ROLE = ethers.keccak256(ethers.toUtf8Bytes('ADMIN_ROLE'))

// Public Base RPC fallbacks used exclusively for log scanning during
// the V1 migration phase. We keep these off Alchemy Free Tier because
// the role-replay sweep would otherwise trip the 10-block range cap.
// Ordering matters — `publicnode` tolerates wider ranges and higher
// request rates than `mainnet.base.org`, so we prefer it as primary.
const PUBLIC_BASE_RPCS: Record<number, string[]> = {
  84532: ['https://base-sepolia.publicnode.com', 'https://sepolia.base.org'],
  8453: ['https://base.publicnode.com', 'https://mainnet.base.org'],
}

function eventScannerProvider(): ethers.Provider {
  // Reuse the configured network provider when it is already a
  // public/local RPC. Only swap to the public fallback when we are on
  // an Alchemy/Infura URL that throttles eth_getLogs aggressively.
  const url = (network.config as { url?: string }).url ?? ''
  const isThrottled = /alchemy|infura/i.test(url)
  if (!isThrottled) return ethers.provider

  const fallbacks = PUBLIC_BASE_RPCS[network.config.chainId ?? 0]
  if (!fallbacks?.length) return ethers.provider

  return new ethers.JsonRpcProvider(fallbacks[0]!, network.config.chainId, {
    batchMaxCount: 1,
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function queryFilterChunked<T extends ethers.EventLog | ethers.Log>(
  contract: ethers.Contract,
  filter: ethers.DeferredTopicFilter,
  fromBlock: number,
  toBlock: number,
  chunkSize = 9_000,
): Promise<T[]> {
  const out: T[] = []
  for (let start = fromBlock; start <= toBlock; start += chunkSize + 1) {
    const end = Math.min(start + chunkSize, toBlock)

    // Retry up to 5 times with exponential backoff. Public RPCs
    // occasionally return 429 Too Many Requests or transient 5xx;
    // failing here mid-migration would waste ETH on a zombie proxy.
    let attempt = 0
    let success = false
    let lastErr: unknown
    while (attempt < 5 && !success) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ethers.js types are too narrow here
        const logs = (await contract.queryFilter(filter as any, start, end)) as T[]
        out.push(...logs)
        success = true
      } catch (err) {
        lastErr = err
        attempt++
        const wait = 800 * 2 ** (attempt - 1)
        const msg = err instanceof Error ? err.message.slice(0, 80) : String(err).slice(0, 80)
        console.warn(`   [retry ${attempt}/5] blocks ${start}→${end}: ${msg} — waiting ${wait}ms`)
        await sleep(wait)
      }
    }
    if (!success) {
      throw new Error(
        `queryFilter failed after 5 retries for blocks ${start}→${end}: ` +
          (lastErr instanceof Error ? lastErr.message : String(lastErr)),
      )
    }

    // Gentle pacing to be a good citizen on public RPCs.
    await sleep(100)
  }
  return out
}

interface MigrationPlan {
  v1Address: string
  admins: string[]
  activeSurveys: number[]
}

const V1_READ_ABI = [
  'event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)',
  'event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)',
  'function isAdmin(address account) view returns (bool)',
  // NOTE: return order matches SurveyPoints V1 — (bytes32 secretHash, uint8 points, ...),
  // NOT the order used elsewhere. Don't swap.
  'function getSurveyInfo(uint256) view returns (bytes32 secretHash, uint8 points, uint256 maxClaims, uint256 claimCount, bool active, uint256 registeredAt, string title)',
]

async function enumerateActiveSurveys(v1: ethers.Contract, maxSurveyId: number): Promise<number[]> {
  // V1 has no surveyCount() — we enumerate via getSurveyInfo() view calls
  // until we see a run of un-registered IDs, then stop. `registeredAt == 0`
  // is the "never existed" sentinel; active surveys have registeredAt > 0.
  const active: number[] = []
  let consecutiveMisses = 0
  const MISS_LIMIT = 10 // stop after 10 consecutive unregistered IDs

  for (let id = 1; id <= maxSurveyId; id++) {
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
      consecutiveMisses++
      if (consecutiveMisses >= MISS_LIMIT) break
      continue
    }
    consecutiveMisses = 0
    if (isActive) active.push(id)
  }
  return active
}

async function buildMigrationPlan(
  v1Address: string,
  v1DeployBlock: number,
  scanner: ethers.Provider,
  manualAdmins: string[] | null,
  maxSurveyId: number,
): Promise<MigrationPlan> {
  const v1 = new ethers.Contract(v1Address, V1_READ_ABI, scanner)

  let admins: string[]

  if (manualAdmins && manualAdmins.length > 0) {
    console.log(
      `   Using ${manualAdmins.length} manually-provided admin(s); verifying via isAdmin()...`,
    )
    const verified: string[] = []
    for (const addr of manualAdmins) {
      const ok = (await v1.isAdmin(addr)) as boolean
      if (ok) {
        verified.push(addr)
      } else {
        console.warn(`     - ${addr} is NOT ADMIN_ROLE on V1 — skipping`)
      }
    }
    admins = verified
  } else {
    console.log(
      '   No V1_ADMINS provided → falling back to eth_getLogs role replay (slow on mainnet).',
    )
    const head = await scanner.getBlockNumber()
    const grants = await queryFilterChunked<ethers.EventLog>(
      v1,
      v1.filters.RoleGranted(ADMIN_ROLE),
      v1DeployBlock,
      head,
    )
    const revokes = await queryFilterChunked<ethers.EventLog>(
      v1,
      v1.filters.RoleRevoked(ADMIN_ROLE),
      v1DeployBlock,
      head,
    )
    const adminSet = new Set<string>()
    for (const log of grants) adminSet.add((log.args[1] as string).toLowerCase())
    for (const log of revokes) adminSet.delete((log.args[1] as string).toLowerCase())
    admins = Array.from(adminSet).map((a) => ethers.getAddress(a))
  }

  console.log(`   Enumerating V1 surveys via getSurveyInfo (id 1..${maxSurveyId}) ...`)
  const activeSurveys = await enumerateActiveSurveys(v1, maxSurveyId)

  return { v1Address, admins, activeSurveys }
}

async function main() {
  const [deployer] = await ethers.getSigners()
  const adminAddress = process.env.ADMIN_ADDRESS || deployer.address
  const minterAddress = process.env.MINTER_ADDRESS || deployer.address
  const v1Address = process.env.V1_CONTRACT_ADDRESS
  const v1DeployBlock = process.env.V1_DEPLOY_BLOCK ? Number(process.env.V1_DEPLOY_BLOCK) : 0
  const skipDeactivation = (process.env.SKIP_V1_DEACTIVATION || '').toLowerCase() === 'true'
  const skipVerify = (process.env.SKIP_VERIFY || '').toLowerCase() === 'true'
  const keepDeployerAdmin = (process.env.KEEP_DEPLOYER_ADMIN || '').toLowerCase() === 'true'
  const maxSurveyId = Number(process.env.V1_MAX_SURVEY_ID || 512)
  const manualAdminsRaw = (process.env.V1_ADMINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  for (const addr of manualAdminsRaw) {
    if (!ethers.isAddress(addr)) {
      throw new Error(`V1_ADMINS contains invalid address: ${addr}`)
    }
  }
  const manualAdmins =
    manualAdminsRaw.length > 0 ? manualAdminsRaw.map((a) => ethers.getAddress(a)) : null

  // Addresses that must NOT receive ADMIN_ROLE on V2 even when they had
  // it on V1. The minter is intentionally NOT in this list — it gets
  // ADMIN_ROLE in step 5 because the backend is a relayer (see header).
  const manualExcludes = (process.env.EXCLUDE_FROM_ADMIN_MIGRATION || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  for (const addr of manualExcludes) {
    if (!ethers.isAddress(addr)) {
      throw new Error(`EXCLUDE_FROM_ADMIN_MIGRATION contains invalid address: ${addr}`)
    }
  }
  const adminMigrationExcludes = new Set<string>(
    manualExcludes.map((a) => ethers.getAddress(a).toLowerCase()),
  )

  const deployerIsTargetAdmin = deployer.address.toLowerCase() === adminAddress.toLowerCase()

  console.log('=== Deploying SurveyPointsV2 (UUPS) ===')
  console.log(`  Network:     ${network.name} (chainId=${network.config.chainId})`)
  console.log(`  Deployer:    ${deployer.address}`)
  console.log(`  Target admin: ${adminAddress}${deployerIsTargetAdmin ? ' (= deployer)' : ''}`)
  console.log(`  Minter:      ${minterAddress}`)
  if (adminMigrationExcludes.size > 0) {
    console.log(`  Admin-migration excludes (manual):`)
    for (const e of adminMigrationExcludes) {
      console.log(`    - ${ethers.getAddress(e)}`)
    }
  }
  console.log(
    `  Balance:     ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`,
  )
  if (v1Address) {
    console.log(`  V1 source:   ${v1Address} (block ${v1DeployBlock})`)
  } else {
    console.log('  V1 source:   <none — greenfield deploy>')
  }

  // ---------------------------------------------------------------
  // Step 1: build migration plan first (before spending any gas on
  //         the deploy) so we fail loudly if log scanning is broken.
  // ---------------------------------------------------------------

  let plan: MigrationPlan | null = null
  if (v1Address) {
    if (!ethers.isAddress(v1Address)) {
      throw new Error(`V1_CONTRACT_ADDRESS is not a valid address: ${v1Address}`)
    }
    if (v1DeployBlock <= 0) {
      console.warn(
        '  ⚠ V1_DEPLOY_BLOCK not set; the role replay will scan from genesis. ' +
          'This is slow on mainnet — set V1_DEPLOY_BLOCK to the actual block number.',
      )
    }
    console.log('\n→ Building migration plan ...')
    plan = await buildMigrationPlan(
      v1Address,
      v1DeployBlock,
      eventScannerProvider(),
      manualAdmins,
      maxSurveyId,
    )
    console.log(`   ${plan.admins.length} ADMIN_ROLE holder(s) on V1:`)
    for (const a of plan.admins) console.log(`     - ${a}`)
    console.log(
      `   ${plan.activeSurveys.length} active surveys: [${plan.activeSurveys.join(', ')}]`,
    )
  }

  // ---------------------------------------------------------------
  // Step 2: deploy V2 proxy
  //
  // We always initialize with the *deployer* as admin/minter so the
  // migration TXs in step 3 succeed even when ADMIN_ADDRESS is a cold
  // wallet whose key we don't have here. Step 6 then transfers the
  // privileged roles to ADMIN_ADDRESS / MINTER_ADDRESS and (unless
  // KEEP_DEPLOYER_ADMIN=true) renounces the deployer's roles.
  // ---------------------------------------------------------------

  console.log('\n→ Deploying UUPS proxy ...')
  const factory = await ethers.getContractFactory('SurveyPointsV2')
  const proxy = await upgrades.deployProxy(factory, [deployer.address, deployer.address], {
    kind: 'uups',
    initializer: 'initialize',
  })
  await proxy.waitForDeployment()
  const proxyAddress = await proxy.getAddress()
  const implAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress)
  const adminSlot = await upgrades.erc1967.getAdminAddress(proxyAddress)

  const deployTx = proxy.deploymentTransaction()
  const deployBlock = deployTx ? ((await deployTx.wait())?.blockNumber ?? 0) : 0

  console.log(`   Proxy:           ${proxyAddress}`)
  console.log(`   Implementation:  ${implAddress}`)
  console.log(`   Admin slot:      ${adminSlot} (UUPS does not use ProxyAdmin → expected 0x0)`)
  console.log(`   Deploy block:    ${deployBlock}`)

  // ---------------------------------------------------------------
  // Step 3: migrate ADMIN_ROLE holders
  // ---------------------------------------------------------------

  if (plan && plan.admins.length > 0) {
    console.log('\n→ Migrating ADMIN_ROLE holders to V2 proxy ...')
    const v2Migrator = await ethers.getContractAt('SurveyPointsV2', proxyAddress, deployer)
    for (const admin of plan.admins) {
      if (admin.toLowerCase() === deployer.address.toLowerCase()) {
        console.log(`   - ${admin} (= deployer, already initial admin)`)
        continue
      }
      if (adminMigrationExcludes.has(admin.toLowerCase())) {
        console.log(`   - ${admin} SKIPPED (EXCLUDE_FROM_ADMIN_MIGRATION)`)
        continue
      }
      const tx = await v2Migrator.addAdmin(admin)
      await tx.wait()
      console.log(`   - ${admin} ✔`)
    }
  }

  // ---------------------------------------------------------------
  // Step 4: optionally deactivate active surveys on V1
  // ---------------------------------------------------------------

  if (plan && !skipDeactivation && plan.activeSurveys.length > 0) {
    const v1Abi = [
      'function deactivateSurvey(uint256 surveyId) external',
      'function isAdmin(address account) view returns (bool)',
    ]
    const v1Writer = new ethers.Contract(plan.v1Address, v1Abi, deployer)
    const deployerIsV1Admin = await (
      v1Writer as unknown as { isAdmin(a: string): Promise<boolean> }
    ).isAdmin(deployer.address)
    if (!deployerIsV1Admin) {
      console.warn(
        '\n⚠ Skipping V1 deactivation: deployer is not an ADMIN_ROLE holder on V1. ' +
          'Run this step manually from an admin wallet, or set SKIP_V1_DEACTIVATION=true to silence this warning.',
      )
    } else {
      console.log('\n→ Deactivating active surveys on V1 (write side) ...')
      for (const id of plan.activeSurveys) {
        try {
          const tx = await v1Writer.deactivateSurvey(id)
          await tx.wait()
          console.log(`   - survey #${id} deactivated on V1 ✔`)
        } catch (err) {
          console.warn(`   - survey #${id} could not be deactivated: ${(err as Error).message}`)
        }
      }
    }
  } else if (skipDeactivation) {
    console.log('\n→ Skipping V1 deactivation (SKIP_V1_DEACTIVATION=true).')
  }

  // ---------------------------------------------------------------
  // Step 5: hand DEFAULT_ADMIN_ROLE / ADMIN_ROLE / MINTER_ROLE over
  //         to the configured production wallets and (by default)
  //         renounce the deployer's roles.
  // ---------------------------------------------------------------

  const v2 = await ethers.getContractAt('SurveyPointsV2', proxyAddress, deployer)
  const DEFAULT_ADMIN_ROLE = await v2.DEFAULT_ADMIN_ROLE()
  const ADMIN_ROLE_HASH = await v2.ADMIN_ROLE()
  const MINTER_ROLE = await v2.MINTER_ROLE()

  if (!deployerIsTargetAdmin) {
    console.log('\n→ Granting DEFAULT_ADMIN_ROLE + ADMIN_ROLE to target admin ...')
    if (!(await v2.hasRole(DEFAULT_ADMIN_ROLE, adminAddress))) {
      await (await v2.grantRole(DEFAULT_ADMIN_ROLE, adminAddress)).wait()
      console.log(`   DEFAULT_ADMIN_ROLE → ${adminAddress} ✔`)
    }
    if (!(await v2.hasRole(ADMIN_ROLE_HASH, adminAddress))) {
      await (await v2.addAdmin(adminAddress)).wait()
      console.log(`   ADMIN_ROLE         → ${adminAddress} ✔`)
    }
  }

  if (minterAddress.toLowerCase() !== deployer.address.toLowerCase()) {
    console.log('\n→ Granting MINTER_ROLE to target minter ...')
    if (!(await v2.hasRole(MINTER_ROLE, minterAddress))) {
      await (await v2.grantRole(MINTER_ROLE, minterAddress)).wait()
      console.log(`   MINTER_ROLE → ${minterAddress} ✔`)
    }
    if (!keepDeployerAdmin && deployer.address.toLowerCase() !== minterAddress.toLowerCase()) {
      await (await v2.revokeRole(MINTER_ROLE, deployer.address)).wait()
      console.log(`   MINTER_ROLE revoked from deployer ✔`)
    }
  }

  // Grant ADMIN_ROLE to the backend signer. Required for the relayer
  // pattern: the backend submits all admin-gated TXs (addAdmin,
  // removeAdmin, deactivateSurvey, revokePoints, markWalletSubmitted)
  // on behalf of admins who authenticated with an EIP-191 signature
  // off-chain. See the script header for the full trade-off.
  console.log('\n→ Granting ADMIN_ROLE to backend signer (relayer pattern) ...')
  if (!(await v2.hasRole(ADMIN_ROLE_HASH, minterAddress))) {
    await (await v2.addAdmin(minterAddress)).wait()
    console.log(`   ADMIN_ROLE → ${minterAddress} ✔`)
  } else {
    console.log(`   ${minterAddress} already ADMIN ✔`)
  }

  if (!deployerIsTargetAdmin && !keepDeployerAdmin) {
    console.log('\n→ Renouncing deployer roles (set KEEP_DEPLOYER_ADMIN=true to skip) ...')
    // Renounce ADMIN_ROLE first — _adminCount stays >= 1 because the
    // target admin already holds it from the step above.
    if (await v2.hasRole(ADMIN_ROLE_HASH, deployer.address)) {
      await (await v2.removeAdmin(deployer.address)).wait()
      console.log(`   ADMIN_ROLE         renounced ✔`)
    }
    if (await v2.hasRole(DEFAULT_ADMIN_ROLE, deployer.address)) {
      await (await v2.renounceRole(DEFAULT_ADMIN_ROLE, deployer.address)).wait()
      console.log(`   DEFAULT_ADMIN_ROLE renounced ✔`)
    }
  } else if (keepDeployerAdmin) {
    console.log('\n→ KEEP_DEPLOYER_ADMIN=true → deployer keeps DEFAULT_ADMIN_ROLE + ADMIN_ROLE.')
  }

  // ---------------------------------------------------------------
  // Step 6: verify implementation on BaseScan
  // ---------------------------------------------------------------

  if (!skipVerify && network.name !== 'hardhat' && network.name !== 'localhost') {
    console.log('\n→ Verifying implementation on BaseScan (waiting for confirmations) ...')
    if (deployTx) {
      await deployTx.wait(5)
    }
    try {
      await run('verify:verify', { address: implAddress, constructorArguments: [] })
      console.log('   Implementation verified ✔')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('Already Verified')) {
        console.log('   Already verified ✔')
      } else {
        console.warn(`   Verification failed: ${msg}`)
      }
    }
  }

  // ---------------------------------------------------------------
  // Final summary
  // ---------------------------------------------------------------

  const explorer =
    network.name === 'baseMainnet'
      ? 'https://basescan.org'
      : network.name === 'baseSepolia'
        ? 'https://sepolia.basescan.org'
        : null

  console.log('\n=== Deployment Summary ===')
  console.log(`Proxy address:         ${proxyAddress}`)
  console.log(`Implementation:        ${implAddress}`)
  console.log(`Deploy block:          ${deployBlock}`)
  console.log(`Initial admin:         ${adminAddress}`)
  console.log(`Initial minter:        ${minterAddress}`)
  if (plan) {
    console.log(`Migrated admins:       ${plan.admins.length}`)
    console.log(
      `V1 surveys deactivated: ${skipDeactivation ? 'skipped' : plan.activeSurveys.length}`,
    )
  }
  if (explorer) {
    console.log(`Explorer:              ${explorer}/address/${proxyAddress}`)
  }

  console.log('\n=== Plesk environment variables ===')
  console.log('# Backend (.env)')
  console.log(`CONTRACT_ADDRESS=${proxyAddress}`)
  console.log(`CONTRACT_DEPLOY_BLOCK=${deployBlock}`)
  console.log('CONTRACT_ABI=SurveyPointsV2')
  console.log('# Frontend (.env)')
  console.log(`VITE_CONTRACT_ADDRESS=${proxyAddress}`)
  console.log(`VITE_CONTRACT_DEPLOY_BLOCK=${deployBlock}`)
  console.log('# Restart Phusion Passenger after updating env vars:')
  console.log('# touch tmp/restart.txt')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
