import { Eip1193Provider } from 'ethers'

declare global {
  interface Window {
    ethereum?: Eip1193Provider & {
      isMetaMask?: boolean
      on?(event: string, handler: (...args: unknown[]) => void): void
      removeListener?(event: string, handler: (...args: unknown[]) => void): void
    }
  }
}
