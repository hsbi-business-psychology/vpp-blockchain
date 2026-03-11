export const config = {
  appName: import.meta.env.VITE_APP_NAME || 'VPP Blockchain',
  apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  rpcUrl: import.meta.env.VITE_RPC_URL || 'https://sepolia.base.org',
  contractAddress: import.meta.env.VITE_CONTRACT_ADDRESS || '',
  explorerUrl: import.meta.env.VITE_EXPLORER_URL || 'https://sepolia.basescan.org',
  defaultLocale: import.meta.env.VITE_DEFAULT_LOCALE || 'en',
} as const

export function getTxUrl(txHash: string): string {
  return `${config.explorerUrl}/tx/${txHash}`
}

export function getAddressUrl(address: string): string {
  return `${config.explorerUrl}/address/${address}`
}
