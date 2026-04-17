/**
 * Upgrade an existing SurveyPointsV2 UUPS proxy to a new implementation.
 *
 * Usage:
 *   PROXY_ADDRESS=0x... npx hardhat run scripts/upgrade-v2.ts --network baseMainnet
 *
 * Required environment variables:
 *   DEPLOYER_PRIVATE_KEY – must hold DEFAULT_ADMIN_ROLE on the proxy.
 *   PROXY_ADDRESS        – address of the UUPS proxy to upgrade.
 *
 * Optional:
 *   IMPLEMENTATION_NAME  – Solidity contract name to use as the new
 *                          implementation. Defaults to "SurveyPointsV2".
 *   SKIP_VERIFY          – "true" to skip BaseScan verification.
 *
 * The OpenZeppelin Upgrades plugin verifies storage layout compatibility
 * before broadcasting the upgrade. If the new contract is incompatible,
 * the script aborts before sending any transaction.
 */
import { ethers, network, run, upgrades } from 'hardhat'

async function main() {
  const proxyAddress = process.env.PROXY_ADDRESS
  if (!proxyAddress || !ethers.isAddress(proxyAddress)) {
    throw new Error('PROXY_ADDRESS is required and must be a valid address')
  }
  const implementationName = process.env.IMPLEMENTATION_NAME || 'SurveyPointsV2'
  const skipVerify = (process.env.SKIP_VERIFY || '').toLowerCase() === 'true'

  const [deployer] = await ethers.getSigners()
  console.log('=== Upgrading UUPS proxy ===')
  console.log(`  Network:        ${network.name}`)
  console.log(`  Proxy:          ${proxyAddress}`)
  console.log(`  New impl:       ${implementationName}`)
  console.log(`  Deployer:       ${deployer.address}`)

  const oldImpl = await upgrades.erc1967.getImplementationAddress(proxyAddress)
  console.log(`  Current impl:   ${oldImpl}`)

  const factory = await ethers.getContractFactory(implementationName, deployer)
  const upgraded = await upgrades.upgradeProxy(proxyAddress, factory)
  await upgraded.waitForDeployment()
  const newImpl = await upgrades.erc1967.getImplementationAddress(proxyAddress)
  console.log(`  New impl:       ${newImpl}`)

  if (oldImpl.toLowerCase() === newImpl.toLowerCase()) {
    console.log('\n⚠ Implementation address unchanged — no upgrade was performed.')
    return
  }

  if (!skipVerify && network.name !== 'hardhat' && network.name !== 'localhost') {
    console.log('\n→ Verifying new implementation on BaseScan ...')
    try {
      await run('verify:verify', { address: newImpl, constructorArguments: [] })
      console.log('   Verified ✔')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('Already Verified')) console.log('   Already verified ✔')
      else console.warn(`   Verification failed: ${msg}`)
    }
  }

  console.log('\n=== Upgrade complete ===')
  console.log(`Proxy:           ${proxyAddress}`)
  console.log(`New impl:        ${newImpl}`)
  console.log('No environment variables need updating — the proxy address is unchanged.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
