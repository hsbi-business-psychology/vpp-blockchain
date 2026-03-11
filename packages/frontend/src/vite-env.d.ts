/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME: string
  readonly VITE_API_URL: string
  readonly VITE_RPC_URL: string
  readonly VITE_CONTRACT_ADDRESS: string
  readonly VITE_EXPLORER_URL: string
  readonly VITE_DEFAULT_LOCALE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
