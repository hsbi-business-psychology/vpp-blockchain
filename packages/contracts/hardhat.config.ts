import type { HardhatUserConfig } from 'hardhat/config'
import '@nomicfoundation/hardhat-toolbox'
import '@openzeppelin/hardhat-upgrades'
import 'dotenv/config'

const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || ''
const BASE_SEPOLIA_RPC = process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org'
const BASE_MAINNET_RPC = process.env.BASE_MAINNET_RPC_URL || 'https://mainnet.base.org'
const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY || ''

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      // Cancun is the lowest EVM version that supports EIP-1153 transient
      // storage opcodes (TLOAD/TSTORE), which OpenZeppelin's
      // ReentrancyGuardTransient relies on. Base mainnet has supported
      // Cancun since the network upgrade in March 2024.
      evmVersion: 'cancun',
    },
  },
  networks: {
    hardhat: {},
    baseSepolia: {
      url: BASE_SEPOLIA_RPC,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 84532,
    },
    baseMainnet: {
      url: BASE_MAINNET_RPC,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 8453,
    },
  },
  etherscan: {
    apiKey: {
      baseSepolia: BASESCAN_API_KEY,
      baseMainnet: BASESCAN_API_KEY,
    },
    customChains: [
      {
        network: 'baseSepolia',
        chainId: 84532,
        urls: {
          apiURL: 'https://api-sepolia.basescan.org/api',
          browserURL: 'https://sepolia.basescan.org',
        },
      },
      {
        network: 'baseMainnet',
        chainId: 8453,
        urls: {
          apiURL: 'https://api.basescan.org/api',
          browserURL: 'https://basescan.org',
        },
      },
    ],
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === 'true',
  },
}

export default config
