import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const artifactPath = resolve(
  __dirname,
  '../../contracts/artifacts/contracts/SurveyPoints.sol/SurveyPoints.json',
)
const outputPath = resolve(__dirname, '../src/lib/contract-abi.ts')

if (!existsSync(artifactPath)) {
  console.error(
    `Artifact not found at ${artifactPath}\nRun "pnpm hardhat compile" in packages/contracts first.`,
  )
  process.exit(1)
}

const artifact = JSON.parse(readFileSync(artifactPath, 'utf-8'))
const abi = JSON.stringify(artifact.abi, null, 2)

const output = `/**
 * Auto-generated from packages/contracts/artifacts.
 * Do not edit manually — run: pnpm sync-abi
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SURVEY_POINTS_ABI = ${abi} as const satisfies readonly any[]
`

writeFileSync(outputPath, output)
console.log('ABI synced → src/lib/contract-abi.ts')
