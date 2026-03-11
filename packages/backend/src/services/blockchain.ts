import { ethers } from 'ethers'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from '../config.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadContractABI(): ethers.InterfaceAbi {
  const artifactPath = resolve(
    __dirname,
    '../../../contracts/artifacts/contracts/SurveyPoints.sol/SurveyPoints.json',
  )
  const artifact = JSON.parse(readFileSync(artifactPath, 'utf-8'))
  return artifact.abi
}

const abi = loadContractABI()

const provider = new ethers.JsonRpcProvider(config.rpcUrl)
const wallet = new ethers.Wallet(config.minterPrivateKey, provider)
const contract = new ethers.Contract(config.contractAddress, abi, wallet)
const readOnlyContract = new ethers.Contract(config.contractAddress, abi, provider)

export async function awardPoints(
  student: string,
  surveyId: number,
  secret: string,
): Promise<ethers.TransactionReceipt> {
  const tx = await contract.awardPoints(student, surveyId, secret)
  const receipt = await tx.wait()
  if (!receipt) throw new Error('Transaction receipt is null')
  return receipt
}

export async function registerSurvey(
  surveyId: number,
  secretHash: string,
  points: number,
  maxClaims: number,
): Promise<ethers.TransactionReceipt> {
  const tx = await contract.registerSurvey(surveyId, secretHash, points, maxClaims)
  const receipt = await tx.wait()
  if (!receipt) throw new Error('Transaction receipt is null')
  return receipt
}

export interface SurveyInfoRaw {
  secretHash: string
  points: number
  maxClaims: bigint
  claimCount: bigint
  active: boolean
  registeredAt: bigint
}

export async function getSurveyInfo(surveyId: number): Promise<SurveyInfoRaw> {
  const result = await readOnlyContract.getSurveyInfo(surveyId)
  return {
    secretHash: result[0],
    points: Number(result[1]),
    maxClaims: result[2],
    claimCount: result[3],
    active: result[4],
    registeredAt: result[5],
  }
}

export async function getTotalPoints(walletAddress: string): Promise<number> {
  const points = await readOnlyContract.totalPoints(walletAddress)
  return Number(points)
}

export async function getSurveyPoints(walletAddress: string, surveyId: number): Promise<number> {
  const points = await readOnlyContract.surveyPoints(walletAddress, surveyId)
  return Number(points)
}

export async function hasClaimed(walletAddress: string, surveyId: number): Promise<boolean> {
  return readOnlyContract.claimed(walletAddress, surveyId)
}

export interface PointsAwardedEvent {
  wallet: string
  surveyId: number
  points: number
  blockNumber: number
  transactionHash: string
  timestamp: number
}

export async function getPointsAwardedEvents(
  walletAddress: string,
): Promise<PointsAwardedEvent[]> {
  const filter = readOnlyContract.filters.PointsAwarded(walletAddress)
  const events = await readOnlyContract.queryFilter(filter)

  const results: PointsAwardedEvent[] = []
  for (const event of events) {
    if (!('args' in event)) continue
    const block = await event.getBlock()
    results.push({
      wallet: event.args[0],
      surveyId: Number(event.args[1]),
      points: Number(event.args[2]),
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      timestamp: block.timestamp,
    })
  }

  return results
}

export interface SurveyRegisteredEvent {
  surveyId: number
  points: number
  maxClaims: number
  blockNumber: number
  transactionHash: string
  timestamp: number
}

export async function getSurveyRegisteredEvents(): Promise<SurveyRegisteredEvent[]> {
  const filter = readOnlyContract.filters.SurveyRegistered()
  const events = await readOnlyContract.queryFilter(filter)

  const results: SurveyRegisteredEvent[] = []
  for (const event of events) {
    if (!('args' in event)) continue
    const block = await event.getBlock()
    results.push({
      surveyId: Number(event.args[0]),
      points: Number(event.args[1]),
      maxClaims: Number(event.args[2]),
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      timestamp: block.timestamp,
    })
  }

  return results
}

export async function getBlockNumber(): Promise<number> {
  return provider.getBlockNumber()
}

export async function getNetwork(): Promise<string> {
  const network = await provider.getNetwork()
  return network.name
}

export { provider, contract, readOnlyContract }
