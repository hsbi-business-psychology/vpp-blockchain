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
    {
      id: 1,
      secret: 'test-secret-alpha',
      points: 2,
      maxClaims: 0,
      title: 'Persönlichkeitstest WS 2025',
    },
    {
      id: 2,
      secret: 'test-secret-beta',
      points: 1,
      maxClaims: 0,
      title: 'Stresswahrnehmung Studie',
    },
    {
      id: 3,
      secret: 'test-secret-gamma',
      points: 3,
      maxClaims: 0,
      title: 'Entscheidungsfindung Experiment',
    },
    {
      id: 4,
      secret: 'test-secret-delta',
      points: 1,
      maxClaims: 0,
      title: 'Lernverhalten Befragung',
    },
    {
      id: 5,
      secret: 'test-secret-epsilon',
      points: 2,
      maxClaims: 0,
      title: 'Emotionsregulation Studie',
    },
  ]

  for (const s of surveys) {
    const secretHash = ethers.keccak256(ethers.toUtf8Bytes(s.secret))
    const tx = await contract.registerSurvey(s.id, secretHash, s.points, s.maxClaims, s.title)
    await tx.wait()
    console.log(`Survey #${s.id} "${s.title}" registered (${s.points} pts, secret: "${s.secret}")`)
  }

  // Award test points to student for surveys 1-4 (survey 5 left open for claim testing)
  const claims = [
    { surveyId: 1, secret: 'test-secret-alpha', points: 2 },
    { surveyId: 2, secret: 'test-secret-beta', points: 1 },
    { surveyId: 3, secret: 'test-secret-gamma', points: 3 },
    { surveyId: 4, secret: 'test-secret-delta', points: 1 },
  ]

  console.log('')
  for (const c of claims) {
    const tx = await contract.awardPoints(student.address, c.surveyId, c.secret)
    await tx.wait()
    console.log(`Awarded ${c.points} pts to student for survey #${c.surveyId}`)
  }

  const total = await contract.totalPoints(student.address)
  console.log(`Student total: ${total} pts (survey #5 open for claim testing)`)

  console.log('\n=== Setup Complete ===\n')
  console.log('Add this to your .env files:\n')
  console.log(`  CONTRACT_ADDRESS=${address}`)
  console.log(`  RPC_URL=http://127.0.0.1:8545`)
  console.log(`  VITE_CONTRACT_ADDRESS=${address}`)
  console.log(`  VITE_RPC_URL=http://127.0.0.1:8545\n`)
  console.log('Test accounts (Hardhat defaults):\n')
  console.log(
    `  Admin private key:   0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`,
  )
  console.log(
    `  Student private key: 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d\n`,
  )
  console.log('Secrets for testing claims:\n')
  for (const s of surveys) {
    console.log(`  Survey #${s.id}: ${s.secret}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
