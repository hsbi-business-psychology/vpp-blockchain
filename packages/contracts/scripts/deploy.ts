/**
 * Production deployment script for the SurveyPoints contract.
 *
 * Usage:
 *   npx hardhat run scripts/deploy.ts --network baseMainnet
 *
 * Environment variables:
 *   DEPLOYER_PRIVATE_KEY – private key of the deploying wallet
 *   ADMIN_ADDRESS        – wallet receiving ADMIN_ROLE (defaults to deployer)
 *   MINTER_ADDRESS       – wallet receiving MINTER_ROLE (defaults to deployer)
 *
 * After deployment the script prints the contract address and deploy block
 * which need to be added to the backend/frontend environment variables.
 */
import { ethers, network, run } from 'hardhat'

async function main() {
  const [deployer] = await ethers.getSigners()

  console.log('Deploying SurveyPoints contract...')
  console.log(`  Network:  ${network.name}`)
  console.log(`  Deployer: ${deployer.address}`)

  const balance = await ethers.provider.getBalance(deployer.address)
  console.log(`  Balance:  ${ethers.formatEther(balance)} ETH`)

  const adminAddress = process.env.ADMIN_ADDRESS || deployer.address
  const minterAddress = process.env.MINTER_ADDRESS || deployer.address

  console.log(`  Admin:    ${adminAddress}`)
  console.log(`  Minter:   ${minterAddress}`)

  const factory = await ethers.getContractFactory('SurveyPoints')
  const contract = await factory.deploy(adminAddress, minterAddress)
  await contract.waitForDeployment()

  const address = await contract.getAddress()
  console.log(`\nSurveyPoints deployed to: ${address}`)

  if (network.name !== 'hardhat' && network.name !== 'localhost') {
    console.log('\nWaiting for block confirmations before verification...')
    const tx = contract.deploymentTransaction()
    if (tx) {
      await tx.wait(5)
    }

    console.log('Verifying contract on BaseScan...')
    try {
      await run('verify:verify', {
        address,
        constructorArguments: [adminAddress, minterAddress],
      })
      console.log('Contract verified successfully!')
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes('Already Verified')) {
        console.log('Contract is already verified.')
      } else {
        console.error('Verification failed:', error)
      }
    }
  }

  const deployTx = contract.deploymentTransaction()
  const deployBlock = deployTx ? (await deployTx.wait())?.blockNumber ?? 0 : 0

  console.log('\n--- Deployment Summary ---')
  console.log(`Contract:     ${address}`)
  console.log(`Deploy Block: ${deployBlock}`)
  console.log(`Admin:        ${adminAddress}`)
  console.log(`Minter:       ${minterAddress}`)
  console.log(`Network:      ${network.name}`)

  if (network.name === 'baseSepolia') {
    console.log(`Explorer:     https://sepolia.basescan.org/address/${address}`)
  } else if (network.name === 'baseMainnet') {
    console.log(`Explorer:     https://basescan.org/address/${address}`)
  }

  console.log('\n--- Environment Variables ---')
  console.log(`CONTRACT_ADDRESS=${address}`)
  console.log(`CONTRACT_DEPLOY_BLOCK=${deployBlock}`)
  console.log(`VITE_CONTRACT_ADDRESS=${address}`)
  console.log(`VITE_CONTRACT_DEPLOY_BLOCK=${deployBlock}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
