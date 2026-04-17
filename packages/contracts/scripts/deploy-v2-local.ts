/**
 * Local development setup for SurveyPointsV2 (UUPS proxy + seeded data).
 *
 * Mirrors scripts/deploy-local.ts but for the V2 contract. Run alongside
 * a local Hardhat node:
 *
 *   npx hardhat node                                                # terminal 1
 *   npx hardhat run scripts/deploy-v2-local.ts --network localhost  # terminal 2
 *
 * V2 surveys no longer carry an on-chain secret. The seeded HMAC-token
 * helper printed at the bottom can be wired straight into the backend's
 * /admin survey-registration form for end-to-end claim testing.
 */
import { ethers, upgrades } from 'hardhat'

async function main() {
  const [deployer, student] = await ethers.getSigners()

  console.log('=== VPP Local V2 Setup ===\n')
  console.log(`Admin / Minter: ${deployer.address}`)
  console.log(`Test Student:   ${student.address}\n`)

  const factory = await ethers.getContractFactory('SurveyPointsV2')
  const proxy = await upgrades.deployProxy(factory, [deployer.address, deployer.address], {
    kind: 'uups',
    initializer: 'initialize',
  })
  await proxy.waitForDeployment()
  const address = await proxy.getAddress()
  const impl = await upgrades.erc1967.getImplementationAddress(address)
  console.log(`Proxy deployed to:          ${address}`)
  console.log(`Implementation deployed to: ${impl}\n`)

  const v2 = await ethers.getContractAt('SurveyPointsV2', address, deployer)

  const surveys = [
    { id: 1, points: 2, maxClaims: 0, title: 'Persönlichkeitstest WS 2025' },
    { id: 2, points: 1, maxClaims: 0, title: 'Stresswahrnehmung Studie' },
    { id: 3, points: 3, maxClaims: 0, title: 'Entscheidungsfindung Experiment' },
    { id: 4, points: 1, maxClaims: 0, title: 'Lernverhalten Befragung' },
    { id: 5, points: 2, maxClaims: 0, title: 'Emotionsregulation Studie' },
  ]

  for (const s of surveys) {
    const tx = await v2.registerSurvey(s.id, s.points, s.maxClaims, s.title)
    await tx.wait()
    console.log(`Survey #${s.id} "${s.title}" registered (${s.points} pts)`)
  }

  console.log('')
  for (const id of [1, 2, 3, 4]) {
    const tx = await v2.awardPoints(student.address, id)
    await tx.wait()
    console.log(`Awarded survey #${id} to student`)
  }

  console.log(`\nStudent total: ${await v2.totalPoints(student.address)} pts (survey #5 open)\n`)

  console.log('=== Setup Complete ===\n')
  console.log('Add this to your .env files:\n')
  console.log(`  CONTRACT_ADDRESS=${address}`)
  console.log('  CONTRACT_ABI=SurveyPointsV2')
  console.log('  RPC_URL=http://127.0.0.1:8545')
  console.log(`  VITE_CONTRACT_ADDRESS=${address}`)
  console.log('  VITE_RPC_URL=http://127.0.0.1:8545\n')
  console.log('Hardhat default keys:\n')
  console.log('  Admin:   0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80')
  console.log('  Student: 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
