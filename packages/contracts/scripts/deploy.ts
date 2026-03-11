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

  console.log('\n--- Deployment Summary ---')
  console.log(`Contract: ${address}`)
  console.log(`Admin:    ${adminAddress}`)
  console.log(`Minter:   ${minterAddress}`)
  console.log(`Network:  ${network.name}`)

  if (network.name === 'baseSepolia') {
    console.log(`Explorer: https://sepolia.basescan.org/address/${address}`)
  } else if (network.name === 'baseMainnet') {
    console.log(`Explorer: https://basescan.org/address/${address}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
