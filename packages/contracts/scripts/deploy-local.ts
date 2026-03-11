import { ethers } from 'hardhat'

/**
 * Deploy + seed script for local Hardhat node.
 *
 * Hardhat default accounts (deterministic):
 *   #0  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266  — admin + minter
 *   #1  0x70997970C51812dc3A010C7d01b50e0d17dc79C8  — test student
 *
 * Run:
 *   npx hardhat node                       (terminal 1)
 *   npx hardhat run scripts/deploy-local.ts --network localhost  (terminal 2)
 */
async function main() {
  const [deployer, student] = await ethers.getSigners()

  console.log('=== VPP Local Development Setup ===\n')
  console.log(`Admin / Minter: ${deployer.address}`)
  console.log(`Test Student:   ${student.address}\n`)

  // Deploy contract
  const factory = await ethers.getContractFactory('SurveyPoints')
  const contract = await factory.deploy(deployer.address, deployer.address)
  await contract.waitForDeployment()
  const address = await contract.getAddress()
  console.log(`Contract deployed to: ${address}\n`)

  // Seed test surveys
  const surveys = [
    { id: 1, secret: 'test-secret-alpha', points: 5, maxClaims: 100 },
    { id: 2, secret: 'test-secret-beta', points: 10, maxClaims: 50 },
    { id: 3, secret: 'test-secret-gamma', points: 3, maxClaims: 0 },
  ]

  for (const s of surveys) {
    const secretHash = ethers.keccak256(ethers.toUtf8Bytes(s.secret))
    const tx = await contract.registerSurvey(s.id, secretHash, s.points, s.maxClaims)
    await tx.wait()
    console.log(`Survey #${s.id} registered (${s.points} pts, max ${s.maxClaims || '∞'} claims, secret: "${s.secret}")`)
  }

  // Award test points to student for surveys 1 and 2
  const tx1 = await contract.awardPoints(student.address, 1, 'test-secret-alpha')
  await tx1.wait()
  console.log(`\nAwarded 5 pts to student for survey #1`)

  const tx2 = await contract.awardPoints(student.address, 2, 'test-secret-beta')
  await tx2.wait()
  console.log(`Awarded 10 pts to student for survey #2`)

  const total = await contract.totalPoints(student.address)
  console.log(`Student total: ${total} pts`)

  console.log('\n=== Setup Complete ===\n')
  console.log('Add this to your .env files:\n')
  console.log(`  CONTRACT_ADDRESS=${address}`)
  console.log(`  RPC_URL=http://127.0.0.1:8545`)
  console.log(`  VITE_CONTRACT_ADDRESS=${address}`)
  console.log(`  VITE_RPC_URL=http://127.0.0.1:8545\n`)
  console.log('Test accounts (Hardhat defaults):\n')
  console.log(`  Admin private key:   0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`)
  console.log(`  Student private key: 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d\n`)
  console.log('Secrets for testing claims:\n')
  for (const s of surveys) {
    console.log(`  Survey #${s.id}: ${s.secret}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
